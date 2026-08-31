import { test, expect, Page } from '@playwright/test';

// Smoke test del flujo local de la app (sin Supabase).
// El server temporal (start-test-server.mjs) siembra owner E2ETEST con PIN 1234.
// Cubre lo esencial que no depende de selectores frágiles con modales:
// login, dashboard y creación de producto con stock inicial.

const APP_URL = 'http://localhost:3000';

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
  const url = page.url();
  if (url.includes('/dashboard')) {
    await dismissPinModal(page);
    return;
  }
  await page.fill('#pin', '1234');
  await page.getByRole('button', { name: /entrar|ingresar|acceder|iniciar/i }).first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await dismissPinModal(page);
}

test('login y dashboard cargan', async ({ page }) => {
  await ensureLoggedIn(page);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText('Negocio E2E').first()).toBeVisible({ timeout: 15000 });
});

test('crear producto con stock inicial y verificar en movimientos', async ({ page }) => {
  await ensureLoggedIn(page);
  await page.goto(APP_URL + '/dashboard/inventory', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await dismissPinModal(page);
  await page.waitForTimeout(1000);

  const nameInput = page.locator('#name');
  await nameInput.waitFor({ state: 'visible', timeout: 20000 });
  const prodName = 'Arroz QA ' + Date.now();
  await nameInput.fill(prodName);

  const catSelect = page.locator('#category');
  if (await catSelect.count().catch(() => 0)) {
    await catSelect.selectOption({ index: 1 }).catch(() => {});
  }
  await page.locator('#quantity').fill('50');

  const individual = page.locator('#is_individual');
  const isInd = await individual.isChecked().catch(() => false);
  if (!isInd) await individual.check({ force: true }).catch(() => {});
  const priceInput = page.locator('#price');
  if (await priceInput.count().catch(() => 0)) {
    await priceInput.fill('55');
  }
  await page.locator('#cost').fill('40');

  // La página re-renderiza con las tormentas de fetchAll (BD compartida en
  // suite) y el botón tiene animación glow: reintentar el click con
  // acción normal hasta que el formulario esté asentado
  const addBtn = page.getByRole('button', { name: 'Agregar Producto' });
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await addBtn.click({ timeout: 5000 });
      break;
    } catch {
      await page.waitForTimeout(1200);
    }
  }
  await page.waitForTimeout(3000);

  await page.goto(APP_URL + '/dashboard/movements', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await dismissPinModal(page);
  await page.waitForTimeout(1500);
  const body = await page.locator('body').textContent().catch(() => '') || '';
  const bodyLower = body.toLowerCase();
  expect(bodyLower).toContain(prodName.toLowerCase());
  expect(bodyLower).toContain('entrada');
});
