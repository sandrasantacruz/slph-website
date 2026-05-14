// scripts/sync-to-prod.mjs
//
// Kopiert die `posts`-Records (events + news, unified) inkl. Cover- und
// Gallery-Files vom lokalen PocketBase auf Prod. Re-uploaded Dateien (PB
// vergibt neue Filenames) und re-mapped die Bild-URLs im BlockNote-`content`.
//
// Bricht ab, wenn auf Prod bereits Records existieren — zum erneuten Lauf
// die Collection vorher leeren.
//
// Usage:
//   node scripts/sync-to-prod.mjs

import { config } from 'dotenv';
config();

import PocketBase from 'pocketbase';

const LOCAL_URL = process.env.SYNC_LOCAL_URL ?? 'http://127.0.0.1:8090';
const PROD_URL = process.env.SYNC_PROD_URL ?? 'https://slph.pulpo.cloud';

const LOCAL_SUPER_EMAIL = process.env.PB_SUPERUSER_EMAIL;
const LOCAL_SUPER_PASS = process.env.PB_SUPERUSER_PASSWORD;
const PROD_USER_EMAIL = process.env.SYNC_PROD_EMAIL ?? 'sandra@pulpo.cloud';
const PROD_USER_PASS = process.env.SYNC_PROD_PASSWORD ?? '1234567890';

if (!LOCAL_SUPER_EMAIL || !LOCAL_SUPER_PASS) {
  console.error('PB_SUPERUSER_EMAIL und PB_SUPERUSER_PASSWORD müssen in .env gesetzt sein.');
  process.exit(1);
}

const local = new PocketBase(LOCAL_URL);
const prod = new PocketBase(PROD_URL);

function rewriteContent(content, srcMap) {
  if (!Array.isArray(content)) return;
  for (const b of content) {
    if (b?.type === 'image' && typeof b.props?.url === 'string') {
      const mapped = srcMap.get(b.props.url);
      if (mapped) b.props.url = mapped;
    }
    if (Array.isArray(b?.children)) rewriteContent(b.children, srcMap);
  }
}

async function fetchFile(rec, filename) {
  const url = `${LOCAL_URL}/api/files/${rec.collectionId}/${rec.id}/${filename}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  const blob = await res.blob();
  return blob;
}

async function syncRecord(name, rec, scalarFields) {
  const fd = new FormData();
  fd.append('id', rec.id);
  for (const f of scalarFields) {
    const v = rec[f];
    if (v === null || v === undefined) continue;
    fd.append(f, String(v));
  }

  if (rec.cover) {
    const blob = await fetchFile(rec, rec.cover);
    fd.append('cover', blob, rec.cover);
  }
  const images = Array.isArray(rec.images) ? rec.images : [];
  for (const fname of images) {
    const blob = await fetchFile(rec, fname);
    fd.append('images', blob, fname);
  }

  const created = await prod.collection(name).create(fd);

  if (rec.content) {
    const srcMap = new Map();
    const newImgs = Array.isArray(created.images) ? created.images : [];
    for (let i = 0; i < images.length; i++) {
      if (!newImgs[i]) continue;
      const oldUrl = `${LOCAL_URL}/api/files/${rec.collectionId}/${rec.id}/${images[i]}`;
      const newUrl = `${PROD_URL}/api/files/${created.collectionId}/${created.id}/${newImgs[i]}`;
      srcMap.set(oldUrl, newUrl);
    }
    const content = JSON.parse(JSON.stringify(rec.content));
    rewriteContent(content, srcMap);
    await prod.collection(name).update(created.id, { content });
  }

  console.log(
    `  ✓ ${rec.slug}  (cover=${rec.cover ? 'y' : 'n'}, images=${images.length})`,
  );
}

async function syncCollection(name, scalarFields) {
  const records = await local.collection(name).getFullList({ sort: '+created' });
  console.log(`[${name}] ${records.length} records on local`);
  for (const rec of records) {
    await syncRecord(name, rec, scalarFields);
  }
}

async function main() {
  console.log(`Local: ${LOCAL_URL}`);
  console.log(`Prod:  ${PROD_URL}`);

  await local.collection('_superusers').authWithPassword(LOCAL_SUPER_EMAIL, LOCAL_SUPER_PASS);
  console.log(`Auth ok on local as superuser ${LOCAL_SUPER_EMAIL}`);

  await prod.collection('users').authWithPassword(PROD_USER_EMAIL, PROD_USER_PASS);
  console.log(`Auth ok on prod as ${PROD_USER_EMAIL}`);

  const existing = await prod.collection('posts').getList(1, 1);
  if (existing.totalItems > 0) {
    console.error(
      `Prod posts hat bereits ${existing.totalItems} Records. Abbruch — vorher leeren.`,
    );
    process.exit(1);
  }

  await syncCollection('posts', [
    'typ',
    'title',
    'slug',
    'excerpt',
    'status',
    'published_at',
    'event_date',
    'event_end',
    'location',
    'address_url',
  ]);

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
