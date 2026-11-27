// Spec 009: precios múltiples por rol (listas, precios por producto y USD).
import { test, expect, Page } from '@playwright/test';
import { randomBytes, scryptSync } from 'node:crypto';

const APP_URL = 'http://localhost:3000';
const BASE = 'http://127.0.0.1:4173';
const suffix = String(Date.now()).slice(-7);

let token = '';
let session = '';

async function call(request: any, method: string, p: string, body?: any, auth = true, extraHeaders: Record<string, string> = {}) {
  const res = await request.fetch(`${BASE}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE,
      ...(auth && token ? { 'x-inventarioy-token': token } : {}),
      ...(auth && session ? { 'x-inventarioy-session': session } : {}),
      ...extraHeaders,
    },
    ...(body ? { data: body } : {}),
  });
  return { status: res.status(), j: await res.json().catch(() => ({})) };
}

async function queryRows(request: any, table: string, filters: any[] = []) {
  const r = await call(request, 'POST', '/api/query', { table, method: 'select', columns: '*', filters });
  expect(r.status).toBe(200);
  return (r.j?.data || []) as any[];
}

async function insertRow(request: any, table: string, data: any) {
  const r = await call(request, 'POST', '/api/query', { table, method: 'insert', data });
  expect(r.j?.error, `insert ${table}: ${JSON.stringify(r.j?.error)}`).toBeFalsy();
  return r.j?.data;
}

async function dismissPinModal(page: Page, pin = '1234') {
  const dialog = page.getByRole('dialog').filter({ hasText: 'Identificación' });
  if (await dialog.count().catch(() => 0)) {
    const pinInput = page.locator('input[placeholder="0000"]').first();
    if (await pinInput.count().catch(() => 0)) await pinInput.fill(pin);
    const identifyBtn = page.getByRole('button', { name: 'Identificarse' });
    if (await identifyBtn.count().catch(() => 0)) {
      await identifyBtn.click();
      await page.waitForTimeout(1500).catch(() => {});
    }
    if (await dialog.count().catch(() => 0)) {
      await page.getByRole('button', { name: 'Cerrar' }).first().click().catch(() => {});
      await page.waitForTimeout(1000);
    }
  }
}

async function loginUi(page: Page, pin: string) {
  await page.goto(APP_URL + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  if (!page.url().includes('/dashboard')) {
    await page.fill('#pin', pin);
    await page.getByRole('button', { name: /entrar|ingresar|acceder|iniciar/i }).first().click();
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });
    await page.waitForTimeout(2500);
  }
  await dismissPinModal(page, pin);
}

async function seedProduct(request: any, name: string, basePrice: number) {
  const warehouses = await queryRows(request, 'warehouses', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  let warehouseId = warehouses.find(w => w.is_main)?.id || warehouses[0]?.id;
  if (!warehouseId) {
    warehouseId = `wh-${suffix}`;
    await insertRow(request, 'warehouses', {
      id: warehouseId, user_id: 'owner', name: 'Almacén', is_main: 1, created_at: new Date().toISOString(),
    });
  }
  const productId = `pl-${suffix}-${Math.random().toString(36).slice(2, 7)}`;
  await insertRow(request, 'products', {
    id: productId, user_id: 'owner', name, category: 'Otros', unit: 'u',
    quantity: 10, price: basePrice, cost: 50, rop: 0, eoq: 0, is_individual: 1, is_active: 1,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  await insertRow(request, 'product_warehouse', {
    id: `pw-${productId}`, product_id: productId, warehouse_id: warehouseId,
    quantity: 10, in_transit: 5, updated_at: new Date().toISOString(),
  });
  await insertRow(request, 'transit_items', {
    id: `tr-${productId}`, user_id: 'owner', product_id: productId,
    quantity: 5, consumed: 0, remaining: 5, reason: 'Seed QA',
    sent_date: new Date().toISOString(), created_at: new Date().toISOString(), warehouse_id: warehouseId,
  });
  return { productId, warehouseId };
}

async function createList(request: any, name: string, roles: string[], isDefault = false) {
  const id = `list-${suffix}-${Math.random().toString(36).slice(2, 6)}`;
  await insertRow(request, 'price_lists', {
    id, user_id: 'owner', name, is_default: isDefault ? 1 : 0, is_active: 1,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  for (const roleId of roles) {
    await insertRow(request, 'price_list_roles', { price_list_id: id, role_id: roleId });
  }
  return id;
}

test.beforeAll(async ({ request }) => {
  const login = await call(request, 'POST', '/api/auth/login', { pin: '1234' }, false);
  expect(login.j?.data?.success).toBe(true);
  token = login.j.data.token;
  session = login.j.data.sessionToken;

  const existingRoles = await queryRows(request, 'roles', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  if (!existingRoles.some(r => r.id === 'owner')) {
    await insertRow(request, 'roles', {
      id: 'owner', user_id: 'owner', name: 'Dueño/a',
      modules: JSON.stringify(['sales', 'inventory', 'movements', 'transit', 'recipes', 'consumption', 'closings', 'charts', 'analysis', 'filtered', 'hr', 'settings', 'pricing']),
      is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
  }

  // PIN de dependiente para probar permisos y resolución por rol.
  const salt = randomBytes(16);
  const hash = scryptSync('2222', salt, 64);
  await insertRow(request, 'access_pins', {
    id: `pin-clerk-${suffix}`, user_id: 'owner',
    pin_hash: `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`,
    role: 'clerk', pin_name: 'Cajero Precios QA', is_active: 1,
    failed_attempts: 0, created_at: new Date().toISOString(),
  });
});

test('solo dueño/económico puede gestionar listas y precios', async ({ request }) => {
  const listId = await createList(request, `Permisos QA ${suffix}`, ['owner']);
  expect(listId).toBeTruthy();

  // Dependiente: intento de crear lista → 403 por módulo pricing.
  const clerkLogin = await call(request, 'POST', '/api/auth/login', { pin: '2222' }, false);
  expect(clerkLogin.j?.data?.success).toBe(true);
  const clerkToken = clerkLogin.j.data.token;
  const clerkSession = clerkLogin.j.data.sessionToken;

  const denied = await call(
    request, 'POST', '/api/query',
    {
      table: 'price_lists', method: 'insert',
      data: {
        id: `denied-${suffix}`, user_id: 'owner', name: 'No permitida',
        is_default: 0, is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
    },
    true,
    { 'x-inventarioy-token': clerkToken, 'x-inventarioy-session': clerkSession }
  );
  expect(denied.status).toBe(403);
});

test('la venta guarda la lista de precios usada', async ({ request }) => {
  const listId = await createList(request, `Venta QA ${suffix}`, ['owner'], true);
  const { productId } = await seedProduct(request, `precio venta qa ${suffix}`, 100);

  const saleRes = await call(request, 'POST', '/api/rpc', {
    fn: 'sale',
    args: {
      sale: {
        items: [{ product_id: productId, quantity: 1, unit_cost: 50, selling_price: 150, subtotal: 150, is_recipe: false }],
        total_amount: 150, date: new Date().toISOString(), sale_type: 'VENTA_RAPIDA',
        discount: 0, payment_method: 'Efectivo: 150', efectivo: 150,
        price_list_id: listId, price_list_name: `Venta QA ${suffix}`,
      },
    },
  });
  expect(saleRes.j?.data?.success).toBe(true);
  const saleId = saleRes.j.data.sale.id;
  const rows = await queryRows(request, 'sales', [{ op: 'eq', column: 'id', value: saleId }]);
  expect(rows[0].price_list_id).toBe(listId);
  expect(rows[0].price_list_name).toBe(`Venta QA ${suffix}`);
});

test('UI: crear lista, precio por producto y POS usa la lista del rol', async ({ page, request }) => {
  const { productId } = await seedProduct(request, `precio ui qa ${suffix}`, 100);

  await loginUi(page, '1234');

  // Crear lista desde Configuración y asignarla al rol Dueño.
  await page.goto(APP_URL + '/dashboard/settings', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await dismissPinModal(page);
  await page.locator('#price_list_name').fill(`Mayorista UI ${suffix}`);
  await page.locator('#price_role_owner').check();
  await page.getByRole('button', { name: 'Crear lista' }).click();
  await expect(page.getByText(`Mayorista UI ${suffix}`).first()).toBeVisible({ timeout: 15000 });

  const lists = await queryRows(request, 'price_lists', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  const list = lists.find(l => l.name === `Mayorista UI ${suffix}`);
  expect(list).toBeTruthy();

  // Precio por lista + USD para el producto.
  await insertRow(request, 'product_prices', {
    id: `pp-${suffix}`, product_id: productId, price_list_id: list.id, price: 150,
    updated_at: new Date().toISOString(),
  });
  await call(request, 'POST', '/api/query', {
    table: 'products', method: 'update', data: { price_usd: 2 },
    filters: [{ op: 'eq', column: 'id', value: productId }],
  });

  // POS: badge de lista y precio de la lista (no el precio base 100).
  await page.goto(APP_URL + '/dashboard/sales', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await dismissPinModal(page);
  await expect(page.getByText(`Lista: Mayorista UI ${suffix}`)).toBeVisible({ timeout: 15000 });
  const card = page.locator('button', { hasText: `precio ui qa ${suffix}` }).first();
  await expect(card).toContainText('$150.00');
  await expect(card).toContainText('≈ $2.00 USD');
});

test('UI: el dependiente usa la lista asignada a su rol', async ({ page, request }) => {
  const { productId } = await seedProduct(request, `precio clerk qa ${suffix}`, 100);
  const clerkListId = await createList(request, `Minorista QA ${suffix}`, ['clerk']);
  await insertRow(request, 'product_prices', {
    id: `pp-clerk-${suffix}`, product_id: productId, price_list_id: clerkListId, price: 120,
    updated_at: new Date().toISOString(),
  });

  await loginUi(page, '2222');
  await page.goto(APP_URL + '/dashboard/sales', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await dismissPinModal(page);

  await expect(page.getByText(`Lista: Minorista QA ${suffix}`)).toBeVisible({ timeout: 15000 });
  const card = page.locator('button', { hasText: `precio clerk qa ${suffix}` }).first();
  await expect(card).toContainText('$120.00');
});
async function createRoleWithPin(request: any, roleId: string, modules: string[], pin: string) {
  const existing = await queryRows(request, 'roles', [{ op: 'eq', column: 'id', value: roleId }]);
  if (existing.length === 0) {
    await insertRow(request, 'roles', {
      id: roleId, user_id: 'owner', name: roleId, modules: JSON.stringify(modules),
      is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
  }
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 64);
  await insertRow(request, 'access_pins', {
    id: `pin-${roleId}`, user_id: 'owner',
    pin_hash: `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`,
    role: roleId, pin_name: roleId, is_active: 1, failed_attempts: 0,
    created_at: new Date().toISOString(),
  });
}

test('un rol personalizado con módulo pricing puede gestionar listas', async ({ request }) => {
  const roleId = `pricingqa-${suffix}`;
  await createRoleWithPin(request, roleId, ['sales', 'pricing'], '7777');
  const login = await call(request, 'POST', '/api/auth/login', { pin: '7777' }, false);
  expect(login.j?.data?.success).toBe(true);
  const r = await call(
    request, 'POST', '/api/query',
    {
      table: 'price_lists', method: 'insert',
      data: {
        id: `custom-list-${suffix}`, user_id: 'owner', name: `Custom QA ${suffix}`,
        is_default: 0, is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
    },
    true,
    { 'x-inventarioy-token': login.j.data.token, 'x-inventarioy-session': login.j.data.sessionToken }
  );
  expect(r.status).toBe(200);
  expect(r.j?.error).toBeFalsy();
});

test('sin lista asignada al rol se usa la predeterminada', async ({ page, request }) => {
  const { productId } = await seedProduct(request, `precio fallback qa ${suffix}`, 100);
  // Dejar una sola lista predeterminada.
  await call(request, 'POST', '/api/query', {
    table: 'price_lists', method: 'update', data: { is_default: 0 },
    filters: [{ op: 'eq', column: 'user_id', value: 'owner' }],
  });
  const defaultListId = await createList(request, `Default QA ${suffix}`, [], true);
  await insertRow(request, 'product_prices', {
    id: `pp-fallback-${suffix}`, product_id: productId, price_list_id: defaultListId,
    price: 90, updated_at: new Date().toISOString(),
  });
  const roleId = `fallbackqa-${suffix}`;
  await createRoleWithPin(request, roleId, ['sales'], '6666');

  await loginUi(page, '6666');
  await page.goto(APP_URL + '/dashboard/sales', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await dismissPinModal(page, '6666');

  await expect(page.getByText(`Lista: Default QA ${suffix}`)).toBeVisible({ timeout: 15000 });
  const card = page.locator('button', { hasText: `precio fallback qa ${suffix}` }).first();
  await expect(card).toContainText('$90.00');
});

test('UI: editar y eliminar una lista de precios', async ({ page, request }) => {
  const listId = await createList(request, `Editable QA ${suffix}`, ['owner']);
  await loginUi(page, '1234');
  await page.goto(APP_URL + '/dashboard/settings', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await dismissPinModal(page);

  await page.getByLabel(`Editar lista Editable QA ${suffix}`).click();
  await page.locator('#price_list_name').fill(`Editada QA ${suffix}`);
  await page.locator('#price_list_save').click();
  await expect(page.getByText(`Editada QA ${suffix}`).first()).toBeVisible({ timeout: 15000 });

  await page.getByLabel(`Eliminar lista Editada QA ${suffix}`).click();
  await page.getByRole('dialog').filter({ hasText: 'Eliminar lista de precios' }).getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText(`Editada QA ${suffix}`)).toHaveCount(0, { timeout: 15000 });

  const rows = await queryRows(request, 'price_lists', [{ op: 'eq', column: 'id', value: listId }]);
  expect(rows.length).toBe(0);
});

test('la venta en USD guarda el monto y la lista', async ({ request }) => {
  const listId = await createList(request, `USD QA ${suffix}`, ['owner']);
  const { productId } = await seedProduct(request, `precio usd qa ${suffix}`, 100);
  const saleRes = await call(request, 'POST', '/api/rpc', {
    fn: 'sale',
    args: {
      sale: {
        items: [{ product_id: productId, quantity: 1, unit_cost: 50, selling_price: 150, subtotal: 150, is_recipe: false }],
        total_amount: 150, date: new Date().toISOString(), sale_type: 'VENTA_RAPIDA',
        discount: 0, payment_method: 'USD: 2', efectivo: 0, usd: 2,
        price_list_id: listId, price_list_name: `USD QA ${suffix}`,
      },
    },
  });
  expect(saleRes.j?.data?.success).toBe(true);
  const rows = await queryRows(request, 'sales', [{ op: 'eq', column: 'id', value: saleRes.j.data.sale.id }]);
  expect(Number(rows[0].usd)).toBe(2);
  expect(rows[0].price_list_id).toBe(listId);
});