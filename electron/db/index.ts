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

// Backup rotativo de la base de datos. Se ejecuta al arrancar la app para que
// ante una corrupción o borrado accidental siempre exista una copia reciente.
// Conserva hasta MAX_BACKUPS copias con nombre inventarioy-backup-<fecha>.db.
const MAX_BACKUPS = 5;

export function backupDatabase(): string | null {
  if (!dataDir) return null;
  const dbPath = path.join(dataDir, 'inventarioy.db');
  if (!fs.existsSync(dbPath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(dataDir, `inventarioy-backup-${stamp}.db`);
  try {
    // Backup consistente aunque la BD esté en WAL: checkpoint + copia física.
    try { db?.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* ok */ }
    fs.copyFileSync(dbPath, backupPath);
    // Rotación: borrar backups antiguos hasta dejar MAX_BACKUPS.
    const backups = fs.readdirSync(dataDir)
      .filter(f => /^inventarioy-backup-.*\.db$/.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(dataDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const b of backups.slice(MAX_BACKUPS)) {
      try { fs.unlinkSync(path.join(dataDir, b.f)); } catch { /* ignore */ }
    }
    return backupPath;
  } catch {
    return null;
  }
}

export function initDatabase(dir?: string): DatabaseSync {
  dataDir = dir || path.join(process.env.APPDATA || path.join(os.homedir(), '.inventarioy'), 'inventarioy-desktop');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'inventarioy.db');

  const openDb = (): DatabaseSync => {
    const d = new DatabaseSync(dbPath);
    d.exec('PRAGMA journal_mode = WAL');
    d.exec('PRAGMA foreign_keys = ON');
    return d;
  };

  const verifyIntegrity = (d: DatabaseSync): boolean => {
    try {
      const integrity = d.prepare('PRAGMA integrity_check').get() as any;
      const value = integrity && typeof integrity === 'object' ? integrity.integrity_check : integrity;
      return value === 'ok';
    } catch {
      return false;
    }
  };

  // Abrir y verificar integridad. Si la BD está corrupta, restaurar desde el
  // backup más reciente antes de aplicar migraciones.
  try {
    db = openDb();
    if (!verifyIntegrity(db)) {
      console.error('[db] ⚠️ integrity_check falló. Intentando restaurar desde backup...');
      db.close();
      const backups = fs.readdirSync(dataDir)
        .filter(f => /^inventarioy-backup-.*\.db$/.test(f))
        .sort((a, b) => fs.statSync(path.join(dataDir, b)).mtimeMs - fs.statSync(path.join(dataDir, a)).mtimeMs);
      if (backups.length > 0) {
        fs.copyFileSync(path.join(dataDir, backups[0]), dbPath);
        db = openDb();
        console.log('[db] ✅ BD restaurada desde backup:', backups[0]);
      } else {
        throw new Error('Base de datos corrupta y sin copia de seguridad disponible');
      }
    }
  } catch (e: any) {
    if (e?.message?.includes('corrupta y sin copia')) throw e;
    // Fallo al abrir (p. ej. "file is not a database"): intentar restaurar.
    console.error('[db] Error abriendo la BD:', e?.message);
    try { db?.close(); } catch { /* ignore */ }
    const backups = fs.readdirSync(dataDir)
      .filter(f => /^inventarioy-backup-.*\.db$/.test(f))
      .sort((a, b) => fs.statSync(path.join(dataDir, b)).mtimeMs - fs.statSync(path.join(dataDir, a)).mtimeMs);
    if (backups.length > 0) {
      fs.copyFileSync(path.join(dataDir, backups[0]), dbPath);
      db = openDb();
      console.log('[db] ✅ BD restaurada desde backup:', backups[0]);
    } else {
      throw new Error('Base de datos corrupta y sin copia de seguridad disponible');
    }
  }

  applyMigrations(db);
  // Copia de seguridad al arrancar (tras migraciones exitosas).
  backupDatabase();
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
    // El rol 'owner' y los roles con PINs asociados no pueden eliminarse
    // (la UI lo impide; esto es defensa en profundidad).
    if (table === 'roles') {
      const targets = d
        .prepare(`SELECT id, name FROM ${quote('roles')}${where ? ` WHERE ${where}` : ''}`)
        .all(...params) as any[];
      for (const t of targets) {
        if (t.id === 'owner') {
          return { data: null, error: { code: 'ROLE_PROTECTED', message: 'El rol de Dueño no se puede eliminar.' } };
        }
        const used = (d.prepare('SELECT COUNT(*) AS n FROM access_pins WHERE role = ?').get(t.id) as any)?.n ?? 0;
        if (used > 0) {
          return { data: null, error: { code: 'ROLE_IN_USE', message: 'No se puede eliminar un rol que tiene PINs asociados.' } };
        }
      }
    }
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

// Ejecuta una lista de escrituras DENTRO de una única transacción SQLite.
// Si cualquiera falla, se revierte todo (rollback) y se devuelve el error.
// Cada comando sigue el mismo contrato que /api/query (métodos writeRows).
export function runBatchWrite(
  commands: { table: string; method: 'insert' | 'upsert' | 'update' | 'delete'; data?: any; filters?: Filter[]; onConflict?: string }[]
): { data: any; error?: any } {
  try {
    const results = transaction(() => {
      const out: any[] = [];
      for (const c of commands) {
        const r = writeRows({ table: c.table, method: c.method, data: c.data, filters: c.filters, onConflict: c.onConflict });
        if (r.error) throw r.error;
        out.push(r.data);
      }
      return out;
    });
    return { data: results };
  } catch (e: any) {
    return { data: null, error: { code: 'BATCH_FAILED', message: e?.message || 'Error en la transacción' } };
  }
}
