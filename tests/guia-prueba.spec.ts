import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// La app dispara varias fetchAll en cada navegación (carga inicial). Una fetchAll
// en curso con datos "stale" (grupo consultado ANTES de una mutación) sobrescribe
// al final la mutación optimista (fetchAll: set final con `X ?? []`). Este helper
// espera a que el "storm" de fetchAll se asiente (sin logs de carga por 2s) antes
// de mutar, evitando que una fetchAll en vuelo borre departamentos/empleados/stock.
async function waitForDataStable(page: Page, timeoutMs = 45000) {
  const started = Date.now();
  await new Promise<void>((resolve) => {
    let lastActivity = Date.now();
    const onMsg = (msg: ConsoleMessage) => {
      const t = msg.text();
      if (/Cargando|Datos cargados|restaurando/.test(t)) lastActivity = Date.now();
    };
    page.on('console', onMsg);
    const check = setInterval(() => {
      if (Date.now() - lastActivity > 2000 || Date.now() - started > timeoutMs) {
        clearInterval(check);
        page.off('console', onMsg);
        resolve();
      }
    }, 500);
  });
}

// ============================================================
// DATOS DEL GUIA_PRUEBA (corregidos según verificación manual)
// ============================================================

const OWNER_PIN = '1234';
const BUSINESS_NAME = 'Restaurante El Prueba';
const JAN_PIN = '2345';   // Juan Dependiente (rol "Dependiente", módulo Ventas)
const MARIA_PIN = '3456'; // María Supervisora (rol "Supervisora", Ventas + Cierres)

interface CatalogItem { name: string; cat: string; unit: string; unitLabel: string; cost: string; price: string; rop: string; stock: string; individual: boolean; }
const CATALOG: CatalogItem[] = [
  { name: 'Arroz', cat: 'Granos', unit: 'kg', unitLabel: 'Kilogramos (kg)', cost: '60', price: '', rop: '5', stock: '50', individual: false },
  { name: 'Frijoles negros', cat: 'Granos', unit: 'kg', unitLabel: 'Kilogramos (kg)', cost: '50', price: '', rop: '4', stock: '30', individual: false },
  { name: 'Carne de cerdo', cat: 'Carnes', unit: 'kg', unitLabel: 'Kilogramos (kg)', cost: '130', price: '', rop: '4', stock: '20', individual: false },
  { name: 'Pollo', cat: 'Carnes', unit: 'kg', unitLabel: 'Kilogramos (kg)', cost: '110', price: '', rop: '4', stock: '15', individual: false },
  { name: 'Aceite', cat: 'Cocina', unit: 'L', unitLabel: 'Litros (L)', cost: '90', price: '', rop: '3', stock: '10', individual: false },
  { name: 'Cebolla', cat: 'Vegetales', unit: 'kg', unitLabel: 'Kilogramos (kg)', cost: '25', price: '', rop: '2', stock: '8', individual: false },
  { name: 'Ajo', cat: 'Vegetales', unit: 'kg', unitLabel: 'Kilogramos (kg)', cost: '60', price: '', rop: '1', stock: '4', individual: false },
  { name: 'Sal', cat: 'Cocina', unit: 'kg', unitLabel: 'Kilogramos (kg)', cost: '8', price: '', rop: '1', stock: '5', individual: false },
  { name: 'Papa', cat: 'Vegetales', unit: 'kg', unitLabel: 'Kilogramos (kg)', cost: '30', price: '', rop: '3', stock: '12', individual: false },
  { name: 'Tomate', cat: 'Vegetales', unit: 'kg', unitLabel: 'Kilogramos (kg)', cost: '35', price: '', rop: '2', stock: '6', individual: false },
  { name: 'Plátano', cat: 'Vegetales', unit: 'kg', unitLabel: 'Kilogramos (kg)', cost: '15', price: '', rop: '2', stock: '10', individual: false },
  { name: 'Refresco', cat: 'Bebidas', unit: 'u', unitLabel: 'Unidades (u)', cost: '40', price: '100', rop: '6', stock: '24', individual: true },
  { name: 'Agua', cat: 'Bebidas', unit: 'u', unitLabel: 'Unidades (u)', cost: '15', price: '50', rop: '12', stock: '36', individual: true },
  { name: 'Cerveza', cat: 'Bebidas', unit: 'u', unitLabel: 'Unidades (u)', cost: '70', price: '150', rop: '6', stock: '24', individual: true },
  { name: 'Café', cat: 'Bebidas', unit: 'u', unitLabel: 'Unidades (u)', cost: '30', price: '80', rop: '6', stock: '18', individual: true },
  { name: 'Pan', cat: 'Abarrotes', unit: 'u', unitLabel: 'Unidades (u)', cost: '5', price: '25', rop: '12', stock: '40', individual: true },
  { name: 'Detergente', cat: 'Abarrotes', unit: 'u', unitLabel: 'Unidades (u)', cost: '60', price: '110', rop: '3', stock: '6', individual: true },
  { name: 'Jabón', cat: 'Abarrotes', unit: 'u', unitLabel: 'Unidades (u)', cost: '40', price: '80', rop: '3', stock: '6', individual: true },
];

const STORE_PRODUCTS = ['Refresco', 'Agua', 'Cerveza', 'Café', 'Pan', 'Detergente', 'Jabón'];

interface Recipe { name: string; price: string; ing: [string, string][] }
const RECIPES: Recipe[] = [
  { name: 'Arroz con pollo', price: '450', ing: [['Arroz', '0.25'], ['Pollo', '0.30'], ['Aceite', '0.02'], ['Cebolla', '0.02'], ['Ajo', '0.01'], ['Sal', '0.01']] },
  { name: 'Congrí', price: '380', ing: [['Arroz', '0.25'], ['Frijoles negros', '0.20'], ['Aceite', '0.02'], ['Cebolla', '0.02'], ['Sal', '0.01']] },
  { name: 'Cerdo asado', price: '500', ing: [['Carne de cerdo', '0.35'], ['Ajo', '0.01'], ['Cebolla', '0.03'], ['Aceite', '0.03'], ['Sal', '0.01']] },
  { name: 'Masas de cerdo', price: '450', ing: [['Carne de cerdo', '0.30'], ['Ajo', '0.01'], ['Cebolla', '0.02'], ['Aceite', '0.04'], ['Sal', '0.01']] },
  { name: 'Tostones', price: '120', ing: [['Plátano', '0.25'], ['Aceite', '0.03'], ['Sal', '0.005']] },
  { name: 'Papas fritas', price: '150', ing: [['Papa', '0.30'], ['Aceite', '0.05'], ['Sal', '0.01']] },
];

interface Movement { t: 'ENTRADA' | 'SALIDA' | 'MERMA'; n: string; q: string; blocked?: boolean }
const MOVEMENTS: Record<string, Movement[]> = {
  d1: [
    { t: 'SALIDA', n: 'Arroz', q: '5' }, { t: 'SALIDA', n: 'Pollo', q: '3' },
    { t: 'SALIDA', n: 'Carne de cerdo', q: '3' }, { t: 'SALIDA', n: 'Aceite', q: '2' },
    { t: 'SALIDA', n: 'Cebolla', q: '2' }, { t: 'SALIDA', n: 'Ajo', q: '0.3' },
    { t: 'SALIDA', n: 'Sal', q: '0.3' }, { t: 'SALIDA', n: 'Papa', q: '3' },
    { t: 'SALIDA', n: 'Plátano', q: '2' }, { t: 'SALIDA', n: 'Frijoles negros', q: '2' },
    { t: 'SALIDA', n: 'Refresco', q: '6' }, { t: 'SALIDA', n: 'Agua', q: '6' },
    { t: 'SALIDA', n: 'Cerveza', q: '6' }, { t: 'SALIDA', n: 'Café', q: '6' },
    { t: 'SALIDA', n: 'Pan', q: '10' },
  ],
  d2: [
    { t: 'ENTRADA', n: 'Arroz', q: '10' }, { t: 'ENTRADA', n: 'Pollo', q: '5' },
    { t: 'ENTRADA', n: 'Carne de cerdo', q: '5' }, { t: 'ENTRADA', n: 'Aceite', q: '2' },
    { t: 'ENTRADA', n: 'Cebolla', q: '1' }, { t: 'ENTRADA', n: 'Refresco', q: '6' },
    { t: 'ENTRADA', n: 'Cerveza', q: '12' }, { t: 'ENTRADA', n: 'Café', q: '12' },
    { t: 'ENTRADA', n: 'Pan', q: '10' },
    { t: 'MERMA', n: 'Tomate', q: '1' },
    { t: 'SALIDA', n: 'Arroz', q: '4' }, { t: 'SALIDA', n: 'Pollo', q: '2' },
    { t: 'SALIDA', n: 'Carne de cerdo', q: '2' }, { t: 'SALIDA', n: 'Aceite', q: '1' },
    { t: 'SALIDA', n: 'Cebolla', q: '1' }, { t: 'SALIDA', n: 'Papa', q: '2' },
    { t: 'SALIDA', n: 'Plátano', q: '1' }, { t: 'SALIDA', n: 'Frijoles negros', q: '1' },
    { t: 'SALIDA', n: 'Refresco', q: '6' }, { t: 'SALIDA', n: 'Agua', q: '6' },
    { t: 'SALIDA', n: 'Cerveza', q: '6' }, { t: 'SALIDA', n: 'Café', q: '6' },
    { t: 'SALIDA', n: 'Pan', q: '10' },
  ],
  d3: [
    { t: 'SALIDA', n: 'Arroz', q: '3' }, { t: 'SALIDA', n: 'Pollo', q: '2' },
    { t: 'SALIDA', n: 'Carne de cerdo', q: '2' }, { t: 'SALIDA', n: 'Aceite', q: '1' },
    { t: 'SALIDA', n: 'Cebolla', q: '1' }, { t: 'SALIDA', n: 'Papa', q: '2' },
    { t: 'SALIDA', n: 'Plátano', q: '2' }, { t: 'SALIDA', n: 'Frijoles negros', q: '1' },
    { t: 'SALIDA', n: 'Refresco', q: '6' }, { t: 'SALIDA', n: 'Agua', q: '6' },
    { t: 'SALIDA', n: 'Cerveza', q: '6' }, { t: 'SALIDA', n: 'Café', q: '6' },
    { t: 'SALIDA', n: 'Pan', q: '10' },
  ],
  d4: [
    { t: 'SALIDA', n: 'Arroz', q: '3' }, { t: 'SALIDA', n: 'Pollo', q: '2' },
    { t: 'SALIDA', n: 'Carne de cerdo', q: '2' }, { t: 'SALIDA', n: 'Aceite', q: '1' },
    { t: 'SALIDA', n: 'Cebolla', q: '1' }, { t: 'SALIDA', n: 'Papa', q: '1' },
    { t: 'SALIDA', n: 'Plátano', q: '1' }, { t: 'SALIDA', n: 'Frijoles negros', q: '1' },
    { t: 'SALIDA', n: 'Refresco', q: '6' }, { t: 'SALIDA', n: 'Agua', q: '6' },
    { t: 'SALIDA', n: 'Cerveza', q: '6' }, { t: 'SALIDA', n: 'Café', q: '6' },
    { t: 'SALIDA', n: 'Pan', q: '10' },
  ],
  d5: [
    { t: 'ENTRADA', n: 'Arroz', q: '15' }, { t: 'ENTRADA', n: 'Pollo', q: '5' },
    { t: 'ENTRADA', n: 'Carne de cerdo', q: '5' }, { t: 'ENTRADA', n: 'Aceite', q: '3' },
    { t: 'ENTRADA', n: 'Frijoles negros', q: '5' }, { t: 'ENTRADA', n: 'Refresco', q: '12' },
    { t: 'ENTRADA', n: 'Agua', q: '12' }, { t: 'ENTRADA', n: 'Cerveza', q: '12' },
    { t: 'ENTRADA', n: 'Café', q: '12' }, { t: 'ENTRADA', n: 'Pan', q: '20' },
    { t: 'MERMA', n: 'Sal', q: '0.5' },
    { t: 'SALIDA', n: 'Arroz', q: '8' }, { t: 'SALIDA', n: 'Pollo', q: '4' },
    { t: 'SALIDA', n: 'Carne de cerdo', q: '4' }, { t: 'SALIDA', n: 'Aceite', q: '2' },
    { t: 'SALIDA', n: 'Cebolla', q: '2' }, { t: 'SALIDA', n: 'Ajo', q: '0.5' },
    { t: 'SALIDA', n: 'Sal', q: '0.5' }, { t: 'SALIDA', n: 'Papa', q: '3' },
    { t: 'SALIDA', n: 'Plátano', q: '3' }, { t: 'SALIDA', n: 'Frijoles negros', q: '3' },
    { t: 'SALIDA', n: 'Refresco', q: '12' }, { t: 'SALIDA', n: 'Agua', q: '12' },
    { t: 'SALIDA', n: 'Cerveza', q: '12' }, { t: 'SALIDA', n: 'Café', q: '12' },
    { t: 'SALIDA', n: 'Pan', q: '20' },
  ],
  d6: [
    { t: 'SALIDA', n: 'Arroz', q: '2' }, { t: 'SALIDA', n: 'Pollo', q: '1' },
    { t: 'SALIDA', n: 'Carne de cerdo', q: '1' },
    { t: 'SALIDA', n: 'Refresco', q: '6' }, { t: 'SALIDA', n: 'Agua', q: '6' },
    { t: 'SALIDA', n: 'Cerveza', q: '6' }, { t: 'SALIDA', n: 'Café', q: '6' },
    { t: 'SALIDA', n: 'Pan', q: '10' },
  ],
  d7: [
    { t: 'SALIDA', n: 'Refresco', q: '3', blocked: true },
    { t: 'SALIDA', n: 'Agua', q: '3' },
    { t: 'SALIDA', n: 'Café', q: '3', blocked: true },
    { t: 'SALIDA', n: 'Pan', q: '5', blocked: true },
  ],
};

// Tránsito esperado (En Tránsito) por día, orden: Arroz, Pollo, Carne, Aceite,
// Cebolla, Ajo, Sal, Papa, Plátano, Frijoles, Refresco, Agua, Cerveza, Café, Pan.
// Valores decimales con tolerancia ±0.1 (los de unidades enteras exactos).
const TRANSIT_ORDER = ['Arroz', 'Pollo', 'Carne de cerdo', 'Aceite', 'Cebolla', 'Ajo', 'Sal', 'Papa', 'Plátano', 'Frijoles negros', 'Refresco', 'Agua', 'Cerveza', 'Café', 'Pan'];
const TRANSIT_DAYS: Record<string, number[]> = {
  d1: [4.25, 2.4, 3, 1.94, 1.94, 0.28, 0.27, 3, 2, 1.8, 4, 5, 6, 5, 8],
  d2: [8.25, 4.4, 4.3, 2.77, 2.88, 0.26, 0.23, 4.7, 2.5, 2.8, 8, 11, 9, 10, 18],
  d3: [10.75, 6.1, 5.95, 3.7, 3.81, 0.24, 0.2, 6.7, 4.5, 3.6, 13, 16, 13, 13, 25],
  d4: [13.0, 7.8, 7.95, 4.59, 4.75, 0.23, 0.16, 7.4, 5.5, 4.2, 18, 22, 16, 18, 33],
  d5: [20.25, 10.9, 11.25, 6.41, 6.63, 0.68, 0.6, 10.4, 8, 7.2, 27, 32, 24, 28, 49],
  d6: [22.0, 11.6, 12.25, 6.36, 6.61, 0.67, 0.585, 9.9, 7.75, 7.2, 32, 38, 27, 33, 56],
  d7: [22.0, 11.6, 12.25, 6.36, 6.61, 0.67, 0.585, 9.9, 7.75, 7.2, 32, 41, 27, 32, 54],
};

// Stock final en almacén (Disponible)
const FINAL_STOCK: [string, string][] = [
  ['Arroz', '50'], ['Frijoles negros', '27'], ['Carne de cerdo', '16'], ['Pollo', '11'],
  ['Aceite', '8'], ['Cebolla', '2'], ['Ajo', '3.2'], ['Sal', '3.7'], ['Papa', '1'],
  ['Plátano', '1'], ['Refresco', '0'], ['Agua', '3'], ['Cerveza', '6'], ['Café', '0'],
  ['Pan', '0'], ['Detergente', '6'], ['Jabón', '6'],
];

// Fechas (yyyy-mm-dd) por día
const D = {
  d1: '2026-08-10', d2: '2026-08-11', d3: '2026-08-12',
  d4: '2026-08-13', d5: '2026-08-14', d6: '2026-08-15', d7: '2026-08-16',
};

// ============================================================
// RECOLECCIÓN DE DATOS PARA EL REPORTE
// ============================================================
const reportData: Record<string, unknown> = { finalStock: {}, transit: {}, sales: {} };
function saveReport() {
  const f = path.join(path.dirname(fileURLToPath(import.meta.url)), 'guia-report-data.json');
  fs.writeFileSync(f, JSON.stringify(reportData, null, 2));
}

// ============================================================
// HELPERS
// ============================================================

async function login(page: Page, pin: string) {
  await gotoApp(page,`${BASE_URL}/login`);
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
  // Recarga completa para que useDatabaseStore re-inicialice verifiedRole desde
  // localStorage: tras el logout el store queda en null y el chip "Sesión:" solo
  // se pinta si el store tiene el rol (en la GUI real aparece tras reiniciar/recargar).
  await gotoApp(page, `${BASE_URL}/dashboard`);
  await dismissOnboarding(page);
  await expect(page.locator('#root')).toContainText('Ventas', { timeout: 15000 });
  const st = await page.evaluate(() => ({
    url: location.href,
    vr: localStorage.getItem('verifiedRole'),
    vrn: localStorage.getItem('verifiedRoleName'),
    lo: localStorage.getItem('inventarioy_logged_out'),
    userRole: (JSON.parse(localStorage.getItem('inventarioy_user') || '{}') as any).role,
  }));
  console.log(`[login pin=${pin}] ${JSON.stringify(st)}`);
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

async function logout(page: Page) {
  const btn = page.getByRole('button', { name: 'Cerrar Sesión' });
  try {
    await btn.scrollIntoViewIfNeeded({ timeout: 5000 });
    await btn.click({ timeout: 5000 });
  } catch {
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(el => el.textContent?.includes('Cerrar Sesión'));
      (b as HTMLButtonElement)?.click();
    });
  }
  const confirmBtn = page.getByRole('button', { name: 'Cerrar sesión igual' });
  try {
    await confirmBtn.waitFor({ state: 'visible', timeout: 3000 });
    await confirmBtn.click();
  } catch {
    /* sin dialog de sincronización pendiente */
  }
  await page.waitForURL(/\/login$|\/$/, { timeout: 15000 });
  const st = await page.evaluate(async () => {
    return { url: location.href, lo: localStorage.getItem('inventarioy_logged_out'), u: !!localStorage.getItem('inventarioy_user'), syncQueue: 'removed' };
  });
  console.log(`[logout] ${JSON.stringify(st)}`);
  await gotoApp(page, `${BASE_URL}/login`);
}

async function closeModalAfterSuccess(page: Page, modal: Locator) {
  try {
    await expect(modal).toBeHidden({ timeout: 8000 });
    return;
  } catch {
    /* la operación ya confirmó (toast); forzar cierre */
  }
  await modal.getByRole('button', { name: 'Cancelar' }).click({ timeout: 2000 }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await expect(modal).toBeHidden({ timeout: 8000 });
}

async function acceptRetroactive(page: Page) {
  try {
    const btn = page.locator('[data-sonner-toast]').getByRole('button', { name: 'Continuar' }).first();
    await btn.waitFor({ state: 'visible', timeout: 1500 });
    await btn.click();
  } catch {
    /* no retroactivo */
  }
}

async function expectToast(page: Page, text: string | RegExp, timeout = 30000) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: text });
  await expect(toast.first()).toBeVisible({ timeout });
}

async function closeTickets(page: Page) {
  const containers = page.locator('#ticket-container');
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline && (await containers.count().catch(() => 0)) === 0) {
    await page.waitForTimeout(200);
  }
  for (let i = 0; i < 4; i++) {
    const count = await containers.count().catch(() => 0);
    if (count === 0) break;
    const top = containers.nth(count - 1);
    const closeBtn = top.getByRole('button', { name: 'Cerrar' });
    if (await closeBtn.count()) {
      await closeBtn.click();
    }
    try {
      await top.waitFor({ state: 'detached', timeout: 8000 });
    } catch {
      /* si no se desmonta, reintentamos en la siguiente iteración */
    }
  }
  await expect(containers).toHaveCount(0);
}

// page.goto directo falla intermitentemente con net::ERR_ABORTED (navegación
// interrumpida por otra, p.ej. HMR de Vite o el router SPA). Reintentar es seguro
// porque cada intento es una carga completa de la página.
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

async function gotoInventory(page: Page) {
  await gotoApp(page, `${BASE_URL}/dashboard/inventory`);
  await expect(page.locator('#mov_type')).toBeVisible({ timeout: 15000 });
  await waitForDataStable(page);
}

async function gotoSales(page: Page) {
  await gotoApp(page,`${BASE_URL}/dashboard/sales`);
  await expect(page.getByText('Punto de Venta').first()).toBeVisible({ timeout: 15000 });
  await waitForDataStable(page);
}

async function setSalesDate(page: Page, date: string) {
  await page.locator('input[type="date"]').first().fill(date);
}

async function expandSaleDetails(page: Page) {
  const saleType = page.locator('#saleType');
  try {
    await saleType.waitFor({ state: 'visible', timeout: 1500 });
  } catch {
    await page.locator('button').filter({ hasText: 'Total' }).first().click();
    await expect(saleType).toBeVisible({ timeout: 5000 });
  }
}

async function addToCart(page: Page, name: string, qty = 1) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const card = page.locator('button').filter({ has: page.locator('h3', { hasText: new RegExp('^' + esc + '$', 'i') }) }).first();
  await expect(card).toBeVisible({ timeout: 8000 });
  for (let i = 0; i < qty; i++) {
    await card.click();
  }
}

async function removeCartItem(page: Page, name: string) {
  // El botón de eliminar del carrito no tiene title; es el primer botón de la
  // tarjeta del artículo (h4[title]) bajo "Carrito Actual".
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const card = page.locator('div.rounded-lg.border').filter({ has: page.locator('h4[title]', { hasText: new RegExp('^' + esc + '$', 'i') }) }).first();
  await expect(card).toBeVisible({ timeout: 8000 });
  await card.locator('button').first().click();
}

function normalizeNum(s: string): number {
  return parseFloat(s.replace(/[^0-9.,-]/g, '').replace(/,/g, '.'));
}

async function registerMovement(page: Page, m: Movement, date: string) {
  await page.locator('#mov_type').selectOption(m.t);
  const opt = page.locator(`#mov_product option`).filter({ hasText: new RegExp('^' + m.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
  const value = await opt.first().getAttribute('value');
  expect(value).toBeTruthy();
  await page.locator('#mov_product').selectOption(value!);
  await page.locator('#mov_qty').fill(m.q);
  await page.locator('#mov_date').fill(`${date}T08:00`);
  await page.locator('#mov_reason').fill('Flujo GUIA_PRUEBA');
  const btnLabel = m.t === 'ENTRADA' ? 'Registrar Entrada' : m.t === 'SALIDA' ? 'Registrar Salida' : 'Registrar Merma';
  await page.getByRole('button', { name: btnLabel }).click();
  await acceptRetroactive(page);
  if (m.blocked) {
    await expectToast(page, 'excede el stock disponible');
    return false;
  }
  await expectToast(page, 'Movimiento registrado exitosamente');
  // La app resetea el formulario tras el submit; esperar a que el reset
  // se aplique en el DOM para no pisar los fills del siguiente movimiento.
  await expect(page.locator('#mov_product')).toHaveValue('', { timeout: 10000 });
  return true;
}

async function doMovements(page: Page, day: string) {
  await gotoInventory(page);
  const date = D[day];
  for (const m of MOVEMENTS[day]) {
    await registerMovement(page, m, date);
  }
}

async function paymentFields(page: Page, scope: any, pay: [string, string, string, string]) {
  const inputs = scope.locator('input[placeholder="0.00"]');
  await expect(inputs).toHaveCount(4, { timeout: 8000 });
  for (let i = 0; i < 4; i++) {
    if (pay[i]) await inputs.nth(i).fill(pay[i]);
  }
}

async function doSale(page: Page, saleType: string, items: [string, number][], pay: [string, string, string, string]) {
  await expandSaleDetails(page);
  if (saleType !== 'SALON') {
    await page.locator('#saleType').selectOption(saleType);
  }
  for (const [name, qty] of items) {
    await addToCart(page, name, qty);
  }
  const total = items.reduce((acc, [n, q]) => {
    const rec = RECIPES.find(r => r.name === n);
    const cat = CATALOG.find(c => c.name === n);
    const price = rec ? parseFloat(rec.price) : cat ? parseFloat(cat.price) : 0;
    return acc + price * q;
  }, 0);

  await page.getByRole('button', { name: 'Agregar Venta' }).click();
  const preview = page.locator('.modal-backdrop').filter({ hasText: 'Resumen de Venta' });
  await expect(preview).toBeVisible({ timeout: 8000 });
  await expect(preview).toContainText(`$${total.toFixed(2)}`, { timeout: 5000 });
  await paymentFields(page, preview, pay);
  await preview.getByRole('button', { name: 'Confirmar Venta' }).click();
  await expectToast(page, 'Venta registrada exitosamente');
  await closeModalAfterSuccess(page, preview);
  await closeTickets(page);
  return total;
}

async function createPendingAccount(page: Page, name: string) {
  // "Nueva Cuenta" solo está disponible dentro del modal de Resumen de Venta
  const addBtn = page.getByRole('button', { name: 'Agregar Venta' });
  if (await addBtn.isDisabled()) {
    await addToCart(page, 'Café', 1);
  }
  await addBtn.click();
  const preview = page.locator('.modal-backdrop').filter({ hasText: 'Resumen de Venta' });
  await expect(preview).toBeVisible({ timeout: 8000 });
  await preview.getByRole('button', { name: 'Nueva Cuenta' }).click();
  const modal = page.locator('.modal-backdrop').filter({ hasText: 'Nueva Cuenta Pendiente' });
  await modal.locator('input[placeholder*="Ej: Mesa"]').fill(name);
  await modal.getByRole('button', { name: 'Crear Cuenta' }).click();
  await expectToast(page, 'Cuenta creada');
  await expect(modal).toBeHidden({ timeout: 5000 });
  // Limpiar estado: cerrar el preview y quitar el artículo temporal
  await preview.locator('button.rounded-full').first().click();
  await expect(preview).toBeHidden({ timeout: 5000 });
  await removeCartItem(page, 'Café');
}

async function addToPendingAccount(page: Page, account: string, items: [string, number][], isAccountHouse = false) {
  await expandSaleDetails(page);
  if (isAccountHouse) {
    await page.locator('#accountHouse').check();
  }
  for (const [name, qty] of items) {
    await addToCart(page, name, qty);
  }
  const preview = page.locator('.modal-backdrop').filter({ hasText: 'Resumen de Venta' });
  if ((await preview.count()) === 0) {
    await page.getByRole('button', { name: 'Agregar Venta' }).click();
  }
  await expect(preview).toBeVisible({ timeout: 8000 });
  const sel = preview.locator('select').filter({ has: page.locator(`option:has-text("${account}")`) }).first();
  const opt = sel.locator(`option:has-text("${account}")`).first();
  const value = await opt.getAttribute('value');
  expect(value).toBeTruthy();
  await sel.selectOption(value!);
  await preview.getByRole('button', { name: 'Agregar a Cuenta' }).click();
  await expectToast(page, /Productos agregados a la cuenta|Cuenta creada/i);
  await closeTickets(page);
  const house = page.locator('#accountHouse');
  if ((await house.isChecked()) && (await house.isEnabled())) {
    await house.uncheck();
  }
}

async function chargePendingAccount(page: Page, account: string, pay: [string, string, string, string]) {
  const card = page.locator('div.rounded-lg.border').filter({ hasText: account }).filter({ has: page.getByRole('button', { name: 'Cobrar' }) }).first();
  await expect(card).toBeVisible({ timeout: 8000 });
  await card.getByRole('button', { name: 'Cobrar' }).click();
  const modal = page.locator('.modal-backdrop').filter({ hasText: 'Cobrar Cuenta' });
  await expect(modal).toBeVisible({ timeout: 8000 });
  await paymentFields(page, modal, pay);
  await modal.getByRole('button', { name: 'Confirmar Cobro' }).click();
  // Ventana amplia: bajo carga (BD compartida en suite) el cobro puede tardar
  await expectToast(page, 'Cuenta cobrada', 30000);
  await closeTickets(page);
}

async function closeDay(page: Page, date: string, pay: [string, string, string, string]) {
  await gotoSales(page);
  await setSalesDate(page, date);
  await page.getByRole('button', { name: 'Cierre de Caja' }).click();
  const modal = page.locator('.modal-backdrop').filter({ hasText: 'Cierre de Caja' });
  await expect(modal).toBeVisible({ timeout: 8000 });
  await paymentFields(page, modal, pay);
  await modal.getByRole('button', { name: 'Confirmar Cierre' }).click();
  // Ventana amplia: bajo carga (BD compartida en suite) el cierre puede tardar
  await expectToast(page, new RegExp(`Cierre de caja del ${date} registrado`), 30000);
  await expect(modal).toBeHidden({ timeout: 8000 });
}

async function readStockCell(page: Page, product: string, col: 3 | 4): Promise<number> {
  await page.locator('input[placeholder="Buscar por nombre o categoría..."]').fill(product);
  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible({ timeout: 8000 });
  const cell = await row.locator('td').nth(col).textContent();
  return normalizeNum(cell || '0');
}

// La fetchAll "storm" puede dejar el dashboard mostrando productos.in_transit
// crudo (residual de la última venta) durante unos segundos, hasta que la última
// fetchAll recalcula in_transit desde transit_items. Releer la celda hasta que
// converja al valor esperado evita leer el valor transitorio sin enmascarar
// discrepancias reales (si nunca converge, falla con el valor leído).
async function readStockCellUntil(page: Page, product: string, col: 3 | 4, expected: number, tol: number): Promise<number> {
  let val = -1;
  for (let attempt = 0; attempt < 15; attempt++) {
    await page.locator('input[placeholder="Buscar por nombre o categoría..."]').fill(product);
    const row = page.locator('tbody tr').first();
    await expect(row).toBeVisible({ timeout: 8000 });
    val = normalizeNum((await row.locator('td').nth(col).textContent()) || '0');
    if (Math.abs(val - expected) <= tol) return val;
    await page.waitForTimeout(1500);
  }
  return val;
}

async function verifyTransitDay(page: Page, day: string) {
  const expected = TRANSIT_DAYS[day];
  const got: Record<string, number> = {};
  const tolFor = (name: string) => (name === 'Refresco' || name === 'Agua' || name === 'Cerveza' || name === 'Café' || name === 'Pan') ? 0.01 : 0.11;

  // La fetchAll "storm" puede dejar en el store productos.in_transit obsoleto
  // (suma calculada sobre transit_items en memoria que no incluye aún el último
  // lote creado). La única forma fiable de converger es una navegación fresca que
  // dispare una fetchAll cuyo recompute use transit_items del server ya asentado.
  // Reintentar en ciclos de goto + waitForDataStable hasta que TODOS los productos
  // coincidan; si tras varios ciclos hay discrepancias, fallar con el valor leído.
  let attempts = 0;
  for (;;) {
    attempts++;
    await gotoApp(page,`${BASE_URL}/dashboard`);
    await waitForDataStable(page);
    let allOk = true;
    for (let i = 0; i < TRANSIT_ORDER.length; i++) {
      const exp = expected[i];
      const tol = tolFor(TRANSIT_ORDER[i]);
      got[TRANSIT_ORDER[i]] = await readStockCellUntil(page, TRANSIT_ORDER[i], 4, exp, tol);
      if (Math.abs(got[TRANSIT_ORDER[i]] - exp) > tol) {
        allOk = false;
        break;
      }
    }
    if (allOk || attempts >= 5) break;
  }

  for (let i = 0; i < TRANSIT_ORDER.length; i++) {
    const exp = expected[i];
    const tol = tolFor(TRANSIT_ORDER[i]);
    expect(Math.abs(got[TRANSIT_ORDER[i]] - exp)).toBeLessThan(tol);
  }
  reportData.transit[day] = got;
  saveReport();
}

async function addProduct(page: Page, p: CatalogItem) {
  await gotoInventory(page);
  await page.locator('#name').fill(p.name);
  await page.locator('#category').selectOption('custom');
  await page.locator('#custom_category').fill(p.cat);
  await page.locator('#quantity').fill(p.stock);
  await page.locator('#unit').selectOption({ label: p.unitLabel });
  await page.locator('#cost').fill(p.cost);
  if (p.individual) {
    await page.locator('#is_individual').check();
    await page.locator('#price').fill(p.price);
  }
  await page.getByRole('button', { name: 'Agregar Producto' }).click();
  await expectToast(page, 'Producto agregado exitosamente');
}

async function setRop(page: Page, p: CatalogItem) {
  await page.locator('input[placeholder="Buscar por nombre o categoría..."]').fill(p.name);
  const row = page.locator('tbody tr').first();
  await row.locator('button[title="Editar parámetros (ROP)"]').click();
  const modal = page.locator('.modal-backdrop').filter({ hasText: 'Editar Parámetros' });
  await expect(modal).toBeVisible({ timeout: 8000 });
  await modal.locator('#edit_rop').fill(p.rop);
  await modal.getByRole('button', { name: 'Auto' }).click();
  if (p.individual) {
    await modal.locator('#edit_price').fill(p.price);
  }
  await modal.getByRole('button', { name: 'Guardar Cambios' }).click();
  await expectToast(page, 'Parámetros actualizados exitosamente');
}

async function addRecipe(page: Page, r: Recipe) {
  await gotoApp(page,`${BASE_URL}/dashboard/recipes`);
  await waitForDataStable(page);
  await page.locator('#recipeName').fill(r.name);
  await page.locator('#sellingPrice').fill(r.price);
  for (const [ing, qty] of r.ing) {
    const form = page.locator('form').first();
    const opt = form.locator('option').filter({ hasText: new RegExp('^' + ing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
    const value = await opt.first().getAttribute('value');
    expect(value).toBeTruthy();
    // El ingrediente se agrega seleccionándolo del select (UI actual; sin botón "Agregar Ingrediente")
    await form.locator('select').first().selectOption(value!);
    const row = form.locator('div.rounded-md.bg-surface').filter({ hasText: ing }).last();
    await expect(row).toBeVisible({ timeout: 5000 });
    await row.locator('input[type="number"]').last().fill(qty);
  }
  await page.getByRole('button', { name: 'Guardar Receta' }).click();
  await expectToast(page, /Receta creada|Receta guardada/i);
}

async function toggleSwitch(page: Page, label: string) {
  const row = page.locator('div.flex.items-center.justify-between').filter({ hasText: label });
  const sw = row.getByRole('switch').first();
  const checked = (await sw.getAttribute('aria-checked')) === 'true';
  if (!checked) await sw.click();
}

async function createDepartment(page: Page, name: string) {
  await page.getByRole('button', { name: /Departamentos|Deptos\./ }).first().click();
  await page.locator('input[placeholder*="Ej: Cocina"]').fill(name);
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await expectToast(page, 'Departamento creado');
  // La tarjeta del departamento debe persistir (ninguna fetchAll en vuelo lo borra)
  await expect(page.locator('div.rounded-xl.border.border-border.bg-surface').filter({ hasText: name }).first()).toBeVisible({ timeout: 8000 });
}

async function createEmployee(page: Page, name: string, role: 'dependiente' | 'supervisor', salary: string) {
  await page.getByRole('button', { name: /Personal|Pers\./ }).first().click();
  await page.locator('#name').fill(name);
  await page.locator('#role').fill(role === 'dependiente' ? 'Dependiente' : 'Supervisora');
  await page.locator('#salary').fill(salary);
  await page.locator('#nit_id').fill('75082512345');
  await expect(page.locator('#category option', { hasText: 'Cocina' })).toHaveCount(1, { timeout: 15000 });
  await page.locator('#category').selectOption('Cocina');
  await page.locator('#hire_date').fill('2026-08-01');
  await page.getByRole('button', { name: 'Registrar Empleado' }).click();
  // Verificación por DOM (tarjeta del empleado) — más fiable que el toast (sonner puede quedarse atascado)
  await expect(page.locator('h3').filter({ hasText: name })).toHaveCount(1, { timeout: 30000 });
  // El departamento debe seguir existiendo tras el alta
  await expect(page.locator('#category option', { hasText: 'Cocina' })).toHaveCount(1, { timeout: 15000 });
}

async function createPin(page: Page, name: string, roleName: string, modules: string[], pin: string) {
  await page.getByRole('button', { name: 'Agregar Nuevo PIN' }).click();
  const modal = page.getByRole('dialog').filter({ hasText: 'Agregar Nuevo PIN' });
  await expect(modal).toBeVisible({ timeout: 8000 });
  // Empleado existente de RR.HH.
  const empSelect = modal.locator('select').nth(1);
  const opt = empSelect.locator('option', { hasText: name }).first();
  await opt.waitFor({ state: 'attached', timeout: 15000 });
  await empSelect.selectOption((await opt.getAttribute('value')) as string);
  await modal.locator('input[placeholder="0000"]').fill(pin);
  // Rol nuevo con los módulos indicados
  await modal.locator('input[placeholder^="Nombre del nuevo rol"]').fill(roleName);
  for (const m of modules) {
    await modal.getByRole('button', { name: m, exact: true }).click();
  }
  await modal.getByRole('button', { name: 'Crear PIN' }).click();
  await expectToast(page, /PIN creado/i);
  await expect(modal).toBeHidden({ timeout: 8000 });
}

// ============================================================
// PRUEBA PRINCIPAL
// ============================================================

test('Flujo completo GUIA_PRUEBA (7 días restaurante + bodega)', async ({ page }) => {
  test.setTimeout(3_600_000);

  // ---- FASE 0: Registro (setup de negocio) ----
  await test.step('Registro y setup del negocio', async () => {
    // Pre-vuelo anti-reúso: la prueba exige la BD temporal pristine que crea
    // scripts/start-test-server.mjs. Con reuseExistingServer, un servidor
    // :4173 superviviente de una corrida anterior conserva sus datos (el
    // setup responde 400 'ya está configurado' y el flujo falla de forma
    // determinista más adelante, p. ej. a mitad del Día 1). Se detectan
    // residuos propios de esta prueba (nombres que ningún otro spec crea)
    // y se falla aquí con mensaje accionable.
    {
      const api = 'http://127.0.0.1:4173';
      const loginRes = await page.request.post(`${api}/api/auth/login`, {
        data: { pin: '1234' },
        headers: { 'Content-Type': 'application/json', Origin: api },
      });
      const loginJson = await loginRes.json().catch(() => ({} as any));
      const token = loginJson?.data?.token as string | undefined;
      const sess = loginJson?.data?.sessionToken as string | undefined;
      if (token && sess) {
        const q = async (table: string, column: string, value: string) => {
          const r = await page.request.post(`${api}/api/query`, {
            data: { table, method: 'select', filters: [{ op: 'eq', column, value }] },
            headers: {
              'Content-Type': 'application/json',
              Origin: api,
              'x-inventarioy-token': token,
              'x-inventarioy-session': sess,
            },
          });
          const j = await r.json().catch(() => ({} as any));
          return Array.isArray(j?.data) ? j.data.length : 0;
        };
        const residue =
          (await q('departments', 'name', 'Cocina')) +
          (await q('employees', 'name', 'Juan Dependiente')) +
          (await q('pending_accounts', 'client_name', 'Ana')) +
          (await q('pending_accounts', 'client_name', 'Cuenta Casa')) +
          (await q('products', 'name', 'Frijoles negros'));
        if (residue > 0) {
          throw new Error(
            `BD temporal reutilizada (${residue} fila(s) residuo de una corrida anterior en :4173). ` +
            `Deten los procesos node en los puertos 3000/4173 y re-ejecuta para partir de BD limpia.`
          );
        }
      }
    }
    await gotoApp(page,`${BASE_URL}/register`);
    await page.locator('#businessName').fill(BUSINESS_NAME);
    await page.locator('#pin').fill(OWNER_PIN);
    await page.locator('#confirmPin').fill(OWNER_PIN);
    await page.getByRole('button', { name: 'Configurar y Comenzar' }).click();
    await page.waitForURL('**/login', { timeout: 20000 });
    await login(page, OWNER_PIN);
  });

  // ---- FASE 1: Configuración (monedas y ticket) ----
  await test.step('Configuración: USD, EUR, Transferencia y ticket', async () => {
    await gotoApp(page,`${BASE_URL}/dashboard/settings`);
    await expect(page.locator('#businessName, [data-testid="business-name"], input').first()).toBeVisible({ timeout: 15000 });
    await waitForDataStable(page);
    await toggleSwitch(page, 'Generar ticket');
    await toggleSwitch(page, 'USD');
    await page.locator('input[placeholder="Tasa USD→CUP"]').fill('320');
    await toggleSwitch(page, 'EUR');
    await page.locator('input[placeholder="Tasa EUR→CUP"]').fill('350');
    await toggleSwitch(page, 'CUP Transferencia');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expectToast(page, /guardad[oa]|actualizado|exitosa/i);
  });

  // ---- FASE 2: RRHH y PINs ----
  await test.step('RRHH: departamentos, empleados y PINs', async () => {
    await gotoApp(page,`${BASE_URL}/dashboard/hr`);
    await waitForDataStable(page);
    await createDepartment(page, 'Cocina');
    await createEmployee(page, 'Juan Dependiente', 'dependiente', '10000');
    await createEmployee(page, 'María Supervisora', 'supervisor', '15000');

    await gotoApp(page,`${BASE_URL}/dashboard/settings`);
    await expect(page.getByRole('button', { name: 'Agregar Nuevo PIN' })).toBeVisible({ timeout: 15000 });
    await waitForDataStable(page);
    await createPin(page, 'Juan Dependiente', 'Dependiente', ['Ventas'], JAN_PIN);
    await createPin(page, 'María Supervisora', 'Supervisora', ['Ventas', 'Cierres'], MARIA_PIN);
  });

  // ---- FASE 3: Catálogo de productos ----
  await test.step('Catálogo: 18 productos', async () => {
    for (const p of CATALOG) {
      await addProduct(page, p);
    }
  });

  // ---- FASE 4: Configurar ROP ----
  await test.step('Configurar ROP de productos', async () => {
    await gotoApp(page,`${BASE_URL}/dashboard`);
    await waitForDataStable(page);
    for (const p of CATALOG) {
      await setRop(page, p);
    }
  });

  // ---- FASE 5: Recetas ----
  await test.step('Recetario: 6 recetas', async () => {
    for (const r of RECIPES) {
      await addRecipe(page, r);
    }
  });

  // ---- FASE 6: Días 1-7 ----
  // Día 1
  await test.step('Día 1 (2026-08-10): movimientos y ventas', async () => {
    await doMovements(page, 'd1');
    await gotoSales(page);
    await setSalesDate(page, D.d1);
    await doSale(page, 'SALON', [['Arroz con pollo', 2], ['Refresco', 2]], ['1100', '', '', '']);
    await doSale(page, 'SALON', [['Congrí', 1], ['Café', 1]], ['460', '', '', '']);
    await doSale(page, 'VENTA_RAPIDA', [['Pan', 2], ['Agua', 1]], ['100', '', '', '']);
    await createPendingAccount(page, 'Ana');
    await addToPendingAccount(page, 'Ana', [['Cerdo asado', 1], ['Cerveza', 1]]);
    await verifyTransitDay(page, 'd1');
    await closeDay(page, D.d1, ['1660', '', '', '']);
  });

  // Día 2
  await test.step('Día 2 (2026-08-11): bloqueo día cerrado, cobro y ventas', async () => {
    await doMovements(page, 'd2');
    await gotoSales(page);
    await setSalesDate(page, D.d2);

    // Bloqueo retroactivo (fecha cerrada)
    await expandSaleDetails(page);
    await addToCart(page, 'Cerdo asado', 1);
    await setSalesDate(page, D.d1);
    const addBtn = page.getByRole('button', { name: /Agregar Venta|Día Cerrado/ }).last();
    await expect(addBtn).toContainText('Día Cerrado', { timeout: 5000 });
    await expect(addBtn).toBeDisabled();
    await removeCartItem(page, 'Cerdo asado');
    await setSalesDate(page, D.d2);

    // Cobro de cuenta pendiente de Ana
    await chargePendingAccount(page, 'Ana', ['650', '', '', '']);

    await doSale(page, 'DOMICILIO', [['Cerdo asado', 1], ['Refresco', 2]], ['600', '100', '', '']);
    await doSale(page, 'BAR', [['Cerveza', 2], ['Café', 1]], ['60', '', '1', '']);
    await doSale(page, 'SALON', [['Tostones', 2], ['Papas fritas', 1]], ['390', '', '', '']);
    await verifyTransitDay(page, 'd2');
    await closeDay(page, D.d2, ['1700', '100', '1', '']);
  });

  // Día 3
  await test.step('Día 3 (2026-08-12): cuenta de la casa', async () => {
    await doMovements(page, 'd3');
    await gotoSales(page);
    await setSalesDate(page, D.d3);
    await doSale(page, 'SALON', [['Arroz con pollo', 1], ['Congrí', 1]], ['830', '', '', '']);
    await doSale(page, 'DOMICILIO', [['Cerdo asado', 1], ['Café', 2]], ['20', '', '2', '']);
    await doSale(page, 'BAR', [['Cerveza', 2], ['Café', 1], ['Agua', 1]], ['80', '', '', '1']);
    await doSale(page, 'VENTA_RAPIDA', [['Pan', 3], ['Refresco', 1]], ['175', '', '', '']);

    await createPendingAccount(page, 'Cuenta Casa');
    await addToPendingAccount(page, 'Cuenta Casa', [['Arroz con pollo', 1]], true);

    await verifyTransitDay(page, 'd3');
    await closeDay(page, D.d3, ['1105', '', '2', '1']);
  });

  // Día 4
  await test.step('Día 4 (2026-08-13): eliminar Tomate (adaptación)', async () => {
    await gotoApp(page,`${BASE_URL}/dashboard`);
    await waitForDataStable(page);
    await page.locator('input[placeholder="Buscar por nombre o categoría..."]').fill('Tomate');
    const row = page.locator('tbody tr').first();
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.locator('button[title="Eliminar producto"]').click();
    const modal = page.locator('.modal-backdrop').filter({ hasText: 'Eliminar producto' });
    await modal.getByRole('button', { name: 'Sí, eliminar' }).click();
    await expectToast(page, /eliminado/i);

    await doMovements(page, 'd4');
    await gotoSales(page);
    await setSalesDate(page, D.d4);
    await doSale(page, 'SALON', [['Congrí', 2], ['Café', 1]], ['840', '', '', '']);
    await doSale(page, 'DOMICILIO', [['Arroz con pollo', 1], ['Papas fritas', 1]], ['600', '', '', '']);
    await doSale(page, 'BAR', [['Cerveza', 3]], ['450', '', '', '']);
    await doSale(page, 'VENTA_RAPIDA', [['Pan', 2], ['Refresco', 1]], ['150', '', '', '']);
    await verifyTransitDay(page, 'd4');
    await closeDay(page, D.d4, ['2040', '', '', '']);
  });

  // Día 5
  await test.step('Día 5 (2026-08-14): movimientos y ventas', async () => {
    await doMovements(page, 'd5');
    await gotoSales(page);
    await setSalesDate(page, D.d5);
    await doSale(page, 'SALON', [['Arroz con pollo', 3], ['Refresco', 3]], ['1000', '650', '', '']);
    await doSale(page, 'DOMICILIO', [['Cerdo asado', 2], ['Café', 2]], ['520', '', '2', '']);
    await doSale(page, 'BAR', [['Cerveza', 4], ['Tostones', 2]], ['490', '', '', '1']);
    await doSale(page, 'VENTA_RAPIDA', [['Pan', 4], ['Agua', 2]], ['200', '', '', '']);
    await verifyTransitDay(page, 'd5');
    await closeDay(page, D.d5, ['2210', '650', '2', '1']);
  });

  // Día 6
  await test.step('Día 6 (2026-08-15): merma en tránsito y ventas', async () => {
    await doMovements(page, 'd6');
    // Merma en tránsito de Papa 0.5 kg
    await gotoApp(page,`${BASE_URL}/dashboard/transit`);
    await waitForDataStable(page);
    await page.locator('#transit-search').fill('Papa');
    const tcard = page.locator('div.rounded-xl.border.border-border.bg-bg.p-4').filter({ hasText: 'Papa' }).first();
    await expect(tcard).toBeVisible({ timeout: 8000 });
    const mermaBtns = tcard.locator('button[title="Registrar merma"]');
    if (!(await mermaBtns.first().isVisible().catch(() => false))) {
      await tcard.locator('summary').click();
    }
    await mermaBtns.first().click();
    const tmodal = page.locator('.modal-backdrop').filter({ hasText: 'Registrar Merma' });
    await expect(tmodal).toBeVisible({ timeout: 8000 });
    await tmodal.locator('input[type="number"]').first().fill('0.5');
    await tmodal.locator('textarea').fill('Papa dañada en tránsito');
    await tmodal.getByRole('button', { name: 'Registrar Merma' }).click();
    await expectToast(page, 'Merma registrada exitosamente');
    await closeModalAfterSuccess(page, tmodal);

    await gotoSales(page);
    await setSalesDate(page, D.d6);
    await doSale(page, 'SALON', [['Arroz con pollo', 1], ['Café', 1]], ['530', '', '', '']);
    await doSale(page, 'BAR', [['Cerveza', 3], ['Tostones', 1]], ['250', '', '1', '']);
    await doSale(page, 'VENTA_RAPIDA', [['Pan', 3], ['Refresco', 1]], ['175', '', '', '']);
    await verifyTransitDay(page, 'd6');
    await closeDay(page, D.d6, ['955', '', '1', '']);
  });

  // Día 7
  await test.step('Día 7 (2026-08-16): SALIDAs bloqueadas y venta (sin cierre)', async () => {
    await gotoInventory(page);
    for (const m of MOVEMENTS.d7) {
      await registerMovement(page, m, D.d7);
    }
    // Verificar Agua salió correctamente (stock transit +1 ya cubierto en verifyTransit)
    await gotoSales(page);
    await setSalesDate(page, D.d7);
    await doSale(page, 'VENTA_RAPIDA', [['Pan', 2], ['Café', 1]], ['130', '', '', '']);
    await verifyTransitDay(page, 'd7');
    // Cuenta Casa sigue pendiente sin cobrar (total $0.00)
    await gotoSales(page);
    await setSalesDate(page, D.d7);
    const casaCard = page.locator('div.rounded-lg.border').filter({ hasText: 'Cuenta Casa' }).first();
    await expect(casaCard).toBeVisible({ timeout: 8000 });
    await expect(casaCard).toContainText('0.00', { timeout: 8000 });
  });

  // ---- FASE 7: Verificación final ----
  await test.step('Verificación final: stock, cierres y roles', async () => {
    // Stock final
    await gotoApp(page,`${BASE_URL}/dashboard`);
    await waitForDataStable(page);
    for (const [name, exp] of FINAL_STOCK) {
      const got = await readStockCell(page, name, 3);
      reportData.finalStock[name] = got;
      const expected = normalizeNum(exp);
      expect(Math.abs(got - expected)).toBeLessThan(0.11);
    }
    saveReport();

    // Cierres registrados
    await gotoApp(page,`${BASE_URL}/dashboard/closings`);
    await expect(page.getByRole('heading', { name: /Cierres de Caja/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/\d+ cierres encontrados/i)).toBeVisible({ timeout: 10000 });

    // Roles
    const checkAccessDenied = async () => {
      const dialog = page.getByRole('dialog', { name: 'Verificar PIN' });
      await expect(dialog).toBeVisible({ timeout: 8000 });
      await dialog.getByRole('button', { name: 'Cerrar' }).click();
      await expect(dialog).toBeHidden({ timeout: 5000 });
    };

    await logout(page);
    await login(page, JAN_PIN);
    await expect(page.locator('#root')).toContainText('Ventas', { timeout: 15000 });
    await expect(page.locator('#root')).toContainText('Dependiente', { timeout: 5000 });
    await gotoApp(page, `${BASE_URL}/dashboard/movements`);
    await checkAccessDenied();

    await logout(page);
    await login(page, MARIA_PIN);
    await expect(page.locator('#root')).toContainText('Ventas', { timeout: 15000 });
    await expect(page.locator('#root')).toContainText('Cierres de Caja', { timeout: 5000 });
    await expect(page.locator('#root')).toContainText('Supervisora', { timeout: 5000 });
    await gotoApp(page, `${BASE_URL}/dashboard/movements`);
    await checkAccessDenied();

    await logout(page);
    await login(page, OWNER_PIN);
    await expect(page.getByText('Almacén').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#root')).toContainText('Dueño/a', { timeout: 5000 });
  });
});