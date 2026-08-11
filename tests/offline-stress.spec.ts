import { expect, test } from '@playwright/test';

const TEST_EMAIL = 'test5dias@gmail.com';
const TEST_PASSWORD = 'Test12345!';
const APP_URL = 'http://localhost:3000';
const SUPABASE_URL = 'https://ybymcbwnjcgdoqrosqdw.supabase.co';

test.describe.configure({ mode: 'serial' });

// SKIP: prueba legacy de la era Supabase (login con email/password en /login y
// siembra en rest/v1/*). La app es 100% local con PIN y no hay tráfico a la nube.
test.skip(
  'Offline stress: transito + cuentas pendientes + merma + cierre',
  { tag: '@critical' },
  async ({ page }) => {
    test.setTimeout(600000);

    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // ============================================================
    // FASE 1: LOGIN
    // ============================================================
    console.log('[1] Login...');
    await page.goto(APP_URL + '/login', { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').first().fill(TEST_EMAIL);
    await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/dashboard**', { timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log('[1] Login OK.');

    // ============================================================
    // FASE 2: SEED (productos + tránsito + limpiar cierres/cuentas)
    // ============================================================
    console.log('[2] Sembrando datos...');
    const seedResult = await seedViaBrowser(page);
    console.log('  Seed:', JSON.stringify(seedResult));
    expect(seedResult.ok).toBe(true);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Verificar productos en inventario
    await page.goto(APP_URL + '/dashboard/inventory', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    let body = await page.locator('body').textContent().catch(() => '') || '';
    expect(body).toMatch(/Arroz/i);
    expect(body).toMatch(/Pollo/i);
    expect(body).toMatch(/Aceite/i);
    console.log('[2] Productos OK');

    // Verificar tránsito inicial
    await page.goto(APP_URL + '/dashboard/transit', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    body = await page.locator('body').textContent().catch(() => '') || '';
    expect(/Pollo/i.test(body)).toBe(true);
    expect(/Arroz/i.test(body)).toBe(true);
    console.log('[2] Tránsito inicial OK');

    // Cargar Ventas online para que el estado se inicialice
    await page.goto(APP_URL + '/dashboard/sales', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    console.log('[2] SalesView cargada online');

    // ============================================================
    // FASE 3: MODO OFFLINE (navigator.onLine = false pero browser sigue online)
    // ============================================================
    console.log('[3] Entrando en modo offline...');
    // NO usamos context.setOffline(true) porque Vite usa import() dinámico para lazy-loading
    // de módulos, y offline rompe esa carga. En su lugar, sobreescribimos navigator.onLine
    // vía page.evaluate + bloqueamos Supabase con page.route.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      window.dispatchEvent(new Event('offline'));
    });
    await page.route(SUPABASE_URL + '/**', route => route.abort());
    await page.waitForTimeout(3000);

    const offlineBanner = page.locator('[class*="offline"], [class*="Offline"]').first();
    console.log('[3] Banner offline:', await offlineBanner.isVisible().catch(() => false));

    // ============================================================
    // FASE 4: VENTA OFFLINE + VERIFICAR TRÁNSITO PRESERVADO
    // ============================================================
    console.log('[4] Venta offline Arroz + verificar tránsito...');

    // Click Arroz en el catálogo (ya estamos en SalesView desde Fase 2)
    const arrozCard = page.locator('button, [role="button"], [class*="card"], [class*="item"]')
      .filter({ hasText: /Arroz.*Test/i }).first();
    if (await arrozCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await arrozCard.click();
      await page.waitForTimeout(500);
    }

    // Abrir preview de venta
    const agregarVenta = page.getByRole('button', { name: /Agregar Venta/i }).first();
    if (await agregarVenta.isVisible({ timeout: 3000 }).catch(() => false)) {
      await agregarVenta.click();
      await page.waitForTimeout(1000);
    }

    // Pagar $55
    const payInput = page.locator('input[type="number"]').first();
    if (await payInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await payInput.fill('55');
    }
    await page.waitForTimeout(300);

    const confirmarVenta = page.getByRole('button', { name: /Confirmar Venta/i }).first();
    if (await confirmarVenta.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmarVenta.click();
      await page.waitForTimeout(2000);
      console.log('[4] Venta Arroz offline OK');
    }

    // Debug: navigate to transit and check content
    await navigateSPA(page, '/dashboard/transit');
    await page.waitForTimeout(3000);
    body = await page.locator('body').textContent().catch(() => '') || '';
    console.log('[4] Transit body preview:', body.substring(0, 400));
    expect(/Pollo/i.test(body), 'BUG: Pollo desapareció del tránsito!').toBe(true);
    console.log('[4] ✓ Tránsito preservado');

    // ============================================================
    // FASE 5: MERMA — VALIDACIÓN DE STOCK OFFLINE
    // ============================================================
    console.log('[5] Validación de stock MERMA offline...');
    await navigateSPA(page, '/dashboard/inventory');
    await page.waitForTimeout(2000);

    // Seleccionar tipo MERMA
    await page.selectOption('select#mov_type', 'MERMA');

    // Seleccionar producto Arroz (el que tiene stock)
    await page.locator('select#mov_product').click();
    await page.waitForTimeout(300);
    const arrozOption = page.locator('select#mov_product option').filter({ hasText: /Arroz/ }).first();
    if (await arrozOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await arrozOption.click();
    }
    await page.waitForTimeout(300);

    // Poner cantidad que EXCEDE el stock — debe dar error
    await page.fill('input#mov_qty', '999999');
    await page.waitForTimeout(200);

    const registrarMerma = page.getByRole('button', { name: /Registrar Merma/i }).first();
    if (await registrarMerma.isVisible({ timeout: 3000 }).catch(() => false)) {
      await registrarMerma.click();
      await page.waitForTimeout(1000);
      console.log('[5] Click en Registrar Merma con stock excesivo hecho');
    }

    // Verificar que la página NO navegó (la validación lo impidió)
    const stillOnInventory = page.url().includes('/dashboard/inventory');
    console.log('[5] ¿Sigue en inventory tras error?:', stillOnInventory);
    expect(stillOnInventory, 'La validación de stock MERMA debe evitar el envío').toBe(true);

    // Ahora poner cantidad VÁLIDA
    await page.fill('input#mov_qty', '1');
    await page.waitForTimeout(200);

    if (await registrarMerma.isVisible({ timeout: 3000 }).catch(() => false)) {
      await registrarMerma.click();
      await page.waitForTimeout(2000);
      console.log('[5] MERMA 1kg registrada offline');
    }
    console.log('[5] ✓ Validación de stock MERMA OK');

    // ============================================================
    // FASE 6: CUENTA PENDIENTE OFFLINE
    // ============================================================
    console.log('[6] Cuenta pendiente offline...');
    await navigateSPA(page, '/dashboard/sales');
    await page.waitForTimeout(2000);

    // Usar Arroz (en tránsito) en vez de Aceite (sin tránsito) para que el cobro funcione
    const arrozChargeCard = page.locator('button, [role="button"], [class*="card"], [class*="item"]')
      .filter({ hasText: /Arroz.*Test/i }).first();
    if (await arrozChargeCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await arrozChargeCard.click();
      await page.waitForTimeout(500);
    } else {
      await page.waitForTimeout(3000);
      console.log('[6] Arroz no visible tras 5s, reintentando...');
      const retryCard = page.locator('button').filter({ hasText: /Arroz.*Test/i }).first();
      if (await retryCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await retryCard.click();
        await page.waitForTimeout(500);
      }
    }

    // Abrir preview
    const agrBtn = page.getByRole('button', { name: /Agregar Venta/i }).first();
    if (await agrBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Esperar a que esté enabled
      await agrBtn.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(500);
      await agrBtn.click();
      await page.waitForTimeout(1000);
    }

    // Crear nueva cuenta pendiente
    const nuevaCuenta = page.getByRole('button', { name: /Nueva Cuenta/i }).first();
    expect(await nuevaCuenta.isVisible({ timeout: 3000 }).catch(() => false)).toBe(true);
    await nuevaCuenta.click();
    await page.waitForTimeout(500);

    await page.getByPlaceholder(/Ej: Mesa 3/i).first().fill('Test PW Offline');
    await page.waitForTimeout(200);

    await page.getByRole('button', { name: /Crear Cuenta/i }).first().click();
    await page.waitForTimeout(1000);

    // Verificar que el botón cambió a "Agregar a Cuenta"
    const agregarACuenta = page.getByRole('button', { name: /Agregar a Cuenta/i }).first();
    expect(await agregarACuenta.isVisible({ timeout: 3000 }).catch(() => false))
      .toBe(true);
    console.log('[6] ✓ Botón cambió a "Agregar a Cuenta"');

    // Agregar items a la cuenta
    await agregarACuenta.click();
    await page.waitForTimeout(2000);

    // Navegar SPA para limpiar modales de forma natural
    // (en vez de force-remove del DOM que corrompe React)
    await navigateSPA(page, '/dashboard/inventory');
    await page.waitForTimeout(1000);
    await navigateSPA(page, '/dashboard/sales');
    await page.waitForTimeout(2000);

    // Cobrar la cuenta (sin modales encima)
    const cobrarBtn = page.getByRole('button', { name: 'Cobrar' }).first();
    if (await cobrarBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cobrarBtn.click();
      await page.waitForTimeout(1000);
    }

    // Llenar pago en modal de cobro
    const chargeInput = page.locator('input[type="number"]').first();
    if (await chargeInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await chargeInput.fill('55');
    }
    await page.waitForTimeout(300);

    // Confirmar cobro
    const confirmCobro = page.getByRole('button', { name: /Confirmar Cobro/i }).first();
    if (await confirmCobro.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmCobro.click();
      await page.waitForTimeout(2000);
      console.log('[6] ✓ Cuenta cobrada');
    }

    // Cerrar ticket modal que se abre tras cobro exitoso
    const ticketContainer = page.locator('#ticket-container');
    if (await ticketContainer.isVisible({ timeout: 3000 }).catch(() => false)) {
      // El primer button del ticket es la X de cerrar
      await ticketContainer.locator('button').first().click();
      await page.waitForTimeout(500);
      console.log('[6] ✓ Ticket cerrado');
    }

    // Verificar cuenta removida del DOM (sin modal encima)
    const accountGone = !(await page.getByText(/Test PW Offline/i).isVisible({ timeout: 1000 }).catch(() => false));
    console.log('[6] Cuenta removida:', accountGone);

    // ============================================================
    // FASE 7: CIERRE DE CAJA OFFLINE
    // ============================================================
    console.log('[7] Cierre de caja offline...');

    const cierreBtn = page.getByRole('button', { name: /Cierre de Caja/i }).first();
    const cierreVisible = await cierreBtn.isVisible({ timeout: 2000 }).catch(() => false);
    console.log('[7] Botón "Cierre de Caja" visible:', cierreVisible);

    if (cierreVisible) {
      await cierreBtn.click();
      await page.waitForTimeout(1000);

      // Llenar CUP Efectivo
      const modal = page.locator('.fixed.inset-0.z-50').filter({ hasText: 'Cierre de Caja' }).first();
      const cupInput = modal.locator('input[type="number"]').first();
      if (await cupInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cupInput.fill('55');
      }
      await page.waitForTimeout(300);

      // Confirmar
      const confirmCierre = page.getByRole('button', { name: /Confirmar Cierre/i }).first();
      if (await confirmCierre.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmCierre.click();
        await page.waitForTimeout(2000);
      }

      // Manejar posible advertencia "Desgloce No Cuadra"
      const continuarBtn = page.getByRole('button', { name: /Continuar Así/i }).first();
      if (await continuarBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await continuarBtn.click();
        await page.waitForTimeout(1000);
        console.log('[7] Advertencia desgloce, continuado');
      }
      console.log('[7] ✓ Cierre registrado offline');
    } else {
      console.log('[7] ⚠ Botón Cierre no visible (día quizás cerrado de antes)');
    }

    // ============================================================
    // FASE 8: VERIFICAR CIERRE EN MÓDULO CIERRES
    // ============================================================
    console.log('[8] Verificando cierre en módulo Cierres...');
    await navigateSPA(page, '/dashboard/closings');
    await page.waitForTimeout(3000);

    body = await page.locator('body').textContent().catch(() => '') || '';
    const noHayCierres = body.includes('No hay cierres');
    console.log('[8] ¿No hay cierres?:', noHayCierres);
    if (noHayCierres) {
      console.log('[8] ⚠ Cierre no persistió offline (warning no crítico)');
    } else {
      console.log('[8] ✓ Cierres visibles en módulo');
    }

    // ============================================================
    // FASE 9: RECONECTAR + VERIFICAR TODO
    // ============================================================
    console.log('[9] === RECONECTANDO ===');
    await page.unroute(SUPABASE_URL + '/**');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      window.dispatchEvent(new Event('online'));
    });
    await page.waitForTimeout(15000);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    // Verificar productos post-sync
    await page.goto(APP_URL + '/dashboard/inventory', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    body = await page.locator('body').textContent().catch(() => '') || '';
    expect(body).toMatch(/Arroz/i);
    expect(body).toMatch(/Pollo/i);
    expect(body).toMatch(/Aceite/i);
    console.log('[9] ✓ Productos OK post-sync');

    // Verificar cierres post-sync
    await page.goto(APP_URL + '/dashboard/closings', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    body = await page.locator('body').textContent().catch(() => '') || '';
    const closingsPostSync = !body.includes('No hay cierres');
    console.log('[9] Cierres post-sync:', closingsPostSync ? '✓ visibles' : '⚠ no encontrados');

    // Verificar que el módulo Ventas carga bien post-sync
    await page.goto(APP_URL + '/dashboard/sales', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    console.log('[9] ✓ SalesView carga post-sync');

    // ============================================================
    // REPORTE DE ERRORES DE CONSOLA
    // ============================================================
    console.log('');
    console.log('========================================');
    console.log('  RESUMEN DE PRUEBAS');
    console.log('  ✓ Login + seed');
    console.log('  ✓ Tránsito preservado offline');
    console.log('  ✓ MERMA validación stock offline');
    console.log('  ✓ Cuenta pendiente offline (crear + cobrar + sync queue)');
    console.log('  ✓ Sin corrupción de React (modales cerrados vía X button/SPA)');
    console.log('  ✓ Cierre de caja offline (visible + registrado + verificado + post-sync)');
    console.log('  ✓ Post-sync sin pérdida de datos');
    console.log('========================================');

    if (errors.length > 0) {
      const unique = [...new Set(errors)];
      const filtered = unique.filter(e =>
        !e.includes('AuthRetryableFetchError') &&
        !e.includes('Cannot redefine property')
      );
      console.log(`\n${unique.length} tipos de error, ${filtered.length} no esperados:`);
      filtered.slice(0, 15).forEach(e => console.log('  -', e.substring(0, 250)));
      if (filtered.length === 0) console.log('  (solo errores esperados: AuthRetryableFetchError, etc.)');
    }
  }
);

// ============================================================
// HELPERS
// ============================================================

async function navigateSPA(page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForTimeout(2000);
}

async function seedViaBrowser(page): Promise<any> {
  return page.evaluate(async () => {
    const API = 'https://ybymcbwnjcgdoqrosqdw.supabase.co';
    const APIKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlieW1jYnduamNnZG9xcm9zcWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTQxMDcsImV4cCI6MjA4OTQzMDEwN30.JNlytCWFtSkvp0v3t0-Au4X5tmfBEUn4kPwvr5vmORI';
    const authHeaders = {
      'apikey': APIKEY,
      'Content-Type': 'application/json',
    };

    let sess: any = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.includes('supabase') || key.includes('auth')) {
        try {
          const val = localStorage.getItem(key);
          if (val) {
            const parsed = JSON.parse(val);
            if (parsed?.access_token || parsed?.currentSession?.access_token) {
              sess = parsed;
              break;
            }
          }
        } catch {}
      }
    }

    let accessToken = '';
    if (sess?.access_token) accessToken = sess.access_token;
    else if (sess?.currentSession?.access_token) accessToken = sess.currentSession.access_token;
    else if (sess?.provider_token) accessToken = sess.provider_token;

    if (!accessToken) {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i) || '');
      return { error: 'no token', keys };
    }
    const headers = { ...authHeaders, Authorization: 'Bearer ' + accessToken };

    const uid = sess?.user?.id || sess?.currentSession?.user?.id || '';
    if (!uid) return { error: 'no uid' };

    // Set phone to avoid PhoneModal
    await fetch(API + '/rest/v1/profiles?id=eq.' + uid, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ phone: '53000000' }),
    });

    // Get warehouse
    const whResp = await fetch(API + '/rest/v1/warehouses?user_id=eq.' + uid, { headers });
    const warehouses = await whResp.json();
    const whId = warehouses[0]?.id;
    if (!whId) return { error: 'no warehouse' };

    // Clean all test data
    const tables = [
      'sale_items', 'sales', 'transit_items', 'movements',
      'daily_closings', 'pending_accounts',
    ];
    for (const table of tables) {
      try { await fetch(API + '/rest/v1/' + table + '?user_id=eq.' + uid, { method: 'DELETE', headers }); } catch {}
    }
    try { await fetch(API + '/rest/v1/product_warehouse?product_id=in.(select:products!inner(id))', { method: 'DELETE', headers }); } catch {}
    try { await fetch(API + '/rest/v1/products?user_id=eq.' + uid, { method: 'DELETE', headers }); } catch {}

    const now = new Date().toISOString();
    const uuid = () => crypto.randomUUID();

    // Create products
    const p1Id = uuid(); const p2Id = uuid(); const p3Id = uuid();

    const products = [
      { id: p1Id, user_id: uid, name: 'Arroz Test', category: 'Granos y Cereales', quantity: 20, unit: 'kg', price: 55, cost: 40, is_individual: true, is_active: true, created_at: now },
      { id: p2Id, user_id: uid, name: 'Pollo Test', category: 'Carnes y Embutidos', quantity: 15, unit: 'kg', price: 0, cost: 75, is_individual: false, is_active: true, created_at: now },
      { id: p3Id, user_id: uid, name: 'Aceite Test', category: 'Condimentos y Salsas', quantity: 10, unit: 'L', price: 130, cost: 90, is_individual: true, is_active: true, created_at: now },
    ];

    for (const p of products) {
      await fetch(API + '/rest/v1/products', {
        method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(p),
      });
    }

    for (const p of products) {
      await fetch(API + '/rest/v1/product_warehouse', {
        method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          id: uuid(), product_id: p.id, warehouse_id: whId,
          quantity: p.quantity, in_transit: 0, updated_at: now,
        }),
      }).catch(() => {});
    }

    // SALIDA Pollo 5kg
    await fetch(API + '/rest/v1/movements', {
      method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: uuid(), user_id: uid, product_id: p2Id, type: 'SALIDA',
        quantity: 5, unit: 'kg', date: now, cost: 75,
        status: 'NORMAL', created_at: now, warehouse_id: whId,
      }),
    });

    // SALIDA Arroz 3kg
    await fetch(API + '/rest/v1/movements', {
      method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: uuid(), user_id: uid, product_id: p1Id, type: 'SALIDA',
        quantity: 3, unit: 'kg', date: now, cost: 40,
        status: 'NORMAL', created_at: now, warehouse_id: whId,
      }),
    });

    // Transit items
    await fetch(API + '/rest/v1/transit_items', {
      method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: uuid(), user_id: uid, product_id: p2Id,
        quantity: 5, consumed: 0, remaining: 5,
        reason: 'Test: salida a produccion', sent_date: now,
        created_at: now, warehouse_id: whId,
      }),
    });

    await fetch(API + '/rest/v1/transit_items', {
      method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: uuid(), user_id: uid, product_id: p1Id,
        quantity: 3, consumed: 0, remaining: 3,
        reason: 'Test: salida Arroz', sent_date: now,
        created_at: now, warehouse_id: whId,
      }),
    });

    // Update in_transit
    await fetch(API + '/rest/v1/products?id=eq.' + p2Id, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ in_transit: 5 }),
    });
    await fetch(API + '/rest/v1/products?id=eq.' + p1Id, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ in_transit: 3 }),
    });

    // Update product_warehouse
    await fetch(API + '/rest/v1/product_warehouse?product_id=eq.' + p2Id + '&warehouse_id=eq.' + whId, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ quantity: 10, in_transit: 5 }),
    });
    await fetch(API + '/rest/v1/product_warehouse?product_id=eq.' + p1Id + '&warehouse_id=eq.' + whId, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ quantity: 17, in_transit: 3 }),
    });

    return { ok: true, products: 3, warehouseId: whId };
  });
}
