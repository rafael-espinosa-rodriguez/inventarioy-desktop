// Helpers para manipular la base de datos temporal de los tests de licencia.
// El servidor de prueba (scripts/start-test-server.mjs) expone la misma BD que
// usa la app, por lo que estos helpers corren en el mismo proceso de Playwright.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { sign } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_DIR = path.join(os.tmpdir(), 'inventarioy-e2e');
export const E2E_DB_PATH = path.join(E2E_DIR, 'inventarioy.db');
export const BUSINESS_CODE = 'E2ETEST';
export const DEFAULT_PASSWORD = '1234';

const PRIV_PEM_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'license-private.pem'
);

const DAY_MS = 24 * 60 * 60 * 1000;

function openDb(): DatabaseSync {
  const db = new DatabaseSync(E2E_DB_PATH);
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function nowPlusDays(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

export function nowPlusMs(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

/**
 * Firma una clave de activación como haría el vendedor
 * (scripts/generar-licencia.mjs), formateada en grupos de 5
 * separados por espacios (los guiones corromperían base64url).
 */
export function signKey(code: string, validUntilISO: string): string {
  const payload = JSON.stringify({ code, validUntil: validUntilISO });
  const privPem = readFileSync(PRIV_PEM_PATH, 'utf8');
  const signature = sign(null, Buffer.from(payload, 'utf8'), privPem);
  const key = `${Buffer.from(payload, 'utf8').toString('base64url')}.${signature.toString('base64url')}`;
  return key.match(/.{1,5}/g)!.join(' ');
}

/** Trial de 7 días recién iniciado, sin licencia, sin marcador anti-tamper. */
export function setTrial(): void {
  const db = openDb();
  db.prepare(
    `UPDATE user_session SET trial_started_at = ?, license_key = NULL, license_valid_until = NULL, license_activated_at = NULL WHERE id = 'owner'`
  ).run(nowISO());
  db.prepare(`DELETE FROM settings WHERE key = 'license_max_seen_time'`).run();
  db.close();
}

/** Trial vencido (iniciado hace 21 días): estado expired forzado. */
export function setExpired(): void {
  const db = openDb();
  db.prepare(
    `UPDATE user_session SET trial_started_at = ?, license_key = NULL, license_valid_until = NULL, license_activated_at = NULL WHERE id = 'owner'`
  ).run(new Date(Date.now() - 21 * DAY_MS).toISOString());
  db.prepare(`DELETE FROM settings WHERE key = 'license_max_seen_time'`).run();
  db.close();
}

/** Licencia activa hasta validUntilISO, sin marcador anti-tamper. */
export function setActive(validUntilISO: string): void {
  const db = openDb();
  db.prepare(
    `UPDATE user_session SET trial_started_at = ?, license_key = ?, license_valid_until = ?, license_activated_at = ? WHERE id = 'owner'`
  ).run(nowISO(), 'E2E_KEY', validUntilISO, nowISO());
  db.prepare(`DELETE FROM settings WHERE key = 'license_max_seen_time'`).run();
  db.close();
}

/** Simula retroceso de reloj: registra maxSeen en el futuro. */
export function setRollback(futureISO: string): void {
  const db = openDb();
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run('license_max_seen_time', JSON.stringify(futureISO), nowISO());
  db.close();
}

export function clearRollback(): void {
  const db = openDb();
  db.prepare(`DELETE FROM settings WHERE key = 'license_max_seen_time'`).run();
  db.close();
}

export function getMaxSeen(): string | null {
  const db = openDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'license_max_seen_time'`).get() as
    | { value?: string }
    | undefined;
  db.close();
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

export function getOwner(): Record<string, unknown> {
  const db = openDb();
  const row = db.prepare(`SELECT * FROM user_session WHERE id = 'owner'`).get() as Record<string, unknown>;
  db.close();
  return row;
}
