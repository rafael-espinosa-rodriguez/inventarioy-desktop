import { test, expect, type Page, type Locator } from '@playwright/test';

// ============================================================
// E2E: Roles combinados + flujos atómicos de tránsito
// ============================================================
// Valida:
// 1. Fix B — un PIN con módulo Inventario pero SIN Tránsito puede
//    registrar SALIDAS (el gate de TABLE_MODULES no debe exigir el
//    módulo tránsito para crear transit_items).
// 2. Fix A — un rol con módulo Cierres ve el botón "Previsualizar"
//    en el detalle del cierre diario.
// 3. Flujos de tránsito reescritos con supabase.batch:
//    devolución al stock, merma y consumo manual.
// ============================================================

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OWNER_PIN = '1234';
const BETO_PIN = '9630';

// Los specs comparten la BD dentro de una misma invocación de Playwright
// (el servidor arranca una vez); sufijo único evita colisiones de nombres
const TAG = Math.random().toString(36).slice(2, 6);
const DEPT = `Cocina ${TAG}`;
const EMP = `Beto ${TAG}`;
const ROL = `Vendedor ${TAG}`;
const PAN = `Pan Roles ${TAG}`;
const CAFE = `Café Roles ${TAG}`;
const LAV = `Servicio Lavado ${TAG}`;

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

// Cerramos AYER para que HOY quede abierto: los movimientos y las
// acciones de tránsito se registran con fecha de hoy y el guard
// "El día está cerrado" los bloquearía si cerramos la fecha actual.
function yesterdayISO(): string {
  return new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');
}

// ============================================================
// HELPERS (base copiada de guia-prueba.spec.ts)
// ============================================================

async function waitForDataStable(page: Page, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let lastLog = Date.now();
  const handler = (msg: { text(): string }) => {
    if (/Cargando|Datos cargados|restaurando/i.test(msg.text())) lastLog = Date.now();
  };
  page.on('console', handler);
  try {
    while (Date.now() - lastLog < 2000 && Date.now() < deadline) {
      await page.waitForTimeout(250);
    }
  } finally {
    page.off('console', handler);
  }
}

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
  // Recarga para que useDatabaseStore re-inicialice verifiedRole desde localStorage
  await gotoApp(page, `${BASE_URL}/dashboard`);
  await dismissOnboarding(page);
  await expect(page.locator('#root')).toContainText('Ventas', { timeout: 15000 });
  await waitForDataStable(page);
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
  await gotoApp(page, `${BASE_URL}/login`);
}

async function expectToast(page: Page, text: string | RegExp, timeout = 30000) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: text });
  await expect(toast.first()).toBeVisible({ timeout });
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

async function gotoInventory(page: Page) {
  await gotoApp(page, `${BASE_URL}/dashboard/inventory`);
  await expect(page.locator('#mov_type')).toBeVisible({ timeout: 15000 });
  await waitForDataStable(page);
}

async function gotoSales(page: Page) {
  await gotoApp(page, `${BASE_URL}/dashboard/sales`);
  await expect(page.getByText('Punto de Venta').first()).toBeVisible({ timeout: 15000 });
  await waitForDataStable(page);
}

async function gotoTransit(page: Page) {
  await gotoApp(page, `${BASE_URL}/dashboard/transit`);
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

async function paymentFields(page: Page, scope: Locator, pay: [string, string, string, string]) {
  const inputs = scope.locator('input[placeholder="0.00"]');
  await expect(inputs).toHaveCount(4, { timeout: 8000 });
  for (let i = 0; i < 4; i++) {
    if (pay[i]) await inputs.nth(i).fill(pay[i]);
  }
}

interface ProductSpec {
  name: string;
  cat: string;
  unitLabel: string;
  cost: string;
  price?: string;
  stock: string;
  individual?: boolean;
  consumoDirecto?: boolean;
}

async function addProductEx(page: Page, p: ProductSpec) {
  await gotoInventory(page);
  await page.locator('#name').fill(p.name);
  await page.locator('#category').selectOption('custom');
  await page.locator('#custom_category').fill(p.cat);
  await page.locator('#quantity').fill(p.stock);
  await page.locator('#unit').selectOption({ label: p.unitLabel });
  await page.locator('#cost').fill(p.cost);
  if (p.individual) {
    await page.locator('#is_individual').check();
    await page.locator('#price').fill(p.price!);
  }
  if (p.consumoDirecto) {
    await page.locator('#is_consumo_directo').check();
  }
  await page.getByRole('button', { name: 'Agregar Producto' }).click();
  await expectToast(page, 'Producto agregado exitosamente');
}

async function registerMovement(
  page: Page,
  t: 'ENTRADA' | 'SALIDA' | 'MERMA',
  productName: string,
  qty: string,
  date: string,
  reason: string,
) {
  await page.locator('#mov_type').selectOption(t);
  const opt = page.locator(`#mov_product option`).filter({ hasText: new RegExp('^' + productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
  const value = await opt.first().getAttribute('value');
  expect(value).toBeTruthy();
  await page.locator('#mov_product').selectOption(value!);
  await page.locator('#mov_qty').fill(qty);
  await page.locator('#mov_date').fill(`${date}T08:00`);
  await page.locator('#mov_reason').fill(reason);
  const btnLabel = t === 'ENTRADA' ? 'Registrar Entrada' : t === 'SALIDA' ? 'Registrar Salida' : 'Registrar Merma';
  await page.getByRole('button', { name: btnLabel }).click();
  await acceptRetroactive(page);
  await expectToast(page, 'Movimiento registrado exitosamente');
  // Esperar al reset del formulario para no pisar los fills del siguiente movimiento
  await expect(page.locator('#mov_product')).toHaveValue('', { timeout: 10000 });
}

// La fetchAll "storm" puede mostrar valores transitorios; releer hasta converger
async function readStockCellUntil(page: Page, product: string, col: 3 | 4, expected: number, tol: number): Promise<number> {
  const normalize = (s: string) => parseFloat((s || '0').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
  let val = -1;
  for (let attempt = 0; attempt < 15; attempt++) {
    await page.locator('input[placeholder="Buscar por nombre o categoría..."]').fill(product);
    const row = page.locator('tbody tr').first();
    await expect(row).toBeVisible({ timeout: 8000 });
    val = normalize((await row.locator('td').nth(col).textContent()) || '0');
    if (Math.abs(val - expected) <= tol) return val;
    await page.waitForTimeout(1500);
  }
  return val;
}

// El inventario de roles limitados NO muestra la tabla de productos;
// el stock se verifica con el texto "(Stock: N u)" del selector de movimientos
async function expectStockOption(page: Page, product: string, qty: number) {
  const esc = product.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const opt = page.locator('#mov_product option').filter({ hasText: new RegExp('^' + esc, 'i') }).first();
  await expect(opt).toBeAttached({ timeout: 15000 });
  await expect(async () => {
    const txt = (await opt.textContent()) || '';
    expect(txt).toMatch(new RegExp(`\\(Stock:\\s*${qty}(\\.0+)? u\\)`));
  }).toPass({ timeout: 30000 });
}

async function createDepartment(page: Page, name: string) {
  await page.getByRole('button', { name: /Departamentos|Deptos\./ }).first().click();
  await page.locator('input[placeholder*="Ej: Cocina"]').fill(name);
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await expectToast(page, 'Departamento creado');
  await expect(page.locator('div.rounded-xl.border.border-border.bg-surface').filter({ hasText: name }).first()).toBeVisible({ timeout: 8000 });
}

async function createEmployee(page: Page, name: string, roleLabel: string, salary: string) {
  await page.getByRole('button', { name: /Personal|Pers\./ }).first().click();
  await page.locator('#name').fill(name);
  await page.locator('#role').fill(roleLabel);
  await page.locator('#salary').fill(salary);
  await page.locator('#nit_id').fill('75082512345');
  const deptOpt = page.locator('#category option').filter({ hasText: DEPT }).first();
  await expect(deptOpt).toBeAttached({ timeout: 15000 });
  await page.locator('#category').selectOption((await deptOpt.getAttribute('value')) as string);
  await page.locator('#hire_date').fill(todayISO());
  await page.getByRole('button', { name: 'Registrar Empleado' }).click();
  await expect(page.locator('h3').filter({ hasText: name })).toHaveCount(1, { timeout: 30000 });
}

async function createPin(page: Page, employeeName: string, roleName: string, modules: string[], pin: string) {
  await page.getByRole('button', { name: 'Agregar Nuevo PIN' }).click();
  const modal = page.getByRole('dialog').filter({ hasText: 'Agregar Nuevo PIN' });
  await expect(modal).toBeVisible({ timeout: 8000 });
  // Empleado existente de RR.HH.
  const empSelect = modal.locator('select').nth(1);
  const opt = empSelect.locator('option', { hasText: employeeName }).first();
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

// --- Tránsito ---

function transitGroup(page: Page, productName: string): Locator {
  const esc = productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // La tarjeta del grupo usa "rounded-xl border ... bg-bg p-4"; el filtro
  // por bg-bg evita capturar contenedores ancestro (paneles con bg-surface)
  return page.locator('div.rounded-xl.border.bg-bg').filter({
    has: page.locator('h3', { hasText: new RegExp('^' + esc + '$', 'i') }),
  }).first();
}

async function expandTransitDetails(group: Locator) {
  await group.locator('summary').click();
}

// ============================================================
// PRUEBA PRINCIPAL
// ============================================================

test('Roles combinados (Inventario+Cierres sin Tránsito) y flujos de tránsito atómicos', async ({ page }) => {
  test.setTimeout(1_200_000);
  const today = todayISO();

  // ---- FASE 0: Login como owner (el servidor de pruebas ya siembra
  // el negocio "Negocio E2E" con PIN owner 1234 en modo trial) ----
  await test.step('Login owner', async () => {
    await login(page, OWNER_PIN);
  });

  // ---- FASE 1: Configuración (monedas para los 4 campos de pago) ----
  await test.step('Configuración: USD, EUR y Transferencia', async () => {
    await gotoApp(page, `${BASE_URL}/dashboard/settings`);
    await waitForDataStable(page);
    const toggleSwitch = async (label: string) => {
      const row = page.locator('div.flex.items-center.justify-between').filter({ hasText: label });
      const sw = row.getByRole('switch').first();
      if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
    };
    await toggleSwitch('USD');
    await page.locator('input[placeholder="Tasa USD→CUP"]').fill('320');
    await toggleSwitch('EUR');
    await page.locator('input[placeholder="Tasa EUR→CUP"]').fill('350');
    await toggleSwitch('CUP Transferencia');
    // Si la BD ya tenía la config (servidor reutilizado entre specs), el botón
    // queda deshabilitado y no hay toast: solo exigirlo si hubo algo que guardar
    const guardar = page.getByRole('button', { name: 'Guardar' });
    if (await guardar.isEnabled()) {
      await guardar.click();
      // Con config ya persistida el save emite info "No hay cambios que guardar"
      await expectToast(page, /guardad[oa]|actualizado|exitosa|no hay cambios/i);
    }
  });

  // ---- FASE 2: RRHH + PIN de Beto ----
  await test.step('RRHH: departamento, empleado y PIN Beto', async () => {
    await gotoApp(page, `${BASE_URL}/dashboard/hr`);
    await waitForDataStable(page);
    await createDepartment(page, DEPT);
    await createEmployee(page, EMP, 'Vendedor', '10000');

    await gotoApp(page, `${BASE_URL}/dashboard/settings`);
    await expect(page.getByRole('button', { name: 'Agregar Nuevo PIN' })).toBeVisible({ timeout: 15000 });
    await waitForDataStable(page);
    // Beto: Ventas + Inventario + Cierres, SIN Tránsito
    await createPin(page, EMP, ROL, ['Ventas', 'Inventario', 'Cierres'], BETO_PIN);
  });

  // ---- FASE 3: Catálogo ----
  await test.step('Catálogo: Pan Roles, Café Roles y Servicio Lavado', async () => {
    // Pan Roles se usa solo para la venta/cierre (desacopla los flujos de tránsito)
    await addProductEx(page, { name: PAN, cat: 'Panaderia', unitLabel: 'Unidades (u)', cost: '10', price: '80', stock: '5', individual: true });
    await addProductEx(page, { name: CAFE, cat: 'Bebidas', unitLabel: 'Unidades (u)', cost: '30', price: '80', stock: '10', individual: true });
    await addProductEx(page, { name: LAV, cat: 'Servicios', unitLabel: 'Unidades (u)', cost: '0', price: '3', stock: '5', individual: true, consumoDirecto: true });

    // Las ventas consumen del TRÁNSITO: primero pasamos stock a producción
    await gotoInventory(page);
    await registerMovement(page, 'SALIDA', PAN, '1', today, 'E2E para venta');
  });

  // ---- FASE 4: Venta + cierre de AYER (como owner) ----
  await test.step('Venta y cierre de caja (ayer)', async () => {
    const saleDay = yesterdayISO();
    await gotoSales(page);
    await setSalesDate(page, saleDay);
    await expandSaleDetails(page);
    await addToCart(page, PAN, 1);
    await page.getByRole('button', { name: 'Agregar Venta' }).click();
    const preview = page.locator('.modal-backdrop').filter({ hasText: 'Resumen de Venta' });
    await expect(preview).toBeVisible({ timeout: 8000 });
    await paymentFields(page, preview, ['80', '', '', '']);
    await preview.getByRole('button', { name: 'Confirmar Venta' }).click();
    await expectToast(page, 'Venta registrada exitosamente', 30000);
    await closeModalAfterSuccess(page, preview);
    await closeTickets(page);

    await setSalesDate(page, saleDay);
    await page.getByRole('button', { name: 'Cierre de Caja' }).click();
    const closingModal = page.locator('.modal-backdrop').filter({ hasText: 'Cierre de Caja' });
    await expect(closingModal).toBeVisible({ timeout: 8000 });
    await paymentFields(page, closingModal, ['80', '', '', '']);
    await closingModal.getByRole('button', { name: 'Confirmar Cierre' }).click();
    await expectToast(page, new RegExp(`Cierre de caja del ${saleDay} registrado`), 30000);
    await expect(closingModal).toBeHidden({ timeout: 8000 });
  });

  // ---- FASE 5: BETO — SALIDAs sin módulo Tránsito (Fix B) ----
  await test.step('Beto: SALIDAs con módulo Inventario sin Tránsito', async () => {
    await logout(page);
    await login(page, BETO_PIN);

    await gotoInventory(page);
    // Dos salidas de Café Roles crean DOS lotes separados en tránsito
    await registerMovement(page, 'SALIDA', CAFE, '2', today, 'E2E lote tránsito A');
    await registerMovement(page, 'SALIDA', CAFE, '2', today, 'E2E lote tránsito B');
    await expectStockOption(page, CAFE, 6);

    await registerMovement(page, 'SALIDA', LAV, '2', today, 'E2E consumo directo');
    await expectStockOption(page, LAV, 3);
  });

  // ---- FASE 6: BETO — Cierres con Previsualizar (Fix A) ----
  await test.step('Beto: detalle de cierre muestra Previsualizar', async () => {
    await gotoApp(page, `${BASE_URL}/dashboard/closings`);
    await waitForDataStable(page);

    // Primera tarjeta de cierre (orden descendente → la de hoy)
    const card = page.locator('div.rounded-xl').filter({ has: page.locator('svg.lucide-eye') }).first();
    await expect(card).toBeVisible({ timeout: 15000 });

    // Abrir detalle del cierre
    await card.locator('button').filter({ has: page.locator('svg.lucide-eye') }).first().click();

    // Fix A: el rol con módulo Cierres debe ver "Previsualizar" (canPrint)
    const previsualizar = page.getByRole('button', { name: 'Previsualizar' });
    await expect(previsualizar).toBeVisible({ timeout: 8000 });

    // El preview de ticket se abre correctamente
    await previsualizar.click();
    const ticketPreview = page.locator('.modal-backdrop').filter({ hasText: 'Previsualización de Ticket' });
    await expect(ticketPreview).toBeVisible({ timeout: 8000 });
    await expect(ticketPreview).toContainText('RESUMEN DE VENTAS');

    // Cerrar ambos modales
    await ticketPreview.getByRole('button').first().click(); // X del preview
    await expect(ticketPreview).toBeHidden({ timeout: 5000 });
    await page.getByRole('button', { name: 'Cerrar' }).last().click().catch(() => {});
  });

  // ---- FASE 7: OWNER — Devolución al stock desde tránsito ----
  await test.step('Owner: devolver cantidad al stock (cancel_transit batch)', async () => {
    await logout(page);
    await login(page, OWNER_PIN);

    await gotoTransit(page);
    const group = transitGroup(page, CAFE);
    await expect(group).toBeVisible({ timeout: 15000 });
    await expandTransitDetails(group);

    // Dos lotes → dos botones; devolvemos el primero COMPLETO
    // (la cantidad viene precargada con el restante del lote)
    const devButtons = group.locator('button[title="Devolver cantidad al stock"]');
    await expect(devButtons).toHaveCount(2, { timeout: 8000 });
    await devButtons.first().click();
    const modal = page.locator('.modal-backdrop').filter({ hasText: 'Devolver al Stock' });
    await expect(modal).toBeVisible({ timeout: 8000 });
    await modal.locator('textarea').fill('E2E devolucion lote A');
    await modal.getByRole('button', { name: 'Devolver', exact: true }).click();
    await expectToast(page, 'Producto devuelto al stock exitosamente');
    await expect(modal).toBeHidden({ timeout: 8000 });

    // El grupo sigue visible porque el lote B permanece en tránsito
    await expect(transitGroup(page, CAFE)).toBeVisible({ timeout: 10000 });
  });

  // ---- FASE 8: OWNER — Merma desde tránsito ----
  await test.step('Owner: registrar merma desde tránsito (batch)', async () => {
    await gotoTransit(page);
    const group = transitGroup(page, CAFE);
    await expect(group).toBeVisible({ timeout: 15000 });
    await expandTransitDetails(group);

    // Solo queda el lote B
    const wasteButtons = group.locator('button[title="Registrar merma"]');
    await expect(wasteButtons).toHaveCount(1, { timeout: 8000 });
    await wasteButtons.click();
    const modal = page.locator('.modal-backdrop').filter({ hasText: 'Registrar Merma' });
    await expect(modal).toBeVisible({ timeout: 8000 });
    await modal.locator('textarea').fill('E2E merma lote');
    await modal.getByRole('button', { name: 'Registrar Merma', exact: true }).click();
    await expectToast(page, 'Merma registrada exitosamente');
    await expect(modal).toBeHidden({ timeout: 8000 });

    // remaining llega a 0 → el producto desaparece de tránsito
    await expect(transitGroup(page, CAFE)).toBeHidden({ timeout: 10000 });
  });

  // ---- FASE 9: OWNER — Consumo manual (producto consumo directo) ----
  await test.step('Owner: consumo manual desde tránsito (batch)', async () => {
    await gotoTransit(page);
    const group = transitGroup(page, LAV);
    await expect(group).toBeVisible({ timeout: 15000 });
    await expandTransitDetails(group);

    await group.locator('button[title="Registrar consumo manual"]').click();
    const modal = page.locator('.modal-backdrop').filter({ hasText: 'Consumo Manual' });
    await expect(modal).toBeVisible({ timeout: 8000 });
    await modal.locator('textarea').fill('E2E consumo manual');
    await modal.getByRole('button', { name: 'Registrar Consumo', exact: true }).click();
    await expectToast(page, 'Consumo registrado exitosamente');
    await expect(modal).toBeHidden({ timeout: 8000 });

    // remaining llega a 0 → desaparece de tránsito
    await expect(transitGroup(page, LAV)).toBeHidden({ timeout: 10000 });
  });

  // ---- FASE 10: Verificación final de stock ----
  await test.step('Verificación final de stock', async () => {
    // La tabla de stock con buscador vive en Almacén (/dashboard), no en /inventory
    await gotoApp(page, `${BASE_URL}/dashboard`);
    await waitForDataStable(page);

    // Café Roles: 10 - 4 (dos salidas) + 2 (devolución lote A) = 8
    // (la merma del lote B no repone stock)
    const stockCafe = await readStockCellUntil(page, CAFE, 3, 8, 0.01);
    expect(Math.abs(stockCafe - 8)).toBeLessThanOrEqual(0.01);

    // Servicio Lavado: 5 - 2 (salida) = 3 (el consumo manual no repone stock)
    const stockLavado = await readStockCellUntil(page, LAV, 3, 3, 0.01);
    expect(Math.abs(stockLavado - 3)).toBeLessThanOrEqual(0.01);
  });
});
