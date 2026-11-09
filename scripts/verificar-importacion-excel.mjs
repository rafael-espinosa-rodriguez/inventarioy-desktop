// Verifica la importación con archivos generados por Excel real (COM, solo Windows).
// Uso: npm run verify:import
// Crea un .xlsx de prueba y lo guarda en los 3 formatos que puede producir Excel:
//   - CSV UTF-8 (FileFormat 62)
//   - CSV separado por comas/list separator (FileFormat 6)
//   - Texto Unicode / tabulado UTF-16 (FileFormat 42)
// Luego parsea cada archivo con la misma lógica de la app y compara valores.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { decodeImportFile, parseImportText } from '../src/lib/importProducts.ts';

const dir = path.join(os.tmpdir(), `inventarioy-verify-import-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });

const psScript = `
$ErrorActionPreference = 'Stop'
$dir = '${dir.replace(/'/g, "''")}'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Add()
  $ws = $wb.Worksheets.Item(1)
  $ws.Cells.Item(1,1) = 'Nombre'
  $ws.Cells.Item(1,2) = 'Unidad'
  $ws.Cells.Item(1,3) = 'Cantidad'
  $ws.Cells.Item(1,4) = 'Costo'
  $ws.Cells.Item(1,5) = 'Vencimiento'
  $ws.Cells.Item(2,1) = 'Café molido'
  $ws.Cells.Item(2,2) = 'kg'
  $ws.Cells.Item(2,3) = 8.5
  $ws.Cells.Item(2,4) = 1600
  $ws.Cells.Item(2,5) = '31/01/2027'
  $ws.Cells.Item(3,1) = 'Aceite de girasol'
  $ws.Cells.Item(3,2) = 'L'
  $ws.Cells.Item(3,3) = 12
  $ws.Cells.Item(3,4) = 450
  $ws.Cells.Item(3,5) = ''
  $wb.SaveAs((Join-Path $dir 'excel-utf8.csv'), 62)
  $wb.SaveAs((Join-Path $dir 'excel-csv.csv'), 6)
  $wb.SaveAs((Join-Path $dir 'excel-unicode.txt'), 42)
  $wb.Close($false)
} finally {
  $excel.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
`;

const psFile = path.join(dir, 'generar.ps1');
fs.writeFileSync(psFile, '\uFEFF' + psScript, 'utf8');

let failed = 0;
try {
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile], { stdio: 'pipe' });
  } catch (err) {
    const stderr = err?.stderr ? Buffer.from(err.stderr).toString('utf8') : '';
    console.error('No se pudo generar el Excel de prueba:', err?.message || err);
    if (stderr) console.error(stderr);
    process.exit(1);
  }
  console.log('Excel generó los 3 archivos en:', dir);

  const cases = [
    { file: 'excel-utf8.csv', label: 'CSV UTF-8' },
    { file: 'excel-csv.csv', label: 'CSV (separador local)' },
    { file: 'excel-unicode.txt', label: 'Texto Unicode (UTF-16)' },
  ];

  for (const c of cases) {
    const full = path.join(dir, c.file);
    const buffer = fs.readFileSync(full);
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const text = decodeImportFile(ab);
    const preview = parseImportText(text);
    const row = preview.rows[0];
    const ok =
      !preview.fatal &&
      preview.rows.length === 2 &&
      row?.name === 'Café molido' &&
      row?.unit === 'kg' &&
      row?.quantity === 8.5 &&
      row?.cost === 1600 &&
      row?.expiration_date === '2027-01-31';
    if (ok) {
      console.log(`OK   ${c.label}: ${row.name} · ${row.quantity} ${row.unit} · costo ${row.cost} · vence ${row.expiration_date}`);
    } else {
      failed++;
      console.error(`FALLO ${c.label}:`, JSON.stringify({ fatal: preview.fatal, rows: preview.rows.slice(0, 2), errors: preview.errors, warnings: preview.warnings }, null, 2));
    }
  }
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* limpieza best-effort */ }
}

if (failed > 0) {
  console.error(`\n${failed} formato(s) fallaron.`);
  process.exit(1);
}
console.log('\nverify:import OK (3 formatos de Excel)');
