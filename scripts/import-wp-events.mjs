// scripts/import-wp-events.mjs
//
// Imports past events from the legacy WordPress page /eventos-anteriores/
// into the PocketBase `events` collection.
//
// The page is one big WP-Block page with a top-level <section> per event;
// each contains an <h3> title, an intro <p>, a YouTube embed, and a gallery.
// We extract: title, slug, excerpt (first p), content (everything), cover (first
// image), event_date (heuristically from the first image's upload path YYYY/MM).
//
// Usage:
//   node scripts/import-wp-events.mjs [--dry-run] [--force] [--only=slug] [--verbose]

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

const SOURCE = 'https://nueva.silospeceshablaran.com';
const PAGE_SLUG = 'eventos-anteriores';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const VERBOSE = args.includes('--verbose');
const ONLY = (() => {
  const a = args.find((x) => x.startsWith('--only='));
  return a ? a.split('=')[1] : null;
})();

const log = (...a) => console.log(...a);
const warn = (msg) => (VERBOSE ? console.warn(`  ! ${msg}`) : null);

// ──────────────────────────────────────────────────────────────────────────────
// Parse the WP page into individual events
// ──────────────────────────────────────────────────────────────────────────────

function eventDateFromUrl(url) {
  // WP upload paths look like /wp-content/uploads/YYYY/MM/file.ext
  const m = /\/uploads\/(\d{4})\/(\d{2})\//.exec(url ?? '');
  if (!m) return null;
  // First of the month — we don't know the day from the URL.
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toISOString();
}

function bestSrc($el) {
  const src = $el.attr('src') ?? '';
  const dataSrc = $el.attr('data-src') || $el.attr('data-lazy-src') || '';
  if (src && !src.startsWith('data:')) return src;
  return dataSrc || src;
}

function extractEvents(html) {
  const $ = cheerio.load(html);
  $('noscript').remove();

  const events = [];
  // Top-level sections are the structure used here.
  $('section.wp-block-group').each((_, sec) => {
    const $sec = $(sec);

    // Only consider sections that are themselves top-level (not nested in another section).
    if ($sec.parents('section.wp-block-group').length > 0) return;

    const $h3 = $sec.find('h3').first();
    if ($h3.length === 0) return; // intro/footer section without title

    const title = stripHtml($h3.html() ?? '');
    if (!title) return;

    const slug = slugify(title) || `event-${events.length + 1}`;

    // First descriptive <p> = excerpt
    const firstP = $sec.find('p').first();
    const excerpt = stripHtml(firstP.html() ?? '').slice(0, 300);

    // First real image = cover (and serves as date heuristic)
    let coverUrl = null;
    $sec.find('img').each((_, img) => {
      if (coverUrl) return;
      const src = bestSrc($(img));
      if (src && !src.startsWith('data:')) coverUrl = src;
    });

    const eventDateIso = eventDateFromUrl(coverUrl);

    // The full HTML of this section becomes content. We strip the cover img
    // so it isn't duplicated below the cover in the detail view.
    const $clone = $sec.clone();
    // Remove the first <h3> (we already capture it as title)
    $clone.find('h3').first().remove();
    // Remove the intro <p> (we use it as excerpt)
    $clone.find('p').first().remove();
    // Remove the first image (used as cover)
    let removedFirstImg = false;
    $clone.find('img').each((_, img) => {
      if (removedFirstImg) return;
      const src = bestSrc($(img));
      if (src && !src.startsWith('data:')) {
        $(img).closest('figure').remove();
        removedFirstImg = true;
      }
    });

    const innerHtml = $clone.html() ?? '';
    const blocks = htmlToBlocks(innerHtml);

    events.push({
      title,
      slug,
      excerpt,
      coverUrl,
      eventDateIso,
      blocks,
    });
  });

  return events;
}

// ──────────────────────────────────────────────────────────────────────────────
// Import a single event into PB
// ──────────────────────────────────────────────────────────────────────────────

async function importEvent(pb, ev, existingSlugs) {
  if (existingSlugs.has(ev.slug)) {
    if (!FORCE) {
      log(`  · skip (exists): ${ev.slug}`);
      return;
    }
    log(`  ↻ re-import (force): ${ev.slug}`);
    if (!DRY_RUN) {
      const old = await pb.collection('events').getFirstListItem(`slug = "${ev.slug}"`);
      await pb.collection('events').delete(old.id);
    }
  }

  const imageSrcs = new Set();
  collectImageSrcs(ev.blocks, imageSrcs);

  log(
    `→ ${ev.slug}  (${ev.blocks.length} blocks, ${imageSrcs.size} inline imgs, ` +
      `cover=${ev.coverUrl ? 'yes' : 'no'}, date=${ev.eventDateIso ? ev.eventDateIso.slice(0, 10) : '—'})`,
  );

  if (DRY_RUN) return;

  const publishedAt = ev.eventDateIso ?? new Date().toISOString();

  const record = await pb.collection('events').create({
    title: ev.title,
    slug: ev.slug,
    excerpt: ev.excerpt,
    status: 'published',
    published_at: publishedAt,
    event_date: ev.eventDateIso ?? '',
    content: ev.blocks,
  });

  if (ev.coverUrl) {
    const img = await downloadImage(ev.coverUrl, { onWarn: warn });
    if (img) {
      const fd = new FormData();
      fd.append('cover', new Blob([img.buf], { type: img.mime }), img.filename);
      await pb.collection('events').update(record.id, fd);
    }
  }

  const srcMap = new Map();
  for (const src of imageSrcs) {
    const img = await downloadImage(src, { onWarn: warn });
    if (!img) continue;
    const fd = new FormData();
    fd.append('images+', new Blob([img.buf], { type: img.mime }), img.filename);
    const updated = await pb.collection('events').update(record.id, fd);
    const newName = Array.isArray(updated.images)
      ? updated.images[updated.images.length - 1]
      : null;
    if (newName) {
      srcMap.set(src, `${PB_URL}/api/files/${updated.collectionId}/${updated.id}/${newName}`);
    }
  }

  if (srcMap.size > 0) {
    rewriteImageUrls(ev.blocks, srcMap);
    await pb.collection('events').update(record.id, { content: ev.blocks });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  log(`PocketBase URL: ${PB_URL}`);
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${FORCE ? ' (force)' : ''}`);

  const pb = new PocketBase(PB_URL);
  await pb.collection('users').authWithPassword(PB_USER_EMAIL, PB_USER_PASSWORD);
  log(`Auth ok as ${pb.authStore.record?.email}`);

  const existing = await pb.collection('events').getFullList({ fields: 'slug' });
  const existingSlugs = new Set(existing.map((r) => r.slug).filter(Boolean));
  log(`Existing events in PB: ${existingSlugs.size}`);

  log(`Fetching ${SOURCE}/${PAGE_SLUG} …`);
  const res = await fetch(`${SOURCE}/wp-json/wp/v2/pages?slug=${PAGE_SLUG}`);
  const pages = await res.json();
  if (!pages?.length) {
    console.error(`Page "${PAGE_SLUG}" not found.`);
    process.exit(1);
  }
  const html = pages[0].content.rendered;
  const events = extractEvents(html);
  log(`Parsed ${events.length} events from the page.`);

  // Sort by event_date (oldest → newest) so PB created order matches chronology.
  events.sort((a, b) => {
    const ad = a.eventDateIso ?? '';
    const bd = b.eventDateIso ?? '';
    return ad.localeCompare(bd);
  });

  const filtered = ONLY ? events.filter((e) => e.slug === ONLY) : events;

  let ok = 0, fail = 0;
  for (const ev of filtered) {
    try {
      await importEvent(pb, ev, existingSlugs);
      ok += 1;
    } catch (err) {
      fail += 1;
      console.error(`  ✗ ${ev.slug}: ${err.message}`);
    }
  }

  log(`\nDone. ${ok} imported, ${fail} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
