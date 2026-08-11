// Cambia el estado de licencia de una base de datos InventarioY (útil para pruebas locales).
// Uso:
//   node scripts/simular-licencia.mjs trial [--db <ruta>]               -> reinicia el trial de 7 días
//   node scripts/simular-licencia.mjs expired [--db <ruta>]             -> trial vencido (bloquea escrituras)
//   node scripts/simular-licencia.mjs activar --codigo E2ETEST --meses 1 [--db <ruta>]
//   node scripts/simular-licencia.mjs activar --codigo E2ETEST --hasta 2026-12-31 [--db <ruta>]
//   node scripts/simular-licencia.mjs rollback [--db <ruta>]            -> maxSeen futuro (simula reloj hacia atrás)
//   node scripts/simular-licencia.mjs clear-rollback [--db <ruta>]      -> borra el marcador anti-tamper
import { DatabaseSync } from 'node:sqlite';
import { sign } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIV_PATH = path.join(__dirname, 'license-private.pem');
const MAX_SEEN_KEY = 'license_max_seen_time';
const DAY_MS = 24 * 60 * 60 * 1000;

function defaultDbPath() {
  const base = process.env.APPDATA || path.join(os.homedir(), '.inventarioy');
  return path.join(base, 'inventarioy-desktop', 'inventarioy.db');
}

function parseArgs(argv) {
  const out = { db: defaultDbPath(), code: null, months: null, until: null, action: null, help: false };
  const rest = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db' && argv[i + 1]) out.db = argv[i + 1];
    else if (a === '--codigo' && argv[i + 1]) out.code = String(argv[i + 1]).trim().toUpperCase();
    else if (a === '--meses' && argv[i + 1]) out.months = Number(argv[i + 1]);
    else if (a === '--hasta' && argv[i + 1]) out.until = String(argv[i + 1]).trim();
    else if (a === '-h' || a === '--help') out.help = true;
    else rest.push(a);
  }
  out.action = rest[0] || null;
  return out;
}

function signKey(code, validUntilISO) {
  const payload = JSON.stringify({ code, validUntil: validUntilISO });
  const privPem = fs.readFileSync(PRIV_PATH, 'utf8');
  const signature = sign('ed25519', Buffer.from(payload, 'utf8'), privPem);
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${signature.toString('base64url')}`;
}

function usage() {
  console.log(
    [
      'Uso: node scripts/simular-licencia.mjs <trial|expired|activar|rollback|clear-rollback> [opciones]',
      '',
      'Opciones:',
      '  --db <ruta>                 Ruta a inventarioy.db (por defecto, la BD real de la app)',
      '  --codigo <CÓDIGO>           Código de negocio para activar',
      '  --meses <N>                 Validez de la licencia en meses',
      '  --hasta <YYYY-MM-DD>        Validez de la licencia hasta esa fecha',
      '',
      'Ejemplos:',
      '  node scripts/simular-licencia.mjs expired',
      '  node scripts/simular-licencia.mjs activar --codigo E2ETEST --meses 1',
      '  node scripts/simular-licencia.mjs rollback',
    ].join('\n')
  );
}

function report(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const owner = db.prepare(`SELECT business_code, trial_started_at, license_valid_until FROM user_session WHERE id = 'owner'`).get();
  const maxSeen = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(MAX_SEEN_KEY);
  db.close();
  console.log('Estado ahora:');
  console.log('  código        :', owner?.business_code || '(sin negocio)');
  console.log('  trial_started :', owner?.trial_started_at || '-');
  console.log('  valid_until   :', owner?.license_valid_until || '-');
  console.log('  maxSeenTime   :', maxSeen?.value || '-');
}

const args = parseArgs(process.argv);
if (args.help || !args.action || !fs.existsSync(args.db)) {
  if (!fs.existsSync(args.db)) console.error(`No existe la base: ${args.db}`);
  usage();
  process.exit(args.help || !args.action ? 0 : 1);
}

const db = new DatabaseSync(args.db);
const nowIso = new Date().toISOString();

switch (args.action) {
  case 'trial': {
    db.prepare(
      `UPDATE user_session SET trial_started_at = ?, license_key = NULL, license_valid_until = NULL, license_activated_at = NULL WHERE id = 'owner'`
    ).run(nowIso);
    db.prepare(`DELETE FROM settings WHERE key = ?`).run(MAX_SEEN_KEY);
    console.log('Trial de 7 días reiniciado.');
    break;
  }
  case 'expired': {
    const past = new Date(Date.now() - 21 * DAY_MS).toISOString();
    db.prepare(
      `UPDATE user_session SET trial_started_at = ?, license_key = NULL, license_valid_until = NULL, license_activated_at = NULL WHERE id = 'owner'`
    ).run(past);
    db.prepare(`DELETE FROM settings WHERE key = ?`).run(MAX_SEEN_KEY);
    console.log('Estado forzado a EXPIRED (trial iniciado hace 21 días).');
    break;
  }
  case 'activar': {
    if (!args.code || (!args.months && !args.until)) {
      console.error('activar requiere --codigo y --meses o --hasta.');
      usage();
      process.exit(1);
    }
    let validUntil;
    if (args.until) validUntil = new Date(`${args.until}T23:59:59`).toISOString();
    else validUntil = new Date(Date.now() + (args.months || 1) * 30 * DAY_MS).toISOString();
    if (Number.isNaN(new Date(validUntil).getTime())) {
      console.error('Fecha inválida. Use --hasta YYYY-MM-DD.');
      process.exit(1);
    }
    const key = signKey(args.code, validUntil);
    db.prepare(
      `UPDATE user_session SET license_key = ?, license_valid_until = ?, license_activated_at = ?, trial_started_at = COALESCE(trial_started_at, ?) WHERE id = 'owner'`
    ).run(key, validUntil, nowIso, nowIso);
    db.prepare(`DELETE FROM settings WHERE key = ?`).run(MAX_SEEN_KEY);
    console.log('Licencia activada. Clave:');
    console.log(' ', key);
    break;
  }
  case 'rollback': {
    const future = new Date(Date.now() + 2 * DAY_MS).toISOString();
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(MAX_SEEN_KEY, JSON.stringify(future), nowIso);
    console.log('Marcador anti-tamper seteado al futuro (reloj hacia atrás):', future);
    break;
  }
  case 'clear-rollback': {
    db.prepare(`DELETE FROM settings WHERE key = ?`).run(MAX_SEEN_KEY);
    console.log('Marcador anti-tamper eliminado.');
    break;
  }
  default: {
    console.error(`Acción desconocida: ${args.action}`);
    usage();
    db.close();
    process.exit(1);
  }
}

db.close();
report(args.db);
