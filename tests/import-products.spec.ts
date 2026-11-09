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

test('importa CSV: válidas, duplicada omitida y error reportado', async ({ page, request }) => {
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
  const csv = [
    'Nombre;Categoría;Unidad;Cantidad;Costo;Precio;ROP;EOQ;Vencimiento;Descripción;Individual;Gasto variable;Consumo directo',
    `${nameA};Granos y Cereales;kg;10;250;0;2;10;;Producto importado;No;No;No`,
    `${nameB};Bebidas y Refrescos;u;24;300;500;6;24;31/01/2027;Botella;Sí;No;No`,
    `${dupName.toUpperCase()};Otros;u;5;10;20;1;5;;;No;No;No`,
    `unidad invalida ${suffix};Otros;caja;3;100;150;1;3;;;No;No;No`,
  ].join('\r\n');
  const csvPath = path.join(os.tmpdir(), `import-${suffix}.csv`);
  fs.writeFileSync(csvPath, '\uFEFF' + csv, 'utf8');

  await openImportDialog(page);
  await page.setInputFiles('#import-file', csvPath);

  await expect(page.getByText('2 válidas')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('1 duplicadas (se omiten)')).toBeVisible();
  await expect(page.getByText('1 con error')).toBeVisible();
  await expect(page.getByText(/Unidad no válida: "caja"/)).toBeVisible();

  await page.getByRole('button', { name: 'Importar 2 productos' }).click();
  await expect(page.getByText('Importación terminada')).toBeVisible({ timeout: 30000 });

  // Productos creados (el store capitaliza el nombre al guardar).
  const products = await queryRows(request, 'products', [{ op: 'eq', column: 'user_id', value: 'owner' }]);
  const byName = new Map(products.map(p => [p.name, p]));
  const productA = byName.get(cap(nameA));
  const productB = byName.get(cap(nameB));
  expect(productA, `producto ${cap(nameA)} no encontrado`).toBeTruthy();
  expect(productB, `producto ${cap(nameB)} no encontrado`).toBeTruthy();
  expect(Number(productA.quantity)).toBe(10);
  expect(productB.unit).toBe('u');

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
  expect(products.some(p => String(p.name).includes('unidad invalida'))).toBe(false);
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
