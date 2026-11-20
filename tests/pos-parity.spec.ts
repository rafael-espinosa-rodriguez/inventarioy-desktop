// Spec 008: paridad POS (escaneo, descuentos, devoluciones, anulación, caja, xlsx).
import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';

const APP_URL = 'http://localhost:3000';
const BASE = 'http://127.0.0.1:4173';
const suffix = String(Date.now()).slice(-7);

let token = '';
let session = '';

async function call(request: any, method: string, p: string, body?: any, auth = true) {
  const res = await request.fetch(`${BASE}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE,
      ...(auth && token ? { 'x-inventarioy-token': token } : {}),
      ...(auth && session ? { 'x-inventarioy-session': session } : {}),
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
  expect(r.j?.error, `insert ${table} falló: ${JSON.stringify(r.j?.error)}`).toBeFalsy();
  expect([200, 201]).toContain(r.status);
  return r.j?.data;
}

async function dismissPinModal(page: Page) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'Identificación' });
  if (await dialog.count().catch(() => 0)) {
    const pinInput = page.locator('input[placeholder="0000"]').first();
    if (await pinInput.count().catch(() => 0)) await pinInput.fill('1234');
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

async function ensureLoggedIn(page: Page) {
  await page.goto(APP_URL + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  if (page.url().includes('/dashboard')) {
    await dismissPinModal(page);
    return;
  }
  await page.fill('#pin', '1234');
  await page.getByRole('button', { name: /entrar|ingresar|acceder|iniciar/i }).first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await dismissPinModal(page);
}

async function seedProductWithTransit(request: any, name: string, barcode: string, warehouseId: string, transitQty: number) {
  const productId = `qa-${suffix}-${Math.random().toString(36).slice(2, 7)}`;
  await insertRow(request, 'products', {
    id: productId, user_id: 'owner', name, category: 'Otros', unit: 'u',
    quantity: 10, price: 150, cost: 100, rop: 0, eoq: 0, is_individual: 1, is_active: 1,
    sku: `SKU-${productId}`, barcode,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  await insertRow(request, 'product_warehouse', {
    id: `pw-${productId}`, product_id: productId, warehouse_id: warehouseId,
    quantity: 10, in_transit: transitQty, updated_at: new Date().toISOString(),
  });
  await insertRow(request, 'transit_items', {
    id: `tr-${productId}`, user_id: 'owner', product_id: productId,
    quantity: transitQty, consumed: 0, remaining: transitQty,
    reason: 'Seed QA', sent_date: new Date().toISOString(), created_at: new Date().toISOString(),
    warehouse_id: warehouseId,
  });
  return productId;
}

test.beforeAll(async ({ request }) => {
  const login = await call(request, 'POST', '/api/auth/login', { pin: '1234' }, false);
  expect(login.j?.data?.success).toBe(true);
  token = login.j.data.token;
  session = login.j.data.sessionToken;

  const warehouses = await queryRows(request, 'warehouses', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  if (warehouses.length === 0) {
    await insertRow(request, 'warehouses', {
      id: `wh-main-${suffix}`, user_id: 'owner', name: 'Almacén', is_main: 1,
      created_at: new Date().toISOString(),
    });
  }
});

test('escaneo USB agrega al carrito y descuento por ítem resta del total', async ({ page, request }) => {
  const warehouses = await queryRows(request, 'warehouses', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  const warehouseId = warehouses.find(w => w.is_main)?.id || warehouses[0]?.id;
  expect(warehouseId).toBeTruthy();

  const barcode = `7599${suffix}1`;
  const name = `scan qa ${suffix}`;
  await seedProductWithTransit(request, name, barcode, warehouseId, 5);

  await ensureLoggedIn(page);
  await page.goto(APP_URL + '/dashboard/sales', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await dismissPinModal(page);

  // Escanear (lector USB = teclado + Enter) con el foco fuera de los inputs.
  await page.locator('h1').first().click().catch(() => {});
  await page.keyboard.type(barcode, { delay: 20 });
  await page.keyboard.press('Enter');

  const productName = name;
  await expect(page.getByText(new RegExp(name, 'i')).first()).toBeVisible({ timeout: 15000 });

  const discountInput = page.getByLabel(`Descuento ${productName}`, { exact: true });
  await discountInput.fill('25');
  await page.getByLabel(`Motivo descuento ${productName}`, { exact: true }).fill('Promoción');
  await expect(page.getByText('-$25.00').first()).toBeVisible({ timeout: 10000 });
});

test('devolución repone stock, registra movimiento y respeta merma', async ({ request }) => {
  const warehouses = await queryRows(request, 'warehouses', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  const warehouseId = warehouses.find(w => w.is_main)?.id || warehouses[0]?.id;
  const productId = await seedProductWithTransit(request, `ret qa ${suffix}`, `7599${suffix}2`, warehouseId, 5);

  const saleRes = await call(request, 'POST', '/api/rpc', {
    fn: 'sale',
    args: {
      sale: {
        items: [{ product_id: productId, quantity: 2, unit_cost: 100, selling_price: 150, subtotal: 300, is_recipe: false }],
        total_amount: 300, date: new Date().toISOString(), sale_type: 'VENTA_RAPIDA',
        discount: 0, payment_method: 'Efectivo: 300', efectivo: 300,
      },
    },
  });
  expect(saleRes.j?.data?.success).toBe(true);
  const sale = saleRes.j.data.sale;
  const saleItem = saleRes.j.data.items[0];

  // Devolver 1 con reposición.
  const ret1 = await call(request, 'POST', '/api/rpc', {
    fn: 'sale_return',
    args: { sale_id: sale.id, reason: 'Cliente devuelve', items: [{ sale_item_id: saleItem.id, quantity: 1, restock: true }] },
  });
  expect(ret1.j?.data?.success).toBe(true);
  expect(Number(ret1.j.data.total)).toBe(150);

  let pw = await queryRows(request, 'product_warehouse', [{ op: 'eq', column: 'product_id', value: productId }]);
  expect(Number(pw[0].quantity)).toBe(11);

  const movements = await queryRows(request, 'movements', [{ op: 'eq', column: 'product_id', value: productId }]);
  expect(movements.some(m => m.type === 'ENTRADA' && String(m.reason).includes('Devolución'))).toBe(true);

  // Devolver 1 sin reposición (merma): no cambia el stock.
  const ret2 = await call(request, 'POST', '/api/rpc', {
    fn: 'sale_return',
    args: { sale_id: sale.id, reason: 'Producto dañado', items: [{ sale_item_id: saleItem.id, quantity: 1, restock: false }] },
  });
  expect(ret2.j?.data?.success).toBe(true);
  pw = await queryRows(request, 'product_warehouse', [{ op: 'eq', column: 'product_id', value: productId }]);
  expect(Number(pw[0].quantity)).toBe(11);

  // No se puede devolver más de lo vendido (ya devueltas 2 de 2).
  const ret3 = await call(request, 'POST', '/api/rpc', {
    fn: 'sale_return',
    args: { sale_id: sale.id, reason: 'Exceso', items: [{ sale_item_id: saleItem.id, quantity: 1, restock: true }] },
  });
  expect(ret3.j?.error?.code).toBe('INVALID_QTY');
});

test('anulación repone stock, marca la venta y audita', async ({ request }) => {
  const warehouses = await queryRows(request, 'warehouses', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  const warehouseId = warehouses.find(w => w.is_main)?.id || warehouses[0]?.id;
  const productId = await seedProductWithTransit(request, `void qa ${suffix}`, `7599${suffix}3`, warehouseId, 4);

  const saleRes = await call(request, 'POST', '/api/rpc', {
    fn: 'sale',
    args: {
      sale: {
        items: [{ product_id: productId, quantity: 3, unit_cost: 100, selling_price: 150, subtotal: 450, is_recipe: false }],
        total_amount: 450, date: new Date().toISOString(), sale_type: 'VENTA_RAPIDA',
        discount: 0, payment_method: 'Efectivo: 450', efectivo: 450,
      },
    },
  });
  expect(saleRes.j?.data?.success).toBe(true);
  const saleId = saleRes.j.data.sale.id;

  const voidRes = await call(request, 'POST', '/api/rpc', {
    fn: 'void_sale',
    args: { sale_id: saleId, reason: 'Error de cobro' },
  });
  expect(voidRes.j?.data?.success).toBe(true);

  const sales = await queryRows(request, 'sales', [{ op: 'eq', column: 'id', value: saleId }]);
  expect(sales[0].voided_at).toBeTruthy();
  expect(sales[0].void_reason).toBe('Error de cobro');

  const pw = await queryRows(request, 'product_warehouse', [{ op: 'eq', column: 'product_id', value: productId }]);
  expect(Number(pw[0].quantity)).toBe(13);

  const logs = await queryRows(request, 'action_logs', [{ op: 'eq', column: 'module', value: 'sales' }]);
  expect(logs.some(l => l.action === 'ANULAR')).toBe(true);
});

test('movimientos de caja se registran y quedan en la base', async ({ request }) => {
  const now = new Date().toISOString();
  const res = await insertRow(request, 'cash_movements', {
    id: `cash-${suffix}`, user_id: 'owner', date: now, type: 'RETIRO',
    amount: 50, note: 'Retiro QA', shift: '1', created_by: 'owner', created_at: now,
  });
  expect(res).toBeTruthy();
  const rows = await queryRows(request, 'cash_movements', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  expect(rows.some(r => r.id === `cash-${suffix}`)).toBe(true);
});

test('importa .xlsx directo con validaciones', async ({ page, request }) => {
  const nameA = `xlsx qa a ${suffix}`;
  const nameB = `xlsx qa b ${suffix}`;
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Nombre', 'Categoría', 'Unidad', 'Cantidad', 'Costo', 'Precio', 'SKU', 'Código de barras'],
    [nameA, 'Otros', 'u', 3, 100, 150, `SKU-X-${suffix}`, ''],
    [nameB, 'Otros', 'kg', 2, 80, 0, '', ''],
    [`xlsx qa err ${suffix}`, 'Otros', 'caja', 1, 10, 0, '', ''],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Productos');
  const xlsxPath = path.join(os.tmpdir(), `import-${suffix}.xlsx`);
  XLSX.writeFile(wb, xlsxPath);

  await ensureLoggedIn(page);
  await page.goto(APP_URL + '/dashboard/inventory', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await dismissPinModal(page);
  await page.getByRole('button', { name: 'Importar inventario' }).click();
  await page.setInputFiles('#import-file', xlsxPath);

  await expect(page.getByText('3 válidas')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Importar 3 productos' }).click();
  await expect(page.getByText('Importación terminada')).toBeVisible({ timeout: 30000 });

  const products = await queryRows(request, 'products', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  const a = products.find(p => p.name.toLowerCase() === nameA.toLowerCase());
  expect(a).toBeTruthy();
  expect(a.sku).toBe(`SKU-X-${suffix}`);
  expect(products.some(p => p.name.toLowerCase() === nameB.toLowerCase())).toBe(true);
});
