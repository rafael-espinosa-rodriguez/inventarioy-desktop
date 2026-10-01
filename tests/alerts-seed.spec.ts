// Spec 006: collectAlerts sobre BD temporal propia (nunca datos reales).
// No requiere servidor: importa la capa db directamente.
import { test, expect } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { initDatabase, getDb } from '../electron/db/index';
import { collectAlerts, digestSignature } from '../electron/alerts';

const E2E_DIR = path.join(os.tmpdir(), 'inventarioy-alertstest');

test.beforeAll(() => {
  fs.rmSync(E2E_DIR, { recursive: true, force: true });
  fs.mkdirSync(E2E_DIR, { recursive: true });
  initDatabase(E2E_DIR);
  const now = new Date().toISOString();
  const in5d = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
  const run = (sql: string, ...p: any[]) => getDb().prepare(sql).run(...p);
  run(`INSERT INTO products (id, user_id, name, quantity, rop, is_active, created_at, updated_at)
       VALUES ('p-low','owner','Queso',0,10,1,?,?)`, now, now);
  run(`INSERT INTO product_warehouse (id, product_id, warehouse_id, quantity, in_transit, updated_at)
       VALUES ('pw1','p-low','w1',3,0,?)`, now);
  run(`INSERT INTO products (id, user_id, name, quantity, rop, is_active, expiration_date, created_at, updated_at)
       VALUES ('p-exp','owner','Leche',100,0,1,?,?,?)`, in5d, now, now);
  run(`INSERT INTO user_session (id, email, name, businessName, role, phone, address, businessHours, subscriptionActive, subscriptionPlan, ticketMessage, usdEnabled, usdRate, eurEnabled, eurRate, cupTransferEnabled, business_code, trial_started_at, created_at)
       VALUES ('owner','o@x.local','O','N','owner','','','',1,'desktop','',0,0,0,0,0,'TEST',?,?)`,
    new Date(Date.now() - 2 * 86400000).toISOString(), now);
  run(`INSERT INTO payroll_periods (id, user_id, month, year, status, created_at, updated_at)
       VALUES ('pp1','owner',9,2026,'draft',?,?)`, now, now);
});

test('detecta las 4 categorías con seed completo', () => {
  const d = collectAlerts(getDb(), { expiryDays: 7, licenseDays: 7 });
  const kinds = d.alerts.map((a) => a.kind).sort();
  expect(kinds).toEqual(['expiry', 'license', 'payroll', 'stock']);
  expect(d.alerts.find((a) => a.kind === 'stock')?.names).toContain('Queso');
  expect(d.alerts.find((a) => a.kind === 'license')?.title).toMatch(/5 día/);
});

test('umbral expiry excluye lo lejano', () => {
  const d = collectAlerts(getDb(), { expiryDays: 3, licenseDays: 7 });
  expect(d.alerts.some((a) => a.kind === 'expiry')).toBe(false);
});

test('firma anti-spam estable', () => {
  const a = collectAlerts(getDb(), { expiryDays: 7, licenseDays: 7 });
  const b = collectAlerts(getDb(), { expiryDays: 7, licenseDays: 7 });
  expect(digestSignature(a)).toBe(digestSignature(b));
});
