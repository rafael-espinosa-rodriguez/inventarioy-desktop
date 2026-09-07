import { test, expect, Page } from '@playwright/test';

// Regresión del error "Cannot access 'se' before initialization" (TDZ) en Ventas:
// el filtro todaySales leía targetShift antes de su declaración cuando el doble
// turno estaba ACTIVO y existían ventas. Los tests existentes no lo cubrían porque
// corren con el doble turno apagado (cortocircuito) y sin ventas en la vista.

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function gotoApp(page: Page, url: string) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      return;
    } catch (e) {
      lastErr = e;
      await page.waitForTimeout(2000);
    }
  }
  throw lastErr;
}

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

async function login(page: Page, pin: string) {
  await gotoApp(page, `${BASE_URL}/login`);
  await dismissOnboarding(page);
  const pinInput = page.locator('#pin');
  await pinInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  if (await pinInput.isVisible().catch(() => false)) {
    await pinInput.fill(pin);
    await page.locator('button').filter({ hasText: /entrar|ingresar|acceder|iniciar/i }).first().click();
    await dismissPinModal(page, pin);
  } else {
    await dismissPinModal(page, pin);
  }
  await expect(page.locator('#root')).toContainText('Ventas', { timeout: 15000 });
  await gotoApp(page, `${BASE_URL}/dashboard`);
  await expect(page.locator('#root')).toContainText('Ventas', { timeout: 15000 });
}

test('Doble turno activo: Ventas no se rompe con ventas cargadas (regresión TDZ)', async ({ page }) => {
  await login(page, '1234');

  // Activar doble turno (corte 15) e insertar una venta de HOY (misma fecha local que
  // usa Ventas) para que el filtro todaySales recorra al menos un elemento.
  const inserted = await page.evaluate(async () => {
    const token = localStorage.getItem('inventarioy_api_token') || '';
    const session = localStorage.getItem('inventarioy_session_token') || '';
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['x-inventarioy-token'] = token;
    if (session) h['x-inventarioy-session'] = session;

    const setKey = async (key: string, value: unknown) => {
      const res = await fetch('/api/settings', { method: 'POST', headers: h, body: JSON.stringify({ key, value }) });
      return res.json();
    };

    const today = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

    const [s1, s2] = await Promise.all([
      setKey('double_shift_enabled', true),
      setKey('shift_cutoff_hour', 15),
    ]);

    const saleRes = await fetch('/api/query', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        table: 'sales',
        method: 'insert',
        data: { user_id: 'owner', total_amount: 10, date: today, sale_type: 'SALON', shift: '1' },
      }),
    });
    const saleJson = await saleRes.json();

    return {
      s1: s1.error || null,
      s2: s2.error || null,
      saleError: saleJson.error || null,
      saleId: (saleJson.data && saleJson.data.id) || null,
    };
  });

  expect(inserted.s1).toBeNull();
  expect(inserted.s2).toBeNull();
  expect(inserted.saleError).toBeNull();
  expect(inserted.saleId).toBeTruthy();

  // Navegar a Ventas. Antes del fix esto rompía con "Cannot access 'se' before initialization".
  try {
    await gotoApp(page, `${BASE_URL}/dashboard/sales`);
    await expect(page.getByText('Punto de Venta').first()).toBeVisible({ timeout: 20000 });
    // El indicador "Turno actual" confirma que el doble turno está cargado y la vista renderizó.
    await expect(page.getByText(/Turno actual:/).first()).toBeVisible({ timeout: 10000 });
  } finally {
    // Limpieza: dejar la BD como estaba (doble turno apagado + borrar la venta insertada)
    // para no afectar a los demás specs que corren en la misma BD compartida.
    await page.evaluate(async (saleId: string | null) => {
      const token = localStorage.getItem('inventarioy_api_token') || '';
      const session = localStorage.getItem('inventarioy_session_token') || '';
      const h: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) h['x-inventarioy-token'] = token;
      if (session) h['x-inventarioy-session'] = session;
      await fetch('/api/settings', { method: 'POST', headers: h, body: JSON.stringify({ key: 'double_shift_enabled', value: false }) });
      if (saleId) {
        await fetch('/api/query', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ table: 'sales', method: 'delete', filters: [{ op: 'eq', column: 'id', value: saleId }] }),
        });
      }
    }, inserted.saleId).catch(() => {});
  }
});

test('Doble turno: cerrar Turno 1 NO bloquea vender en Turno 2 (regresión shift por hora actual)', async ({ page }) => {
  await login(page, '1234');

  // Determinista sin importar la hora: con hora de corte = 0 toda venta es Turno 2
  // (hora < 0 nunca se cumple). Antes del fix, la venta se etiquetaba siempre como
  // Turno 1 (sale.date solo lleva el día) y tras cerrar el Turno 1 se bloqueaba TODO.
  const res = await page.evaluate(async () => {
    const token = localStorage.getItem('inventarioy_api_token') || '';
    const session = localStorage.getItem('inventarioy_session_token') || '';
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['x-inventarioy-token'] = token;
    if (session) h['x-inventarioy-session'] = session;

    const post = async (url: string, body: unknown) => {
      const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
      return r.json();
    };

    await post('/api/settings', { key: 'double_shift_enabled', value: true });
    await post('/api/settings', { key: 'shift_cutoff_hour', value: 0 });

    const iso = new Date().toISOString();
    const today = iso.split('T')[0];
    const prodId = 'prod-shift-test';

    await post('/api/query', { table: 'products', method: 'insert', data: { id: prodId, user_id: 'owner', name: 'Prod Shift Test', unit: 'u', price: 10, cost: 5, quantity: 0, in_transit: 10 } });
    await post('/api/query', { table: 'transit_items', method: 'insert', data: { id: 'transit-shift-test', user_id: 'owner', product_id: prodId, quantity: 10, consumed: 0, remaining: 10, reason: 'Test', sent_date: iso } });

    // Cerrar SOLO el Turno 1 de hoy.
    const closing1 = await post('/api/query', { table: 'daily_closings', method: 'insert', data: { user_id: 'owner', closing_date: today, shift: '1', total_sales: 0, closing_amount: 0 } });

    const saleBody = { date: iso, total_amount: 10, sale_type: 'SALON', is_account_house: false, discount: 0, items: [{ product_id: prodId, quantity: 1, unit_cost: 5, selling_price: 10, subtotal: 10, is_recipe: false }] };
    // Venta en Turno 2 (cutoff 0): debe PERMITIRSE aunque el Turno 1 esté cerrado.
    const sale1 = await post('/api/rpc', { fn: 'sale', args: { sale: saleBody } });

    // Ahora cerrar también el Turno 2.
    const closing2 = await post('/api/query', { table: 'daily_closings', method: 'insert', data: { user_id: 'owner', closing_date: today, shift: '2', total_sales: 0, closing_amount: 0 } });

    // Venta de nuevo en Turno 2: ya está cerrado -> debe rechazarse por DAY_CLOSED.
    const sale2 = await post('/api/rpc', { fn: 'sale', args: { sale: saleBody } });

    return {
      closing1: closing1.error || null,
      closing1Id: (closing1.data && closing1.data.id) || null,
      sale1: { success: !!sale1.data?.success, shift: sale1.data?.sale?.shift || null, error: sale1.error || null },
      sale1Id: (sale1.data && sale1.data.sale && sale1.data.sale.id) || null,
      closing2: closing2.error || null,
      closing2Id: (closing2.data && closing2.data.id) || null,
      sale2: { error: sale2.error || null },
    };
  });

  expect(res.closing1).toBeNull();
  // La venta tras cerrar solo el Turno 1 debe ser permitida y sellada como Turno 2.
  expect(res.sale1.success).toBe(true);
  expect(res.sale1.shift).toBe('2');
  expect(res.sale1.error).toBeNull();
  expect(res.closing2).toBeNull();
  // Con el Turno 2 también cerrado, la siguiente venta se bloquea por día cerrado.
  expect(res.sale2.error?.code).toBe('DAY_CLOSED');

  // Limpieza completa.
  await page.evaluate(async (ids: { c1: string | null; c2: string | null; s1: string | null }) => {
    const token = localStorage.getItem('inventarioy_api_token') || '';
    const session = localStorage.getItem('inventarioy_session_token') || '';
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['x-inventarioy-token'] = token;
    if (session) h['x-inventarioy-session'] = session;
    const del = (table: string, filters: { op: string; column: string; value: unknown }[]) =>
      fetch('/api/query', { method: 'POST', headers: h, body: JSON.stringify({ table, method: 'delete', filters }) }).catch(() => {});
    await fetch('/api/settings', { method: 'POST', headers: h, body: JSON.stringify({ key: 'double_shift_enabled', value: false }) });
    if (ids.c1) await del('daily_closings', [{ op: 'eq', column: 'id', value: ids.c1 }]);
    if (ids.c2) await del('daily_closings', [{ op: 'eq', column: 'id', value: ids.c2 }]);
    if (ids.s1) {
      await del('sale_items', [{ op: 'eq', column: 'sale_id', value: ids.s1 }]);
      await del('sales', [{ op: 'eq', column: 'id', value: ids.s1 }]);
    }
    await del('movements', [{ op: 'eq', column: 'product_id', value: 'prod-shift-test' }]);
    await del('transit_items', [{ op: 'eq', column: 'id', value: 'transit-shift-test' }]);
    await del('products', [{ op: 'eq', column: 'id', value: 'prod-shift-test' }]);
  }, { c1: res.closing1Id, c2: res.closing2Id, s1: res.sale1Id }).catch(() => {});
});