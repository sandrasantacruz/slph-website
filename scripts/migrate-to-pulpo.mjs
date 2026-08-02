// scripts/migrate-to-pulpo.mjs
//
// Migriert Artikel UND Veranstaltungen dieser Seite (Collection `posts`,
// BlockNote-JSON) in das neue Multi-Tenant-System (pulpo, SCHEMA.md §13/§14):
//
//   posts.content (BlockNote) ─→ posts.body/publishedBody  ({es: "<p>…"} HTML)
//   posts.cover               ─→ media (WebP ≤1500px) + posts.coverImage
//   posts.typ                 ─→ posts.kind (`article` / `event`) + tag
//   posts.event_date/_end     ─→ posts.startsAt / endsAt
//   posts.location            ─→ posts.location (lokalisiert)
//   posts.address_url         ─→ posts.mapEmbed (nur echte /maps/embed-URLs)
//   posts.slug                ─→ posts.postKey + routes.slug ("noticias/<slug>")
//
// `visibleFrom` bleibt leer: migriert werden bereits veröffentlichte Beiträge,
// die sofort sichtbar sein sollen. `category` bleibt ebenfalls leer — Rubriken
// legt das Skript weder an noch weist es welche zu; die Trennung von Artikel
// und Veranstaltung trägt `kind`.
//
// Idempotent: ein zweiter Lauf überspringt, was schon da ist (Erkennung über
// `postKey` bzw. `media.label`). Mit --force werden bestehende Artikel
// aktualisiert statt übersprungen.
//
// Voraussetzungen im Ziel (legt das Skript NICHT an):
//   - das Restaurant selbst + ein `users`-Login mit `website`-Berechtigung
//   - eine `pages`-Zeile mit Route-Slug "noticias" als Übersichtsseite
//     (postList-Block) — die Artikel-Routen liegen darunter
//
// Usage:
//   node scripts/migrate-to-pulpo.mjs --dry-run
//   node scripts/migrate-to-pulpo.mjs
//   node scripts/migrate-to-pulpo.mjs --only=news --limit=3
//   node scripts/migrate-to-pulpo.mjs --force
//
// Env (siehe .env.example):
//   PULPO_URL            Ziel-PocketBase, z.B. http://127.0.0.1:8090
//   PULPO_EMAIL/_PASSWORD  Login in der `users`-Collection (Recht `website`)
//   PULPO_SUPERUSER=1    stattdessen als _superuser einloggen
//                        (dann ist PULPO_RESTAURANT Pflicht)
//   PULPO_RESTAURANT     Restaurant-ID (Default: aus dem Auth-Record)
//   PULPO_LANG           Sprachcode (Default: site_settings.defaultLang, sonst es)
//   SRC_URL              Quell-PocketBase (Default https://slph.pulpo.cloud)
//   SRC_EMAIL/_PASSWORD  optionaler Quell-Login (nur nötig für Entwürfe)

import { pathToFileURL } from 'node:url';

import { config } from 'dotenv';
config();

import PocketBase from 'pocketbase';
import sharp from 'sharp';

// ──────────────────────────────────────────────────────────────────────────────
// Konfiguration
// ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const DRY_RUN = flag('dry-run');
const FORCE = flag('force');
const ONLY = opt('only', ''); // '' | 'news' | 'event'
const LIMIT = Number(opt('limit', '0')) || 0;
const SLUG_PREFIX = opt('prefix', 'noticias').replace(/^\/+|\/+$/g, '');

const SRC_URL = process.env.SRC_URL ?? 'https://slph.pulpo.cloud';
const SRC_EMAIL = process.env.SRC_EMAIL ?? '';
const SRC_PASSWORD = process.env.SRC_PASSWORD ?? '';

const DST_URL = process.env.PULPO_URL ?? '';
const DST_EMAIL = process.env.PULPO_EMAIL ?? '';
const DST_PASSWORD = process.env.PULPO_PASSWORD ?? '';
const DST_SUPERUSER = ['1', 'true', 'yes'].includes(
  (process.env.PULPO_SUPERUSER ?? '').toLowerCase(),
);
const DST_RESTAURANT = process.env.PULPO_RESTAURANT ?? '';

// Muss zu MaxImageEdge in apps/backend/internal/website/media.go passen —
// größere Bilder lehnt das Ziel-Backend ab.
const MAX_EDGE = 1500;
const WEBP_QUALITY = 85;

// typ → `kind` im Ziel. Kategorien werden bewusst nicht vergeben; `kind`
// trennt Artikel und Veranstaltung, der Tag macht den Import wiederauffindbar.
const KINDS = { news: 'article', event: 'event' };
const TAGS = { news: 'noticia', event: 'evento' };

// Was `normalizeMapEmbed` (apps/backend/internal/blog/mapembed.go) akzeptiert.
// Alles andere quittiert der Hook mit 400 und würde den ganzen Record kippen —
// ein „Teilen"-Link (/maps/place/…, maps.app.goo.gl) ist KEINE Einbettung.
const MAP_EMBED_HOSTS = new Set(['www.google.com', 'google.com', 'maps.google.com']);
const MAP_EMBED_PATH = '/maps/embed';

export function isMapEmbedUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    return (
      u.protocol === 'https:' &&
      MAP_EMBED_HOSTS.has(u.hostname.toLowerCase()) &&
      u.pathname === MAP_EMBED_PATH
    );
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// BlockNote → HTML
//
// Das Ziel sanitisiert serverseitig (bluemonday, apps/backend/internal/blog):
// erlaubt sind p, h2-h4, Listen, a[href], blockquote, pre/code, figure/
// figcaption, Tabellen — KEINE class-Attribute und `<img>` ausschließlich mit
// `data-media-id`. Wir erzeugen deshalb direkt Markup, das die Allowlist
// unverändert passiert, statt src/lib/blocknote-render.ts (Tailwind-Klassen,
// echte Bild-URLs, iframes) wiederzuverwenden.
// ──────────────────────────────────────────────────────────────────────────────

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

function renderInline(items) {
  if (!Array.isArray(items)) return '';
  return items
    .map((item) => {
      if (item?.type === 'link') {
        const inner = renderInline(item.content ?? []);
        if (!inner) return '';
        const href = String(item.href ?? '');
        // Der Sanitizer wirft alles außer http/https/mailto weg; relative Links
        // aus dem WordPress-Import wären ohnehin tote Pfade.
        if (!/^(https?:|mailto:)/i.test(href)) return inner;
        return `<a href="${esc(href)}">${inner}</a>`;
      }
      let html = esc(item?.text ?? '');
      if (!html) return '';
      const s = item?.styles ?? {};
      if (s.code) html = `<code>${html}</code>`;
      if (s.bold) html = `<strong>${html}</strong>`;
      if (s.italic) html = `<em>${html}</em>`;
      if (s.underline) html = `<u>${html}</u>`;
      if (s.strike) html = `<s>${html}</s>`;
      return html;
    })
    .join('');
}

/**
 * Rendert eine BlockNote-Blockliste. `onImage(url, caption)` liefert die
 * Media-ID für ein Bild (oder null → Block wird verworfen) und ist async,
 * weil dabei hochgeladen wird.
 */
export async function renderBlocks(blocks, ctx) {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';

  let html = '';
  let list = null; // 'ul' | 'ol'
  const closeList = () => {
    if (list) html += `</${list}>`;
    list = null;
  };

  for (const b of blocks) {
    const type = b?.type;
    const props = b?.props ?? {};
    const inline = renderInline(b?.content);
    const wanted =
      type === 'bulletListItem' || type === 'checkListItem'
        ? 'ul'
        : type === 'numberedListItem'
          ? 'ol'
          : null;

    if (wanted !== list) {
      closeList();
      if (wanted) html += `<${wanted}>`;
      list = wanted;
    }

    switch (type) {
      case 'paragraph':
        if (inline.trim()) html += `<p>${inline}</p>`;
        break;

      case 'heading': {
        // h1 ist im Ziel der Seite vorbehalten (Sanitizer entfernt es).
        const level = Math.min(4, Math.max(2, Number(props.level ?? 2) + 1));
        html += `<h${level}>${inline}</h${level}>`;
        break;
      }

      case 'bulletListItem':
      case 'numberedListItem':
      case 'checkListItem': {
        const children = await renderBlocks(b.children, ctx);
        html += `<li>${inline}${children}</li>`;
        break;
      }

      case 'quote':
        html += `<blockquote><p>${inline}</p></blockquote>`;
        break;

      case 'image': {
        const url = String(props.url ?? '');
        if (!url) break;
        const caption = String(props.caption ?? '');
        const mediaId = await ctx.onImage(url, caption);
        if (!mediaId) break;
        const img = `<img data-media-id="${mediaId}" alt="${esc(caption)}" />`;
        html += caption
          ? `<figure>${img}<figcaption>${esc(caption)}</figcaption></figure>`
          : `<figure>${img}</figure>`;
        break;
      }

      case 'codeBlock': {
        const raw =
          typeof b.content === 'string'
            ? b.content
            : (b.content ?? []).map((c) => c?.text ?? '').join('');
        html += `<pre><code>${esc(raw)}</code></pre>`;
        break;
      }

      case 'video':
      case 'audio':
      case 'file': {
        // Einbettungen überleben den Sanitizer nicht (kein iframe/video/audio).
        // Statt sie still zu verlieren: als Link erhalten und protokollieren.
        const url = String(props.url ?? '');
        if (url && /^https?:/i.test(url)) {
          html += `<p><a href="${esc(url)}">${esc(props.name ?? url)}</a></p>`;
          ctx.warn(`${type}-Block als Link erhalten: ${url}`);
        } else if (url) {
          ctx.warn(`${type}-Block verworfen (Sanitizer erlaubt kein <${type}>): ${url}`);
        }
        break;
      }

      default:
        if (inline.trim()) html += `<p>${inline}</p>`;
        else if (type) ctx.warn(`Unbekannter Blocktyp übersprungen: ${type}`);
    }
  }

  closeList();
  return html;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helfer
// ──────────────────────────────────────────────────────────────────────────────

const fileUrl = (rec, filename) =>
  `${SRC_URL}/api/files/${rec.collectionId}/${rec.id}/${filename}`;

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Nach WebP konvertieren und auf MAX_EDGE herunterskalieren (nie hoch).
 *
 * Bereits passende WebP-Dateien werden UNVERÄNDERT durchgereicht — die Cover
 * dieser Seite sind schon WebP ≤1500 px, ein zweiter Encode kostet nur Qualität.
 */
async function toWebp(buffer) {
  const img = sharp(buffer, { failOn: 'none' });
  const meta = await img.metadata();

  const fits = (meta.width ?? 0) <= MAX_EDGE && (meta.height ?? 0) <= MAX_EDGE;
  if (meta.format === 'webp' && fits && !meta.orientation) {
    return { buffer, width: meta.width, height: meta.height, resized: false, reencoded: false };
  }

  const out = await img
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: out.data,
    width: out.info.width,
    height: out.info.height,
    resized: (meta.width ?? 0) > MAX_EDGE || (meta.height ?? 0) > MAX_EDGE,
    reencoded: true,
  };
}

/** PB-Datum ("2019-01-01 00:00:00.000Z") → ISO. Leer bleibt leer. */
function toIso(value) {
  if (!value) return '';
  const d = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

const isNotFound = (e) => e?.status === 404;

/** Fehlende/falsche Konfiguration — wird ohne Stacktrace gemeldet. */
class ConfigError extends Error {}
const bail = (msg) => {
  throw new ConfigError(msg);
};

// ──────────────────────────────────────────────────────────────────────────────
// Ziel-Zugriff
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Lädt ein Quell-Bild hoch und gibt die Media-ID zurück. `label` ist der
 * Wiedererkennungs-Schlüssel: ein zweiter Lauf findet das Bild darüber und
 * lädt es nicht erneut hoch.
 */
async function ensureMedia(dst, restaurant, { url, label, alt, tags }, state) {
  const known = state.media.get(label);
  if (known) return known;

  if (DRY_RUN) {
    console.log(`    · media "${label}" würde hochgeladen`);
    return `dry-media-${label}`;
  }

  const raw = await download(url);
  const { buffer, width, height, resized, reencoded } = await toWebp(raw);

  const form = new FormData();
  form.append('restaurant', restaurant);
  form.append('file', new Blob([buffer], { type: 'image/webp' }), `${label}.webp`);
  form.append('width', String(width));
  form.append('height', String(height));
  form.append('label', label);
  if (alt) form.append('alt', JSON.stringify(alt));
  if (tags?.length) form.append('tags', JSON.stringify(tags));

  const rec = await dst.collection('media').create(form);
  state.media.set(label, rec.id);
  console.log(
    `    · media ${rec.id} (${width}×${height}${resized ? ', skaliert' : ''}` +
      `${reencoded ? ', konvertiert' : ''}, ${Math.round(buffer.length / 1024)} kB)`,
  );
  return rec.id;
}

async function ensureRoute(dst, restaurant, lang, slug, postId, state) {
  const existing = state.routes.find((r) => r.lang === lang && r.slug === slug);
  if (existing) {
    if (existing.post === postId) return;
    if (DRY_RUN) return;
    await dst.collection('routes').update(existing.id, { post: postId, page: '' });
    return;
  }
  if (DRY_RUN) {
    console.log(`    · route ${lang}:/${slug} (dry-run)`);
    return;
  }
  const rec = await dst.collection('routes').create({ restaurant, lang, slug, post: postId });
  state.routes.push(rec);
  console.log(`    · route ${lang}:/${slug}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Migration eines Artikels
// ──────────────────────────────────────────────────────────────────────────────

async function migratePost(dst, source, ctx) {
  const { restaurant, lang, state } = ctx;
  const slug = source.slug || source.id;
  const title = source.title?.trim() || slug;
  const typ = source.typ === 'event' ? 'event' : 'news';

  const warnings = [];
  const warn = (msg) => warnings.push(msg);

  const existing = state.posts.get(slug);
  if (existing && !FORCE) {
    console.log(`  = ${slug} (existiert, übersprungen)`);
    return { status: 'skipped' };
  }

  // Cover → media
  let coverImage = '';
  if (source.cover) {
    coverImage = await ensureMedia(
      dst,
      restaurant,
      {
        url: fileUrl(source, source.cover),
        label: slug,
        alt: { [lang]: title },
        tags: ['slph-import', TAGS[typ]],
      },
      state,
    );
  }

  // Body → HTML (Inline-Bilder landen ebenfalls in `media`)
  let inlineCount = 0;
  const body = await renderBlocks(source.content, {
    warn,
    onImage: async (url, caption) => {
      inlineCount += 1;
      try {
        return await ensureMedia(
          dst,
          restaurant,
          {
            url,
            label: `${slug}-${inlineCount}`,
            alt: { [lang]: caption || title },
            tags: ['slph-import', TAGS[typ]],
          },
          state,
        );
      } catch (e) {
        warn(`Inline-Bild konnte nicht übernommen werden (${url}): ${e.message}`);
        return null;
      }
    },
  });

  const publishedAt = toIso(source.published_at) || toIso(source.event_date);
  const status = source.status === 'published' ? 'published' : 'draft';
  const kind = KINDS[typ];

  // Veranstaltungsfelder. `startsAt` ist für kind=event Pflicht (Go-Hook
  // validateEvent) — ohne Datum würde der Record mit 400 abgelehnt, deshalb
  // hier abbrechen statt eine unbrauchbare Zeile anzulegen.
  let startsAt = '';
  let endsAt = '';
  if (kind === 'event') {
    startsAt = toIso(source.event_date) || publishedAt;
    if (!startsAt) {
      throw new Error('Veranstaltung ohne Datum — startsAt ist im Ziel Pflicht.');
    }
    endsAt = toIso(source.event_end);
    if (endsAt && endsAt < startsAt) {
      warn(`endsAt (${endsAt}) liegt vor startsAt (${startsAt}) — Ende verworfen.`);
      endsAt = '';
    }
  } else if (source.event_date || source.event_end || source.location) {
    warn('Event-Felder an einem Nicht-Event ignoriert.');
  }

  // `address_url` war im alten Schema ein beliebiger Maps-Link; `mapEmbed`
  // nimmt nur echte Einbettungen. Alles andere quittiert der Hook mit 400,
  // also lieber weglassen und melden.
  let mapEmbed = '';
  if (source.address_url) {
    if (isMapEmbedUrl(source.address_url)) mapEmbed = source.address_url.trim();
    else warn(`address_url ist keine Maps-Einbettung, nicht übernommen: ${source.address_url}`);
  }

  const payload = {
    postKey: slug,
    kind,
    title: { [lang]: title },
    ...(source.excerpt?.trim() ? { teaser: { [lang]: source.excerpt.trim() } } : {}),
    ...(body ? { body: { [lang]: body } } : {}),
    // Öffentlich gerendert wird ausschließlich der Snapshot — bei einem
    // Bestandsartikel ist der Arbeitsstand derselbe Text.
    ...(body && status === 'published' ? { publishedBody: { [lang]: body } } : {}),
    ...(coverImage ? { coverImage } : {}),
    // Bewusst leer und bewusst immer im Payload: ein --force-Lauf räumt damit
    // auch die Rubrik eines früheren Laufs wieder ab.
    category: '',
    ...(startsAt ? { startsAt } : {}),
    ...(endsAt ? { endsAt } : {}),
    ...(source.location?.trim() ? { location: { [lang]: source.location.trim() } } : {}),
    ...(mapEmbed ? { mapEmbed } : {}),
    status,
    ...(publishedAt ? { publishedAt } : {}),
    ...(ctx.author ? { author: ctx.author } : {}),
    tags: ['slph-import', TAGS[typ]],
  };

  // Events verfallen im Ziel: die „Demnächst"-Liste filtert auf
  // `startsAt >= @now`, alles Ältere landet im Rückblick (website.ts).
  const label = `[${kind}${startsAt ? ` ${startsAt.slice(0, 10)}` : ''}]`;
  const past = Boolean(startsAt) && startsAt < ctx.now;

  let postId = existing?.id;
  if (DRY_RUN) {
    console.log(`  ${existing ? '~' : '+'} ${slug}  ${label}  "${title.slice(0, 60)}"`);
  } else if (existing) {
    const rec = await dst.collection('posts').update(existing.id, payload);
    postId = rec.id;
    console.log(`  ~ ${slug}  ${label}  aktualisiert`);
  } else {
    const rec = await dst.collection('posts').create({ restaurant, ...payload });
    postId = rec.id;
    state.posts.set(slug, rec);
    console.log(`  + ${slug}  ${label}  → ${rec.id}`);
  }

  const routeSlug = SLUG_PREFIX ? `${SLUG_PREFIX}/${slug}` : slug;
  if (postId) await ensureRoute(dst, restaurant, lang, routeSlug, postId, state);

  for (const w of warnings) console.log(`    ! ${w}`);

  return { status: existing ? 'updated' : 'created', warnings, kind, past };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!DST_URL) bail('PULPO_URL ist nicht gesetzt.');
  if (!DST_EMAIL || !DST_PASSWORD) bail('PULPO_EMAIL und PULPO_PASSWORD müssen gesetzt sein.');
  if (DST_SUPERUSER && !DST_RESTAURANT) bail('Mit PULPO_SUPERUSER=1 ist PULPO_RESTAURANT Pflicht.');

  const src = new PocketBase(SRC_URL);
  const dst = new PocketBase(DST_URL);
  src.autoCancellation(false);
  dst.autoCancellation(false);

  if (SRC_EMAIL && SRC_PASSWORD) {
    await src.collection('_superusers').authWithPassword(SRC_EMAIL, SRC_PASSWORD);
  }

  const authCollection = DST_SUPERUSER ? '_superusers' : 'users';
  const auth = await dst.collection(authCollection).authWithPassword(DST_EMAIL, DST_PASSWORD);

  const restaurant = DST_RESTAURANT || auth.record.restaurant;
  if (!restaurant) bail(`Der Login ${DST_EMAIL} hat kein Restaurant — PULPO_RESTAURANT setzen.`);
  if (!DST_SUPERUSER && !(auth.record.permissions ?? []).includes('website')) {
    bail(`Der Login ${DST_EMAIL} hat keine "website"-Berechtigung — Schreiben endet in 404.`);
  }

  // Sprache: bevorzugt die Standardsprache des Tenants.
  let lang = process.env.PULPO_LANG ?? '';
  if (!lang) {
    try {
      const settings = await dst
        .collection('site_settings')
        .getFirstListItem(dst.filter('restaurant = {:r}', { r: restaurant }));
      lang = settings.defaultLang || 'es';
    } catch (e) {
      if (!isNotFound(e)) throw e;
      lang = 'es';
    }
  }

  console.log(`Quelle : ${SRC_URL}`);
  console.log(`Ziel   : ${DST_URL}  (restaurant=${restaurant}, lang=${lang})`);
  console.log(
    `Modus  : ${DRY_RUN ? 'DRY-RUN' : 'schreibend'}${FORCE ? ', --force' : ''}` +
      `${ONLY ? `, nur typ=${ONLY}` : ''}${LIMIT ? `, limit=${LIMIT}` : ''}`,
  );
  console.log(`Routen : ${lang}:/${SLUG_PREFIX ? `${SLUG_PREFIX}/` : ''}<slug>`);
  console.log('');

  // Bestand im Ziel laden — Grundlage der Idempotenz.
  const tenantFilter = dst.filter('restaurant = {:r}', { r: restaurant });
  const state = {
    posts: new Map(),
    media: new Map(),
    routes: await dst.collection('routes').getFullList({ filter: tenantFilter }),
  };
  for (const p of await dst.collection('posts').getFullList({ filter: tenantFilter })) {
    state.posts.set(p.postKey, p);
  }
  for (const m of await dst.collection('media').getFullList({ filter: tenantFilter })) {
    if (m.label) state.media.set(m.label, m.id);
  }
  console.log(
    `Bestand im Ziel: ${state.posts.size} posts, ${state.media.size} media, ` +
      `${state.routes.length} Routen`,
  );

  // Quelle laden
  let sources = await src.collection('posts').getFullList({ sort: 'published_at,created' });
  if (ONLY) sources = sources.filter((p) => p.typ === ONLY);
  if (LIMIT) sources = sources.slice(0, LIMIT);
  const counts = sources.reduce((acc, p) => ({ ...acc, [p.typ]: (acc[p.typ] ?? 0) + 1 }), {});
  console.log(
    `Quelle : ${sources.length} Artikel (${Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')})\n`,
  );

  const ctx = {
    restaurant,
    lang,
    state,
    author: process.env.PULPO_AUTHOR ?? '',
    now: new Date().toISOString(),
  };
  const tally = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const events = { upcoming: 0, past: 0 };
  const problems = [];

  for (const source of sources) {
    try {
      const res = await migratePost(dst, source, ctx);
      tally[res.status] += 1;
      if (res.kind === 'event') events[res.past ? 'past' : 'upcoming'] += 1;
      for (const w of res.warnings ?? []) problems.push(`${source.slug}: ${w}`);
    } catch (e) {
      tally.failed += 1;
      const detail = e?.response?.data ? ` ${JSON.stringify(e.response.data)}` : '';
      problems.push(`${source.slug}: ${e.message}${detail}`);
      console.log(`  ✗ ${source.slug}: ${e.message}${detail}`);
    }
  }

  console.log('');
  console.log(
    `Fertig: ${tally.created} neu, ${tally.updated} aktualisiert, ` +
      `${tally.skipped} übersprungen, ${tally.failed} fehlgeschlagen`,
  );
  if (events.upcoming + events.past > 0) {
    console.log(
      `Davon Veranstaltungen: ${events.upcoming} kommend, ${events.past} vergangen ` +
        `(vergangene stehen nur im Rückblick, nicht in „Demnächst").`,
    );
  }
  if (problems.length) {
    console.log('\nHinweise:');
    for (const p of problems) console.log(`  - ${p}`);
  }
  if (DRY_RUN) console.log('\n(DRY-RUN — es wurde nichts geschrieben.)');
  if (tally.failed) process.exitCode = 1;
}

// Nur ausführen, wenn direkt gestartet — so ist `renderBlocks` importierbar
// (Konvertierung isoliert prüfbar, ohne Ziel-PocketBase).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    if (e instanceof ConfigError) console.error(e.message);
    else console.error(e?.response?.data ?? e);
    process.exit(1);
  });
}
