// scripts/import-noticias.mjs
//
// Scrapes https://silospeceshablaran.com/noticias-2/ (one big WP-Divi page) and
// imports each event/news item into the unified PB `posts` collection.
//
// The page is structured as Divi shortcodes interleaved with the real HTML:
//   <h1>Title</h1>
//   <p>Description with <strong>14 de junio de 2026</strong> ...</p>
//   <img src=".../wp-content/uploads/YYYY/MM/...jpg">          ← cover
//   <img src=".../wp-content/uploads/2018/11/Divisor1@2x.png"> ← item separator
//
// We split on the Divisor image, then for each segment extract title, cover,
// description, date, and a typ heuristic (Entrevista/Radio/TV → news, else event).
//
// Usage:
//   node scripts/import-noticias.mjs [--dry-run] [--force] [--only=slug] [--limit=N] [--verbose]

import { config } from 'dotenv';
config();

import PocketBase from 'pocketbase';
import * as cheerio from 'cheerio';

import {
  htmlToBlocks,
  collectImageSrcs,
  rewriteImageUrls,
  downloadImage,
  stripHtml,
  slugify,
} from './_import-utils.mjs';

const PB_URL = process.env.PUBLIC_POCKETBASE_URL ?? 'http://127.0.0.1:8090';
const PB_USER_EMAIL = process.env.PB_USER_EMAIL;
const PB_USER_PASSWORD = process.env.PB_USER_PASSWORD;

if (!PB_USER_EMAIL || !PB_USER_PASSWORD) {
  console.error('PB_USER_EMAIL und PB_USER_PASSWORD müssen in .env gesetzt sein.');
  process.exit(1);
}

const SOURCE = 'https://silospeceshablaran.com';
const PAGE_SLUG = 'noticias-2';
const DIVISOR_HINT = 'Divisor1@2x.png';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const VERBOSE = args.includes('--verbose');
const ONLY = (() => {
  const a = args.find((x) => x.startsWith('--only='));
  return a ? a.split('=')[1] : null;
})();
const LIMIT = (() => {
  const a = args.find((x) => x.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();

const log = (...a) => console.log(...a);
const warn = (msg) => (VERBOSE ? console.warn(`  ! ${msg}`) : null);

// ──────────────────────────────────────────────────────────────────────────────
// Date parsing (Spanish)
// ──────────────────────────────────────────────────────────────────────────────

const MONTHS_ES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

function isoDate(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).toISOString();
}

// Find a "DD de Mes de YYYY" or "Mes de YYYY" date in plaintext. Year-only
// matches are intentionally skipped — they're too noisy (e.g. "año 2019/2020"
// in the description grabs the wrong year).
function parseSpanishDate(text) {
  if (!text) return null;
  const lc = text.toLowerCase();

  // "14 de junio de 2026"
  const full = /\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})\b/i;
  const m1 = lc.match(full);
  if (m1) {
    const month = MONTHS_ES[m1[2]];
    if (month) return isoDate(Number(m1[3]), month, Number(m1[1]));
  }

  // "junio de 2026"
  const monthYear = /\b([a-záéíóúñ]+)\s+de\s+(\d{4})\b/i;
  const m2 = lc.match(monthYear);
  if (m2 && MONTHS_ES[m2[1]]) {
    return isoDate(Number(m2[2]), MONTHS_ES[m2[1]], 1);
  }

  return null;
}

function dateFromImageUrl(url) {
  const m = /\/uploads\/(\d{4})\/(\d{2})\//.exec(url ?? '');
  if (!m) return null;
  return isoDate(Number(m[1]), Number(m[2]), 1);
}

// ──────────────────────────────────────────────────────────────────────────────
// typ heuristic
// ──────────────────────────────────────────────────────────────────────────────

const NEWS_PATTERNS = [
  /^entrevista\b/i,
  /^descubriendo con\b/i,
  /\bradio\s/i,
  /\b(rtve?|tve|rtv)\b/i,
  /\bcerca de ti\b/i,
  /\bsomos 8\b/i,
  /\bla otra mañana\b/i,
  /\bcharlas de bolsillo\b/i,
  /\bcanarias es cultura\b/i,
  /\bgran canaria al día\b/i,
  /\bel espejo canario\b/i,
  /\broscas y cotufas\b/i,
  /\brocas y cotufas\b/i,
  /\bcrónicas g\.c\.\b/i,
  /\bla provincia\b/i,
  /\bel diario\b/i,
  /\benjoy\b/i,
];

function classifyTyp(title) {
  const t = title ?? '';
  return NEWS_PATTERNS.some((re) => re.test(t)) ? 'news' : 'event';
}

// ──────────────────────────────────────────────────────────────────────────────
// HTML segmentation
// ──────────────────────────────────────────────────────────────────────────────

function bestSrc($el) {
  const src = $el.attr('src') ?? '';
  const dataSrc = $el.attr('data-src') || $el.attr('data-lazy-src') || '';
  if (src && !src.startsWith('data:')) return src;
  return dataSrc || src;
}

// Cover URLs are extracted via regex from raw HTML, so HTML entities like
// `&#8230;` (…) or `&amp;` are still encoded. Decode them before fetching.
// WP's "smart" typography rewrites `...` to `…` for display, but the real file
// on disk still uses three ASCII dots — undo that for image URLs.
function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/…/g, '...');
}

// The page is Divi shortcodes rendered as plain text — images live inside
// `[et_pb_image src=»URL»]` shortcodes (not real <img> tags). We split on the
// FULL divisor shortcode (incl. attributes + closing tag) so no orphan
// attribute fragments leak into the next chunk's content.
function divisorRegex() {
  const hint = DIVISOR_HINT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `\\[et_pb_image\\s+[^\\]]*${hint}[^\\]]*\\](?:\\s*\\[\\/et_pb_image\\])?`,
    'g',
  );
}

// Strip all `[et_pb_...]` / `[/et_pb_...]` shortcode tags from a string.
function stripShortcodes(s) {
  return s.replace(/\[\/?et_pb_[^\]]*\]/g, '');
}

// FB renders inline emoji like ✍️ as <img src="...fbcdn.net/images/emoji.php/...">
// with the real emoji in `alt`. Inline these so they stay with the surrounding
// text instead of becoming standalone image blocks (which also avoids
// downloading them into PB).
function inlineEmojiImages(html) {
  return html.replace(
    /<img\b[^>]*?\bsrc=["'][^"']*fbcdn\.net\/images\/emoji[^"']*["'][^>]*?>/gi,
    (match) => {
      const alt = match.match(/\balt=["']([^"']*)["']/i);
      return alt?.[1] ?? '';
    },
  );
}

function splitItems(html) {
  const chunks = html.split(divisorRegex());

  const parsed = [];
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    // Pre-strip all remaining Divi shortcode tags so they don't surface in
    // the parsed content blocks. Also replace inline emoji <img>s with their
    // alt text so they don't become standalone image blocks.
    const cleaned = inlineEmojiImages(stripShortcodes(chunk));
    const $c = cheerio.load(cleaned, null, false);
    $c('noscript').remove();
    let hasTitle = false;
    $c('h1').each((_, h) => {
      if (stripHtml($c(h).html() ?? '')) hasTitle = true;
    });
    if (hasTitle) parsed.push({ $: $c, raw: chunk });
  }
  return parsed;
}

// Extract first `et_pb_image src=»URL»` from a chunk that isn't the divisor.
function findCoverUrl(rawHtml) {
  const re = /et_pb_image\s+src=[»"]([^»"]+)[»"]/g;
  let m;
  while ((m = re.exec(rawHtml)) !== null) {
    const url = decodeEntities(m[1]);
    if (url.includes(DIVISOR_HINT)) continue;
    return url;
  }
  return null;
}

function extractItem({ $: $c, raw }, index) {
  // Title: first non-empty h1.
  let title = '';
  $c('h1').each((_, h) => {
    if (title) return;
    const t = stripHtml($c(h).html() ?? '');
    if (t) title = t;
  });
  if (!title) return null;

  // Cover from `et_pb_image src=»...»` shortcode in the raw (pre-strip) chunk.
  const coverUrl = findCoverUrl(raw);

  // Description plaintext for date heuristic. The chunk is already
  // shortcode-stripped at the splitItems stage.
  const plaintext = stripHtml($c.html() ?? '');

  const eventDateIso =
    parseSpanishDate(plaintext) || dateFromImageUrl(coverUrl);

  // Excerpt: first block-level element with substantive text content. We
  // include <div> here because some items (e.g. "Descubriendo con …") wrap
  // their text in <div>s rather than <p>s.
  let excerpt = '';
  $c('p, div').each((_, el) => {
    if (excerpt) return;
    // Skip wrapper divs that contain block descendants — we want the leaf node.
    if ($c(el).find('p, div').length > 0) return;
    const txt = stripHtml($c(el).html() ?? '');
    if (!txt || txt.length < 20) return;
    excerpt = txt.slice(0, 300);
  });

  const typ = classifyTyp(title);
  const slug = slugify(title) || `noticia-${index + 1}`;

  // Build content blocks. The title is captured in the `title` field, so
  // strip ALL h1s from the body to avoid duplication.
  const $clone = cheerio.load($c.html() ?? '', null, false);
  $clone('h1').remove();

  // Some items wrap text in <div> instead of <p>. htmlToBlocks descends into
  // <div> and emits each inline child as its own paragraph — fragmenting the
  // text. Convert "leaf" divs (no block-level descendants) to <p>.
  const BLOCK_CHILD_SELECTOR = 'p,div,h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote,pre,section,article';
  $clone('div').each((_, d) => {
    const $d = $clone(d);
    if ($d.find(BLOCK_CHILD_SELECTOR).length === 0) {
      // Replace <div>...</div> with <p>...</p>
      $d.replaceWith(`<p>${$d.html() ?? ''}</p>`);
    }
  });

  // Drop empty paragraphs and paragraphs that are nothing but a stray bracket
  // left over from shortcode stripping (e.g. just `[` or `]`).
  $clone('p').each((_, p) => {
    const txt = stripHtml($clone(p).html() ?? '');
    if (!txt || /^[\[\]\s]+$/.test(txt)) $clone(p).remove();
  });

  const blocks = htmlToBlocks($clone.html() ?? '');

  return { title, slug, excerpt, coverUrl, eventDateIso, typ, blocks };
}

// ──────────────────────────────────────────────────────────────────────────────
// PB import
// ──────────────────────────────────────────────────────────────────────────────

async function importItem(pb, item, existingSlugs) {
  if (existingSlugs.has(item.slug)) {
    if (!FORCE) {
      log(`  · skip (exists): ${item.slug}`);
      return { status: 'skipped' };
    }
    log(`  ↻ re-import (force): ${item.slug}`);
    if (!DRY_RUN) {
      const old = await pb.collection('posts').getFirstListItem(`slug = "${item.slug}"`);
      await pb.collection('posts').delete(old.id);
    }
  }

  const imageSrcs = new Set();
  collectImageSrcs(item.blocks, imageSrcs);

  log(
    `→ [${item.typ}] ${item.slug}  ` +
      `(${item.blocks.length} blocks, ${imageSrcs.size} inline imgs, ` +
      `cover=${item.coverUrl ? 'yes' : 'no'}, ` +
      `date=${item.eventDateIso ? item.eventDateIso.slice(0, 10) : '—'})`,
  );

  if (DRY_RUN) return { status: 'dry' };

  const publishedAt = item.eventDateIso ?? new Date().toISOString();
  const data = {
    typ: item.typ,
    title: item.title,
    slug: item.slug,
    excerpt: item.excerpt,
    status: 'published',
    published_at: publishedAt,
    content: item.blocks,
  };
  if (item.typ === 'event' && item.eventDateIso) {
    data.event_date = item.eventDateIso;
  }

  const record = await pb.collection('posts').create(data);

  if (item.coverUrl) {
    const img = await downloadImage(item.coverUrl, { onWarn: warn });
    if (img) {
      const fd = new FormData();
      fd.append('cover', new Blob([img.buf], { type: img.mime }), img.filename);
      await pb.collection('posts').update(record.id, fd);
    }
  }

  const srcMap = new Map();
  for (const src of imageSrcs) {
    const img = await downloadImage(src, { onWarn: warn });
    if (!img) continue;
    const fd = new FormData();
    fd.append('images+', new Blob([img.buf], { type: img.mime }), img.filename);
    const updated = await pb.collection('posts').update(record.id, fd);
    const newName = Array.isArray(updated.images)
      ? updated.images[updated.images.length - 1]
      : null;
    if (newName) {
      srcMap.set(src, `${PB_URL}/api/files/${updated.collectionId}/${updated.id}/${newName}`);
    }
  }

  if (srcMap.size > 0) {
    rewriteImageUrls(item.blocks, srcMap);
    await pb.collection('posts').update(record.id, { content: item.blocks });
  }

  return { status: 'ok' };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  log(`PocketBase URL: ${PB_URL}`);
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${FORCE ? ' (force)' : ''}${Number.isFinite(LIMIT) ? ` limit=${LIMIT}` : ''}`);

  const pb = new PocketBase(PB_URL);
  await pb.collection('users').authWithPassword(PB_USER_EMAIL, PB_USER_PASSWORD);
  log(`Auth ok as ${pb.authStore.record?.email}`);

  const existing = await pb.collection('posts').getFullList({ fields: 'slug' });
  const existingSlugs = new Set(existing.map((r) => r.slug).filter(Boolean));
  log(`Existing posts in PB: ${existingSlugs.size}`);

  log(`Fetching ${SOURCE}/wp-json/wp/v2/pages?slug=${PAGE_SLUG} …`);
  const res = await fetch(`${SOURCE}/wp-json/wp/v2/pages?slug=${PAGE_SLUG}`);
  const pages = await res.json();
  if (!pages?.length) {
    console.error(`Page "${PAGE_SLUG}" not found.`);
    process.exit(1);
  }
  const html = pages[0].content.rendered;

  const segments = splitItems(html);
  log(`Split into ${segments.length} segments with at least one h1.`);

  const items = [];
  const usedSlugs = new Set();
  segments.forEach((seg, i) => {
    const it = extractItem(seg, i);
    if (!it) return;
    // De-dupe slugs within the page (some titles repeat across years).
    let s = it.slug;
    let n = 2;
    while (usedSlugs.has(s)) s = `${it.slug}-${n++}`;
    usedSlugs.add(s);
    it.slug = s;
    items.push(it);
  });
  log(`Extracted ${items.length} items.`);

  // Sort oldest → newest so PB created order is chronological.
  items.sort((a, b) =>
    (a.eventDateIso ?? '').localeCompare(b.eventDateIso ?? ''),
  );

  const filtered = ONLY ? items.filter((i) => i.slug === ONLY) : items;
  const toImport = filtered.slice(0, LIMIT);

  let ok = 0, fail = 0, skipped = 0;
  for (const it of toImport) {
    try {
      const r = await importItem(pb, it, existingSlugs);
      if (r.status === 'ok' || r.status === 'dry') ok += 1;
      else if (r.status === 'skipped') skipped += 1;
    } catch (err) {
      fail += 1;
      console.error(`  ✗ ${it.slug}: ${err.message}`);
    }
  }

  log(`\nDone. ${ok} imported, ${skipped} skipped, ${fail} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
