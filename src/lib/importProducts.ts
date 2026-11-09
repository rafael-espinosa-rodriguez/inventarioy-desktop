import { normalizeStr } from './utils';
import { UNIT_LABELS, normalizeUnit, type UnitAbbrev } from './unitConversion';

// Importación de inventario desde Excel/CSV (spec 005).
// Sin dependencias externas: parser propio, tolerante a separadores y codificación.

export const MAX_IMPORT_ROWS = 2000;

export interface ImportRow {
  line: number;
  name: string;
  category: string;
  unit: UnitAbbrev;
  quantity: number;
  cost: number;
  price: number;
  rop: number;
  eoq: number;
  expiration_date: string | null;
  description: string;
  is_individual: boolean;
  is_gasto_variable: boolean;
  is_consumo_directo: boolean;
}

export interface ImportRowIssue {
  line: number;
  name: string;
  message: string;
}

export interface ImportPreview {
  rows: ImportRow[];
  errors: ImportRowIssue[];
  duplicates: ImportRowIssue[];
  totalRows: number;
  fatal?: string;
}

type FieldKey =
  | 'name' | 'category' | 'unit' | 'quantity' | 'cost' | 'price' | 'rop' | 'eoq'
  | 'expiration_date' | 'description' | 'is_individual' | 'is_gasto_variable'
  | 'is_consumo_directo';

// Cabeceras aceptadas (normalizadas: minúsculas, sin acentos).
const HEADER_ALIASES: Record<string, FieldKey> = {
  nombre: 'name', producto: 'name', articulo: 'name', 'nombre del producto': 'name',
  categoria: 'category', rubro: 'category', familia: 'category', seccion: 'category',
  unidad: 'unit', 'unidad de medida': 'unit', 'unidad medida': 'unit', um: 'unit', medida: 'unit',
  cantidad: 'quantity', stock: 'quantity', existencia: 'quantity', 'existencia inicial': 'quantity',
  'cantidad inicial': 'quantity', 'stock inicial': 'quantity',
  costo: 'cost', 'costo unitario': 'cost', 'precio de costo': 'cost', 'precio costo': 'cost',
  precio: 'price', 'precio de venta': 'price', 'precio venta': 'price', pvp: 'price',
  rop: 'rop', 'punto de reorden': 'rop', 'stock minimo': 'rop', minimo: 'rop',
  eoq: 'eoq', 'lote optimo': 'eoq', 'cantidad optima': 'eoq',
  vencimiento: 'expiration_date', 'fecha de vencimiento': 'expiration_date',
  caducidad: 'expiration_date', 'fecha vencimiento': 'expiration_date',
  descripcion: 'description', detalle: 'description', nota: 'description',
  individual: 'is_individual', 'venta unitaria': 'is_individual', 'por unidad': 'is_individual',
  'gasto variable': 'is_gasto_variable', 'es gasto variable': 'is_gasto_variable',
  'consumo directo': 'is_consumo_directo', 'es consumo directo': 'is_consumo_directo',
};

const TEMPLATE_HEADERS = [
  'Nombre', 'Categoría', 'Unidad', 'Cantidad', 'Costo', 'Precio', 'ROP', 'EOQ',
  'Vencimiento', 'Descripción', 'Individual', 'Gasto variable', 'Consumo directo',
];

const TEMPLATE_EXAMPLES = [
  ['Aceite de girasol', 'Otros', 'L', '12', '450', '0', '4', '12', '', 'Aceite para cocina', 'No', 'No', 'No'],
  ['Refresco Cola 1.5L', 'Bebidas y Refrescos', 'u', '24', '300', '500', '6', '24', '2027-01-31', 'Botella 1.5 litros', 'Sí', 'No', 'No'],
  ['Pollo entero', 'Carnes y Embutidos', 'kg', '8,5', '850', '0', '2', '10', '', '', 'No', 'No', 'No'],
];

/** Detecta el separador mirando la primera línea con contenido (fuera de comillas). */
export function detectDelimiter(text: string): ';' | ',' | '\t' {
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) || '';
  let inQuotes = false;
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === ';' || ch === ',' || ch === '\t')) counts[ch]++;
  }
  let best: ';' | ',' | '\t' = ';';
  for (const candidate of [';', ',', '\t'] as const) {
    if (counts[candidate] > counts[best]) best = candidate;
  }
  return counts[best] > 0 ? best : ';';
}

/** Parser delimitado con soporte de comillas, comillas escapadas y saltos internos. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  row.push(field);
  rows.push(row);

  // Descartar filas totalmente vacías
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/** Decodifica el archivo: UTF-8 y, si hay caracteres inválidos, Windows-1252 (Excel ANSI). */
export function decodeImportFile(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('\uFFFD')) return utf8;
  try {
    return new TextDecoder('windows-1252').decode(buffer);
  } catch {
    return utf8;
  }
}

/** Número tolerante: coma decimal, sin separador de miles. */
export function parseImportNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === ',') return null;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    normalized = cleaned.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    normalized = cleaned.replace(/,/g, '.');
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Fecha `AAAA-MM-DD`, `DD/MM/AAAA` o `DD-MM-AAAA` → ISO `AAAA-MM-DD`. */
export function parseImportDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  let y = 0, m = 0, d = 0;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]); }
  else if (dmy) { d = Number(dmy[1]); m = Number(dmy[2]); y = Number(dmy[3]); }
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const TRUE_VALUES = new Set(['si', 's', 'x', '1', 'true', 'verdadero', 'yes']);
const FALSE_VALUES = new Set(['no', 'n', '0', 'false', 'falso', '']);

export function parseImportBoolean(raw: string): boolean | null {
  const value = normalizeStr(raw);
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  return null;
}

function resolveUnit(raw: string): UnitAbbrev | null {
  const value = raw.trim();
  if (!value) return 'u';
  const normalized = normalizeUnit(value);
  const valid = Object.keys(UNIT_LABELS) as UnitAbbrev[];
  // normalizeUnit cae a 'u' con valores desconocidos: comprobar el alias real.
  const known = valid.includes(normalized) && (
    normalized !== 'u' || /^(u|un|unidad|unidades|unds|u\.?)$/i.test(value)
  );
  return known ? normalized : null;
}

/**
 * Parsea y valida el texto importado.
 * @param text contenido CSV/TSV
 * @param existingNames nombres ya existentes (normalizados) para detectar duplicados
 */
export function parseImportText(text: string, existingNames: string[] = []): ImportPreview {
  const clean = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(clean);
  const table = parseDelimited(clean, delimiter);

  if (table.length < 2) {
    return { rows: [], errors: [], duplicates: [], totalRows: 0, fatal: 'El archivo no contiene filas de datos.' };
  }

  const headerRow = table[0].map(h => normalizeStr(h));
  const fieldByColumn: (FieldKey | null)[] = headerRow.map(h => HEADER_ALIASES[h] ?? null);
  if (!fieldByColumn.includes('name')) {
    return { rows: [], errors: [], duplicates: [], totalRows: 0, fatal: 'Falta la columna obligatoria "Nombre".' };
  }

  const dataRows = table.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return {
      rows: [], errors: [], duplicates: [], totalRows: dataRows.length,
      fatal: `El archivo tiene ${dataRows.length} filas; el máximo por importación es ${MAX_IMPORT_ROWS}.`,
    };
  }

  const rows: ImportRow[] = [];
  const errors: ImportRowIssue[] = [];
  const duplicates: ImportRowIssue[] = [];
  const seen = new Set(existingNames.map(normalizeStr));
  const seenInFile = new Set<string>();

  dataRows.forEach((cells, index) => {
    const line = index + 2; // +1 cabecera, +1 índice base 1
    const get = (key: FieldKey): string => {
      const col = fieldByColumn.indexOf(key);
      return col >= 0 ? (cells[col] ?? '').trim() : '';
    };

    const name = get('name');
    const rowErrors: string[] = [];

    if (!name) rowErrors.push('Falta el nombre');
    else if (name.length > 120) rowErrors.push('El nombre supera 120 caracteres');

    const unit = resolveUnit(get('unit'));
    if (unit === null) rowErrors.push(`Unidad no válida: "${get('unit')}"`);

    const parseAmount = (key: FieldKey, label: string): number => {
      const raw = get(key);
      if (raw === '') return 0;
      const value = parseImportNumber(raw);
      if (value === null) { rowErrors.push(`${label} no es un número válido: "${raw}"`); return 0; }
      if (value < 0) { rowErrors.push(`${label} no puede ser negativo`); return 0; }
      return value;
    };

    const quantity = parseAmount('quantity', 'Cantidad');
    const cost = parseAmount('cost', 'Costo');
    const price = parseAmount('price', 'Precio');
    const rop = parseAmount('rop', 'ROP');
    const eoq = parseAmount('eoq', 'EOQ');

    const rawExpiration = get('expiration_date');
    const expiration = rawExpiration ? parseImportDate(rawExpiration) : null;
    if (rawExpiration && expiration === null) rowErrors.push(`Fecha de vencimiento no válida: "${rawExpiration}"`);

    const flags: { key: FieldKey; label: string; target: 'is_individual' | 'is_gasto_variable' | 'is_consumo_directo' }[] = [
      { key: 'is_individual', label: 'Individual', target: 'is_individual' },
      { key: 'is_gasto_variable', label: 'Gasto variable', target: 'is_gasto_variable' },
      { key: 'is_consumo_directo', label: 'Consumo directo', target: 'is_consumo_directo' },
    ];
    const booleans = { is_individual: false, is_gasto_variable: false, is_consumo_directo: false };
    for (const flag of flags) {
      const raw = get(flag.key);
      const value = parseImportBoolean(raw);
      if (value === null) rowErrors.push(`${flag.label} debe ser sí/no`);
      else booleans[flag.target] = value;
    }

    if (rowErrors.length > 0) {
      errors.push({ line, name: name || `(fila ${line})`, message: rowErrors.join('; ') });
      return;
    }

    const normalizedName = normalizeStr(name);
    if (seen.has(normalizedName)) {
      duplicates.push({
        line,
        name,
        message: seenInFile.has(normalizedName) ? 'Duplicado dentro del archivo' : 'Ya existe en el inventario',
      });
      return;
    }
    seen.add(normalizedName);
    seenInFile.add(normalizedName);

    rows.push({
      line,
      name,
      category: get('category') || 'Otros',
      unit: unit as UnitAbbrev,
      quantity,
      cost,
      price,
      rop,
      eoq,
      expiration_date: expiration,
      description: get('description'),
      ...booleans,
    });
  });

  return { rows, errors, duplicates, totalRows: dataRows.length };
}

function escapeCsvCell(value: string): string {
  const needsQuoting = value.includes(';') || value.includes('"') || value.includes('\n');
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

/** Plantilla CSV (separador `;`, BOM UTF-8, 3 ejemplos). */
export function buildTemplateCsv(): string {
  const lines = [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLES].map(row => row.map(escapeCsvCell).join(';'));
  return '\uFEFF' + lines.join('\r\n');
}

/** Reporte de filas con problema. */
export function buildErrorsCsv(issues: ImportRowIssue[]): string {
  const lines = [
    ['Fila', 'Nombre', 'Motivo'],
    ...issues.map(i => [String(i.line), i.name, i.message]),
  ].map(row => row.map(escapeCsvCell).join(';'));
  return '\uFEFF' + lines.join('\r\n');
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
