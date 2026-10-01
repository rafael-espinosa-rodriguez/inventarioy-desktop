// Spec 002: respaldos vía API contra servidor temporal (BD en os.tmpdir).
// No toca datos reales. Requiere webServers del config (Fastify :4173).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'http://127.0.0.1:4173';
const E2E_DIR = path.join(os.tmpdir(), 'inventarioy-e2e');

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

test.beforeAll(async ({ request }) => {
  const login = await call(request, 'POST', '/api/auth/login', { pin: '1234' }, false);
  expect(login.j?.data?.success).toBe(true);
  token = login.j.data.token;
  session = login.j.data.sessionToken;
});

test('respaldo manual crea archivo y registra last_at', async ({ request }) => {
  const r = await call(request, 'POST', '/api/backup/now', {});
  expect(r.status).toBe(200);
  expect(r.j?.data?.file).toMatch(/^inventarioy-manual-.*\.db$/);
  expect(fs.existsSync(r.j.data.path)).toBe(true);
  const st = await call(request, 'GET', '/api/backup/status');
  expect(st.j?.data?.lastAt).toBeTruthy();
});

test('rotación respeta keepN', async ({ request }) => {
  await call(request, 'POST', '/api/settings', { key: 'backup_keep_n', value: 2 });
  for (let i = 0; i < 3; i++) {
    await call(request, 'POST', '/api/backup/now', {});
    await new Promise((r) => setTimeout(r, 1100));
  }
  const manuals = fs.readdirSync(E2E_DIR).filter((f) => /^inventarioy-manual-.*\.db$/.test(f));
  expect(manuals.length).toBe(2);
  await call(request, 'POST', '/api/settings', { key: 'backup_keep_n', value: 5 });
});

test('restore revierte datos + copia pre-restore + anti-traversal', async ({ request }) => {
  const r1 = await call(request, 'POST', '/api/backup/now', {});
  const first = r1.j.data.file;
  await call(request, 'POST', '/api/query', {
    table: 'settings', method: 'insert',
    data: { key: '__marker__', value: '"1"', updated_at: new Date().toISOString() },
  });
  const rr = await call(request, 'POST', '/api/backup/restore', { file: first });
  expect(rr.status).toBe(200);
  expect(fs.existsSync(path.join(E2E_DIR, rr.j.data.safetyCopy))).toBe(true);
  const chk = await call(request, 'POST', '/api/query', {
    table: 'settings', method: 'select',
    filters: [{ op: 'eq', column: 'key', value: '__marker__' }],
  });
  expect((chk.j?.data || []).length).toBe(0);
  const bad = await call(request, 'POST', '/api/backup/restore', { file: '../../evil.db' });
  expect(bad.status).toBe(400);
});
