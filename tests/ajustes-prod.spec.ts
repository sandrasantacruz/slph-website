import { test, expect } from '@playwright/test';

const BASE = 'https://slph.pulpo.cloud';

test('login -> open ajustes -> edit -> save', async ({ page }) => {
  page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  page.on('requestfailed', (req) =>
    console.log('[requestfailed]', req.method(), req.url(), req.failure()?.errorText),
  );
  page.on('response', (res) => {
    if (!res.ok() && res.status() !== 304) {
      console.log('[non-2xx]', res.status(), res.request().method(), res.url());
    }
  });

  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="email"]', 'sandra@pulpo.cloud');
  await page.fill('input[name="password"]', '123456789');
  await Promise.all([
    page.waitForURL(/\/admin\//),
    page.click('button[type="submit"]'),
  ]);
  console.log('after login url:', page.url());

  await page.goto(`${BASE}/admin/ajustes`);
  await expect(page.locator('input[name="whatsapp"]')).toBeVisible();

  const initial = {
    whatsapp: await page.inputValue('input[name="whatsapp"]'),
    phone: await page.inputValue('input[name="phone"]'),
    email: await page.inputValue('input[name="email"]'),
  };
  console.log('initial values:', initial);

  const disabledW = await page.locator('input[name="whatsapp"]').isDisabled();
  console.log('whatsapp disabled?', disabledW);

  // Set test value, save
  await page.fill('input[name="whatsapp"]', '+34 600 11 22 33');
  await page.click('button[type="submit"]:has-text("Guardar")');

  // Wait for navigation / render after submit
  await page.waitForLoadState('networkidle');
  console.log('after save url:', page.url());

  const errorBox = page.locator('.text-red-900, .bg-red-50');
  const successBox = page.locator('.text-emerald-900, .bg-emerald-50');
  const errorVisible = await errorBox.first().isVisible().catch(() => false);
  const successVisible = await successBox.first().isVisible().catch(() => false);
  console.log('error visible?', errorVisible, 'success visible?', successVisible);
  if (errorVisible) {
    console.log('error text:', (await errorBox.first().innerText()).trim());
  }
  if (successVisible) {
    console.log('success text:', (await successBox.first().innerText()).trim());
  }

  // Restore initial value
  await page.fill('input[name="whatsapp"]', initial.whatsapp);
  await page.click('button[type="submit"]:has-text("Guardar")');
  await page.waitForLoadState('networkidle');
  const restoredW = await page.inputValue('input[name="whatsapp"]');
  console.log('restored whatsapp value:', restoredW);

  expect(successVisible).toBeTruthy();
});
