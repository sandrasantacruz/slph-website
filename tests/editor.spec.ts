import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as fs from 'node:fs';

const EMAIL = process.env.TEST_EMAIL ?? process.env.PB_USER_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD ?? process.env.PB_USER_PASSWORD;
const PB_URL = process.env.PB_URL ?? 'http://127.0.0.1:8090';

if (!EMAIL || !PASSWORD) {
  throw new Error('Set PB_USER_EMAIL/PB_USER_PASSWORD (in .env) or TEST_EMAIL/TEST_PASSWORD.');
}

const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url)) + '/fixtures';
const FIXTURE_PNG = path.join(FIXTURES_DIR, 'cover.png');
const FIXTURE_HEIC = path.join(FIXTURES_DIR, 'iphone.heic');

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin/posts');
}

async function deletePost(page: Page, id: string) {
  // Use the PB cookie set during login.
  const cookies = await page.context().cookies();
  const auth = cookies.find((c) => c.name === 'pb_auth');
  if (!auth) return;
  const decoded = JSON.parse(decodeURIComponent(auth.value)) as { token: string };
  await page.request.delete(`${PB_URL}/api/collections/posts/records/${id}`, {
    headers: { Authorization: decoded.token },
  });
}

async function fetchRecord(page: Page, id: string) {
  const cookies = await page.context().cookies();
  const auth = cookies.find((c) => c.name === 'pb_auth')!;
  const decoded = JSON.parse(decodeURIComponent(auth.value)) as { token: string };
  const res = await page.request.get(`${PB_URL}/api/collections/posts/records/${id}`, {
    headers: { Authorization: decoded.token },
  });
  return await res.json();
}

test.describe('Blog editor', () => {
  let createdId: string | null = null;

  test.afterEach(async ({ page }) => {
    if (createdId) {
      await deletePost(page, createdId);
      createdId = null;
    }
  });

  test('login → list page', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: 'Artikel' })).toBeVisible();
  });

  test('create draft, slug auto-derives, validation blocks publish without date', async ({ page }) => {
    await login(page);

    // Create new draft.
    await page.click('button:has-text("Neuer Artikel")');
    await page.waitForURL(/\/admin\/posts\/[a-z0-9]+\/edit/);
    const url = page.url();
    createdId = url.split('/admin/posts/')[1].split('/edit')[0];

    // Editor visible.
    await expect(page.getByLabel('Titel')).toBeVisible();
    await expect(page.getByLabel('URL-Slug')).toBeDisabled();

    // Type title → slug should auto-derive (German umlaut handling).
    await page.getByLabel('Titel').fill('Mein erster Beitrag über Größe & Schönheit');
    await expect(page.getByLabel('URL-Slug')).toHaveValue('mein-erster-beitrag-ueber-groesse-schoenheit');

    // Switch status to published WITHOUT date → save should show error.
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Veröffentlicht' }).click();

    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(
      page.getByText('Veröffentlichungsdatum ist erforderlich, wenn der Artikel veröffentlicht wird.'),
    ).toBeVisible();

    // Switch back to draft, save should succeed.
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Entwurf' }).click();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText(/Gespeichert um/)).toBeVisible({ timeout: 10000 });

    // Verify in PB.
    const record = await fetchRecord(page, createdId);
    expect(record.title).toBe('Mein erster Beitrag über Größe & Schönheit');
    expect(record.slug).toBe('mein-erster-beitrag-ueber-groesse-schoenheit');
    expect(record.status).toBe('draft');
  });

  test('save with empty title → validation error', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Neuer Artikel")');
    await page.waitForURL(/\/admin\/posts\/[a-z0-9]+\/edit/);
    createdId = page.url().split('/admin/posts/')[1].split('/edit')[0];

    await page.click('button:has-text("Speichern")');
    await expect(page.getByText('Titel ist erforderlich.')).toBeVisible();
  });

  test('cover upload converts to WebP and resizes to ≤1500px', async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Neuer Artikel")');
    await page.waitForURL(/\/admin\/posts\/[a-z0-9]+\/edit/);
    createdId = page.url().split('/admin/posts/')[1].split('/edit')[0];

    // The cover upload area is a label with a hidden file input.
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(FIXTURE_PNG);

    // Wait for the preview to appear (cover has been replaced with the WebP filename).
    const filename = page.locator('span.truncate.text-neutral-500').first();
    await expect(filename).toBeVisible({ timeout: 10000 });
    const coverFilename = await filename.textContent();
    expect(coverFilename).toMatch(/\.webp$/);

    // Verify in PB that cover field is set to that webp file.
    const record = await fetchRecord(page, createdId);
    const cover: string = Array.isArray(record.cover) ? record.cover[0] : record.cover;
    expect(cover).toMatch(/\.webp$/);
    expect(cover).toBe(coverFilename);
  });

  // Insert a BlockNote image block via the slash menu and upload a file into it.
  // BlockNote shows a panel with Upload/Embed/Search tabs after the image block
  // is inserted; the Upload tab has a hidden <input type="file"> we drive directly.
  async function insertInlineImage(page: Page, filePath: string) {
    const editor = page.locator('.ProseMirror').first();
    await editor.click();
    await page.keyboard.type('/image');
    // Slash-menu item label "Image" — BlockNote renders these in a popup. Try
    // a few selector strategies to be resilient to BlockNote markup variants.
    const item = page
      .locator('[class*="suggestion"], [class*="slash"]')
      .getByText('Image', { exact: true })
      .first();
    await item.click({ timeout: 5_000 });
    // After clicking, BlockNote renders an image block with an upload UI.
    // Wait for any newly-rendered file input and use it.
    const fileInput = page.locator('input[type="file"]').last();
    await fileInput.setInputFiles(filePath);
  }

  test('inline image: slash menu → upload, deferred until save, save persists WebP', async ({ page }) => {
    test.setTimeout(60_000);

    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser error]', msg.text());
    });

    await login(page);
    await page.click('button:has-text("Neuer Artikel")');
    await page.waitForURL(/\/admin\/posts\/[a-z0-9]+\/edit/);
    createdId = page.url().split('/admin/posts/')[1].split('/edit')[0];

    await page.getByLabel('Titel').fill('Inline image test');

    await insertInlineImage(page, FIXTURE_PNG);

    // Image element should render with a blob: URL (deferred upload).
    const editor = page.locator('.ProseMirror').first();
    const imgInEditor = editor.locator('img').first();
    await expect(imgInEditor).toBeVisible({ timeout: 15_000 });
    const blobSrc = await imgInEditor.getAttribute('src');
    expect(blobSrc).toMatch(/^blob:/);

    // Deferred-upload badge should be visible.
    await expect(page.getByText(/ungespeicherte/)).toBeVisible();

    // PocketBase has no inline images yet.
    const beforeSave = await fetchRecord(page, createdId);
    expect(beforeSave.images).toEqual([]);

    // Save → uploads happen, badge disappears, "Gespeichert" appears.
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText(/ungespeicherte/)).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(/Gespeichert um/)).toBeVisible({ timeout: 15_000 });

    // Image src should now be a permanent PB URL ending in .webp.
    const finalSrc = await imgInEditor.getAttribute('src');
    expect(finalSrc).not.toMatch(/^blob:/);
    expect(finalSrc).toMatch(/\.webp$/);
    expect(finalSrc).toContain(`/api/files/${beforeSave.collectionId}/${createdId}/`);

    // PocketBase has exactly one .webp image attached, and content references it.
    const afterSave = await fetchRecord(page, createdId);
    expect(afterSave.images).toHaveLength(1);
    expect(afterSave.images[0]).toMatch(/\.webp$/);
    const contentStr = JSON.stringify(afterSave.content);
    expect(contentStr).toContain(afterSave.images[0]);
    expect(contentStr).not.toContain('blob:');
  });

  test('inline image: deleting the block reconciles file out of images[]', async ({ page }) => {
    test.setTimeout(60_000);

    await login(page);
    await page.click('button:has-text("Neuer Artikel")');
    await page.waitForURL(/\/admin\/posts\/[a-z0-9]+\/edit/);
    createdId = page.url().split('/admin/posts/')[1].split('/edit')[0];

    await page.getByLabel('Titel').fill('Reconcile test');

    await insertInlineImage(page, FIXTURE_PNG);

    const editor = page.locator('.ProseMirror').first();
    await expect(editor.locator('img').first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText(/Gespeichert um/)).toBeVisible({ timeout: 15_000 });

    const afterFirstSave = await fetchRecord(page, createdId);
    expect(afterFirstSave.images).toHaveLength(1);
    const filename = afterFirstSave.images[0];

    // Delete the image block: click the image, press Backspace.
    await editor.locator('img').first().click();
    await page.keyboard.press('Backspace');
    await expect(editor.locator('img')).toHaveCount(0);

    // Save again → reconciliation should remove the orphan.
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText(/Gespeichert um/)).toBeVisible({ timeout: 15_000 });

    const afterReconcile = await fetchRecord(page, createdId);
    expect(afterReconcile.images).toEqual([]);

    // The file should also be gone from PB storage.
    const cookies = await page.context().cookies();
    const auth = cookies.find((c) => c.name === 'pb_auth')!;
    const decoded = JSON.parse(decodeURIComponent(auth.value)) as { token: string };
    const probe = await page.request.get(
      `${PB_URL}/api/files/${afterReconcile.collectionId}/${createdId}/${filename}`,
      { headers: { Authorization: decoded.token } },
    );
    expect(probe.status()).toBe(404);
  });

  test('HEIC cover upload → decoded with heic2any → WebP', async ({ page }) => {
    test.setTimeout(60_000); // first heic2any call loads WASM, can be slow

    page.on('console', (msg) => console.log(`[browser ${msg.type()}]`, msg.text()));
    page.on('pageerror', (err) => console.log('[page error]', err.message));

    await login(page);
    await page.click('button:has-text("Neuer Artikel")');
    await page.waitForURL(/\/admin\/posts\/[a-z0-9]+\/edit/);
    createdId = page.url().split('/admin/posts/')[1].split('/edit')[0];

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(FIXTURE_HEIC);

    // Either the cover preview shows up, or an error is rendered.
    const filename = page.locator('span.truncate.text-neutral-500').first();
    const errorBox = page.getByText(/heic|HEIC|fehlgeschlagen|umgewandelt/);
    await Promise.race([
      filename.waitFor({ state: 'visible', timeout: 30_000 }),
      errorBox.waitFor({ state: 'visible', timeout: 30_000 }),
    ]);
    if (await errorBox.isVisible()) {
      throw new Error(`Cover-Upload-Fehler im UI: ${await errorBox.textContent()}`);
    }
    await expect(filename).toBeVisible();
    const coverFilename = await filename.textContent();
    expect(coverFilename).toMatch(/\.webp$/);

    const record = await fetchRecord(page, createdId);
    const cover: string = Array.isArray(record.cover) ? record.cover[0] : record.cover;
    expect(cover).toMatch(/\.webp$/);

    // Sanity check: WebP file size should be a fraction of the 2.3 MB HEIC.
    const cookies = await page.context().cookies();
    const auth = cookies.find((c) => c.name === 'pb_auth')!;
    const decoded = JSON.parse(decodeURIComponent(auth.value)) as { token: string };
    const fileRes = await page.request.get(
      `${PB_URL}/api/files/${record.collectionId}/${record.id}/${cover}`,
      { headers: { Authorization: decoded.token } },
    );
    const buf = await fileRes.body();
    const originalSize = fs.statSync(FIXTURE_HEIC).size;
    console.log(`HEIC ${(originalSize / 1024).toFixed(0)} kB → WebP ${(buf.length / 1024).toFixed(0)} kB`);
    expect(buf.length).toBeLessThan(originalSize); // smaller than original HEIC
  });
});
