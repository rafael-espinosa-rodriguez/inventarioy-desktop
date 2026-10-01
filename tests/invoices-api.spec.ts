// Spec 003: facturación vía API contra servidor temporal (BD en os.tmpdir).
// No toca datos reales. Requiere webServers del config (Fastify :4173).
import { test, expect } from '@playwright/test';
import { randomBytes, scryptSync } from 'node:crypto';

const BASE = 'http://127.0.0.1:4173';

let token = '';
let ownerSess = '';

async function call(request: any, method: string, p: string, body?: any, sess?: string, useToken = true) {
  const res = await request.fetch(`${BASE}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE,
      ...(useToken && token ? { 'x-inventarioy-token': token } : {}),
      ...(sess ? { 'x-inventarioy-session': sess } : {}),
    },
    ...(body ? { data: body } : {}),
  });
  return { status: res.status(), j: await res.json().catch(() => ({})) };
}

test.beforeAll(async ({ request }) => {
  const login = await call(request, 'POST', '/api/auth/login', { pin: '1234' }, undefined, false);
  expect(login.j?.data?.success).toBe(true);
  token = login.j.data.token;
  ownerSess = login.j.data.sessionToken;
});

const OH = (request: any, method: string, p: string, body?: any) => call(request, method, p, body, ownerSess);

test('20 creaciones concurrentes → folios únicos y secuenciales', async ({ request }) => {
  const payload = (i: number) => ({
    client_name: `Cliente ${i}`,
    items: [{ description: `Producto ${i}`, quantity: 1, price: 100 + i }],
  });
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => OH(request, 'POST', '/api/invoices', payload(i)))
  );
  const created = results.filter((r) => r.status === 200 && r.j?.data?.id).map((r) => r.j.data);
  expect(created.length).toBe(20);
  const seqs = created.map((c: any) => c.folio_seq).sort((a: number, b: number) => a - b);
  for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
  expect(new Set(seqs).size).toBe(20);
  expect(created.every((c: any) => c.folio_year === new Date().getFullYear())).toBe(true);
});

test('from-sale replica importes y bloquea duplicados', async ({ request }) => {
  const today = new Date().toISOString().split('T')[0];
  const s = await OH(request, 'POST', '/api/query', {
    table: 'sales', method: 'insert',
    data: {
      id: 'sale-test-1', user_id: 'owner', total_amount: 1500, subtotal: 1500, discount: 100,
      date: today, sale_type: 'SALON', payment_method: 'mix', efectivo: 1500, created_at: new Date().toISOString(),
    },
  });
  expect(s.j?.error).toBeFalsy();
  await OH(request, 'POST', '/api/query', {
    table: 'sale_items', method: 'insert',
    data: { id: 'si-1', sale_id: 'sale-test-1', product_id: 'p-x', quantity: 2, selling_price: 750, subtotal: 1500, created_at: new Date().toISOString() },
  });
  const f1 = await OH(request, 'POST', '/api/invoices/from-sale', { sale_id: 'sale-test-1', client_name: 'Juan' });
  expect(f1.status).toBe(200);
  expect(f1.j?.data?.sale_id).toBe('sale-test-1');
  expect(f1.j?.data?.total).toBe(1500);
  expect(f1.j?.data?.discount).toBe(100);
  const dup = await OH(request, 'POST', '/api/invoices/from-sale', { sale_id: 'sale-test-1' });
  expect(dup.status).toBe(400);
});

test('void exige motivo, anula y audita', async ({ request }) => {
  const c = await OH(request, 'POST', '/api/invoices', {
    client_name: 'Anular', items: [{ description: 'X', quantity: 1, price: 50 }],
  });
  const id = c.j.data.id;
  const v0 = await OH(request, 'POST', `/api/invoices/${id}/void`, {});
  expect(v0.status).toBe(400);
  const v1 = await OH(request, 'POST', `/api/invoices/${id}/void`, { reason: 'error de importe' });
  expect(v1.status).toBe(200);
  expect(v1.j?.data?.status).toBe('anulada');
  const logs = await OH(request, 'POST', '/api/query', {
    table: 'action_logs', method: 'select',
    filters: [{ op: 'eq', column: 'action', value: 'void_invoice' }],
  });
  expect(Array.isArray(logs.j?.data) && logs.j.data.length >= 1).toBe(true);
});

test('clerk bloqueado en GET y POST (403)', async ({ request }) => {
  const salt = randomBytes(16);
  const hh = scryptSync('5678', salt, 64);
  await OH(request, 'POST', '/api/query', {
    table: 'access_pins', method: 'insert',
    data: {
      id: 'pin-clerk-t', user_id: 'owner',
      pin_hash: `scrypt$${salt.toString('hex')}$${hh.toString('hex')}`,
      role: 'clerk', pin_name: 'Test', is_active: 1, created_at: new Date().toISOString(),
    },
  });
  const clerk = await call(request, 'POST', '/api/auth/login', { pin: '5678' }, undefined, false);
  expect(clerk.j?.data?.success).toBe(true);
  const CH = (m: string, p: string, b?: any) => call(request, m, p, b, clerk.j.data.sessionToken);
  expect((await CH('GET', '/api/invoices')).status).toBe(403);
  expect((await CH('POST', '/api/invoices', { client_name: 'X', items: [{ description: 'Y', quantity: 1, price: 1 }] })).status).toBe(403);
});

test('reporte mensual cuadra y excluye anuladas', async ({ request }) => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const rep = await OH(request, 'GET', `/api/invoices/report?year=${now.getFullYear()}&month=${mm}`);
  expect(rep.status).toBe(200);
  const rows = rep.j?.data?.rows || [];
  expect(rep.j.data.count).toBe(rows.length);
  const sum = Math.round(rows.reduce((s: number, r: any) => s + Number(r.total || 0), 0) * 100) / 100;
  expect(Math.abs(sum - rep.j.data.total)).toBeLessThan(0.01);
  expect(rows.every((r: any) => r.status === 'emitida')).toBe(true);
});
