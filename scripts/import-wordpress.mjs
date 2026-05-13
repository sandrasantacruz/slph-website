// scripts/import-wordpress.mjs
//
// Imports posts from the legacy WordPress sites into the PocketBase `news` collection.
// - Fetches via /wp-json/wp/v2/posts (paginated)
// - Dedupes by slug across both sources (first source wins)
// - Converts content.rendered HTML to a BlockNote-compatible JSON structure
// - Downloads featured_media + every inline <img>, resizes to ≤1500px, encodes as WebP,
//   and re-uploads them to PB. URLs in the content are rewritten.
// - Idempotent: existing slugs are skipped unless --force is passed
//
// Usage:
//   node scripts/import-wordpress.mjs [--dry-run] [--force] [--limit=N] [--only=slug] [--verbose]

import { config } from 'dotenv';
config();

import PocketBase from 'pocketbase';

import {
  htmlToBlocks,
  collectImageSrcs,
  rewriteImageUrls,
  downloadImage,
  stripHtml,
} from './_import-utils.mjs';

const PB_URL = process.env.PUBLIC_POCKETBASE_URL ?? 'http://127.0.0.1:8090';
const PB_USER_EMAIL = process.env.PB_USER_EMAIL;
const PB_USER_PASSWORD = process.env.PB_USER_PASSWORD;

if (!PB_USER_EMAIL || !PB_USER_PASSWORD) {
  console.error('PB_USER_EMAIL und PB_USER_PASSWORD müssen in .env gesetzt sein.');
  process.exit(1);
}

const SOURCES = [
  'https://nueva.silospeceshablaran.com',
  'https://silospeceshablaran.com',
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const VERBOSE = args.includes('--verbose');
const LIMIT = (() => {
  const a = args.find((x) => x.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();
const ONLY = (() => {
  const a = args.find((x) => x.startsWith('--only='));
  return a ? a.split('=')[1] : null;
})();

const log = (...a) => console.log(...a);
const warn = (msg) => (VERBOSE ? console.warn(`  ! ${msg}`) : null);

async function fetchAllPosts(baseUrl) {
  const out = [];
  let page = 1;
  for (;;) {
    const url = `${baseUrl}/wp-json/wp/v2/posts?per_page=50&page=${page}&_embed=wp:featuredmedia`;
    const res = await fetch(url);
    if (res.status === 400) break;
    if (!res.ok) throw new Error(`WP fetch failed: ${res.status} ${url}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch.map((p) => ({ ...p, _source: baseUrl })));
    const totalPages = Number(res.headers.get('x-wp-totalpages') ?? '1');
    if (page >= totalPages) break;
    page += 1;
  }
  return out;
}

async function importPost(pb, post, existingSlugs) {
  const slug = post.slug;
  const title = stripHtml(post.title?.rendered ?? '');
  const excerpt = stripHtml(post.excerpt?.rendered ?? '').slice(0, 300);
  const publishedAt = new Date(post.date_gmt ? post.date_gmt + 'Z' : post.date).toISOString();
  const html = post.content?.rendered ?? '';

  if (existingSlugs.has(slug)) {
    if (!FORCE) {
      log(`  · skip (exists): ${slug}`);
      return;
    }
    log(`  ↻ re-import (force): ${slug}`);
    if (!DRY_RUN) {
      const old = await pb.collection('news').getFirstListItem(`slug = "${slug}"`);
      await pb.collection('news').delete(old.id);
    }
  }

  const blocks = htmlToBlocks(html);
  const imageSrcs = new Set();
  collectImageSrcs(blocks, imageSrcs);

  let featuredUrl = null;
  const featured = post._embedded?.['wp:featuredmedia']?.[0];
  if (featured) {
    const sizes = featured.media_details?.sizes ?? {};
    featuredUrl =
      featured.source_url ??
      sizes['2048x2048']?.source_url ??
      sizes['1536x1536']?.source_url ??
      sizes.large?.source_url ??
      null;
  }

  log(`→ ${slug}  (${blocks.length} blocks, ${imageSrcs.size} inline imgs, cover=${featuredUrl ? 'yes' : 'no'})`);

  if (DRY_RUN) return;

  const record = await pb.collection('news').create({
    title, slug, excerpt, status: 'published', published_at: publishedAt, content: blocks,
  });

  if (featuredUrl) {
    const img = await downloadImage(featuredUrl, { onWarn: warn });
    if (img) {
      const fd = new FormData();
      fd.append('cover', new Blob([img.buf], { type: img.mime }), img.filename);
      await pb.collection('news').update(record.id, fd);
    }
  }

  const srcMap = new Map();
  for (const src of imageSrcs) {
    const img = await downloadImage(src, { onWarn: warn });
    if (!img) continue;
    const fd = new FormData();
    fd.append('images+', new Blob([img.buf], { type: img.mime }), img.filename);
    const updated = await pb.collection('news').update(record.id, fd);
    const newName = Array.isArray(updated.images)
      ? updated.images[updated.images.length - 1]
      : null;
    if (newName) {
      srcMap.set(src, `${PB_URL}/api/files/${updated.collectionId}/${updated.id}/${newName}`);
    }
  }

  if (srcMap.size > 0) {
    rewriteImageUrls(blocks, srcMap);
    await pb.collection('news').update(record.id, { content: blocks });
  }
}

async function main() {
  log(`PocketBase URL: ${PB_URL}`);
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${FORCE ? ' (force)' : ''}${Number.isFinite(LIMIT) ? `  limit=${LIMIT}` : ''}`);

  const pb = new PocketBase(PB_URL);
  await pb.collection('users').authWithPassword(PB_USER_EMAIL, PB_USER_PASSWORD);
  log(`Auth ok as ${pb.authStore.record?.email}`);

  const existing = await pb.collection('news').getFullList({ fields: 'slug' });
  const existingSlugs = new Set(existing.map((r) => r.slug).filter(Boolean));
  log(`Existing news in PB: ${existingSlugs.size}`);

  const all = [];
  for (const src of SOURCES) {
    log(`Fetching ${src} …`);
    const posts = await fetchAllPosts(src);
    log(`  ${posts.length} posts.`);
    all.push(...posts);
  }

  const seen = new Set();
  const deduped = [];
  for (const p of all) {
    if (!p.slug || seen.has(p.slug)) continue;
    seen.add(p.slug);
    deduped.push(p);
  }
  log(`After dedupe: ${deduped.length} posts.`);

  deduped.sort((a, b) => new Date(a.date) - new Date(b.date));

  const filtered = ONLY ? deduped.filter((p) => p.slug === ONLY) : deduped;
  const toImport = filtered.slice(0, LIMIT);

  let ok = 0, fail = 0;
  for (const p of toImport) {
    try {
      await importPost(pb, p, existingSlugs);
      ok += 1;
    } catch (err) {
      fail += 1;
      console.error(`  ✗ ${p.slug}: ${err.message}`);
    }
  }

  log(`\nDone. ${ok} imported, ${fail} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
