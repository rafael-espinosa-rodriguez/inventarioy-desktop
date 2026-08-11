// Reporta el estado de licencia de una base de datos InventarioY.
// Uso: node scripts/license-state.mjs [--db <ruta/al/inventarioy.db>]
// Sin --db usa la BD real de la app (mismo directorio que en producción).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function defaultDbPath() {
  const base = process.env.APPDATA || path.join(os.homedir(), '.inventarioy');
  return path.join(base, 'inventarioy-desktop', 'inventarioy.db');
}

function parseArgs(argv) {
  let db = defaultDbPath();
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--db' && argv[i + 1]) db = argv[i + 1];
  }
  return { db };
}

const { db: dbPath } = parseArgs(process.argv);

if (!fs.existsSync(dbPath)) {
  console.error(`No existe la base: ${dbPath}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
let owner;
let maxSeenRow;
try {
  owner = db.prepare(`SELECT * FROM user_session WHERE id = 'owner'`).get();
  maxSeenRow = db.prepare(`SELECT value FROM settings WHERE key = 'license_max_seen_time'`).get();
} catch (err) {
  console.error(`No se pudo leer la base (¿es un archivo InventarioY?): ${err.message}`);
  process.exit(1);
}
db.close();

if (!owner) {
  console.log(JSON.stringify({ status: 'no-business', error: 'No hay negocio configurado (sin fila owner).' }, null, 2));
  process.exit(0);
}

const now = Date.now();
const validUntilMs = owner.license_valid_until ? new Date(owner.license_valid_until).getTime() : null;
const trialEndsMs = owner.trial_started_at ? new Date(new Date(owner.trial_started_at).getTime() + TRIAL_DAYS * DAY_MS).getTime() : null;
const maxSeenMs = maxSeenRow?.value ? new Date(maxSeenRow.value).getTime() : null;

let status = 'expired';
let daysRemaining = 0;

if (validUntilMs && validUntilMs > now) {
  status = 'active';
  daysRemaining = Math.max(1, Math.ceil((validUntilMs - now) / DAY_MS));
} else if (maxSeenMs && now < maxSeenMs - DAY_MS) {
  status = 'expired'; // reloj retrocedido respecto del último uso conocido
} else if (trialEndsMs && trialEndsMs > now) {
  status = 'trialing';
  daysRemaining = Math.max(1, Math.ceil((trialEndsMs - now) / DAY_MS));
}

console.log(
  JSON.stringify(
    {
      db: dbPath,
      status,
      businessCode: owner.business_code || '',
      daysRemaining,
      trialStartedAt: owner.trial_started_at || null,
      trialEndsAt: trialEndsMs ? new Date(trialEndsMs).toISOString() : null,
      validUntil: owner.license_valid_until || null,
      licenseKey: owner.license_key ? '(presente)' : null,
      maxSeenTime: maxSeenRow?.value || null,
    },
    null,
    2
  )
);
