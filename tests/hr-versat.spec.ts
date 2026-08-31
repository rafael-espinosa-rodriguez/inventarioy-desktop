import { test, expect, type Page } from '@playwright/test';

// ============================================================
// E2E: RRHH modelo Versat — expediente secuencial, captación
// pre-nómina, nómina Borrador/Aplicada y vacaciones acumuladas
// ============================================================

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OWNER_PIN = '1234';

// Sufijo único: los specs comparten la BD dentro de la misma invocación
const TAG = Math.random().toString(36).slice(2, 6);
const DEPT = `Cocina ${TAG}`;
const EMP = `Beto ${TAG}`;

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

// ============================================================
// HELPERS (copiados de roles-transito.spec.ts)
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

async function expectToast(page: Page, text: string | RegExp, timeout = 30000) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: text });
  await expect(toast.first()).toBeVisible({ timeout });
}

test('RRHH Versat: expediente, captación, nómina borrador/aplicada y vacaciones', async ({ page }) => {
  test.setTimeout(420_000);

  await test.step('Login owner', async () => {
    await login(page, OWNER_PIN);
  });

  const expNum = await test.step('Departamento + empleado (expediente auto)', async () => {
    await gotoApp(page, `${BASE_URL}/dashboard/hr`);
    await waitForDataStable(page);

    await page.getByRole('button', { name: /Departamentos|Deptos\./ }).first().click();
    await page.locator('input[placeholder*="Ej: Cocina"]').fill(DEPT);
    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await expectToast(page, 'Departamento creado');

    await page.getByRole('button', { name: /Personal|Pers\./ }).first().click();
    // El formulario muestra el próximo expediente como campo de solo lectura
    const expedientePreview = page.locator('input[disabled][readonly]');
    await expect(expedientePreview.first()).toHaveValue(/#\d+/, { timeout: 8000 });

    await page.locator('#name').fill(EMP);
    await page.locator('#role').fill('Vendedor');
    await page.locator('#salary').fill('26000');
    await page.locator('#nit_id').fill('75082512345');
    const deptOpt = page.locator('#category option').filter({ hasText: DEPT }).first();
    await expect(deptOpt).toBeAttached({ timeout: 15000 });
    await page.locator('#category').selectOption((await deptOpt.getAttribute('value')) as string);
    await page.locator('#hire_date').fill(todayISO());
    await page.getByRole('button', { name: 'Registrar Empleado' }).click();
    await expect(page.locator('h3').filter({ hasText: EMP })).toHaveCount(1, { timeout: 30000 });

    // La tarjeta muestra el badge del expediente secuencial
    const card = page.locator('h3').filter({ hasText: EMP }).first();
    const badge = card.locator('span', { hasText: /^#\d+$/ }).first();
    await expect(badge).toBeVisible();
    const badgeText = ((await badge.textContent()) || '#1').trim();
    // La búsqueda por número de expediente encuentra al trabajador
    await page.locator('input[placeholder*="Buscar por nombre"]').fill(badgeText.replace('#', ''));
    await expect(page.locator('h3').filter({ hasText: EMP })).toHaveCount(1, { timeout: 8000 });
    await page.locator('input[placeholder*="Buscar por nombre"]').fill('');
    return badgeText;
  });

  await test.step('Captación pre-nómina: bono masivo y guardar', async () => {
    await page.getByRole('button', { name: /^Nó/ }).first().click();
    await expect(page.getByText('Captación Pre-nómina').first()).toBeVisible({ timeout: 10000 });
    await waitForDataStable(page);

    // Filtro por departamento (la app capitaliza nombres: seleccionar por value)
    const deptSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Todos los departamentos' }) }).first();
    const deptOpt = deptSelect.locator('option').filter({ hasText: DEPT }).first();
    await expect(deptOpt).toBeAttached({ timeout: 10000 });
    await deptSelect.selectOption((await deptOpt.getAttribute('value')) as string);

    // Bono en lote al incluido del departamento filtrado
    await page.locator('input[placeholder="Bonificación $"]').fill('5000');
    await page.getByRole('button', { name: 'Bonificar' }).click();
    await expectToast(page, /Bonificación de \$5000\.00 aplicada/i);
  });

  await test.step('Generar nómina SIN guardar captación (auto-save) y verificar columnas Versat', async () => {
    // No se pulsa "Guardar Captación": Generar debe auto-guardar lo visible
    await page.getByRole('button', { name: 'Generar Nómina' }).click();
    await expectToast(page, /Nómina generada/i, 30000);

    // La tabla de nómina se agrupa por departamento: buscar la fila en TODAS
    // las tablas con header "Código" (no solo la primera)
    const nominaRows = page.locator('table').filter({ has: page.locator('th', { hasText: 'Código' }) }).locator('tbody tr').filter({ hasText: EMP });
    await expect(nominaRows.first()).toBeVisible({ timeout: 15000 });
    const row = nominaRows.first();
    await expect(row).toContainText(expNum);
    await expect(row).toContainText('5000.00'); // BON aplicado en captación (auto-guardado)
    await expect(row).toContainText('2.5');     // Vac. Acum. (2.5 días/mes)

    // El botón Guardar Captación sigue funcionando de forma independiente
    await page.getByRole('button', { name: 'Guardar Captación' }).click();
    await expectToast(page, 'Captación guardada');
  });

  await test.step('Modelo SC4-06 imprimible', async () => {
    await page.getByRole('button', { name: 'Imprimir SC4-06' }).click();
    const report = page.locator('.print-sc406');
    await expect(report).toBeVisible({ timeout: 8000 });
    await expect(report.getByText('MODELO SC4-06 NOMINA')).toBeVisible();
    await expect(report.getByText('Periodo de pago:')).toBeVisible();
    await expect(report.getByText('Elaborada por')).toBeVisible();
    await expect(report.getByText('Contabilizada por')).toBeVisible();
    const scDialog = page.getByRole('dialog', { name: /Modelo SC4-06/ });
    await scDialog.getByRole('button', { name: 'Cerrar' }).last().click();
    await expect(report).toBeHidden({ timeout: 8000 });
  });

  await test.step('Aplicar nómina → bloqueada; Reabrir (owner)', async () => {
    await page.getByRole('button', { name: 'Aplicar Nómina' }).click();
    const confirm = page.getByRole('dialog', { name: 'Aplicar Nómina' });
    await expect(confirm).toBeVisible({ timeout: 8000 });
    await confirm.getByRole('button', { name: 'Aplicar' }).click();

    await expect(page.getByText('Nómina aplicada (bloqueada)')).toBeVisible({ timeout: 10000 });
    // Generar queda deshabilitado
    await expect(page.getByRole('button', { name: 'Generar Nómina' })).toBeDisabled();

    // Reabrir como owner
    await page.getByRole('button', { name: 'Reabrir Nómina' }).click();
    const reopen = page.getByRole('dialog', { name: 'Reabrir Nómina' });
    await expect(reopen).toBeVisible({ timeout: 8000 });
    await reopen.getByRole('button', { name: 'Reabrir' }).click();
    await expect(page.getByText('Nómina aplicada (bloqueada)')).toBeHidden({ timeout: 10000 });
    await expectToast(page, 'Nómina reabierta');
  });
});
