// Genera una clave de activación de licencia para un cliente.
// Uso: node scripts/generar-licencia.mjs --codigo ABC123 --meses 1
//   --codigo:    código de negocio del cliente (visible en Ajustes → Licencia)
//   --meses:     cantidad de meses a partir de hoy (1 = 30 días, 3, 6, 12)
//   --hasta:     (opcional) fecha de vencimiento manual ISO (YYYY-MM-DD), reemplaza --meses
//   --vitalicia: licencia vitalicia (vence el 31/12/2900), reemplaza --meses y --hasta
//
// Requiere scripts/license-private.pem (generado con generar-claves.mjs).
import { sign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privPath = path.join(__dirname, 'license-private.pem');

function parseArgs(argv) {
  const out = { code: null, months: null, until: null, vitalicia: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--codigo' && argv[i + 1]) out.code = String(argv[i + 1]).trim().toUpperCase();
    if (a === '--meses' && argv[i + 1]) out.months = Number(argv[i + 1]);
    if (a === '--hasta' && argv[i + 1]) out.until = String(argv[i + 1]).trim();
    if (a === '--vitalicia') out.vitalicia = true;
    if (a === '-h' || a === '--help') out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv);

if (args.help || !args.code || (!args.months && !args.until && !args.vitalicia)) {
  console.log('Uso: node scripts/generar-licencia.mjs --codigo ABC123 --meses 1');
  console.log('     node scripts/generar-licencia.mjs --codigo ABC123 --hasta 2026-09-30');
  console.log('     node scripts/generar-licencia.mjs --codigo ABC123 --vitalicia');
  process.exit(args.help ? 0 : 1);
}

if (!fs.existsSync(privPath)) {
  console.error('No existe scripts/license-private.pem. Ejecutá primero: node scripts/generar-claves.mjs');
  process.exit(1);
}

let validUntil;
if (args.vitalicia) {
  validUntil = new Date('2900-12-31T23:59:59');
} else if (args.until) {
  validUntil = new Date(`${args.until}T23:59:59`);
} else {
  const ms = (args.months || 1) * 30 * 24 * 60 * 60 * 1000;
  validUntil = new Date(Date.now() + ms);
}

if (Number.isNaN(validUntil.getTime())) {
  console.error('Fecha de vencimiento inválida');
  process.exit(1);
}

const payload = JSON.stringify({ code: args.code, validUntil: validUntil.toISOString() });
const privPem = fs.readFileSync(privPath, 'utf8');
const signature = sign(null, Buffer.from(payload, 'utf8'), privPem);
const key = `${Buffer.from(payload, 'utf8').toString('base64url')}.${signature.toString('base64url')}`;

// Formato legible en grupos de 5 caracteres separados por espacios.
// NOTA: no usar guiones como separador: base64url incluye '-' como
// carácter válido del payload/firma y rompería la verificación.
const groups = key.match(/.{1,5}/g) || [];
const formatted = groups.join(' ');

console.log('');
console.log('=== CLAVE DE ACTIVACIÓN ===');
console.log(formatted);
console.log('');
console.log(`Código negocio : ${args.code}`);
console.log(`Válida hasta    : ${validUntil.toISOString()}`);
console.log(`Válida hasta    : ${validUntil.toLocaleDateString('es-ES')}`);
