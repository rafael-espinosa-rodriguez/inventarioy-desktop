// Crea la carpeta de entrega para un cliente con instalador, PDFs y LEEME.
// Uso: node scripts/crear-entrega.mjs --cliente "Nombre del negocio" [--zip]
//   --zip  genera además Entrega-<Cliente>.zip en la carpeta (para WhatsApp/correo).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function sanitize(name) {
  const clean = name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/[.\s]+$/g, '');
  if (!clean) {
    console.error('Nombre de cliente inválido. Uso: node scripts/crear-entrega.mjs --cliente "Nombre" [--zip]');
    process.exit(1);
  }
  return clean;
}

const cliente = arg('--cliente');
const wantZip = process.argv.includes('--zip');
if (!cliente) {
  console.error('Uso: node scripts/crear-entrega.mjs --cliente "Nombre del negocio" [--zip]');
  process.exit(1);
}
const nombre = sanitize(cliente);

const SOURCES = [
  ['release', 'InventarioY Setup 1.0.0.exe'],
  ['docs', 'Manual-de-uso.pdf'],
  ['docs', 'Plantilla-entrega-licencia.pdf'],
];
for (const [dir, file] of SOURCES) {
  if (!fs.existsSync(path.join(ROOT, dir, file))) {
    console.error(`No existe ${dir}\\${file}. Ejecute antes: npm run desktop:package`);
    process.exit(1);
  }
}

const fecha = new Date().toISOString().slice(0, 10); // AAAA-MM-DD
const dirName = `${nombre}_${fecha}`;
const outDir = path.join(ROOT, 'entregas', dirName);
fs.mkdirSync(outDir, { recursive: true });

const installerSrc = path.join(ROOT, 'release', 'InventarioY Setup 1.0.0.exe');
const manualSrc = path.join(ROOT, 'docs', 'Manual-de-uso.pdf');
const plantillaSrc = path.join(ROOT, 'docs', 'Plantilla-entrega-licencia.pdf');

const installerDst = path.join(outDir, 'Instalador - InventarioY Setup 1.0.0.exe');
const manualDst = path.join(outDir, 'Manual-de-uso.pdf');
const plantillaDst = path.join(outDir, `Plantilla-entrega-licencia_${nombre}.pdf`);

fs.copyFileSync(installerSrc, installerDst);
fs.copyFileSync(manualSrc, manualDst);
fs.copyFileSync(plantillaSrc, plantillaDst);

const leeme = `INVENTARIOY — ENTREGA DE LICENCIA
===================================

Cliente  : ${nombre}
Fecha    : ${fecha}

CONTENIDO
---------
1. Instalador - InventarioY Setup 1.0.0.exe  → programa a instalar en la PC
2. Manual-de-uso.pdf                          → guía completa de uso
3. Plantilla-entrega-licencia_${nombre}.pdf     → contrato/licencia firmado (rellenar datos si hace falta)

PASOS PARA EL CLIENTE
---------------------
1. Instalar el programa ejecutando el instalador.
2. Abrir InventarioY y completar la configuración inicial: nombre del negocio y PIN.
3. El vendedor le enviará por WhatsApp el CÓDIGO DE NEGOCIO y la CLAVE DE ACTIVACIÓN.
4. En la app ir a Configuración → "Activar / renovar licencia", introducir el código y la clave.

NOTA PARA EL VENDEDOR
---------------------
- La clave de activación NO se incluye en esta carpeta.
- Generarla en la PC del vendedor con:
    node scripts/generar-licencia.mjs --codigo <CODIGO> --meses N
    node scripts/generar-licencia.mjs --codigo <CODIGO> --vitalicia
- Enviarla por WhatsApp junto al código de negocio tras confirmar el pago.
- WhatsApp bloquea archivos .exe: si envía el instalador por WhatsApp, envíe el ZIP.
`;
fs.writeFileSync(path.join(outDir, 'LEEME.txt'), leeme, 'utf8');

if (wantZip) {
  const zipPath = path.join(outDir, `Entrega-${nombre}.zip`);
  const psCmd = `Compress-Archive -Path '${outDir.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', psCmd], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`No se pudo crear el ZIP: ${r.stderr?.trim() || 'error desconocido'}`);
  } else {
    console.log(`ZIP OK: ${zipPath}`);
  }
}

console.log(`Entrega creada: ${outDir}`);
console.log('  - Instalador - InventarioY Setup 1.0.0.exe');
console.log('  - Manual-de-uso.pdf');
console.log(`  - Plantilla-entrega-licencia_${nombre}.pdf`);
console.log('  - LEEME.txt');
