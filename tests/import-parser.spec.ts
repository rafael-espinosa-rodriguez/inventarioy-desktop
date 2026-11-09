// Spec 006: matriz de casos límite del parser de importación (sin navegador).
import { test, expect } from '@playwright/test';
import {
  MAX_IMPORT_ROWS,
  buildResultCsv,
  buildTemplateCsv,
  decodeImportFile,
  detectDelimiter,
  parseImportDate,
  parseImportNumber,
  parseImportText,
} from '../src/lib/importProducts';

const toArrayBuffer = (buf: Buffer): ArrayBuffer =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

test('detecta separadores ; , y tabulador', () => {
  expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
  expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
});

test('soporta comillas, delimitadores y saltos dentro de campos', () => {
  const csv = [
    'Nombre;Descripción;Cantidad',
    '"Refresco, Cola";"Botella ""grande""";5',
    '"Harina; integral";"Nota con\nsalto";7',
  ].join('\n');
  const p = parseImportText(csv);
  expect(p.errors).toHaveLength(0);
  expect(p.rows.map(r => r.name)).toEqual(['Refresco, Cola', 'Harina; integral']);
  expect(p.rows[0].description).toBe('Botella "grande"');
  expect(p.rows[1].description).toBe('Nota con\nsalto');
});

test('números: coma decimal, punto decimal y ambigüedad de miles', () => {
  expect(parseImportNumber('8,5')).toBe(8.5);
  expect(parseImportNumber('8.5')).toBe(8.5);
  expect(parseImportNumber('1.234,5')).toBe(1234.5);
  expect(parseImportNumber('1,600')).toBe(1.6);
  expect(parseImportNumber('abc')).toBeNull();

  const p = parseImportText('Nombre;Costo;Precio\nA;1,600;8,5');
  expect(p.errors).toHaveLength(0);
  expect(p.rows[0].cost).toBe(1.6);
  expect(p.rows[0].price).toBe(8.5);
  expect(p.warnings).toHaveLength(1);
  expect(p.warnings[0].message).toContain('1,600');
  expect(p.warnings[0].message).toContain('1.6');
});

test('fechas aceptadas y rechazadas', () => {
  expect(parseImportDate('2027-01-31')).toBe('2027-01-31');
  expect(parseImportDate('31/01/2027')).toBe('2027-01-31');
  expect(parseImportDate('31-01-2027')).toBe('2027-01-31');
  expect(parseImportDate('2027-02-30')).toBeNull();
  expect(parseImportDate('31/13/2027')).toBeNull();

  const p = parseImportText('Nombre;Vencimiento\nA;31/02/2027\nB;31/01/2027');
  expect(p.errors).toHaveLength(1);
  expect(p.errors[0].line).toBe(2);
  expect(p.rows[0].expiration_date).toBe('2027-01-31');
});

test('booleanos: sí/no, 1/0, x y variantes inválidas', () => {
  const csv = [
    'Nombre;Individual;Gasto variable;Consumo directo',
    'A;Sí;0;x',
    'B;true;NO;1',
    'C;quizás;No;No',
  ].join('\n');
  const p = parseImportText(csv);
  expect(p.errors).toHaveLength(1);
  expect(p.errors[0].message).toContain('Individual');
  expect(p.rows[0]).toMatchObject({ is_individual: true, is_gasto_variable: false, is_consumo_directo: true });
  expect(p.rows[1]).toMatchObject({ is_individual: true, is_gasto_variable: false, is_consumo_directo: true });
});

test('unidad desconocida se carga como u con aviso', () => {
  const p = parseImportText('Nombre;Unidad;Cantidad\nLeche;caja;3');
  expect(p.errors).toHaveLength(0);
  expect(p.rows[0].unit).toBe('u');
  expect(p.warnings).toHaveLength(1);
  expect(p.warnings[0].message).toContain('caja');
});

test('duplicados: en el archivo y contra existentes (normaliza acentos/mayúsculas)', () => {
  const csv = 'Nombre;Unidad\nCafé Molido;kg\nCAFE MOLIDO;kg\nAzúcar;kg';
  const p = parseImportText(csv, ['azucar']);
  expect(p.rows.map(r => r.name)).toEqual(['Café Molido']);
  expect(p.duplicates).toHaveLength(2);
  expect(p.duplicates[0].message).toBe('Duplicado dentro del archivo');
  expect(p.duplicates[1].message).toBe('Ya existe en el inventario');
});

test('alias de cabeceras en español', () => {
  const p = parseImportText('Producto;Unidad de medida;Stock inicial;Precio venta;Punto de reorden\nArroz;kg;10;250;2');
  expect(p.fatal).toBeUndefined();
  expect(p.rows[0]).toMatchObject({ name: 'Arroz', unit: 'kg', quantity: 10, price: 250, rop: 2 });
});

test('fatal: sin columna Nombre y archivo vacío', () => {
  expect(parseImportText('Unidad;Cantidad\nkg;1').fatal).toContain('Nombre');
  expect(parseImportText('').fatal).toBeTruthy();
});

test('límite de filas: 2000 acepta, 2001 rechaza', () => {
  const rows = ['Nombre;Unidad'];
  for (let i = 0; i < MAX_IMPORT_ROWS; i++) rows.push(`p${i};u`);
  const ok = parseImportText(rows.join('\n'));
  expect(ok.fatal).toBeUndefined();
  expect(ok.rows).toHaveLength(MAX_IMPORT_ROWS);

  rows.push('p2000;u');
  const over = parseImportText(rows.join('\n'));
  expect(over.fatal).toContain('2000');
});

test('decodifica UTF-8 con BOM, UTF-16 (Texto Unicode) y ANSI', () => {
  const content = 'Nombre;Unidad;Cantidad\nCafé molido;kg;1';

  const utf8 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(content, 'utf8')]);
  expect(parseImportText(decodeImportFile(toArrayBuffer(utf8))).rows[0].name).toBe('Café molido');

  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, 'utf16le')]);
  const decoded16 = decodeImportFile(toArrayBuffer(utf16));
  expect(decoded16).toContain('Café molido');
  expect(parseImportText(decoded16).rows[0].name).toBe('Café molido');

  const ansi = Buffer.from(content.replace(/;/g, ';'), 'latin1');
  const decodedAnsi = decodeImportFile(toArrayBuffer(ansi));
  expect(parseImportText(decodedAnsi).rows[0].name).toBe('Café molido');
});

test('plantilla y reporte de resultado', () => {
  const template = buildTemplateCsv().replace(/^\uFEFF/, '');
  expect(template.split(/\r?\n/)[0]).toContain('Nombre;Categoría;Unidad;Cantidad;Costo;Precio');
  expect(template.split(/\r?\n/).length).toBeGreaterThan(3);

  const result = buildResultCsv(['A', 'B'], [{ name: 'C', reason: 'Ya existe en el inventario' }]).replace(/^\uFEFF/, '');
  expect(result).toContain('Importado;A;');
  expect(result).toContain('Omitido;C;Ya existe en el inventario');
});
