// Servidor local Fastify embebido (InventarioY Desktop)
import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  selectRows,
  writeRows,
  runRaw,
  queryRaw,
  getRaw,
  transaction,
  runBatchWrite,
  getDataDir,
  type Filter,
  type Order,
} from '../db';
import {
  getLicenseState,
  getTrialEnd,
  verifyLicenseKey,
  TRIAL_DAYS,
  loadPrivateKey,
  generateLicenseKey,
  computeValidUntil,
  formatLicenseKey,
  generatePinResetKey,
  verifyPinResetKey,
  type LicenseState,
} from './license';

export interface ServerConfig {
  port: number;
  host?: string;
  staticDir?: string;
  documentsDir?: string;
  appPath?: string;
}

interface QueryCommand {
  table: string;
  method: 'select' | 'insert' | 'upsert' | 'update' | 'delete';
  columns?: string;
  filters?: Filter[];
  orders?: Order[];
  limit?: number | null;
  range?: [number, number] | null;
  single?: boolean;
  maybeSingle?: boolean;
  count?: 'exact' | 'planned' | 'estimated' | null;
  head?: boolean;
  data?: any;
  onConflict?: string;
}

const PIN_SALT = 'inventarioy_pin_salt';

function hashPin(pin: string): string {
  return createHash('sha256').update(pin + PIN_SALT).digest('hex');
}

// ---------- PIN con scrypt (KDF lento) ----------
// Formato: scrypt$<saltHex>$<hashHex>. Sustituye al hash sha256+salt anterior.
function hashPinScrypt(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(String(pin), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

// Verifica un PIN contra un hash scrypt o legacy (sha256+salt).
// Devuelve true si coincide; el llamador puede migrar el hash legacy a scrypt.
function verifyPinHash(pin: string, stored: string): boolean {
  if (!stored) return false;
  if (stored.startsWith('scrypt$')) {
    const [, saltHex, hashHex] = stored.split('$');
    if (!saltHex || !hashHex) return false;
    try {
      const expected = Buffer.from(hashHex, 'hex');
      const actual = scryptSync(String(pin), Buffer.from(saltHex, 'hex'), expected.length);
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
  // Legacy SHA-256: comparación timing-safe + warning
  const legacyHash = hashPin(pin);
  const a = Buffer.from(legacyHash, 'hex');
  const b = Buffer.from(stored, 'hex');
  if (a.length !== b.length) return false;
  const match = timingSafeEqual(a, b);
  if (match) {
    console.warn('[SEC] PIN con hash legacy SHA-256 detectado. Re-configurar el PIN desde el panel de administración para migrar a scrypt.');
  }
  return match;
}

// ---------- Token de sesión local ----------
// Protege los endpoints de escritura: solo el renderer (que obtiene el token
// vía /api/auth/login o /api/auth/setup) puede escribir.
const AUTH_TOKEN_KEY = 'auth_token';

function getOrCreateToken(): string {
  const row = getRaw<any>('SELECT value FROM settings WHERE key = ?', [AUTH_TOKEN_KEY]);
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (typeof parsed === 'string' && parsed.length >= 16) return parsed;
    } catch { /* se regenera */ }
  }
  const token = randomBytes(32).toString('hex');
  runRaw(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [AUTH_TOKEN_KEY, JSON.stringify(token), new Date().toISOString()]
  );
  return token;
}

// ---------- Rol verificado en servidor ----------
// El rol de escritura NO se toma de un header del cliente (forjable). Se guarda
// en el servidor al verificar exitosamente un PIN (login o verify_access_pin) y
// se usa para autorizar /api/query. El header x-inventarioy-role se ignora.
const ACTIVE_ROLE_KEY = 'active_session_role';

function setActiveRole(role: string): void {
  runRaw(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [ACTIVE_ROLE_KEY, JSON.stringify(role), new Date().toISOString()]
  );
}

function getActiveRole(): string | null {
  const row = getRaw<any>('SELECT value FROM settings WHERE key = ?', [ACTIVE_ROLE_KEY]);
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value);
    return (typeof parsed === 'string' && roleExists(parsed)) ? parsed : null;
  } catch { return null; }
}

function clearActiveRole(): void {
  runRaw('DELETE FROM settings WHERE key = ?', [ACTIVE_ROLE_KEY]);
}

// ---------- Validación de Origin (anti-CSRF / DNS rebinding) ----------
// Hosts de loopback + IPs LAN propias del servidor (para tablets/celulares por WiFi).
const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function localHostnames(): string[] {
  const nets = os.networkInterfaces();
  const out: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

// Las escrituras deben venir de la propia app (loopback, Vite dev o LAN del servidor)
// con un Origin HTTP/HTTPS válido. Sin Origin => se rechaza (evita CSRF desde la red).
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname;
    if (LOCAL_HOSTNAMES.has(host)) return true;
    return localHostnames().includes(host);
  } catch {
    return false;
  }
}

// ---------- CSP para el build de producción ----------
const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function requireToken(request: any, reply: any): boolean {
  const provided = String(request.headers?.['x-inventarioy-token'] || '');
  const expected = getOrCreateToken();
  if (!provided || provided !== expected) {
    reply.code(401).send({ data: null, error: { message: 'No autorizado', code: 'UNAUTHORIZED' } });
    return false;
  }
  return true;
}

function formatBlockRemaining(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s >= 60) {
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${mins} min ${rem} s` : `${mins} min`;
  }
  return `${s} s`;
}

// ---------- Rate limiting simple (login / verificación de PIN) ----------
// El lockout por PIN (3 intentos/5 min) ya mitiga la fuerza bruta, pero este
// límite por IP reduce además abuso a la API (login, verify, setup) desde la LAN.
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX = 30;              // máx. 30 llamadas por minuto por IP

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(request: any): boolean {
  const ip = String(request.ip || 'unknown');
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) return true;
  return false;
}

function rateLimitReply(reply: any) {
  return reply.code(429).send({
    data: null,
    error: { message: 'Demasiadas solicitudes. Intente de nuevo en un minuto.', code: 'RATE_LIMITED' },
  });
}

// Roles legados conocidos (claves históricas). La fuente de verdad son los
// módulos por rol en la tabla `roles`; estos mapas son solo fallback.
const ROLE_LABELS: Record<string, string> = {
  owner: 'Dueño/a',
  economist: 'Económico/a',
  admin: 'Administrador/a',
  supervisor: 'Supervisor/a',
  clerk: 'Dependiente/a',
};

const LEGACY_ROLE_MODULES: Record<string, string[]> = {
  owner: ['sales', 'inventory', 'movements', 'transit', 'recipes', 'consumption', 'closings', 'charts', 'analysis', 'filtered', 'hr', 'settings'],
  economist: ['sales', 'inventory', 'movements', 'transit', 'recipes', 'consumption', 'closings', 'charts', 'analysis', 'filtered', 'hr', 'settings'],
  admin: ['inventory', 'movements', 'transit'],
  supervisor: ['sales', 'closings'],
  clerk: ['sales'],
};

const ALL_KNOWN_ROLES = new Set(['owner', 'economist', 'admin', 'supervisor', 'clerk']);

// Módulo por ruta de dashboard: se usa para verificar que el PIN tiene acceso
// al módulo (verify_access_pin). Las rutas sin mapeo no exigen módulo.
const MODULE_BY_PATH: Record<string, string> = {
  '/inventory': 'inventory',
  '/movements': 'movements',
  '/transit': 'transit',
  '/sales': 'sales',
  '/closings': 'closings',
  '/hr': 'hr',
  '/recipes': 'recipes',
  '/consumption': 'consumption',
  '/analysis': 'analysis',
  '/charts': 'charts',
  '/filtered': 'filtered',
  '/settings': 'settings',
  '/action-logs': 'hr',
};

function getRoleModules(roleId: string): string[] {
  const row = getRaw<any>('SELECT modules FROM roles WHERE id = ? AND is_active = 1', [roleId]);
  if (row?.modules) {
    try {
      const parsed = JSON.parse(row.modules);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* se usa fallback */ }
  }
  return LEGACY_ROLE_MODULES[roleId] || [];
}

function getRoleName(roleId: string): string {
  const row = getRaw<any>('SELECT name FROM roles WHERE id = ?', [roleId]);
  if (row?.name) return row.name;
  return ROLE_LABELS[roleId] || roleId;
}

function roleExists(roleId: string): boolean {
  if (ALL_KNOWN_ROLES.has(roleId)) return true;
  const row = getRaw<any>('SELECT 1 FROM roles WHERE id = ?', [roleId]);
  return !!row;
}

// ---------- Roles: qué tablas puede escribir cada rol vía /api/query ----------
// Cada tabla se asocia a un MÓDULO del rol verificado (roles.modules).
// El dueño pasa todo. Tablas sin regla (o `null`) no se restringen.
type TableModuleRule = string | string[] | null | { insert?: string | string[]; update?: string | string[]; delete?: string | string[] };

const TABLE_MODULES: Record<string, TableModuleRule> = {
  // Ventas + flujo de caja: requiere módulo "sales"
  sales: 'sales',
  sale_items: 'sales',
  pending_accounts: 'sales',
  payments: 'sales',
  // products/movements/transit/product_warehouse son tablas operativas que
  // varias acciones escriben en conjunto (alta de producto, entrada/salida,
  // merma, devolución desde tránsito, consumo por venta). Se permite el módulo
  // que origina la acción para que cualquier combinación de módulos sea
  // coherente y no deje estados parciales.
  products: ['inventory', 'sales', 'transit'],
  movements: ['sales', 'inventory', 'transit'],
  // Tránsito: quien hace salidas (inventario) crea tránsito; quien vende lo
  // consume (update/delete) con "transit" o "sales".
  transit_items: {
    insert: ['transit', 'inventory'],
    update: ['transit', 'sales'],
    delete: ['transit', 'sales'],
  },
  // Inventario / estructura
  categories: 'inventory',
  warehouses: 'inventory',
  product_warehouse: ['inventory', 'sales', 'transit'],
  // Cierres
  daily_closings: 'closings',
  // RRHH / nómina / recetas
  employees: 'hr',
  departments: 'hr',
  hr_documents: 'hr',
  employee_documents: 'hr',
  payroll_config: 'hr',
  payroll_entries: 'hr',
  employee_loans: 'hr',
  payroll_liquidations: 'hr',
  employee_vacation_movements: 'hr',
  payroll_periods: 'hr',
  payroll_drafts: 'hr',
  recipes: 'recipes',
  recipe_ingredients: 'recipes',
  // Auditoría: todos los roles registran acciones
  action_logs: null,
  // Configuración: solo dueño (módulo "settings" exclusivo del dueño)
  access_pins: 'settings',
  settings: 'settings',
  user_session: 'settings',
  profiles: 'settings',
};

// El rol de escritura se obtiene del rol verificado en el servidor (active_session_role),
// establecido tras un login/verify exitoso. NO se confía en el header x-inventarioy-role.
// Fallback: si aún no hay rol verificado (p. ej. actualización en caliente con sesión
// persistida), se usa el rol del owner — alcanzable solo con token válido (requireToken).
function getRequestRole(request: any): string | null {
  const active = getActiveRole();
  if (active) return active;
  const session = getRaw<any>('SELECT role FROM user_session WHERE id = ?', ['owner']);
  const fallback = session?.role || 'owner';
  return roleExists(fallback) ? fallback : null;
}

function roleAllowed(table: string, method: string, role: string): boolean {
  if (role === 'owner') return true; // el dueño siempre puede
  const rule = TABLE_MODULES[table];
  if (rule === undefined || rule === null) return true; // tablas sin regla: sin restricción
  const moduleKey = typeof rule === 'string' ? rule : (rule as any)[method as 'insert' | 'update' | 'delete'];
  if (!moduleKey) return true;
  const modules = getRoleModules(role);
  if (Array.isArray(moduleKey)) return moduleKey.some(m => modules.includes(m));
  return modules.includes(moduleKey);
}

function serializeRow(row: any): any {
  if (!row || typeof row !== 'object') return row;
  const out: any = { ...row };
  for (const key of ['items', 'details', 'recipe_snapshot', 'ingredients']) {
    if (key in out && typeof out[key] === 'string') {
      try { out[key] = JSON.parse(out[key]); } catch { /* keep */ }
    }
  }
  // Normalizar campos booleanos: node:sqlite devuelve INTEGER 0/1, y el resto
  // de la app espera booleanos. Evita bugs del tipo `is_active !== false` que
  // no excluyen a los inactivos porque `0 !== false` es `true`.
  for (const key of ['is_active', 'is_individual', 'is_gasto_variable', 'is_consumo_directo', 'is_recipe', 'is_account_house', 'is_main', 'is_custom']) {
    if (key in out) out[key] = !!out[key];
  }
  return out;
}

function quoteIdent(col: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(col)) return `"${col}"`;
  return col;
}

// ---------- Licencia desktop ----------
const LICENSE_MAX_SEEN_KEY = 'license_max_seen_time';

function getLicenseSettings() {
  const row = getRaw<any>('SELECT value FROM settings WHERE key = ?', [LICENSE_MAX_SEEN_KEY]);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

function touchMaxSeenTime(now: string): void {
  const current = getLicenseSettings();
  if (current && new Date(current) >= new Date(now)) return;
  runRaw(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [LICENSE_MAX_SEEN_KEY, JSON.stringify(now), now]
  );
}

function computeLicenseState(): LicenseState {
  const session = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
  const maxSeen = getLicenseSettings();
  return getLicenseState(session, maxSeen);
}

// Ruta de scripts/ de la app (solo presente en la máquina del vendedor).
let appPathHint: string | undefined;

function getPrivateKey(): string | null {
  return loadPrivateKey(getDataDir(), appPathHint);
}

// Lista blanca de tablas/endpoints que se siguen pudiendo escribir estando vencido.
const LICENSE_WHITELIST_TABLES = new Set(['settings']);

function isWriteBlockedByLicense(): boolean {
  const state = computeLicenseState();
  return state.status === 'expired';
}

// Columnas de licencia y autenticación que NUNCA pueden modificarse vía /api/query.
// El estado de licencia solo cambia por endpoints dedicados (/api/license/activate,
// /api/auth/setup). Impide que el cliente se auto-conceda una licencia vitalicia.
const PROTECTED_LICENSE_COLUMNS = new Set([
  'license_key',
  'license_valid_until',
  'license_activated_at',
  'trial_started_at',
]);
const PROTECTED_SETTINGS_KEYS = new Set([AUTH_TOKEN_KEY, LICENSE_MAX_SEEN_KEY, ACTIVE_ROLE_KEY]);

// Elimina del payload las columnas protegidas de la tabla antes de escribir.
function sanitizeWriteData(table: string, data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map((row: any) => sanitizeWriteData(table, row));
  const out: any = { ...data };
  if (table === 'user_session') {
    for (const col of PROTECTED_LICENSE_COLUMNS) delete out[col];
  }
  if (table === 'settings' && typeof out.key === 'string') {
    if (PROTECTED_SETTINGS_KEYS.has(out.key)) return null;
  }
  return out;
}

// Detecta escrituras sobre claves protegidas de `settings`, tanto si la clave viaja
// en el payload (insert/update) como si se selecciona por filtro (update/delete por WHERE).
function isProtectedSettingsWrite(table: string, data: any, filters?: Filter[]): boolean {
  if (table !== 'settings') return false;
  const rows = Array.isArray(data) ? data : [data];
  const keys: string[] = [];
  for (const row of rows) {
    if (row && typeof row.key === 'string') keys.push(row.key);
  }
  for (const f of filters || []) {
    if (f.op === 'eq' && f.column === 'key' && typeof f.value === 'string') keys.push(f.value);
  }
  return keys.some((k) => PROTECTED_SETTINGS_KEYS.has(k));
}


function extractJoins(columns: string): string[] {
  const joins: string[] = [];
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)\(\*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(columns)) !== null) {
    if (m[1] !== '*') joins.push(m[1]);
  }
  return joins;
}

function buildWhereLocal(filters: Filter[]): { where: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  for (const f of filters) {
    switch (f.op) {
      case 'eq':
        parts.push(`${quoteIdent(f.column)} = ?`);
        params.push(f.value);
        break;
      case 'neq':
        parts.push(`${quoteIdent(f.column)} != ?`);
        params.push(f.value);
        break;
      case 'gt':
        parts.push(`${quoteIdent(f.column)} > ?`);
        params.push(f.value);
        break;
      case 'gte':
        parts.push(`${quoteIdent(f.column)} >= ?`);
        params.push(f.value);
        break;
      case 'lt':
        parts.push(`${quoteIdent(f.column)} < ?`);
        params.push(f.value);
        break;
      case 'lte':
        parts.push(`${quoteIdent(f.column)} <= ?`);
        params.push(f.value);
        break;
      case 'in': {
        const arr = Array.isArray(f.value) ? f.value : [f.value];
        parts.push(`${quoteIdent(f.column)} IN (${arr.map(() => '?').join(', ')})`);
        params.push(...arr);
        break;
      }
      case 'ilike':
        parts.push(`${quoteIdent(f.column)} LIKE ? COLLATE NOCASE`);
        params.push(`%${f.value}%`);
        break;
      case 'is':
        if (f.value === null) parts.push(`${quoteIdent(f.column)} IS NULL`);
        else { parts.push(`${quoteIdent(f.column)} = ?`); params.push(f.value); }
        break;
      default:
        break;
    }
  }
  return { where: parts.length ? parts.join(' AND ') : '', params };
}

export async function createServer(config: ServerConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: 50 * 1024 * 1024, // 50MB para base64 de documentos
  });

  const documentsDir = config.documentsDir || path.join(getDataDir(), 'documents');
  fs.mkdirSync(documentsDir, { recursive: true });

  appPathHint = config.appPath;

  // Anti-CSRF / DNS rebinding: GET/HEAD quedan públicos (QR menu, meta); las escrituras
  // exigen un Origin local válido (app de escritorio, proxy de Vite o LAN del servidor).
  app.addHook('onRequest', async (request, reply) => {
    if ((request.url || '').startsWith('/api/') && request.method !== 'GET' && request.method !== 'HEAD') {
      if (!isAllowedOrigin(request.headers.origin as string | undefined)) {
        return reply.code(403).send({ data: null, error: { message: 'Origen no permitido', code: 'FORBIDDEN_ORIGIN' } });
      }
    }
  });

  // ---------- API: health ----------
  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  // ---------- API: meta (para multi-PC: IP y negocio) ----------
  app.get('/api/meta', async () => {
    const session = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
    const nets = os.networkInterfaces();
    const ips: string[] = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
      }
    }
    return {
      businessName: session?.businessName || '',
      businessCode: session?.business_code || '',
      ips,
      port: config.port,
    };
  });

  // ---------- API: menú público (QR) ----------
  app.get('/api/menu-data', async (request, reply) => {
    const { b } = (request.query as { b?: string }) || {};
    if (!b) {
      return reply.code(400).send({ data: null, error: { message: 'Falta el parámetro b' } });
    }
    try {
      const products = queryRaw<any>(
        'SELECT id, name, price, category, quantity, is_individual, is_active FROM products WHERE user_id = ? AND is_active = 1 ORDER BY name',
        [b]
      );
      const recipes = queryRaw<any>(
        'SELECT id, name, selling_price FROM recipes WHERE user_id = ? ORDER BY name',
        [b]
      ).map((r: any) => ({ ...r, category: null, is_active: 1 }));
      const categories = queryRaw<any>(
        'SELECT id, name FROM categories WHERE user_id = ? ORDER BY name',
        [b]
      );
      const profile = queryRaw<any>(
        'SELECT businessName, phone, address, businessHours FROM user_session WHERE id = ?',
        [b]
      )[0] || null;
      return { data: { products, recipes, categories, profile }, error: null };
    } catch (e: any) {
      return reply.code(500).send({ data: null, error: { message: e?.message || 'Error al cargar el menú', code: 'MENU_ERROR' } });
    }
  });

  // ---------- API: query genérica (SQLite) ----------
  app.post('/api/query', async (request, reply) => {
    if (!requireToken(request, reply)) return;
    const q = request.body as QueryCommand;
    if (!q?.table) {
      return reply.code(400).send({ data: null, error: { message: 'Falta tabla' } });
    }
    try {
      if (q.method === 'select') {
        // Detectar joins anidados: '*, sale_items(*)' o 'sale_items(*)'
        const joins = extractJoins(q.columns || '*');
        const { data: rows } = selectRows({
          table: q.table,
          columns: '*',
          filters: q.filters || [],
          orders: q.orders || [],
          limit: q.limit ?? null,
          single: q.single,
          maybeSingle: q.maybeSingle,
        });

        let data: any = rows;
        let count: number | null = null;

        // range + count
        if (q.range) {
          const [start, end] = q.range;
          data = data.slice(start, end + 1);
        }
        if (q.count === 'exact') {
          const { where, params } = buildWhereLocal(q.filters || []);
          const base = `FROM ${quoteIdent(q.table)}${where ? ` WHERE ${where}` : ''}`;
          const cRow = getRaw<any>(`SELECT COUNT(*) AS n ${base}`, params);
          count = cRow?.n ?? 0;
        }

        // Resolver joins
        if (joins.length) {
          for (const join of joins) {
            const fkMap: Record<string, string> = {
              sale_items: 'sale_id',
              recipe_ingredients: 'recipe_id',
              employee_documents: 'employee_id',
            };
            const fk = fkMap[join];
            if (!fk) continue;
            const parentIds = (data as any[]).map((r: any) => r.id).filter(Boolean);
            if (!parentIds.length) continue;
            const childRows = queryRaw<any>(
              `SELECT * FROM ${quoteIdent(join)} WHERE ${quoteIdent(fk)} IN (${parentIds.map(() => '?').join(',')})`,
              parentIds
            );
            const byParent: Record<string, any[]> = {};
            for (const c of childRows) {
              const pid = c[fk];
              (byParent[pid] = byParent[pid] || []).push(serializeRow(c));
            }
            for (const r of data) {
              r[join] = byParent[r.id] || [];
            }
          }
        }

        const result = q.single || q.maybeSingle ? data[0] ?? null : data;
        const payload = result === null ? null : (Array.isArray(result) ? result.map(serializeRow) : serializeRow(result));
        if (q.head) {
          return { data: null, count, error: null };
        }
        return { data: payload, count: count === null ? undefined : count, error: null };
      }

      if (q.method === 'insert' || q.method === 'upsert' || q.method === 'update' || q.method === 'delete') {
        if (isWriteBlockedByLicense() && !LICENSE_WHITELIST_TABLES.has(q.table)) {
          return reply.code(403).send({
            data: null,
            error: { message: 'Tu licencia de InventarioY está vencida. No se pudo guardar el cambio. Activa tu licencia para volver a editar.', code: 'LICENSE_EXPIRED' },
          });
        }
        const role = getRequestRole(request);
        if (role === null) {
          return reply.code(403).send({ data: null, error: { message: 'No hay sesión verificada. Inicie sesión nuevamente.', code: 'ROLE_FORBIDDEN' } });
        }
        if (!roleAllowed(q.table, q.method, role)) {
          return reply.code(403).send({
            data: null,
            error: { message: 'Tu rol no tiene permiso para modificar este dato.', code: 'ROLE_FORBIDDEN' },
          });
        }
        const sanitized = sanitizeWriteData(q.table, q.data);
        // Los deletes no llevan data (null): el guard solo aplica a insert/update de
        // configuraciones protegidas. Sin esta exención, TODO borrado devolvía FORBIDDEN_SETTING.
        if (q.method !== 'delete' && sanitized === null) {
          return reply.code(403).send({
            data: null,
            error: { message: 'No se permite modificar esta configuración por esta vía.', code: 'FORBIDDEN_SETTING' },
          });
        }
        if (isProtectedSettingsWrite(q.table, q.data, q.filters)) {
          return reply.code(403).send({
            data: null,
            error: { message: 'No se permite modificar esta configuración por esta vía.', code: 'FORBIDDEN_SETTING' },
          });
        }
        const res = writeRows({
          table: q.table,
          method: q.method,
          data: sanitized,
          filters: q.filters || [],
          onConflict: q.onConflict,
        });
        if (res.error) {
          return { data: null, error: res.error };
        }
        return { data: Array.isArray(res.data) ? res.data.map(serializeRow) : serializeRow(res.data), error: null };
      }

      return reply.code(400).send({ data: null, error: { message: 'Método no soportado' } });
    } catch (e: any) {
      return reply.code(500).send({ data: null, error: { message: e?.message || 'Error interno' } });
    }
  });

  // ---------- API: query en lote (transaccional) ----------
  // Ejecuta varias escrituras dentro de UNA transacción SQLite: si alguna falla,
  // se revierte todo (rollback). Se usa en los flujos críticos (venta, movimiento,
  // nómina) para no dejar estados inconsistentes (venta sin stock, stock sin venta).
  app.post('/api/query/batch', async (request, reply) => {
    if (!requireToken(request, reply)) return;
    const body = (request.body || {}) as { commands?: QueryCommand[] };
    const commands = Array.isArray(body.commands) ? body.commands : [];
    if (commands.length === 0) {
      return reply.code(400).send({ data: null, error: { message: 'Faltan comandos' } });
    }
    if (isWriteBlockedByLicense() && commands.some(c => !LICENSE_WHITELIST_TABLES.has(c.table))) {
      return reply.code(403).send({
        data: null,
        error: { message: 'Tu licencia de InventarioY está vencida. No se pudo guardar el cambio. Activa tu licencia para volver a editar.', code: 'LICENSE_EXPIRED' },
      });
    }
    const role = getRequestRole(request);
    if (role === null) {
      return reply.code(403).send({ data: null, error: { message: 'No hay sesión verificada. Inicie sesión nuevamente.', code: 'ROLE_FORBIDDEN' } });
    }
    // Validar permisos y sanear cada comando antes de ejecutar la transacción.
    const sanitizedCommands: { table: string; method: 'insert' | 'upsert' | 'update' | 'delete'; data?: any; filters?: Filter[]; onConflict?: string }[] = [];
    for (const c of commands) {
      const writeMethod = c.method as 'insert' | 'upsert' | 'update' | 'delete';
      if (!['insert', 'upsert', 'update', 'delete'].includes(c.method)) {
        return reply.code(400).send({ data: null, error: { message: 'Comando inválido' } });
      }
      if (!roleAllowed(c.table, writeMethod, role)) {
        return reply.code(403).send({
          data: null,
          error: { message: `Tu rol no tiene permiso para modificar ${c.table}.`, code: 'ROLE_FORBIDDEN' },
        });
      }
      const sanitized = sanitizeWriteData(c.table, c.data);
      if (c.method !== 'delete' && sanitized === null) {
        return reply.code(403).send({
          data: null,
          error: { message: 'No se permite modificar esta configuración por esta vía.', code: 'FORBIDDEN_SETTING' },
        });
      }
      if (isProtectedSettingsWrite(c.table, c.data, c.filters)) {
        return reply.code(403).send({
          data: null,
          error: { message: 'No se permite modificar esta configuración por esta vía.', code: 'FORBIDDEN_SETTING' },
        });
      }
      sanitizedCommands.push({ table: c.table, method: writeMethod, data: sanitized, filters: c.filters, onConflict: c.onConflict });
    }
    try {
      const res = runBatchWrite(sanitizedCommands);
      if (res.error) return { data: null, error: res.error };
      return { data: { success: true }, error: null };
    } catch (e: any) {
      return reply.code(500).send({ data: null, error: { message: e?.message || 'Error interno' } });
    }
  });

  // ---------- API: RPC (verify_access_pin local) ----------
  app.post('/api/rpc', async (request, reply) => {
    if (!requireToken(request, reply)) return;
    const { fn, args } = request.body as { fn: string; args: any };
    if (fn === 'verify_access_pin') {
      if (isRateLimited(request)) return rateLimitReply(reply);
      const pin = String(args?.p_pin || '');
      const modulePath = String(args?.p_module_path || '');
      const pins = queryRaw<any>('SELECT * FROM access_pins WHERE is_active = 1');
      const moduleKey = MODULE_BY_PATH[modulePath]; // undefined => sin exigencia de módulo
      const target = pins.find((p: any) => verifyPinHash(pin, p.pin_hash));
      if (!target) {
        const first = pins[0];
        if (first) {
          const attempts = (first.failed_attempts || 0) + 1;
          const blocked = attempts >= 3;
          const blockedUntil = blocked ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
          runRaw('UPDATE access_pins SET failed_attempts = ?, blocked_until = ? WHERE id = ?', [attempts, blockedUntil, first.id]);
          return {
            data: {
              success: false,
              error: blocked ? 'PIN bloqueado por 3 intentos fallidos. Intente de nuevo en 5 min.' : 'PIN incorrecto',
              blocked,
              remaining_seconds: blocked ? 300 : 0,
            },
            error: null,
          };
        }
        return { data: { success: false, error: 'No hay pines configurados' }, error: null };
      }
      if (target.blocked_until && new Date(target.blocked_until) > new Date()) {
        const remaining = Math.ceil((new Date(target.blocked_until).getTime() - Date.now()) / 1000);
        return { data: { success: false, error: `PIN bloqueado. Intente de nuevo en ${formatBlockRemaining(remaining)}.`, blocked: true, remaining_seconds: remaining }, error: null };
      }
      const modules = getRoleModules(target.role);
      if (moduleKey && !modules.includes(moduleKey)) {
        return { data: { success: false, error: 'Tu PIN no tiene acceso a este módulo' }, error: null };
      }
      runRaw('UPDATE access_pins SET failed_attempts = 0, blocked_until = NULL WHERE id = ?', [target.id]);
      if (!String(target.pin_hash).startsWith('scrypt$')) {
        runRaw('UPDATE access_pins SET pin_hash = ? WHERE id = ?', [hashPinScrypt(pin), target.id]);
      }
      setActiveRole(target.role);
      return { data: { success: true, role: target.role, role_name: getRoleName(target.role), modules, pin_name: target.pin_name }, error: null };
    }
    if (fn === 'save_access_pin') {
      // Crea o actualiza un PIN y (si se indica) un Rol reutilizable. El PIN se
      // hashea con scrypt EN EL SERVIDOR: el cliente jamás guarda el hash.
      // Solo el dueño (rol verificado) puede gestionar PINs.
      const callerRole = getRequestRole(request);
      if (callerRole !== 'owner') {
        return { data: { success: false, error: 'Solo el dueño puede gestionar los PINs' }, error: null };
      }
      const roleId = args?.roleId ? String(args.roleId) : null;
      const roleName = String(args?.roleName || '').trim();
      const rawModules = Array.isArray(args?.modules) ? args.modules.map(String) : [];
      const isOwnerRole = roleId === 'owner';
      // Configuración está reservado al Dueño/a; el Dueño/a siempre tiene todos los módulos.
      const modules = isOwnerRole ? getRoleModules('owner') : rawModules.filter((m: string) => m !== 'settings');
      const pin = String(args?.pin || '');
      const name = String(args?.name || '').trim();
      let pinId = args?.pinId ? String(args.pinId) : null;
      if (!/^\d{4}$/.test(pin)) {
        return { data: { success: false, error: 'El PIN debe tener exactamente 4 dígitos' }, error: null };
      }
      if (!name) {
        return { data: { success: false, error: 'El nombre es obligatorio' }, error: null };
      }
      let finalRole = roleId;
      let isNewRole = false;
      if (!finalRole) {
        // Crear nuevo rol reutilizable
        if (!roleName) {
          return { data: { success: false, error: 'El nombre del rol es obligatorio' }, error: null };
        }
        if (modules.length === 0) {
          return { data: { success: false, error: 'Seleccione al menos un módulo' }, error: null };
        }
        finalRole = crypto.randomUUID();
        isNewRole = true;
      } else if (!roleExists(finalRole)) {
        return { data: { success: false, error: 'El rol seleccionado no existe' }, error: null };
      }
      // Si se crea/edita el dueño, se reutiliza el PIN del dueño existente.
      if (finalRole === 'owner' && !pinId) {
        const ownerPin = getRaw<any>('SELECT id FROM access_pins WHERE role = ? AND is_active = 1 ORDER BY created_at LIMIT 1', ['owner']);
        pinId = ownerPin?.id || null;
      }
      // Un mismo PIN no puede estar asignado a dos usuarios activos.
      // Los hashes tienen salt, así que se verifica contra cada PIN existente.
      const duplicate = queryRaw<any>('SELECT id, pin_hash FROM access_pins WHERE is_active = 1')
        .find((p: any) => p.id !== pinId && verifyPinHash(pin, p.pin_hash));
      if (duplicate) {
        return { data: { success: false, error: 'Ese PIN ya está en uso por otro usuario. Elija un PIN diferente.' }, error: null };
      }
      // Las escrituras solo ocurren después de todas las validaciones,
      // para no dejar roles huérfanos si algo se rechaza.
      if (isNewRole) {
        const now = new Date().toISOString();
        runRaw(
          `INSERT INTO roles (id, user_id, name, modules, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [finalRole, 'owner', roleName, JSON.stringify([...new Set(modules)]), now, now]
        );
      }
      // Si se editó un rol existente, actualizar sus módulos (propaga a todos los PINs).
      if (finalRole !== 'owner' && modules.length > 0) {
        runRaw('UPDATE roles SET modules = ?, updated_at = ? WHERE id = ?', [JSON.stringify([...new Set(modules)]), new Date().toISOString(), finalRole]);
      }
      if (pinId) {
        runRaw('UPDATE access_pins SET pin_hash = ?, role = ?, pin_name = ?, is_active = 1, failed_attempts = 0, blocked_until = NULL WHERE id = ?', [hashPinScrypt(pin), finalRole, name, pinId]);
      } else {
        runRaw(
          `INSERT INTO access_pins (id, user_id, pin_hash, role, pin_name, is_active, failed_attempts, blocked_until, created_at)
           VALUES (?, ?, ?, ?, ?, 1, 0, NULL, ?)`,
          [crypto.randomUUID(), 'owner', hashPinScrypt(pin), finalRole, name, new Date().toISOString()]
        );
      }
      return { data: { success: true }, error: null };
    }
    if (fn === 'get_public_stats') {
      const count = (t: string) => {
        try { return queryRaw<{ c: number }>(`SELECT COUNT(*) AS c FROM ${quoteIdent(t)}`)[0]?.c ?? 0; } catch { return 0; }
      };
      return {
        data: {
          products: count('products'),
          movements: count('movements'),
          sales: count('sales'),
          users: count('user_session'),
        },
        error: null,
      };
    }
    return reply.code(400).send({ data: null, error: { message: `RPC desconocida: ${fn}` } });
  });

  // ---------- API: storage de documentos ----------
  app.post('/api/storage/upload', async (request, reply) => {
    if (!requireToken(request, reply)) return;
    const { path: filePath, base64, contentType } = request.body as { path: string; base64: string; contentType?: string };
    if (!filePath || !base64) return reply.code(400).send({ error: { message: 'Faltan path o base64' } });
    if (isWriteBlockedByLicense()) {
      return reply.code(403).send({
        data: null,
        error: { message: 'Tu licencia de InventarioY está vencida. No se permiten cambios hasta renovar.', code: 'LICENSE_EXPIRED' },
      });
    }
    try {
      const safePath = path.normalize(filePath).replace(/^(\.\.[\\/])+/, '');
      const full = path.join(documentsDir, safePath);
      if (!full.startsWith(documentsDir)) {
        return reply.code(400).send({ error: { message: 'Ruta no válida' } });
      }
      fs.mkdirSync(path.dirname(full), { recursive: true });
      const buf = Buffer.from(base64, 'base64');
      fs.writeFileSync(full, buf);
      return { data: { path: filePath }, error: null };
    } catch (e: any) {
      return reply.code(500).send({ data: null, error: { message: e?.message || 'Error al subir archivo' } });
    }
  });

  app.get('/api/storage/download', async (request, reply) => {
    const filePath = String((request.query as any)?.path || '');
    try {
      const safePath = path.normalize(filePath).replace(/^(\.\.[\\/])+/, '');
      const full = path.join(documentsDir, safePath);
      if (!full.startsWith(documentsDir)) {
        return reply.code(400).send({ error: { message: 'Ruta no válida' } });
      }
      if (!fs.existsSync(full)) return reply.code(404).send({ error: { message: 'Archivo no encontrado' } });
      const buf = fs.readFileSync(full);
      const ext = path.extname(full).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.webp': 'image/webp', '.gif': 'image/gif', '.txt': 'text/plain',
      };
      reply.header('Content-Type', mimeMap[ext] || 'application/octet-stream');
      return reply.send(buf);
    } catch (e: any) {
      return reply.code(500).send({ error: { message: e?.message || 'Error' } });
    }
  });

  app.post('/api/storage/remove', async (request, reply) => {
    if (!requireToken(request, reply)) return;
    const { paths } = request.body as { paths: string[] };
    if (!Array.isArray(paths)) return reply.code(400).send({ error: { message: 'paths requerido' } });
    if (isWriteBlockedByLicense()) {
      return reply.code(403).send({
        data: null,
        error: { message: 'Tu licencia de InventarioY está vencida. No se permiten cambios hasta renovar.', code: 'LICENSE_EXPIRED' },
      });
    }
    for (const p of paths) {
      try {
        const safePath = path.normalize(p).replace(/^(\.\.[\\/])+/, '');
        const full = path.join(documentsDir, safePath);
        if (!full.startsWith(documentsDir)) continue;
        if (fs.existsSync(full)) fs.unlinkSync(full);
      } catch { /* ignore */ }
    }
    return { data: { message: 'ok' }, error: null };
  });

  // ---------- API: auth local (primer uso + sesión) ----------
  app.post('/api/auth/setup', async (request, reply) => {
    const { businessName, pin, phone, address, businessHours, ticketMessage } = request.body as any;
    if (!businessName || !pin) return reply.code(400).send({ error: { message: 'Faltan datos' } });
    if (!/^\d{4}$/.test(String(pin))) return reply.code(400).send({ error: { message: 'El PIN debe tener exactamente 4 dígitos' } });

    const existing = getRaw<any>('SELECT id FROM user_session WHERE id = ?', ['owner']);
    if (existing) {
      return reply.code(400).send({ error: { message: 'El negocio ya está configurado' } });
    }

    const now = new Date().toISOString();
    transaction(() => {
      runRaw(
        `INSERT INTO user_session (id, email, name, businessName, role, phone, address, businessHours,
          subscriptionActive, subscriptionPlan, ticketMessage, usdEnabled, usdRate, eurEnabled, eurRate,
          cupTransferEnabled, business_code, trial_started_at, created_at)
         VALUES ('owner', 'owner@local', ?, ?, 'owner', ?, ?, ?, 1, 'desktop', ?, 0, 0, 0, 0, 0, ?, ?, ?)`,
        [businessName, businessName, phone || '', address || '', businessHours || '', ticketMessage || '¡Gracias por su visita!', generateBusinessCode(), now, now]
      );
      const ownerId = 'owner';
      runRaw(
        `INSERT INTO access_pins (id, user_id, pin_hash, role, pin_name, is_active, failed_attempts, blocked_until, created_at)
         VALUES (?, ?, ?, 'owner', 'Dueño/a', 1, 0, NULL, ?)`,
         [crypto.randomUUID(), ownerId, hashPinScrypt(String(pin)), now]
      );
      runRaw(
        `INSERT INTO roles (id, user_id, name, modules, is_active, created_at, updated_at)
         VALUES ('owner', ?, 'Dueño/a', '["sales","inventory","movements","transit","recipes","consumption","closings","charts","analysis","filtered","hr","settings"]', 1, ?, ?)`,
        [ownerId, now, now]
      );
      runRaw(`INSERT INTO categories (id, user_id, name, created_at) VALUES (?, ?, 'General', ?)`, [crypto.randomUUID(), ownerId, now]);
      runRaw(`INSERT INTO warehouses (id, user_id, name, is_main, created_at) VALUES (?, ?, 'Almacén', 1, ?)`, [crypto.randomUUID(), ownerId, now]);
    });
    setActiveRole('owner');
    return { data: { success: true, token: getOrCreateToken() }, error: null };
  });

  app.post('/api/auth/login', async (request, reply) => {
    const { pin } = request.body as { pin?: string };

    if (!pin) return reply.code(400).send({ error: { message: 'Falta PIN' } });
    if (isRateLimited(request)) return rateLimitReply(reply);
    const pins = queryRaw<any>('SELECT * FROM access_pins WHERE is_active = 1');
    const target = pins.find((p: any) => verifyPinHash(String(pin), p.pin_hash));
    if (!target) {
      const first = pins[0];
      if (first) {
        const attempts = (first.failed_attempts || 0) + 1;
        const blocked = attempts >= 3;
        runRaw('UPDATE access_pins SET failed_attempts = ?, blocked_until = ? WHERE id = ?',
          [attempts, blocked ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null, first.id]);
        return reply.code(401).send({
          data: null,
          error: { message: blocked ? 'PIN bloqueado por 3 intentos fallidos. Intente de nuevo en 5 min.' : 'PIN incorrecto', blocked, remaining_seconds: blocked ? 300 : 0 },
        });
      }
      return reply.code(401).send({ data: null, error: { message: 'No hay pines configurados' } });
    }
    if (target.blocked_until && new Date(target.blocked_until) > new Date()) {
      const remaining = Math.ceil((new Date(target.blocked_until).getTime() - Date.now()) / 1000);
      return reply.code(401).send({ data: null, error: { message: `PIN bloqueado. Intente de nuevo en ${formatBlockRemaining(remaining)}.`, blocked: true, remaining_seconds: remaining } });
    }
    runRaw('UPDATE access_pins SET failed_attempts = 0, blocked_until = NULL WHERE id = ?', [target.id]);
    if (!String(target.pin_hash).startsWith('scrypt$')) {
      runRaw('UPDATE access_pins SET pin_hash = ? WHERE id = ?', [hashPinScrypt(String(pin)), target.id]);
    }
    setActiveRole(target.role);
    const session = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
    return {
      data: {
        success: true,
        session: serializeRow(session),
        pinRole: target.role,
        pinRoleName: getRoleName(target.role),
        pinModules: getRoleModules(target.role),
        pinName: target.pin_name,
        token: getOrCreateToken(),
      },
      error: null,
    };
  });

  app.get('/api/auth/session', async (request, reply) => {
    touchMaxSeenTime(new Date().toISOString());
    const session = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
    // El token de escritura se entrega solo a requests de confianza:
    //  - el renderer real (misma app: sin header Origin en same-origin GET), o
    //  - quien ya presenta el token (validación/renovación), o
    //  - un origin loopback/LAN permitido (tablets/celulares del negocio).
    // Un atacante por DNS rebinding envía Origin: http://attacker.com → rechazado.
    const origin = String(request.headers?.['origin'] || '');
    const provided = String(request.headers?.['x-inventarioy-token'] || '');
    const canGetToken =
      origin === '' ||                                    // same-origin real (la app)
      isAllowedOrigin(origin) ||                           // loopback/LAN del negocio
      (provided !== '' && provided === getOrCreateToken());
    return {
      data: {
        session: session ? serializeRow(session) : null,
        token: canGetToken ? getOrCreateToken() : null,
      },
      error: null,
    };
  });

  app.post('/api/auth/logout', async () => {
    clearActiveRole();
    return { data: { success: true }, error: null };
  });

  // Restablece el PIN del dueño con una clave firmada por el vendedor.
  // NO requiere token de sesión: es el flujo de recuperación cuando nadie puede entrar.
  // La clave es de un solo uso (verificado por hash SHA-256 en pin_reset_used),
  // está ligada al Código de Negocio y vence a las 24 h.
  app.post('/api/auth/reset-pin', async (request, reply) => {
    const { code, resetKey, newPin } = request.body as { code?: string; resetKey?: string; newPin?: string };
    if (!code || !resetKey || !newPin) {
      return reply.code(400).send({ data: null, error: { message: 'Faltan datos' } });
    }
    if (!/^\d{4}$/.test(String(newPin))) {
      return reply.code(400).send({ data: null, error: { message: 'El PIN debe tener exactamente 4 dígitos' } });
    }
    const session = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
    if (!session) {
      return reply.code(400).send({ data: null, error: { message: 'Primero configure el negocio' } });
    }
    const verified = verifyPinResetKey(String(resetKey), String(code));
    if (!verified.ok) {
      return reply.code(400).send({ data: null, error: { message: verified.error || 'Clave inválida' } });
    }
    const keyHash = createHash('sha256').update(String(resetKey).replace(/\s/g, '')).digest('hex');
    const alreadyUsed = getRaw<any>('SELECT key_hash FROM pin_reset_used WHERE key_hash = ?', [keyHash]);
    if (alreadyUsed) {
      return reply.code(400).send({ data: null, error: { message: 'Esta clave ya fue usada. Solicite una nueva al vendedor' } });
    }
    const now = new Date().toISOString();
    transaction(() => {
      runRaw(
        `UPDATE access_pins SET pin_hash = ?, failed_attempts = 0, blocked_until = NULL WHERE role = 'owner'`,
        [hashPinScrypt(String(newPin))]
      );
      runRaw('INSERT INTO pin_reset_used (key_hash, used_at) VALUES (?, ?)', [keyHash, now]);
    });
    return { data: { success: true }, error: null };
  });

  // ---------- API: licencia desktop (trial + clave de activación) ----------
  app.get('/api/license/status', async () => {
    const now = new Date().toISOString();
    touchMaxSeenTime(now);
    const session = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
    const maxSeen = getLicenseSettings();
    const state = getLicenseState(session, maxSeen);
    const privKey = getPrivateKey();
    return {
      data: {
        status: state.status,
        trialStartedAt: state.trialStartedAt,
        trialEndsAt: state.trialEndsAt,
        validUntil: state.validUntil,
        daysRemaining: state.daysRemaining,
        trialDays: TRIAL_DAYS,
        businessCode: session?.business_code || '',
        // Campos de herramienta de desarrollador (solo visibles cuando hay clave privada).
        isDeveloper: privKey !== null,
        hasLicenseKey: privKey !== null,
        maxSeenTime: maxSeen,
      },
      error: null,
    };
  });

  app.post('/api/license/activate', async (request, reply) => {
    if (!requireToken(request, reply)) return;
    const { key } = request.body as { key?: string };
    if (!key || !String(key).trim()) {
      return reply.code(400).send({ data: null, error: { message: 'Ingrese la clave de activación' } });
    }
    const session = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
    if (!session) {
      return reply.code(400).send({ data: null, error: { message: 'Primero configure el negocio' } });
    }
    const expectedCode = session.business_code || '';
    const result = verifyLicenseKey(String(key), expectedCode);
    if (!result.ok || !result.validUntil) {
      return reply.code(400).send({ data: null, error: { message: result.error || 'Clave inválida' } });
    }
    const now = new Date().toISOString();
    const validUntil = result.validUntil;
    // No permitir que una activación ACORTE una licencia vigente.
    if (session.license_valid_until) {
      const current = new Date(session.license_valid_until).getTime();
      const incoming = new Date(validUntil).getTime();
      if (Number.isFinite(current) && Number.isFinite(incoming) && incoming < current) {
        return reply.code(400).send({
          data: null,
          error: { message: 'La nueva clave vence antes que la licencia actual. Verifique la clave.' },
        });
      }
    }
    const trialStartedAt = session.trial_started_at || now;
    runRaw(
      `UPDATE user_session SET license_key = ?, license_valid_until = ?, license_activated_at = ?, trial_started_at = ? WHERE id = 'owner'`,
      [String(key).trim(), validUntil, now, trialStartedAt]
    );
    // Al activar, limpiar el marcador anti-manipulación de reloj: una licencia
    // vigente ya se evalúa antes que maxSeenTime, y así evitamos que un
    // retroceso previo de reloj bloquee la app tras el vencimiento futuro.
    runRaw('DELETE FROM settings WHERE key = ?', [LICENSE_MAX_SEEN_KEY]);
    const updated = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
    const maxSeen = getLicenseSettings();
    return {
      data: { success: true, session: serializeRow(updated), state: getLicenseState(updated, maxSeen) },
      error: null,
    };
  });

  // ---------- API: herramienta de desarrollador de licencias ----------
  // Solo disponible en la máquina del vendedor (donde existe la clave PRIVADA).

  // Genera una clave de activación para un código de negocio.
  app.post('/api/license/generate', async (request, reply) => {
    if (!requireToken(request, reply)) return;
    const privPem = getPrivateKey();
    if (!privPem) {
      return reply.code(403).send({
        data: null,
        error: { message: 'Herramienta solo disponible en la máquina del vendedor', code: 'DEV_TOOLS_UNAVAILABLE' },
      });
    }
    const body = (request.body || {}) as { code?: string; months?: number; until?: string };
    const code = String(body.code || '').trim().toUpperCase();
    if (!code) {
      return reply.code(400).send({ data: null, error: { message: 'Falta el código de negocio' } });
    }
    const validUntil = computeValidUntil(body.months, body.until);
    if (!validUntil) {
      return reply.code(400).send({ data: null, error: { message: 'Fecha de vencimiento inválida' } });
    }
    const key = generateLicenseKey(code, validUntil, privPem);
    return {
      data: {
        key: formatLicenseKey(key),
        rawKey: key,
        code,
        validUntil,
      },
      error: null,
    };
  });

  // Simula estados de licencia (reiniciar trial, forzar vencimiento, activar,
  // retroceso de reloj, limpiar marcador). Replica scripts/simular-licencia.mjs.
  app.post('/api/license/simulate', async (request, reply) => {
    if (!requireToken(request, reply)) return;
    const privPem = getPrivateKey();
    if (!privPem) {
      return reply.code(403).send({
        data: null,
        error: { message: 'Herramienta solo disponible en la máquina del vendedor', code: 'DEV_TOOLS_UNAVAILABLE' },
      });
    }
    const body = (request.body || {}) as {
      action?: string;
      code?: string;
      months?: number;
      until?: string;
    };
    const action = String(body.action || '').trim().toLowerCase();
    const now = new Date().toISOString();

    if (action === 'trial') {
      // Reiniciar el trial de 7 días (sin borrar datos del negocio).
      const session = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
      if (!session) {
        return reply.code(400).send({ data: null, error: { message: 'Primero configure el negocio' } });
      }
      runRaw(
        `UPDATE user_session SET license_key = NULL, license_valid_until = NULL, license_activated_at = NULL, trial_started_at = ? WHERE id = 'owner'`,
        [now]
      );
      runRaw('DELETE FROM settings WHERE key = ?', [LICENSE_MAX_SEEN_KEY]);
      const updated = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
      return { data: { success: true, state: computeLicenseState(), session: serializeRow(updated) }, error: null };
    }

    if (action === 'expired') {
      // Forzar estado vencido: vencimiento en el pasado + retroceso de reloj.
      const session = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
      if (!session) {
        return reply.code(400).send({ data: null, error: { message: 'Primero configure el negocio' } });
      }
      const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      runRaw(
        `UPDATE user_session SET license_valid_until = ?, license_key = license_key WHERE id = 'owner'`,
        [past]
      );
      // Marcador maxSeenTime en el futuro: hace que maxSeenTime > now y la licencia
      // quede vencida aunque haya una clave vigente (protección anti reloj).
      runRaw(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [LICENSE_MAX_SEEN_KEY, JSON.stringify(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()), now]
      );
      const updated = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
      return { data: { success: true, state: computeLicenseState(), session: serializeRow(updated) }, error: null };
    }

    if (action === 'activate') {
      // Genera y aplica una clave como la haría el endpoint de activación real.
      const session = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
      if (!session) {
        return reply.code(400).send({ data: null, error: { message: 'Primero configure el negocio' } });
      }
      const code = String(body.code || session.business_code || '').trim().toUpperCase();
      if (!code) {
        return reply.code(400).send({ data: null, error: { message: 'Falta el código de negocio' } });
      }
      const validUntil = computeValidUntil(body.months, body.until);
      if (!validUntil) {
        return reply.code(400).send({ data: null, error: { message: 'Fecha de vencimiento inválida' } });
      }
      const key = generateLicenseKey(code, validUntil, privPem);
      const trialStartedAt = session.trial_started_at || now;
      runRaw(
        `UPDATE user_session SET license_key = ?, license_valid_until = ?, license_activated_at = ?, trial_started_at = ? WHERE id = 'owner'`,
        [key, validUntil, now, trialStartedAt]
      );
      runRaw('DELETE FROM settings WHERE key = ?', [LICENSE_MAX_SEEN_KEY]);
      const updated = getRaw<any>('SELECT * FROM user_session WHERE id = ?', ['owner']);
      return {
        data: { success: true, key: formatLicenseKey(key), state: computeLicenseState(), session: serializeRow(updated) },
        error: null,
      };
    }

    if (action === 'rollback') {
      // Simula un retroceso de reloj: guarda maxSeenTime en el futuro.
      const fakeNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      runRaw(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [LICENSE_MAX_SEEN_KEY, JSON.stringify(fakeNow), now]
      );
      return { data: { success: true, state: computeLicenseState() }, error: null };
    }

    if (action === 'clear-rollback') {
      // Limpia el marcador anti-manipulación de reloj.
      runRaw('DELETE FROM settings WHERE key = ?', [LICENSE_MAX_SEEN_KEY]);
      return { data: { success: true, state: computeLicenseState() }, error: null };
    }

    return reply.code(400).send({ data: null, error: { message: 'Acción inválida' } });
  });

  // Genera una clave de restablecimiento de PIN (válida 24 h, un solo uso).
  // Solo disponible en la máquina del vendedor (donde existe la clave PRIVADA).
  app.post('/api/pins/reset-key', async (request, reply) => {
    if (!requireToken(request, reply)) return;
    const privPem = getPrivateKey();
    if (!privPem) {
      return reply.code(403).send({
        data: null,
        error: { message: 'Herramienta solo disponible en la máquina del vendedor', code: 'DEV_TOOLS_UNAVAILABLE' },
      });
    }
    const body = (request.body || {}) as { code?: string };
    const code = String(body.code || '').trim().toUpperCase();
    if (!code) {
      return reply.code(400).send({ data: null, error: { message: 'Falta el código de negocio' } });
    }
    const result = generatePinResetKey(code, privPem);
    return {
      data: {
        key: result.key,
        formattedKey: formatLicenseKey(result.key),
        code,
        expiresAt: result.expiresAt,
      },
      error: null,
    };
  });

  // ---------- API: settings (ZELLE y demás) ----------
  app.post('/api/settings', async (request, reply) => {
    if (!requireToken(request, reply)) return;
    const { key, value } = request.body as { key: string; value: any };
    if (!key) return reply.code(400).send({ error: { message: 'Falta key' } });
    if (PROTECTED_SETTINGS_KEYS.has(key)) {
      return reply.code(403).send({ data: null, error: { message: 'No se permite modificar esta configuración por esta vía.', code: 'FORBIDDEN_SETTING' } });
    }
    runRaw(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, typeof value === 'string' ? value : JSON.stringify(value), new Date().toISOString()]
    );
    return { data: { success: true }, error: null };
  });

  app.get('/api/settings', async () => {
    const rows = queryRaw<any>('SELECT key, value FROM settings');
    const out: Record<string, any> = {};
    // Claves que jamás se devuelven al cliente por GET (secretos / estado de licencia).
    const hiddenKeys = new Set([AUTH_TOKEN_KEY, LICENSE_MAX_SEEN_KEY]);
    for (const r of rows) {
      if (hiddenKeys.has(r.key)) continue;
      try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
    }
    return { data: out, error: null };
  });

  // ---------- Servir el build de Vite ----------
  if (config.staticDir && fs.existsSync(config.staticDir)) {
    const staticDir = path.resolve(config.staticDir);
    app.register(fastifyStatic, { root: staticDir });

    // CSP estricto para HTML servido en producción (solo build; Vite dev no pasa por aquí).
    app.addHook('onSend', async (request, reply, payload) => {
      const ct = reply.getHeader('content-type');
      if (typeof ct === 'string' && ct.includes('text/html')) {
        reply.header('Content-Security-Policy', CSP_HEADER);
      }
      return payload;
    });

    app.setNotFoundHandler(async (request, reply) => {
      // Evitar interferir con /api
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ data: null, error: { message: 'No encontrado' } });
      }
      // SPA fallback: cualquier ruta sin archivo devuelve index.html
      return reply.sendFile('index.html');
    });
  }

  return app;
}

function generateBusinessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
