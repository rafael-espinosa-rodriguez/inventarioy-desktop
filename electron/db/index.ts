// Capa de base de datos local (node:sqlite)
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from './schema';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

let db: DatabaseSync | null = null;
let dataDir: string = '';

export function getDataDir(): string {
  return dataDir;
}

export function initDatabase(dir?: string): DatabaseSync {
  dataDir = dir || path.join(process.env.APPDATA || path.join(os.homedir(), '.inventarioy'), 'inventarioy-desktop');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'inventarioy.db');
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  applyMigrations(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('Base de datos no inicializada');
  return db;
}

// --- Helpers de filtrado (replican API encadenable de Supabase) ---

type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'ilike' | 'is' | 'contains';

export interface Filter {
  op: FilterOp;
  column: string;
  value: any;
}

export interface Order {
  column: string;
  ascending: boolean;
}

function buildWhere(filters: Filter[]): { where: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  for (const f of filters) {
    switch (f.op) {
      case 'eq':
        parts.push(`${quote(f.column)} = ?`);
        params.push(f.value);
        break;
      case 'neq':
        parts.push(`${quote(f.column)} != ?`);
        params.push(f.value);
        break;
      case 'gt':
        parts.push(`${quote(f.column)} > ?`);
        params.push(f.value);
        break;
      case 'gte':
        parts.push(`${quote(f.column)} >= ?`);
        params.push(f.value);
        break;
      case 'lt':
        parts.push(`${quote(f.column)} < ?`);
        params.push(f.value);
        break;
      case 'lte':
        parts.push(`${quote(f.column)} <= ?`);
        params.push(f.value);
        break;
      case 'in': {
        const arr = Array.isArray(f.value) ? f.value : [f.value];
        const placeholders = arr.map(() => '?').join(', ');
        parts.push(`${quote(f.column)} IN (${placeholders})`);
        params.push(...arr);
        break;
      }
      case 'ilike':
        parts.push(`${quote(f.column)} LIKE ? COLLATE NOCASE`);
        params.push(`%${f.value}%`);
        break;
      case 'is':
        if (f.value === null) {
          parts.push(`${quote(f.column)} IS NULL`);
        } else {
          parts.push(`${quote(f.column)} = ?`);
          params.push(f.value);
        }
        break;
      case 'contains': {
        // JSON contains (para columnas tipo texto con arrays serializados)
        const needle = typeof f.value === 'string' ? f.value : JSON.stringify(f.value);
        parts.push(`json_extract(${quote(f.column)}, '$') IS NOT NULL`);
        parts.push(`${quote(f.column)} LIKE ?`);
        params.push(`%"${needle}"%`);
        break;
      }
      default:
        break;
    }
  }
  return { where: parts.length ? parts.join(' AND ') : '', params };
}

function quote(col: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(col)) return `"${col}"`;
  return col;
}

// Reemplaza nombres de columnas conocidas de supabase con nombres reales en SQLite
const COLUMN_ALIASES: Record<string, Record<string, string>> = {
  sales: { subtotal: 'subtotal' },
  product_warehouse: { onConflict: 'product_id,warehouse_id' },
};

export interface SelectQuery {
  table: string;
  columns?: string;
  filters: Filter[];
  orders: Order[];
  limit?: number | null;
  single?: boolean;
  maybeSingle?: boolean;
}

export function selectRows(q: SelectQuery): { data: any[] } {
  const d = getDb();
  const { where, params } = buildWhere(q.filters);
  let sql = `SELECT * FROM ${quote(q.table)}`;
  if (where) sql += ` WHERE ${where}`;
  if (q.orders && q.orders.length) {
    const ord = q.orders.map(o => `${quote(o.column)} ${o.ascending ? 'ASC' : 'DESC'}`).join(', ');
    sql += ` ORDER BY ${ord}`;
  }
  if (q.limit) sql += ` LIMIT ${Number(q.limit)}`;
  const stmt = d.prepare(sql);
  const rows = stmt.all(...params) as any[];

  // Deserializar columnas JSON
  for (const r of rows) {
    for (const key of ['items', 'details', 'recipe_snapshot', 'ingredients']) {
      if (key in r && typeof r[key] === 'string') {
        try { r[key] = JSON.parse(r[key]); } catch { /* keep as string */ }
      }
    }
  }
  return { data: rows };
}

export interface WriteQuery {
  table: string;
  method: 'insert' | 'upsert' | 'update' | 'delete';
  data?: any;
  filters?: Filter[];
  onConflict?: string;
}

export function writeRows(q: WriteQuery): { data: any | any[] | null; error?: any } {
  const d = getDb();
  const table = q.table;
  const now = new Date().toISOString();

  // Columnas reales de la tabla (para no insertar columnas inexistentes)
  const tableCols = new Set(
    (d.prepare(`PRAGMA table_info(${quote(table)})`).all() as any[]).map((c: any) => c.name)
  );

  // node:sqlite no acepta booleans; normaliza a 0/1 y undefined a null
  const normalize = (v: any): any => {
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === undefined) return null;
    if (v === null) return null;
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  };

  const filterCols = (row: any): any => {
    const out: any = {};
    for (const k of Object.keys(row)) {
      if (tableCols.has(k)) out[k] = normalize(row[k]);
    }
    return out;
  };

  if (q.method === 'insert') {
    const items = Array.isArray(q.data) ? q.data : [q.data];
    const results: any[] = [];
    for (const item of items) {
      let row: any = { ...item };
      row = filterCols(row);
      if (!row.id && tableCols.has('id')) row.id = crypto.randomUUID();
      if (tableCols.has('created_at') && !row.created_at) row.created_at = now;
      if (tableCols.has('updated_at') && (row.updated_at === undefined || row.updated_at === null)) row.updated_at = now;
      const cols = Object.keys(row);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO ${quote(table)} (${cols.map(quote).join(', ')}) VALUES (${placeholders})`;
      try {
        d.prepare(sql).run(...cols.map(c => row[c]));
        results.push({ ...row });
      } catch (e: any) {
        return { data: null, error: { code: '23505', message: e.message } };
      }
    }
    return { data: Array.isArray(q.data) ? results : results[0] };
  }

  if (q.method === 'upsert') {
    const items = Array.isArray(q.data) ? q.data : [q.data];
    const results: any[] = [];
    const conflictCols = (q.onConflict || 'id').split(',').map(c => c.trim()).filter(Boolean);
    for (const item of items) {
      let row: any = { ...item };
      row = filterCols(row);
      if (!row.id) row.id = crypto.randomUUID();
      if (tableCols.has('created_at') && !row.created_at) row.created_at = now;
      if (tableCols.has('updated_at') && (row.updated_at === undefined || row.updated_at === null)) row.updated_at = now;
      const cols = Object.keys(row);
      const colList = cols.map(quote).join(', ');
      const ph = cols.map(() => '?').join(', ');
      const conflictList = conflictCols.map(quote).join(', ');
      const updateSet = cols
        .filter(c => !conflictCols.includes(c) && c !== 'id' && c !== 'created_at')
        .map(c => `${quote(c)} = excluded.${quote(c)}`)
        .join(', ');
      const sql = updateSet
        ? `INSERT INTO ${quote(table)} (${colList}) VALUES (${ph}) ON CONFLICT (${conflictList}) DO UPDATE SET ${updateSet}`
        : `INSERT INTO ${quote(table)} (${colList}) VALUES (${ph}) ON CONFLICT (${conflictList}) DO NOTHING`;
      try {
        d.prepare(sql).run(...cols.map(c => row[c]));
        results.push(row);
      } catch (e: any) {
        // Sin UNIQUE en la columna conflict: intentar update manual
        const where = conflictCols.map(c => `${quote(c)} = ?`).join(' AND ');
        const updatable = cols.filter(c => !conflictCols.includes(c) && c !== 'id' && c !== 'created_at');
        const set = updatable.map(c => `${quote(c)} = ?`).join(', ');
        if (set) {
          const updParams = updatable.map(c => row[c]);
          const wParams = conflictCols.map(c => row[c]);
          try {
            d.prepare(`UPDATE ${quote(table)} SET ${set} WHERE ${where}`).run(...updParams, ...wParams);
            results.push(row);
          } catch (e2: any) {
            return { data: null, error: { code: '23505', message: e2.message } };
          }
        }
      }
    }
    return { data: Array.isArray(q.data) ? results : results[0] };
  }

  if (q.method === 'update') {
    const { where, params } = buildWhere(q.filters || []);
    const row = filterCols({ ...(q.data || {}), updated_at: now });
    const setCols = Object.keys(row).map(c => `${quote(c)} = ?`).join(', ');
    const sql = `UPDATE ${quote(table)} SET ${setCols}${where ? ` WHERE ${where}` : ''}`;
    try {
      d.prepare(sql).run(...(Object.values(row) as any[]), ...params);
    } catch (e: any) {
      return { data: null, error: { code: 'P0001', message: e.message } };
    }
    return { data: { ...row } };
  }

  if (q.method === 'delete') {
    const { where, params } = buildWhere(q.filters || []);
    const sql = `DELETE FROM ${quote(table)}${where ? ` WHERE ${where}` : ''}`;
    d.prepare(sql).run(...params);
    return { data: null };
  }

  return { data: null, error: { message: 'Método no soportado' } };
}

export function runRaw(sql: string, params: any[] = []): void {
  getDb().prepare(sql).run(...params);
}

export function queryRaw<T = any>(sql: string, params: any[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function getRaw<T = any>(sql: string, params: any[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function transaction<T>(fn: () => T): T {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}
