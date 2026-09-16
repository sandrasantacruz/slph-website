// Astro-Content-Loader für die Artikel und Veranstaltungen aus pulpo.
//
// Läuft zur Build-Zeit: die Collection wird einmal gefüllt, danach braucht die
// Seite kein PocketBase mehr. Genau das, was der Umbau auf reines Frontend
// (Cloudflare Pages) voraussetzt.
//
// Gelesen wird anonym. Die List-Regel von `posts` gibt nur veröffentlichte und
// bereits sichtbare Beiträge heraus (`status='published'` und `visibleFrom`
// leer oder erreicht), Entwürfe und embargierte Beiträge kommen gar nicht erst
// über die API — der Filter unten ist Absicherung, keine Zugriffskontrolle.
//
// Der Loader liefert HTML in `rendered.html`, nicht in den Daten. In einer
// Seite also:
//
//   const { Content } = await render(entry);
//
// Quelle und Tenant stehen in `src/config.ts`; `.env` kann sie für lokale
// Arbeit überschreiben. Die Optionen unten sind nur für Tests gedacht.

import type { Loader, LoaderContext } from 'astro/loaders';

import { pulpo } from '../config';

const PER_PAGE = 200;

export interface PulpoPostsOptions {
  url?: string;
  publicUrl?: string;
  restaurant?: string;
  lang?: string;
}

interface PbRecord {
  id: string;
  collectionId: string;
  [key: string]: unknown;
}

interface PbList {
  items: PbRecord[];
  totalPages: number;
}

async function fetchAll(
  base: string,
  collection: string,
  params: Record<string, string>,
): Promise<PbRecord[]> {
  const items: PbRecord[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const qs = new URLSearchParams({ ...params, page: String(page), perPage: String(PER_PAGE) });
    const res = await fetch(`${base}/api/collections/${collection}/records?${qs}`);
    if (!res.ok) {
      throw new Error(`pulpo: ${collection} → HTTP ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as PbList;
    items.push(...json.items);
    totalPages = json.totalPages || 1;
    page += 1;
  } while (page <= totalPages);

  return items;
}

/**
 * Lokalisierte Felder sind im Ziel JSON-Maps (`{es: "…"}`). Fehlt die Sprache,
 * nehmen wir den ersten belegten Wert — ein Beitrag ohne Übersetzung soll
 * lieber in der falschen Sprache erscheinen als gar nicht.
 */
function localized(value: unknown, lang: string): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const map = value as Record<string, unknown>;
  const hit = map[lang];
  if (typeof hit === 'string' && hit.trim()) return hit.trim();
  for (const v of Object.values(map)) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** PB-Datum („2019-03-01 00:00:00.000Z") → ISO, leer → undefined. */
function isoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const d = new Date(value.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Fokuspunkt eines Media-Records als Bruchteile (0..1), sonst nichts.
 *
 * PocketBase liefert für ein ungesetztes optionales Zahlenfeld `0` statt
 * `null`. `(0, 0)` heißt deshalb „nicht gesetzt" und nicht „links oben" —
 * genau diese Verwechslung schickte im CMS schon einmal den ganzen Bestand in
 * die obere linke Ecke (`resolveFocal` in dessen `packages/site/helpers.ts`).
 */
function focalPoint(media: PbRecord): { focalX?: number; focalY?: number } {
  const x = typeof media.focalX === 'number' ? media.focalX : 0;
  const y = typeof media.focalY === 'number' ? media.focalY : 0;
  if (x === 0 && y === 0) return {};
  return { focalX: x, focalY: y };
}

function fileUrl(base: string, media: PbRecord): string {
  return `${base}/api/files/${media.collectionId}/${media.id}/${media.file as string}`;
}

const IMG_RE = /<img\b([^>]*?)\/?>/gi;
const attr = (raw: string, name: string) =>
  new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(raw)?.[1] ?? '';

/**
 * Inline-Bilder stehen im gespeicherten HTML als `<img data-media-id="…">` —
 * das Sanitizing im Ziel lässt an `img` nur `data-media-id` und `alt` durch.
 * Hier wird daraus die fertige Datei-URL. Kein `?thumb=`: PocketBase
 * re-encodiert Thumbs von WebP-Quellen als PNG (siehe CLAUDE.md).
 */
function resolveInlineImages(
  html: string,
  media: Map<string, PbRecord>,
  publicUrl: string,
  onMissing: (id: string) => void,
): string {
  return html.replace(IMG_RE, (whole, raw: string) => {
    const id = attr(raw, 'data-media-id');
    if (!id) return whole;

    const rec = media.get(id);
    if (!rec) {
      onMissing(id);
      return '';
    }

    const alt = attr(raw, 'alt') || localized(rec.alt, 'es');
    const size =
      typeof rec.width === 'number' && typeof rec.height === 'number' && rec.width > 0
        ? ` width="${rec.width}" height="${rec.height}"`
        : '';
    return (
      `<img src="${fileUrl(publicUrl, rec)}" alt="${alt.replace(/"/g, '&quot;')}"` +
      `${size} loading="lazy" decoding="async">`
    );
  });
}

/**
 * Ein Absatz, der nur aus einem Link besteht:
 *
 *   <p><a href="https://youtu.be/ID?si=…">…</a></p>
 *
 * Genau das fügt man im CMS ein, wenn man ein Video zeigen will. Hier wird
 * daraus der Embed-Platzhalter. Der iframe entsteht erst im Browser, nachdem
 * der Besucher zugestimmt hat (siehe `components/MediaEmbeds.astro`) —
 * deshalb steht hier nur der Link, der ohne JavaScript als Fallback
 * stehenbleibt.
 *
 * Links mitten im Fließtext bleiben Links: nur ein Absatz, der aus nichts
 * anderem besteht, ist erkennbar als Einbettung gemeint.
 *
 * Geduldet wird hinter dem Link ein einzelnes Satzzeichen und ein `<br>`.
 * Beides entsteht beim Schreiben im Back Office von selbst, wenn jemand eine
 * Aufzählung tippt oder eine Zeile abschließt, und ändert nichts daran, dass
 * der Absatz als Einbettung gemeint ist. Ohne diese Nachsicht blieb ein Reel
 * wegen eines angehängten Kommas als nackte URL stehen.
 */
const LINK_PARAGRAPH_RE =
  /<p>\s*<a\b([^>]*)>.*?<\/a>\s*[.,;:]?\s*(?:<br\s*\/?>)?\s*<\/p>/gi;

/** `reel`, `p` (Foto/Video-Post) und `tv` lassen sich einbetten. */
const IG_RE =
  /^https?:\/\/(?:www\.)?instagram\.com\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;

/** Alle Spielarten, in denen YouTube seine IDs verteilt. */
const YT_RE =
  /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^"#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
const YT_SHORTS_RE = /youtube\.com\/shorts\//i;
/** `?t=90` oder `?t=90s` aus der Teilen-Funktion, in Sekunden. */
const YT_START_RE = /[?&](?:t|start)=(\d+)s?(?:&|$)/i;

function instagramFigure(url: string): string | null {
  const m = IG_RE.exec(url);
  if (!m) return null;
  // `reels/` (Plural) ist die Listen-URL derselben Sache, `/reel/` die, die
  // sich einbetten lässt.
  const type = m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase();
  // Query-Parameter wie `igsh` fliegen raus: Tracking-Anhängsel aus der
  // Teilen-Funktion, im Embed haben sie nichts zu suchen.
  const clean = `https://www.instagram.com/${type}/${m[2]}/`;
  return (
    `<figure class="ig-embed" data-embed data-embed-provider="instagram"` +
    ` data-embed-src="${clean}embed/" data-embed-url="${clean}">` +
    `<a class="embed-fallback" href="${clean}" target="_blank" rel="noopener noreferrer">` +
    `Ver esta publicación en Instagram</a>` +
    `</figure>`
  );
}

function youtubeFigure(url: string): string | null {
  const m = YT_RE.exec(url);
  if (!m) return null;
  const id = m[1];
  // Shorts sind hochformatig, im 16:9-Kasten wären sie von zwei schwarzen
  // Balken eingerahmt.
  const vertical = YT_SHORTS_RE.test(url);
  const start = YT_START_RE.exec(url)?.[1];
  // `youtube-nocookie.com` ist YouTubes eigene Variante ohne Werbe-Cookies.
  // Zustimmungspflichtig bleibt sie trotzdem, sie setzt weiter Cookies.
  const src =
    `https://www.youtube-nocookie.com/embed/${id}?rel=0` +
    (start ? `&amp;start=${start}` : '');
  const watch =
    `https://www.youtube.com/watch?v=${id}` + (start ? `&amp;t=${start}s` : '');
  return (
    `<figure class="video-embed${vertical ? ' is-vertical' : ''}" data-embed` +
    ` data-embed-provider="youtube" data-embed-src="${src}" data-embed-url="${watch}">` +
    `<a class="embed-fallback" href="${watch}" target="_blank" rel="noopener noreferrer">` +
    `Ver este vídeo en YouTube</a>` +
    `</figure>`
  );
}

function resolveEmbeds(html: string): string {
  return html.replace(LINK_PARAGRAPH_RE, (whole, raw: string) => {
    const href = attr(raw, 'href');
    if (!href) return whole;
    return instagramFigure(href) ?? youtubeFigure(href) ?? whole;
  });
}

export function pulpoPosts(options: PulpoPostsOptions = {}): Loader {
  const url = (options.url ?? pulpo.url).replace(/\/+$/, '');
  const publicUrl = (options.publicUrl ?? pulpo.publicUrl).replace(/\/+$/, '') || url;
  const restaurant = options.restaurant ?? pulpo.restaurant;
  const lang = options.lang ?? pulpo.lang;

  return {
    name: 'pulpo-posts',

    async load({ store, logger, parseData, generateDigest }: LoaderContext) {
      if (!url) throw new Error('pulpo-loader: keine CMS-URL (src/config.ts).');
      if (!restaurant) throw new Error('pulpo-loader: kein Tenant (src/config.ts).');

      const tenant = `restaurant="${restaurant}"`;
      const [records, routes, mediaRecords] = await Promise.all([
        fetchAll(url, 'posts', {
          filter: `${tenant} && status="published"`,
          sort: '-publishedAt,-created',
        }),
        fetchAll(url, 'routes', { filter: `${tenant} && post!=""` }),
        fetchAll(url, 'media', { filter: tenant }),
      ]);

      const media = new Map(mediaRecords.map((m) => [m.id, m]));
      const contentLang = lang || 'es';

      // Die URL bestimmt `routes`, nicht der Beitrag: im Ziel darf ein Slug
      // beliebig aussehen und wird im Back Office geändert. Kein Präfix
      // annehmen, sonst hängt die Seite an einer Konvention, die dort niemand
      // durchsetzt.
      //
      // Das Datenmodell sieht eine Route je Sprache vor; mehrere in derselben
      // Sprache sind gleichrangige Aliase, es gibt kein „kanonisch"-Flag.
      // Dann gewinnt die zuletzt angelegte, das ist die jüngste Absicht im Back
      // Office. Bei gleichem Zeitstempel entscheidet der Slug, damit die Wahl
      // über Builds hinweg stabil bleibt. Protokolliert wird sie in jedem Fall.
      const routesByPost = new Map<string, PbRecord[]>();
      for (const r of routes) {
        const key = r.post as string;
        const list = routesByPost.get(key);
        if (list) list.push(r);
        else routesByPost.set(key, [r]);
      }
      const pickRoute = (list: PbRecord[]): PbRecord => {
        const inLang = list.filter((r) => r.lang === contentLang);
        const pool = inLang.length ? inLang : list;
        return [...pool].sort(
          (a, b) =>
            String(b.created).localeCompare(String(a.created)) ||
            String(a.slug).localeCompare(String(b.slug)),
        )[0];
      };

      store.clear();
      let skipped = 0;
      const missingMedia = new Set<string>();

      for (const rec of records) {
        const id = String(rec.postKey || rec.id);
        const candidates = routesByPost.get(rec.id);
        if (!candidates?.length) {
          skipped += 1;
          logger.warn(`Beitrag ohne Route, übersprungen: ${id}`);
          continue;
        }

        const route = pickRoute(candidates);
        if (candidates.length > 1) {
          const others = candidates
            .filter((r) => r !== route)
            .map((r) => `${r.lang}:/${r.slug}`)
            .join(', ');
          logger.warn(`${id} hat mehrere Routen, verwendet wird /${route.slug} (sonst: ${others})`);
        }

        const path = String(route.slug);
        // Letztes Segment, damit eine Seite wie `/noticias/[slug]` weiter
        // funktioniert. Der verbindliche Wert ist `path`.
        const slug = path.split('/').filter(Boolean).at(-1) ?? path;

        const cover = rec.coverImage ? media.get(rec.coverImage as string) : undefined;
        const title = localized(rec.title, contentLang);
        const html = resolveEmbeds(
          resolveInlineImages(
            localized(rec.publishedBody, contentLang) || localized(rec.body, contentLang),
            media,
            publicUrl,
            (id) => missingMedia.add(id),
          ),
        );

        const data = await parseData({
          id,
          data: {
            title,
            teaser: localized(rec.teaser, contentLang) || undefined,
            // Leeres `kind` sind Altbestände und zählen als Artikel.
            kind: rec.kind === 'event' ? 'event' : 'article',
            slug,
            path: `/${path}`,
            publishedAt: isoDate(rec.publishedAt),
            startsAt: isoDate(rec.startsAt),
            endsAt: isoDate(rec.endsAt),
            location: localized(rec.location, contentLang) || undefined,
            mapEmbed: (rec.mapEmbed as string) || undefined,
            cover: cover
              ? {
                  src: fileUrl(publicUrl, cover),
                  width: typeof cover.width === 'number' ? cover.width : undefined,
                  height: typeof cover.height === 'number' ? cover.height : undefined,
                  alt: localized(cover.alt, contentLang) || title,
                  ...focalPoint(cover),
                }
              : undefined,
            tags: Array.isArray(rec.tags) ? (rec.tags as string[]) : [],
            author: (rec.author as string) || undefined,
            updated: isoDate(rec.updated),
          },
        });

        store.set({
          id,
          data,
          rendered: { html },
          digest: generateDigest({ updated: rec.updated, html }),
        });
      }

      for (const id of missingMedia) {
        logger.warn(`Inline-Bild ${id} existiert nicht mehr, aus dem HTML entfernt.`);
      }

      const events = store.values().filter((e) => (e.data as { kind: string }).kind === 'event');
      logger.info(
        `${store.keys().length} Beiträge geladen ` +
          `(${store.keys().length - events.length} Artikel, ${events.length} Veranstaltungen` +
          `${skipped ? `, ${skipped} ohne Route übersprungen` : ''}).`,
      );
    },
  };
}
