import { test, expect, Page, ConsoleMessage } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Espera a que el "storm" de fetchAll se asiente (2s sin actividad de carga) antes
// de mutar, evitando que una fetchAll en vuelo sobrescriba la mutación optimista.
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

// page.goto directo falla intermitentemente con net::ERR_ABORTED (navegación
// interrumpida por otra, p.ej. HMR de Vite o el router SPA). Reintentar es seguro.
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

async function gotoSettings(page: Page) {
  await gotoApp(page, `${BASE_URL}/dashboard/settings`);
  await expect(page.getByText('Pines de Acceso').first()).toBeVisible({ timeout: 15000 });
  await waitForDataStable(page);
}

// Crea un PIN desde el modal de "Agregar Nuevo PIN" (solo el dueño puede).
async function createPin(page: Page, opts: { name: string; pin: string; roleName: string; module: string }) {
  await page.getByRole('button', { name: 'Agregar Nuevo PIN' }).click();
  const modal = page.getByRole('dialog').filter({ hasText: 'Agregar Nuevo PIN' });
  await expect(modal).toBeVisible({ timeout: 10000 });
  await modal.locator('select').first().selectOption('other');
  await modal.locator('input[placeholder="Nombre del empleado"]').fill(opts.name);
  await modal.locator('input[placeholder="0000"]').fill(opts.pin);
  await modal.locator('input[placeholder^="Nombre del nuevo rol"]').fill(opts.roleName);
  await modal.getByRole('button', { name: opts.module }).click();
  await modal.getByRole('button', { name: 'Crear PIN' }).click();
  await expectToast(page, 'PIN creado');
  await expect(modal).toBeHidden({ timeout: 8000 });
}

test('Control de Acceso: crear/editar PIN, eliminar PIN y eliminar rol', async ({ page }) => {
  await login(page, '1234');
  await gotoSettings(page);

  // Crear rol "Cajero" + PIN Armando (8642) con módulo Ventas.
  // (PINs distintos de los de guia-prueba.spec.ts: la BD persiste entre specs del mismo run.)
  await createPin(page, { name: 'Armando', pin: '8642', roleName: 'Cajero', module: 'Ventas' });

  // La tarjeta del rol aparece con 1 PIN.
  const cajeroCard = page.getByTestId('role-card').filter({ hasText: 'Cajero' });
  await expect(cajeroCard).toBeVisible({ timeout: 10000 });
  await expect(cajeroCard).toContainText('1 PIN');

  // El PIN de Armando está en la lista con su rol.
  await expect(page.getByText('Armando')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Rol: Cajero')).toBeVisible({ timeout: 10000 });

  // No se permite crear otro PIN con el mismo número (unicidad de PINs en el servidor).
  await page.getByRole('button', { name: 'Agregar Nuevo PIN' }).click();
  const dupModal = page.getByRole('dialog').filter({ hasText: 'Agregar Nuevo PIN' });
  await expect(dupModal).toBeVisible({ timeout: 10000 });
  await dupModal.locator('select').first().selectOption('other');
  await dupModal.locator('input[placeholder="Nombre del empleado"]').fill('Duplicado');
  await dupModal.locator('input[placeholder="0000"]').fill('8642');
  await dupModal.locator('input[placeholder^="Nombre del nuevo rol"]').fill('Repetido');
  await dupModal.getByRole('button', { name: 'Ventas' }).click();
  await dupModal.getByRole('button', { name: 'Crear PIN' }).click();
  await expectToast(page, /ya está en uso/i);
  // El modal sigue abierto y no se creó ni el PIN ni el rol huérfano.
  await expect(dupModal).toBeVisible();
  await expect(page.getByTestId('role-card').filter({ hasText: 'Repetido' })).toHaveCount(0);
  await dupModal.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dupModal).toBeHidden({ timeout: 8000 });

  // Editar el PIN de Armando: agregar Inventario al rol.
  await page.getByRole('button', { name: 'Editar PIN Armando' }).click();
  const editModal = page.getByRole('dialog').filter({ hasText: 'Editar PIN' });
  await expect(editModal).toBeVisible({ timeout: 10000 });
  await editModal.getByRole('button', { name: 'Inventario' }).click();
  await editModal.locator('input[placeholder="0000"]').fill('8642');
  await editModal.getByRole('button', { name: 'Guardar cambios' }).click();
  await expectToast(page, 'PIN actualizado');
  await expect(editModal).toBeHidden({ timeout: 8000 });
  await expect(page.getByText('Rol: Cajero')).toBeVisible({ timeout: 10000 });

  // Crear rol "Auditor" + PIN Sandra (7531) con módulo Análisis.
  await createPin(page, { name: 'Sandra', pin: '7531', roleName: 'Auditor', module: 'Análisis' });
  const auditorCard = page.getByTestId('role-card').filter({ hasText: 'Auditor' });
  await expect(auditorCard).toBeVisible({ timeout: 10000 });
  await expect(auditorCard).toContainText('1 PIN');

  // Un rol con PINs en uso NO se puede eliminar (botón deshabilitado).
  await expect(page.getByRole('button', { name: /Eliminar rol Cajero/ })).toBeDisabled();

  // Eliminar el PIN de Sandra (regresión del bug que bloqueaba todos los deletes).
  await page.getByRole('button', { name: 'Eliminar PIN Sandra' }).click();
  const pinDialog = page.getByRole('dialog').filter({ hasText: 'Eliminar PIN' });
  await expect(pinDialog).toBeVisible({ timeout: 10000 });
  await pinDialog.getByRole('button', { name: 'Eliminar' }).click();
  await expectToast(page, 'PIN eliminado');
  await expect(page.getByText('Sandra')).toHaveCount(0, { timeout: 10000 });

  // Ahora el rol Auditor quedó sin PINs y se puede eliminar.
  const deleteAuditor = page.getByRole('button', { name: /Eliminar rol Auditor/ });
  await expect(deleteAuditor).toBeEnabled({ timeout: 10000 });
  await deleteAuditor.click();
  const roleDialog = page.getByRole('dialog').filter({ hasText: 'Eliminar rol' });
  await expect(roleDialog).toBeVisible({ timeout: 10000 });
  await roleDialog.getByRole('button', { name: 'Eliminar' }).click();
  await expectToast(page, 'Rol eliminado');
  await expect(page.getByTestId('role-card').filter({ hasText: 'Auditor' })).toHaveCount(0, { timeout: 10000 });

  await logout(page);
});

test('Gateo de módulos: un rol sin Configuración no ve ni entra al módulo', async ({ page }) => {
  await login(page, '1234');
  await gotoSettings(page);

  // Crear rol "Barista" + PIN Carlos (5555) con solo Ventas.
  await createPin(page, { name: 'Carlos', pin: '5555', roleName: 'Barista', module: 'Ventas' });
  await expect(page.getByTestId('role-card').filter({ hasText: 'Barista' })).toBeVisible({ timeout: 10000 });

  await logout(page);

  // Entrar como Carlos (rol Barista, solo Ventas).
  await login(page, '5555');

  // La barra lateral NO muestra Configuración ni Registro de Acciones.
  await expect(page.locator('aside').getByRole('link', { name: 'Configuración' })).toHaveCount(0);
  await expect(page.locator('aside').getByRole('link', { name: 'Registro de Acciones' })).toHaveCount(0);
  // Sí muestra Ventas (módulo asignado).
  await expect(page.locator('aside').getByRole('link', { name: 'Ventas' })).toBeVisible({ timeout: 10000 });

  // Navegar directo a Configuración exige verificación por PIN (módulo bloqueado).
  await gotoApp(page, `${BASE_URL}/dashboard/settings`);
  const verifyDialog = page.getByRole('dialog').filter({ hasText: 'Verificar PIN' });
  await expect(verifyDialog).toBeVisible({ timeout: 15000 });
  await verifyDialog.getByRole('button', { name: 'Cancelar' }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 15000 });

  await logout(page);
});