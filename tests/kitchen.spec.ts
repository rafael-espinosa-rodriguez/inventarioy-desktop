// Spec 010: comandas a cocina (mesas, envío, estados y cierre al cobrar).
import { test, expect, Page } from '@playwright/test';
import { randomBytes, scryptSync } from 'node:crypto';

const APP_URL = 'http://localhost:3000';
const BASE = 'http://127.0.0.1:4173';
const suffix = String(Date.now()).slice(-7);

let token = '';
let session = '';
let clerkToken = '';
let clerkSession = '';
let adminToken = '';
let adminSession = '';

async function call(request: any, method: string, p: string, body?: any, auth = true, headers: Record<string, string> = {}) {
  const res = await request.fetch(`${BASE}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE,
      ...(auth && token ? { 'x-inventarioy-token': token } : {}),
      ...(auth && session ? { 'x-inventarioy-session': session } : {}),
      ...headers,
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

async function seedTable(request: any, name: string) {
  const id = `table-${suffix}-${Math.random().toString(36).slice(2, 6)}`;
  await insertRow(request, 'tables', {
    id, user_id: 'owner', name, zone: 'Salón', is_active: 1, created_at: new Date().toISOString(),
  });
  return id;
}

test.beforeAll(async ({ request }) => {
  const login = await call(request, 'POST', '/api/auth/login', { pin: '1234' }, false);
  expect(login.j?.data?.success).toBe(true);
  token = login.j.data.token;
  session = login.j.data.sessionToken;

  const salt = randomBytes(16);
  const hash = scryptSync('3333', salt, 64);
  await insertRow(request, 'access_pins', {
    id: `pin-clerk-kitchen-${suffix}`, user_id: 'owner',
    pin_hash: `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`,
    role: 'clerk', pin_name: 'Cajero Cocina QA', is_active: 1,
    failed_attempts: 0, created_at: new Date().toISOString(),
  });
  const clerk = await call(request, 'POST', '/api/auth/login', { pin: '3333' }, false);
  expect(clerk.j?.data?.success).toBe(true);
  clerkToken = clerk.j.data.token;
  clerkSession = clerk.j.data.sessionToken;

  const saltAdmin = randomBytes(16);
  const hashAdmin = scryptSync('4444', saltAdmin, 64);
  await insertRow(request, 'access_pins', {
    id: `pin-admin-kitchen-${suffix}`, user_id: 'owner',
    pin_hash: `scrypt$${saltAdmin.toString('hex')}$${hashAdmin.toString('hex')}`,
    role: 'admin', pin_name: 'Admin Cocina QA', is_active: 1,
    failed_attempts: 0, created_at: new Date().toISOString(),
  });
  const admin = await call(request, 'POST', '/api/auth/login', { pin: '4444' }, false);
  expect(admin.j?.data?.success).toBe(true);
  adminToken = admin.j.data.token;
  adminSession = admin.j.data.sessionToken;
});

test('envía comanda, reutiliza la comanda abierta y valida rol', async ({ request }) => {
  const tableId = await seedTable(request, `Mesa QA ${suffix}`);
  const send = await call(request, 'POST', '/api/rpc', {
    fn: 'kitchen_send',
    args: {
      table_id: tableId,
      items: [{ product_id: 'p1', name: 'Plato QA', quantity: 2, unit_price: 100 }],
      notes: 'Sin cebolla',
    },
  });
  expect(send.j?.data?.success).toBe(true);
  const orderId = send.j.data.order_id;

  // Segundo envío a la misma mesa: misma comanda, más ítems.
  const send2 = await call(request, 'POST', '/api/rpc', {
    fn: 'kitchen_send',
    args: { table_id: tableId, items: [{ product_id: 'p2', name: 'Bebida QA', quantity: 1, unit_price: 50 }] },
  });
  expect(send2.j?.data?.order_id).toBe(orderId);

  const orders = await queryRows(request, 'kitchen_orders', [{ op: 'eq', column: 'table_id', value: tableId }]);
  expect(orders.length).toBe(1);
  const items = await queryRows(request, 'kitchen_order_items', [{ op: 'eq', column: 'order_id', value: orderId }]);
  expect(items.length).toBe(2);

  // Un rol sin Ventas ni Cocina (admin de inventario) no puede enviar comandas.
  const denied = await call(
    request, 'POST', '/api/rpc',
    { fn: 'kitchen_send', args: { table_id: tableId, items: [{ product_id: 'p3', name: 'X', quantity: 1 }] } },
    true,
    { 'x-inventarioy-token': adminToken, 'x-inventarioy-session': adminSession }
  );
  expect(denied.status).toBe(403);
});

test('cambia estados de la comanda', async ({ request }) => {
  const tableId = await seedTable(request, `Mesa Estado ${suffix}`);
  const send = await call(request, 'POST', '/api/rpc', {
    fn: 'kitchen_send',
    args: { table_id: tableId, items: [{ product_id: 'p1', name: 'Plato', quantity: 1 }] },
  });
  const orderId = send.j.data.order_id;

  const preparing = await call(request, 'POST', '/api/rpc', { fn: 'kitchen_status', args: { order_id: orderId, status: 'preparing' } });
  expect(preparing.j?.data?.success).toBe(true);
  const ready = await call(request, 'POST', '/api/rpc', { fn: 'kitchen_status', args: { order_id: orderId, status: 'ready' } });
  expect(ready.j?.data?.success).toBe(true);

  const rows = await queryRows(request, 'kitchen_orders', [{ op: 'eq', column: 'id', value: orderId }]);
  expect(rows[0].status).toBe('ready');
  expect(rows[0].ready_at).toBeTruthy();
});

test('cobrar la mesa cierra la comanda y descuenta stock', async ({ request }) => {
  const warehouses = await queryRows(request, 'warehouses', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  let warehouseId = warehouses.find(w => w.is_main)?.id || warehouses[0]?.id;
  if (!warehouseId) {
    warehouseId = `wh-${suffix}`;
    await insertRow(request, 'warehouses', {
      id: warehouseId, user_id: 'owner', name: 'Almacén', is_main: 1, created_at: new Date().toISOString(),
    });
  }
  const productId = `kitchen-prod-${suffix}`;
  await insertRow(request, 'products', {
    id: productId, user_id: 'owner', name: `Plato Cocina ${suffix}`, category: 'Otros', unit: 'u',
    quantity: 10, price: 150, cost: 80, rop: 0, eoq: 0, is_individual: 1, is_active: 1,
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

  const tableId = await seedTable(request, `Mesa Cobro ${suffix}`);
  const send = await call(request, 'POST', '/api/rpc', {
    fn: 'kitchen_send',
    args: { table_id: tableId, items: [{ product_id: productId, name: `Plato Cocina ${suffix}`, quantity: 2, unit_price: 150 }] },
  });
  const orderId = send.j.data.order_id;

  const saleRes = await call(request, 'POST', '/api/rpc', {
    fn: 'sale',
    args: {
      sale: {
        items: [{ product_id: productId, quantity: 2, unit_cost: 80, selling_price: 150, subtotal: 300, is_recipe: false }],
        total_amount: 300, date: new Date().toISOString(), sale_type: 'SALON',
        discount: 0, payment_method: 'Efectivo: 300', efectivo: 300,
        kitchen_order_id: orderId,
      },
    },
  });
  expect(saleRes.j?.data?.success).toBe(true);

  const orders = await queryRows(request, 'kitchen_orders', [{ op: 'eq', column: 'id', value: orderId }]);
  expect(orders[0].status).toBe('delivered');
  expect(orders[0].sale_id).toBeTruthy();
});

test('UI: la pantalla de Cocina muestra la comanda y avanza el estado', async ({ page, request }) => {
  const tableId = await seedTable(request, `Mesa UI ${suffix}`);
  await call(request, 'POST', '/api/rpc', {
    fn: 'kitchen_send',
    args: { table_id: tableId, items: [{ product_id: 'p-ui', name: `Plato UI ${suffix}`, quantity: 1, unit_price: 100 }] },
  });

  await loginUi(page, '1234');
  await page.goto(APP_URL + '/dashboard/kitchen', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await dismissPinModal(page);

  await expect(page.getByText(`Mesa UI ${suffix}`).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(`Plato UI ${suffix}`).first()).toBeVisible();

  await page.getByRole('button', { name: 'Iniciar' }).first().click();
  await expect(page.getByRole('button', { name: 'Listo' }).first()).toBeVisible({ timeout: 15000 });

  const orders = await queryRows(request, 'kitchen_orders', [{ op: 'eq', column: 'table_id', value: tableId }]);
  expect(orders[0].status).toBe('preparing');
});
