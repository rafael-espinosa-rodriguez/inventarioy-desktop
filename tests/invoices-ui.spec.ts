// Regresión: el módulo Facturación debe abrir y listar sin toast "No autorizado".
// Cubre que los GET de invoice.list e invoice.report envíen x-inventarioy-token
// (fetch crudo sin headers provocaba 401 solo en este módulo).
// No requiere BD pristine: acepta lista vacía ("Sin facturas") o con folios
// (p. ej. tras correr invoices-api.spec.ts en la misma suite).
import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OWNER_PIN = '1234';

async function dismissOnboarding(page: Page) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'aprender a usar' });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 3000 });
    await dialog.getByRole('button').first().click({ timeout: 2000 }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await dialog.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  } catch { /* sin dialog de onboarding */ }
}

async function dismissPinModal(page: Page, pin: string) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'Identificación' });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    return;
  }
  const pinInput = dialog.locator('input[placeholder="0000"]').first();
  if (await pinInput.isVisible().catch(() => false)) {
    await pinInput.fill(pin);
  } else {
    for (const d of pin) await dialog.locator(`button:has-text("${d}")`).first().click();
  }
  const btn = dialog.getByRole('button', { name: 'Identificarse' });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await dialog.waitFor({ state: 'hidden', timeout: 8000 });
  } else {
    await dialog.getByRole('button', { name: 'Cerrar' }).click();
  }
}

test('Facturación abre sin "No autorizado", lista y reporta', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto(`${BASE_URL}/login`);
  await dismissOnboarding(page);
  const pinInput = page.locator('#pin');
  await pinInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  if (await pinInput.isVisible().catch(() => false)) {
    await pinInput.fill(OWNER_PIN);
    await page.locator('button').filter({ hasText: /entrar|ingresar|acceder|iniciar/i }).first().click();
    await dismissPinModal(page, OWNER_PIN);
  } else {
    await dismissPinModal(page, OWNER_PIN);
  }
  await expect(page.locator('#root')).toContainText('Ventas', { timeout: 15000 });

  await page.goto(`${BASE_URL}/dashboard/invoices`);
  // Breadcrumb en español (no el segmento crudo "invoices").
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Facturación', { timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Facturación' })).toBeVisible({ timeout: 15000 });
  // El listado cargó: vacío ("Sin facturas") o con folios CR-AAAA-NNNNNN.
  await expect(page.locator('#root')).toContainText(/Sin facturas|CR-\d{4}-\d{6}/, { timeout: 30000 });
  // Ningún 401 enmascarado.
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'No autorizado' })).toHaveCount(0);

  // El reporte mensual también usa GET con auth: debe responder (con filas o
  // con "Sin facturas emitidas"), nunca 401.
  await page.getByRole('button', { name: /Reporte ONAT del mes/ }).click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Reporte \d{4}-\d{2}|Sin facturas emitidas/ }).first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'No autorizado' })).toHaveCount(0);
});
