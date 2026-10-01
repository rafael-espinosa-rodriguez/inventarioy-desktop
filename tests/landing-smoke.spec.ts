// Spec 001/004: smoke de la landing contra el dev compartido, con /api/*
// bloqueado a nivel de red: sin backend no hay sesión de negocio (con el
// servidor e2e seedado, `/` deriva al PIN — comportamiento correcto) y la
// landing renderiza. Sin servidores propios ni puertos extra.
import { test, expect } from '@playwright/test';

test('landing renderiza e interactúa sin red externa', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());

  const externalFailed: string[] = [];
  page.on('requestfailed', (r) => {
    if (/googleapis|gstatic|cdn\.tailwindcss/.test(r.url())) externalFailed.push(r.url());
  });
  page.on('response', (r) => {
    if (/googleapis|gstatic|cdn\.tailwindcss/.test(r.url()) && r.status() >= 400) {
      externalFailed.push(`${r.status()} ${r.url()}`);
    }
  });

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  await expect(page.getByText('incluso sin internet', { exact: false }).first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('¿Desea aprender a usar la App?', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'No, gracias' }).click();

  await expect(page.getByText('5,000', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Vitalicio' }).click();
  await expect(page.getByText('130,000', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Actualizaciones incluidas de por vida', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: /ESCANDALLO/ }).click();
  await expect(page.getByText('MARGEN: 72.8%', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('44,400 CUP', { exact: false }).first()).toBeVisible();

  const igHrefs = await page.$$eval('a[href*="instagram.com"]', (as) =>
    as.map((a) => (a as HTMLAnchorElement).href)
  );
  expect(igHrefs.length).toBeGreaterThan(0);
  expect(igHrefs.every((h: string) => h.includes('inventario_y'))).toBe(true);

  expect(externalFailed).toEqual([]);
});
