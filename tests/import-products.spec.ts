// Spec 005: importación de inventario desde Excel/CSV.
// Usa el servidor temporal (:4173) y la BD de %TEMP%\inventarioy-e2e.
import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_URL = 'http://localhost:3000';
const BASE = 'http://127.0.0.1:4173';

let token = '';
let session = '';
const suffix = String(Date.now()).slice(-7);
const cap = (s: string) => s.trim().toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

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

async function dismissPinModal(page: Page) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'Identificación' });
  if (await dialog.count().catch(() => 0)) {
    const pinInput = page.locator('input[placeholder="0000"]').first();
    if (await pinInput.count().catch(() => 0)) {
      await pinInput.fill('1234');
    } else {
      for (const d of ['1', '2', '3', '4']) {
        await page.getByRole('button', { name: d, exact: true }).first().click();
      }
    }
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

async function openImportDialog(page: Page) {
  await ensureLoggedIn(page);
  await page.goto(APP_URL + '/dashboard/inventory', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await dismissPinModal(page);
  await page.getByRole('button', { name: 'Importar inventario' }).click();
  await expect(page.getByRole('heading', { name: 'Importar inventario' })).toBeVisible({ timeout: 15000 });
}

test.beforeAll(async ({ request }) => {
  const login = await call(request, 'POST', '/api/auth/login', { pin: '1234' }, false);
  expect(login.j?.data?.success).toBe(true);
  token = login.j.data.token;
  session = login.j.data.sessionToken;
});

test('descarga la plantilla con las cabeceras esperadas', async ({ page }) => {
  await openImportDialog(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar plantilla' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('plantilla-inventario.csv');
  const filePath = await download.path();
  const content = fs.readFileSync(filePath!, 'utf8').replace(/^\uFEFF/, '');
  expect(content.split(/\r?\n/)[0]).toContain('Nombre;Categoría;Unidad;Cantidad;Costo;Precio');
});

test('importa CSV: válidas, avisos, duplicada omitida y error reportado', async ({ page, request }) => {
  // Producto que ya existe en la BD (para probar la omisión de duplicados).
  const dupName = `duplicado qa ${suffix}`;
  const dupInsert = await call(request, 'POST', '/api/query', {
    table: 'products', method: 'insert',
    data: {
      id: `dup-${suffix}`, user_id: 'owner', name: dupName, category: 'Otros', unit: 'u',
      quantity: 0, price: 0, cost: 0, rop: 0, eoq: 0, is_active: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
  });
  expect([200, 201]).toContain(dupInsert.status);

  const nameA = `import qa a ${suffix}`;
  const nameB = `import qa b ${suffix}`;
  const nameC = `import qa c ${suffix}`;
  const csv = [
    'Nombre;Categoría;Unidad;Cantidad;Costo;Precio;ROP;EOQ;Vencimiento;Descripción;Individual;Gasto variable;Consumo directo',
    `${nameA};Granos y Cereales;kg;10;250;0;2;10;;Producto importado;No;No;No`,
    `${nameB};Bebidas y Refrescos;u;24;1,600;500;6;24;31/01/2027;Botella;Sí;No;No`,
    `${dupName.toUpperCase()};Otros;u;5;10;20;1;5;;;No;No;No`,
    `${nameC};Otros;caja;3;100;150;1;3;;Unidad desconocida;No;No;No`,
    `fecha invalida ${suffix};Otros;u;1;10;20;1;1;31/02/2027;;No;No;No`,
  ].join('\r\n');
  const csvPath = path.join(os.tmpdir(), `import-${suffix}.csv`);
  fs.writeFileSync(csvPath, '\uFEFF' + csv, 'utf8');

  await openImportDialog(page);
  await page.setInputFiles('#import-file', csvPath);

  await expect(page.getByText('3 válidas')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('1 duplicadas (se omiten)')).toBeVisible();
  await expect(page.getByText('1 con error')).toBeVisible();
  await expect(page.getByText('2 con aviso')).toBeVisible();
  await expect(page.getByText(/Unidad "caja" no reconocida/)).toBeVisible();
  await expect(page.getByText(/se interpretó como 1\.6/)).toBeVisible();

  await page.getByRole('button', { name: 'Importar 3 productos' }).click();
  await expect(page.getByText('Importación terminada')).toBeVisible({ timeout: 30000 });

  // Productos creados (el store capitaliza el nombre al guardar).
  const products = await queryRows(request, 'products', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  const byName = new Map(products.map(p => [p.name, p]));
  const productA = byName.get(cap(nameA));
  const productB = byName.get(cap(nameB));
  const productC = byName.get(cap(nameC));
  expect(productA, `producto ${cap(nameA)} no encontrado`).toBeTruthy();
  expect(productB, `producto ${cap(nameB)} no encontrado`).toBeTruthy();
  expect(productC, `producto ${cap(nameC)} no encontrado`).toBeTruthy();
  expect(Number(productA.quantity)).toBe(10);
  expect(productB.unit).toBe('u');
  expect(Number(productB.cost)).toBe(1.6);
  expect(productC.unit).toBe('u');

  // Stock inicial como movimiento de entrada.
  const movements = await queryRows(request, 'movements', [{ op: 'eq', column: 'product_id', value: productA.id }]);
  expect(movements.length).toBe(1);
  expect(movements[0].type).toBe('ENTRADA');
  expect(movements[0].reason).toBe('Stock inicial (Importación)');
  expect(Number(movements[0].quantity)).toBe(10);

  // Fila de almacén principal con la cantidad importada.
  const pw = await queryRows(request, 'product_warehouse', [{ op: 'eq', column: 'product_id', value: productA.id }]);
  expect(pw.length).toBeGreaterThan(0);
  expect(pw.some(r => Number(r.quantity) === 10)).toBe(true);

  // El duplicado no se duplicó.
  const dupCount = products.filter(p => String(p.name).toLowerCase() === dupName.toLowerCase()).length;
  expect(dupCount).toBe(1);

  // La fila con error no se creó.
  expect(products.some(p => String(p.name).includes('fecha invalida'))).toBe(false);

  // Descarga del reporte de resultado.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar resultado' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('resultado-importacion.csv');
  const resultCsv = fs.readFileSync((await download.path())!, 'utf8');
  expect(resultCsv).toContain('Importado');
  expect(resultCsv.toLowerCase()).toContain(dupName.toLowerCase());
});

test('importa pegando celdas de Excel (TSV)', async ({ page, request }) => {
  const name = `pegado qa ${suffix}`;
  const tsv = ['Nombre\tUnidad\tCantidad\tCosto', `${name}\tkg\t5\t120`].join('\n');

  await openImportDialog(page);
  await page.fill('#import-paste', tsv);
  await expect(page.getByText('1 válidas')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Importar 1 producto' }).click();
  await expect(page.getByText('Importación terminada')).toBeVisible({ timeout: 30000 });

  const products = await queryRows(request, 'products', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  const product = products.find(p => p.name === cap(name));
  expect(product, `producto ${cap(name)} no encontrado`).toBeTruthy();
  expect(Number(product.quantity)).toBe(5);
});

test('rechaza más de 2000 filas sin escribir nada', async ({ page }) => {
  await openImportDialog(page);
  const rows = ['Nombre;Unidad;Cantidad'];
  for (let i = 0; i < 2001; i++) rows.push(`producto ${i};u;1`);
  await page.fill('#import-paste', rows.join('\n'));
  await expect(page.getByText(/el máximo por importación es 2000/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: /^Importar 0 producto/ })).toBeDisabled();
});

test('multi-almacén: stock solo en el principal y 0 en el resto', async ({ page, request }) => {
  const warehouseId = `wh-${suffix}`;
  const wh = await call(request, 'POST', '/api/query', {
    table: 'warehouses', method: 'insert',
    data: {
      id: warehouseId, user_id: 'owner', name: `Almacén QA ${suffix}`, is_main: 0,
      created_at: new Date().toISOString(),
    },
  });
  expect([200, 201]).toContain(wh.status);

  const name = `multi almacen qa ${suffix}`;
  await openImportDialog(page);
  await page.fill('#import-paste', ['Nombre;Unidad;Cantidad', `${name};kg;7`].join('\n'));
  await expect(page.getByText('1 válidas')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Importar 1 producto' }).click();
  await expect(page.getByText('Importación terminada')).toBeVisible({ timeout: 30000 });

  const products = await queryRows(request, 'products', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  const product = products.find(p => p.name === cap(name));
  expect(product).toBeTruthy();

  const pw = await queryRows(request, 'product_warehouse', [{ op: 'eq', column: 'product_id', value: product.id }]);
  expect(pw.length).toBeGreaterThanOrEqual(2);
  expect(pw.some(r => Number(r.quantity) === 7)).toBe(true);
  expect(pw.some(r => r.warehouse_id === warehouseId && Number(r.quantity) === 0)).toBe(true);
});

test('producto inactivo con el mismo nombre no bloquea la importación', async ({ page, request }) => {
  const name = `inactivo qa ${suffix}`;
  const inactive = await call(request, 'POST', '/api/query', {
    table: 'products', method: 'insert',
    data: {
      id: `inactive-${suffix}`, user_id: 'owner', name, category: 'Otros', unit: 'u',
      quantity: 0, price: 0, cost: 0, rop: 0, eoq: 0, is_active: 0,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
  });
  expect([200, 201]).toContain(inactive.status);

  await openImportDialog(page);
  await page.fill('#import-paste', ['Nombre;Unidad;Cantidad', `${name};u;4`].join('\n'));
  await expect(page.getByText('1 válidas')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Importar 1 producto' }).click();
  await expect(page.getByText('Importación terminada')).toBeVisible({ timeout: 30000 });

  const products = await queryRows(request, 'products', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  const sameName = products.filter(p => String(p.name).toLowerCase() === cap(name).toLowerCase());
  expect(sameName.length).toBe(2);
  expect(sameName.some(p => Number(p.is_active) === 1 && Number(p.quantity) === 4)).toBe(true);
  expect(sameName.some(p => Number(p.is_active) === 0)).toBe(true);
});

test('estrés: importa 600 filas en lotes sin colgarse', async ({ page, request }) => {
  const prefix = `stress qa ${suffix}`;
  const rows = ['Nombre;Unidad;Cantidad;Costo'];
  for (let i = 0; i < 600; i++) rows.push(`${prefix} ${i};u;1;10`);

  await openImportDialog(page);
  await page.fill('#import-paste', rows.join('\n'));
  await expect(page.getByText('600 válidas')).toBeVisible({ timeout: 60000 });

  const started = Date.now();
  await page.getByRole('button', { name: 'Importar 600 productos' }).click();
  await expect(page.getByText('Importación terminada')).toBeVisible({ timeout: 180000 });
  expect(Date.now() - started).toBeLessThan(150000);

  const products = await queryRows(request, 'products', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  const created = products.filter(p => p.name.startsWith(cap(prefix)));
  expect(created.length).toBe(600);
  expect(created.every(p => Number(p.quantity) === 1)).toBe(true);

  const ids = new Set(created.map(p => p.id));
  const movements = await queryRows(request, 'movements', [{ op: 'eq', column: 'reason', value: 'Stock inicial (Importación)' }]);
  expect(movements.filter(m => ids.has(m.product_id)).length).toBe(600);

  // Limpieza: evita que 600 productos extra ralenticen el resto de la suite.
  const cleanup: any[] = [];
  for (const p of created) {
    cleanup.push({ table: 'movements', method: 'delete', filters: [{ op: 'eq', column: 'product_id', value: p.id }] });
    cleanup.push({ table: 'product_warehouse', method: 'delete', filters: [{ op: 'eq', column: 'product_id', value: p.id }] });
  }
  cleanup.push({ table: 'products', method: 'delete', filters: [{ op: 'in', column: 'id', value: [...ids] }] });
  for (let i = 0; i < cleanup.length; i += 400) {
    const res = await call(request, 'POST', '/api/query/batch', { commands: cleanup.slice(i, i + 400) });
    expect(res.j?.data?.success).toBe(true);
  }
});

test('rollback: un lote con error no deja escrituras parciales', async ({ request }) => {
  const id = `rollback-${suffix}`;
  const payload = {
    id, user_id: 'owner', name: `rollback qa ${suffix}`, category: 'Otros', unit: 'u',
    quantity: 1, price: 0, cost: 0, rop: 0, eoq: 0, is_active: 1,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const res = await call(request, 'POST', '/api/query/batch', {
    commands: [
      { table: 'products', method: 'insert', data: payload },
      { table: 'products', method: 'insert', data: payload },
    ],
  });
  expect(res.j?.error).toBeTruthy();
  const rows = await queryRows(request, 'products', [{ op: 'eq', column: 'id', value: id }]);
  expect(rows.length).toBe(0);
});
