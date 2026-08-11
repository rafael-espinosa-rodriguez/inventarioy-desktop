import { test, expect, type Page } from '@playwright/test';
import {
  BUSINESS_CODE,
  signKey,
  setTrial,
  setExpired,
  setActive,
  setRollback,
  clearRollback,
  getMaxSeen,
  getOwner,
  nowPlusDays,
} from './license-db';

// Los tests comparten la BD temporal del servidor de prueba y corren en serie.
test.describe.configure({ mode: 'serial' });

const APP = 'http://localhost:3000';
const API = 'http://localhost:3000';

const modal = (page: Page) => page.locator('div.fixed.inset-0');
const expiredBanner = (page: Page) => page.getByText(/Su licencia de InventarioY está vencida/);
const trialBanner = (page: Page) => page.getByText(/Prueba gratis: quedan \d+ día[s]?\./);

async function gotoDashboard(page: Page): Promise<void> {
  await page.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/dashboard**', { timeout: 20000 });
}

async function openActivationModal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Activar licencia' }).click();
  await expect(modal(page)).toBeVisible();
}

// Los POSTs directos (page.request) no pasan por el bootstrap de localClient,
// así que obtenemos el token de sesión local del servidor explícitamente.
async function getApiToken(page: Page): Promise<string> {
  const res = await page.request.get(API + '/api/auth/session');
  const body = await res.json();
  const token = body?.data?.token;
  if (!token) throw new Error('No se pudo obtener el token de sesión');
  return token;
}

test('T1: banner de prueba con días restantes y apertura del modal', async ({ page }) => {
  setTrial();

  await gotoDashboard(page);
  await expect(trialBanner(page)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Activar licencia' })).toBeVisible();

  await openActivationModal(page);
  await expect(modal(page).getByRole('heading', { name: 'Activar licencia' })).toBeVisible();
  await expect(modal(page).getByText(BUSINESS_CODE)).toBeVisible();
  await expect(modal(page).getByPlaceholder('XXXXX XXXXX XXXXX XXXXX')).toBeVisible();
});

test('T2: modal forzado al expirar y countdown pausado/recuperado al cerrar', async ({ page }) => {
  setExpired();

  await gotoDashboard(page);
  await expect(expiredBanner(page)).toBeVisible({ timeout: 15000 });

  // El modal aparece forzado, sin ningún clic.
  const m = modal(page);
  await expect(m).toBeVisible();
  await expect(m.getByRole('heading', { name: 'Activar licencia' })).toBeVisible();

  // Countdown congelado en 15 mientras el modal está abierto.
  const countdown = page.getByText(/Su sesión se cerrará en \d+ segundos\./);
  const readCount = async (): Promise<number> => {
    const text = (await countdown.textContent()) ?? '';
    const match = text.match(/en (\d+) segundos/);
    return match ? Number(match[1]) : -1;
  };
  expect(await readCount()).toBe(15);
  await page.waitForTimeout(1600);
  expect(await readCount()).toBe(15);

  // Al cerrar el modal, el conteo se reinicia a 15 y comienza a decrecer.
  await m.getByRole('button', { name: 'Cerrar' }).click();
  await expect(m).toBeHidden();
  expect(await readCount()).toBe(15);
  await page.waitForTimeout(1600);
  expect(await readCount()).toBeLessThan(15);
});

test('T3: activación válida desde el modal (clave con espacios) desbloquea y limpia maxSeen', async ({ page }) => {
  setExpired();
  const validUntil = nowPlusDays(60);
  const rawKey = signKey(BUSINESS_CODE, validUntil);
  // Insertar un espacio para ejercitar la normalización de la clave.
  const keyWithSpaces = rawKey.slice(0, 12) + ' ' + rawKey.slice(12);

  await gotoDashboard(page);
  const m = modal(page);
  await expect(m).toBeVisible({ timeout: 15000 });

  await m.getByPlaceholder('XXXXX XXXXX XXXXX XXXXX').fill(keyWithSpaces);
  await m.getByRole('button', { name: 'Activar', exact: true }).click();

  await expect(page.getByText('Licencia activada correctamente')).toBeVisible({ timeout: 15000 });
  await expect(m).toBeHidden();
  await expect(expiredBanner(page)).toBeHidden();
  await expect(trialBanner(page)).toBeHidden();

  const owner = getOwner();
  expect(owner.license_valid_until).toBe(validUntil);
  expect(String(owner.license_key)).toBeTruthy();
  expect(getMaxSeen()).toBeNull();
});

test('T4: clave de otro negocio rechazada y el modal permanece abierto', async ({ page }) => {
  setExpired();
  const wrongKey = signKey('OTHER99', nowPlusDays(30));

  await gotoDashboard(page);
  const m = modal(page);
  await expect(m).toBeVisible({ timeout: 15000 });

  await m.getByPlaceholder('XXXXX XXXXX XXXXX XXXXX').fill(wrongKey);
  await m.getByRole('button', { name: 'Activar', exact: true }).click();

  await expect(page.getByText('La clave no corresponde a este negocio')).toBeVisible({ timeout: 15000 });
  await expect(m).toBeVisible();
});

test('T5: clave más vieja que la licencia vigente no la acorta (fix #6)', async ({ page }) => {
  setActive(nowPlusDays(30));
  const token = await getApiToken(page);

  const older = signKey(BUSINESS_CODE, nowPlusDays(5));
  const olderRes = await page.request.post(API + '/api/license/activate', { data: { key: older }, headers: { 'x-inventarioy-token': token, origin: API } });
  expect(olderRes.status()).toBe(400);
  const olderBody = await olderRes.json();
  expect(olderBody.error?.message).toBe('La nueva clave vence antes que la licencia actual. Verifique la clave.');

  const newerValidUntil = nowPlusDays(60);
  const newer = signKey(BUSINESS_CODE, newerValidUntil);
  const newerRes = await page.request.post(API + '/api/license/activate', { data: { key: newer }, headers: { 'x-inventarioy-token': token, origin: API } });
  expect(newerRes.status()).toBe(200);
  const newerBody = await newerRes.json();
  expect(newerBody.data?.success).toBe(true);

  const owner = getOwner();
  expect(owner.license_valid_until).toBe(newerValidUntil);
});

test('T6: escrituras bloqueadas (403 LICENSE_EXPIRED) con licencia vencida', async ({ page }) => {
  setExpired();
  const token = await getApiToken(page);

  const res = await page.request.post(API + '/api/query', {
    data: { table: 'categories', method: 'insert', data: { name: 'Categoría E2E', user_id: 'owner' } },
    headers: { 'x-inventarioy-token': token, origin: API },
  });
  expect(res.status()).toBe(403);
  const body = await res.json();
  expect(body.error?.code).toBe('LICENSE_EXPIRED');
});

test('T7: escrituras permitidas con licencia activa', async ({ page }) => {
  setActive(nowPlusDays(30));
  const token = await getApiToken(page);

  const res = await page.request.post(API + '/api/query', {
    data: { table: 'categories', method: 'insert', data: { name: 'Categoría E2E', user_id: 'owner' } },
    headers: { 'x-inventarioy-token': token, origin: API },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.error).toBeNull();
  expect(body.data?.id).toBeTruthy();
});

test('T8: retroceso de reloj (maxSeen futuro) se detecta como vencido sin pisar el marcador', async ({ page }) => {
  setTrial();
  setRollback(nowPlusDays(2));

  await gotoDashboard(page);
  await expect(expiredBanner(page)).toBeVisible({ timeout: 15000 });
  await expect(modal(page)).toBeVisible();

  // touchMaxSeenTime no pisa un marcador futuro: la marca se conserva.
  expect(getMaxSeen()).not.toBeNull();

  clearRollback();
});
