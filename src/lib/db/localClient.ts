/**
 * localClient.ts — Shim del cliente de datos que imita la API encadenable de
 * supabase-js, pero que habla con el servidor Fastify embebido (Electron) vía
 * /api/query, /api/rpc, /api/storage, /api/auth y /api/settings.
 *
 * Estrategia: dbStore.ts se mantiene intacto; este shim cumple el mismo
 * contrato ({ data, error, count }) para que el resto del código no cambie.
 */

type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'ilike' | 'is' | 'contains' | 'or' | 'not';

interface LocalFilter {
  op: FilterOp;
  column: string;
  value: any;
  operator?: string;
}

interface LocalOrder {
  column: string;
  ascending: boolean;
}

interface QueryCommand {
  table: string;
  method: 'select' | 'insert' | 'upsert' | 'update' | 'delete';
  columns?: string;
  filters?: LocalFilter[];
  orders?: LocalOrder[];
  limit?: number | null;
  range?: [number, number] | null;
  single?: boolean;
  maybeSingle?: boolean;
  count?: 'exact' | null;
  head?: boolean;
  data?: any;
  onConflict?: string;
}

export interface LocalError {
  message: string;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  blocked?: boolean;
  remaining_seconds?: number;
}

export interface LocalResponse<T = any> {
  data: T | null;
  error: LocalError | null;
  count?: number | null;
}

function isAbortError(e: any): boolean {
  return !!e && (e.name === 'AbortError' || (e as any)?.error?.name === 'AbortError');
}

// --- Token de sesión local ---
// El servidor protege /api/query y demás endpoints de escritura con un token
// por instalación (x-inventarioy-token). Se obtiene vía /api/auth/session.
const API_TOKEN_KEY = 'inventarioy_api_token';

function getStoredToken(): string {
  try {
    return localStorage.getItem(API_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function saveToken(token: string): void {
  if (!token) return;
  try {
    localStorage.setItem(API_TOKEN_KEY, token);
  } catch { /* ignore */ }
}

// --- Token de sesión por dispositivo (multi-caja en LAN) ---
// El login crea una sesión por dispositivo (tabla `sessions` en el servidor). Este
// token identifica la caja/pestaña y porta su rol propio, para que dos cajas con
// roles distintos operen en simultáneo sin pisarse.
const SESSION_TOKEN_KEY = 'inventarioy_session_token';

function getStoredSessionToken(): string {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function saveSessionToken(token: string): void {
  if (!token) return;
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch { /* ignore */ }
}

function clearSessionToken(): void {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch { /* ignore */ }
}

// --- Rol actual del usuario para el control de escrituras en servidor ---
// El servidor usa x-inventarioy-role para bloquear escrituras de tablas
// que el rol no debería tocar (ej: un cajero no edita pines ni nómina).
function getCurrentRole(): string {
  try {
    const r = localStorage.getItem('verifiedRole');
    if (r) return String(r);
    const userRaw = localStorage.getItem('inventarioy_user');
    if (userRaw) {
      const parsed = JSON.parse(userRaw);
      if (parsed?.role) return String(parsed.role);
    }
  } catch { /* ignore */ }
  return '';
}

let tokenPromise: Promise<string> | null = null;

// El token de escritura se obtiene vía /api/auth/session (solo el renderer real o
// un origin loopback/LAN permitido), o vía /api/auth/setup y /api/auth/login.
// Un atacante por DNS rebinding envía un Origin ajeno y es rechazado por el servidor.
async function fetchTokenFromServer(): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/auth/session', { method: 'GET' });
  } catch {
    return '';
  }
  let parsed: any = {};
  try { parsed = await res.json(); } catch { /* ignore */ }
  const token = typeof parsed?.data?.token === 'string' ? parsed.data.token : '';
  if (token) saveToken(token);
  return token;
}

async function ensureToken(): Promise<string> {
  const stored = getStoredToken();
  if (stored) return stored;
  if (!tokenPromise) {
    tokenPromise = fetchTokenFromServer().finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

async function postJson<T = any>(url: string, body: any, signal?: AbortSignal): Promise<LocalResponse<T>> {
  const token = await ensureToken();
  const role = getCurrentRole();
  const sessionToken = getStoredSessionToken();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-inventarioy-token': token } : {}),
        ...(role ? { 'x-inventarioy-role': role } : {}),
        ...(sessionToken ? { 'x-inventarioy-session': sessionToken } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: any) {
    if (isAbortError(e)) {
      return { data: null, error: { message: 'Solicitud abortada', status: 400 } };
    }
    return { data: null, error: { message: e?.message || 'Error de red', status: 503 } };
  }
  let parsed: any;
  try {
    parsed = await res.json();
  } catch {
    parsed = {};
  }
  if (parsed?.data && typeof parsed.data.token === 'string') {
    saveToken(parsed.data.token);
  }
  if (parsed?.data && typeof parsed.data.sessionToken === 'string') {
    saveSessionToken(parsed.data.sessionToken);
  }
  if (!res.ok) {
    return {
      data: null,
      error: parsed?.error || { message: `Error ${res.status}`, status: res.status },
    };
  }
  return {
    data: parsed?.data ?? null,
    error: parsed?.error || null,
    count: parsed?.count,
  };
}

class QueryBuilder implements PromiseLike<LocalResponse> {
  private _table: string;
  private _method: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private _columns: string = '*';
  private _filters: LocalFilter[] = [];
  private _orders: LocalOrder[] = [];
  private _limit: number | null = null;
  private _range: [number, number] | null = null;
  private _single = false;
  private _maybeSingle = false;
  private _count: 'exact' | null = null;
  private _head = false;
  private _data: any = null;
  private _onConflict: string | undefined;
  private _signal?: AbortSignal;

  constructor(table: string) {
    this._table = table;
  }

  // --- select ---
  select(columns = '*', opts?: { count?: 'exact'; head?: boolean }) {
    this._columns = columns;
    this._count = opts?.count ?? null;
    this._head = !!opts?.head;
    return this;
  }

  // --- filtros ---
  eq(column: string, value: any) { this._filters.push({ op: 'eq', column, value }); return this; }
  neq(column: string, value: any) { this._filters.push({ op: 'neq', column, value }); return this; }
  gt(column: string, value: any) { this._filters.push({ op: 'gt', column, value }); return this; }
  gte(column: string, value: any) { this._filters.push({ op: 'gte', column, value }); return this; }
  lt(column: string, value: any) { this._filters.push({ op: 'lt', column, value }); return this; }
  lte(column: string, value: any) { this._filters.push({ op: 'lte', column, value }); return this; }
  in(column: string, value: any[]) { this._filters.push({ op: 'in', column, value }); return this; }
  ilike(column: string, value: string) { this._filters.push({ op: 'ilike', column, value }); return this; }
  like(column: string, value: string) { this._filters.push({ op: 'ilike', column, value }); return this; }
  is(column: string, value: any) { this._filters.push({ op: 'is', column, value }); return this; }
  contains(column: string, value: any) { this._filters.push({ op: 'contains', column, value }); return this; }
  or(filterString: string) { this._filters.push({ op: 'or', column: '', value: filterString }); return this; }
  not(column: string, operator: string, value: any) { this._filters.push({ op: 'not', column, operator, value }); return this; }

  // --- orden / paginación ---
  order(column: string, opts?: { ascending?: boolean }) {
    this._orders.push({ column, ascending: opts?.ascending ?? true });
    return this;
  }
  limit(n: number) { this._limit = n; return this; }
  range(start: number, end: number) { this._range = [start, end]; return this; }
  abortSignal(signal: AbortSignal) { this._signal = signal; return this; }

  // --- modos single ---
  single() { this._single = true; return this; }
  maybeSingle() { this._maybeSingle = true; return this; }

  // --- escrituras ---
  insert(data: any) { this._method = 'insert'; this._data = data; return this; }
  upsert(data: any, opts?: { onConflict?: string }) {
    this._method = 'upsert';
    this._data = data;
    this._onConflict = opts?.onConflict;
    return this;
  }
  update(data: any) { this._method = 'update'; this._data = data; return this; }
  delete() { this._method = 'delete'; return this; }

  // --- PromiseLike ---
  then<TResult1 = LocalResponse, TResult2 = never>(
    onfulfilled?: ((value: LocalResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._exec().then(onfulfilled as any, onrejected as any);
  }
  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): Promise<LocalResponse | TResult> {
    return this._exec().catch(onrejected as any);
  }
  finally(onfinally?: (() => void) | null): Promise<LocalResponse> {
    return this._exec().finally(onfinally as any);
  }

  private async _exec(): Promise<LocalResponse> {
    if (this._signal?.aborted) {
      return { data: null, error: { message: 'Solicitud abortada', status: 400 } };
    }
    const cmd: QueryCommand = {
      table: this._table,
      method: this._method,
      columns: this._columns,
      filters: this._filters,
      orders: this._orders,
      limit: this._limit,
      range: this._range,
      single: this._single,
      maybeSingle: this._maybeSingle,
      count: this._count,
      head: this._head,
      data: this._data,
      onConflict: this._onConflict,
    };
    const res = await postJson<LocalResponse['data']>('/api/query', cmd, this._signal);
    if (res.error) return res;

    let data = res.data;
    // Emular PGRST116 de supabase para .single() sin filas
    if (this._single && (data === null || (Array.isArray(data) && data.length === 0))) {
      return { data: null, error: { message: 'No se encontraron filas', code: 'PGRST116' } };
    }
    if (Array.isArray(data) && (this._single || this._maybeSingle)) {
      data = data.length ? data[0] : null;
    }
    return { data: data as any, error: null, count: res.count ?? undefined };
  }
}

// --- storage (documentos HR) ---
const storageFrom = (bucket: string) => ({
  upload: async (path: string, file: Blob, opts?: { upsert?: boolean }): Promise<LocalResponse> => {
    let base64 = '';
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      base64 = btoa(binary);
    } catch {
      return { data: null, error: { message: 'No se pudo leer el archivo' } };
    }
    const res = await postJson<{ path: string }>('/api/storage/upload', {
      path: `${bucket}/${path}`,
      base64,
      contentType: (file as File).type || undefined,
    });
    if (res.error) return res;
    return { data: res.data, error: null };
  },
  getPublicUrl: (path: string): { data: { publicUrl: string }; error: null } => {
    const full = `${bucket}/${path}`;
    return { data: { publicUrl: `/api/storage/download?path=${encodeURIComponent(full)}` }, error: null };
  },
  remove: async (paths: string[]): Promise<LocalResponse> => {
    const res = await postJson('/api/storage/remove', { paths: paths.map((p) => `${bucket}/${p}`) });
    if (res.error) return res;
    return { data: res.data, error: null };
  },
});

// --- auth (sesión local por PIN) ---
const authApi = {
  getSession: async (): Promise<{ data: { session: any }; error: LocalError | null }> => {
    let res: Response;
    try {
      res = await fetch('/api/auth/session', { method: 'GET' });
    } catch (e: any) {
      return { data: { session: null }, error: { message: e?.message || 'Error de red', status: 503 } };
    }
    let parsed: any = {};
    try { parsed = await res.json(); } catch { /* ignore */ }
    if (!res.ok) {
      return { data: { session: null }, error: parsed?.error || { message: `Error ${res.status}`, status: res.status } };
    }
    if (typeof parsed?.data?.token === 'string') saveToken(parsed.data.token);
    if (parsed?.data && typeof parsed.data.sessionToken === 'string') saveSessionToken(parsed.data.sessionToken);
    return { data: parsed?.data ?? { session: null }, error: parsed?.error || null };
  },
  signOut: async (): Promise<LocalResponse> => {
    return postJson('/api/auth/logout', {});
  },
  signInWithPassword: async (args: any): Promise<LocalResponse<{ session: any }>> => {
    const res = await postJson('/api/auth/login', { pin: args?.pin });
    if (res.error) return res;
    return { data: { session: res.data?.session ?? null, ...res.data }, error: null };
  },
  signUp: async (args: any): Promise<LocalResponse<{ session: any }>> => {
    const res = await postJson('/api/auth/setup', args);
    if (res.error) return res;
    return { data: { session: null }, error: null };
  },
  resetPin: async (args: { code: string; resetKey: string; newPin: string }): Promise<LocalResponse<{ success: boolean }>> => {
    return postJson('/api/auth/reset-pin', args);
  },
  refreshSession: async (): Promise<{ data: { session: any }; error: LocalError | null }> => {
    // No hay token remoto que refrescar en la versión desktop local:
    // getSession() ya devuelve la sesión local del servidor.
    return { data: { session: null }, error: null };
  },
  updateUser: async (_args: any): Promise<LocalResponse> => {
    // No hay cambio de contraseña remoto en la versión desktop local.
    return { data: { user: null }, error: null };
  },
  onAuthStateChange: (_cb: any) => {
    // No hay auth server-driven; el estado se gestiona desde authStore local.
    return { data: { subscription: { unsubscribe: () => {} } }, error: null };
  },
};

const settingsApi = {
  get: async (key: string): Promise<LocalResponse> => {
    let res: Response;
    try {
      res = await fetch('/api/settings', { method: 'GET' });
    } catch (e: any) {
      return { data: null, error: { message: e?.message || 'Error de red', status: 503 } };
    }
    let parsed: any = {};
    try { parsed = await res.json(); } catch { /* ignore */ }
    if (!res.ok) return { data: null, error: parsed?.error || { message: `Error ${res.status}`, status: res.status } };
    const all = parsed?.data || {};
    return { data: key ? all[key] : all, error: null };
  },
  set: async (key: string, value: any): Promise<LocalResponse> => {
    return postJson('/api/settings', { key, value });
  },
};

export const localDb = {
  from: (table: string) => new QueryBuilder(table),
  rpc: async (fn: string, args?: any): Promise<LocalResponse> => {
    const res = await postJson('/api/rpc', { fn, args });
    return { data: res.data, error: res.error };
  },
  auth: authApi,
  storage: {
    from: storageFrom,
  },
  settings: settingsApi,
  meta: async (): Promise<LocalResponse<{
    businessName: string;
    businessCode: string;
    ips: string[];
    port: number;
  }>> => {
    let res: Response;
    try {
      res = await fetch('/api/meta', { method: 'GET' });
    } catch (e: any) {
      return { data: null, error: { message: e?.message || 'Error de red', status: 503 } };
    }
    let parsed: any = {};
    try { parsed = await res.json(); } catch { /* ignore */ }
    if (!res.ok) return { data: null, error: parsed?.error || { message: `Error ${res.status}`, status: res.status } };
    return { data: parsed ?? null, error: parsed?.error || null };
  },
  fetchMenu: async (businessId: string): Promise<LocalResponse> => {
    let res: Response;
    try {
      res = await fetch(`/api/menu-data?b=${encodeURIComponent(businessId)}`, { method: 'GET' });
    } catch (e: any) {
      return { data: null, error: { message: e?.message || 'Error de red', status: 503 } };
    }
    let parsed: any = {};
    try { parsed = await res.json(); } catch { /* ignore */ }
    if (!res.ok) return { data: null, error: parsed?.error || { message: `Error ${res.status}`, status: res.status } };
    return { data: parsed?.data ?? null, error: parsed?.error || null };
  },
  pins: {
    generateResetKey: async (code: string): Promise<LocalResponse<{
      key: string;
      formattedKey: string;
      code: string;
      expiresAt: string;
    }>> => {
      return postJson('/api/pins/reset-key', { code });
    },
  },
  license: {
    status: async (): Promise<LocalResponse<{
      status: 'trialing' | 'active' | 'expired';
      trialStartedAt: string | null;
      trialEndsAt: string | null;
      validUntil: string | null;
      daysRemaining: number;
      trialDays: number;
      businessCode: string;
      isDeveloper?: boolean;
      hasLicenseKey?: boolean;
      maxSeenTime?: string | null;
    }>> => {
      let res: Response;
      try {
        res = await fetch('/api/license/status', { method: 'GET' });
      } catch (e: any) {
        return { data: null, error: { message: e?.message || 'Error de red', status: 503 } };
      }
      let parsed: any = {};
      try { parsed = await res.json(); } catch { /* ignore */ }
      if (!res.ok) return { data: null, error: parsed?.error || { message: `Error ${res.status}`, status: res.status } };
      return { data: parsed?.data ?? null, error: parsed?.error || null };
    },
    activate: async (key: string): Promise<LocalResponse<{ success: boolean; session?: any; state?: any }>> => {
      return postJson('/api/license/activate', { key });
    },
    generate: async (args: { code: string; months?: number; until?: string }): Promise<LocalResponse<{
      key: string;
      rawKey: string;
      code: string;
      validUntil: string;
    }>> => {
      return postJson('/api/license/generate', args);
    },
    simulate: async (args: { action: string; code?: string; months?: number; until?: string }): Promise<LocalResponse<{
      success: boolean;
      key?: string;
      state?: any;
    }>> => {
      return postJson('/api/license/simulate', args);
    },
  },
  // Respaldos de la BD local (spec 002).
  backup: {
    status: async (): Promise<LocalResponse<{
      dir: string;
      intervalH: number;
      keepN: number;
      lastAt: string | null;
      lastError: string;
      files: { file: string; size: number; mtimeMs: number }[];
    }>> => {
      let res: Response;
      try {
        res = await fetch('/api/backup/status', { method: 'GET' });
      } catch (e: any) {
        return { data: null, error: { message: e?.message || 'Error de red', status: 503 } };
      }
      let parsed: any = {};
      try { parsed = await res.json(); } catch { /* ignore */ }
      if (!res.ok) return { data: null, error: parsed?.error || { message: `Error ${res.status}`, status: res.status } };
      return { data: parsed?.data ?? null, error: parsed?.error || null };
    },
    now: async (): Promise<LocalResponse<{ path: string; file: string; dir: string; at: string }>> => {
      return postJson('/api/backup/now', {});
    },
    restore: async (file: string): Promise<LocalResponse<{ restoredFrom: string; safetyCopy: string; at: string }>> => {
      return postJson('/api/backup/restore', { file });
    },
  },
  // Facturación con folio anual (spec 003).
  invoice: {
    list: async (filters?: { year?: number; month?: string; status?: string; q?: string; limit?: number }): Promise<LocalResponse> => {
      const params = new URLSearchParams();
      if (filters?.year) params.set('year', String(filters.year));
      if (filters?.month) params.set('month', filters.month);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.q) params.set('q', filters.q);
      if (filters?.limit) params.set('limit', String(filters.limit));
      const qs = params.toString();
      let res: Response;
      try {
        res = await fetch(`/api/invoices${qs ? `?${qs}` : ''}`, { method: 'GET' });
      } catch (e: any) {
        return { data: null, error: { message: e?.message || 'Error de red', status: 503 } };
      }
      let parsed: any = {};
      try { parsed = await res.json(); } catch { /* ignore */ }
      if (!res.ok) return { data: null, error: parsed?.error || { message: `Error ${res.status}`, status: res.status } };
      return { data: parsed?.data ?? null, error: parsed?.error || null };
    },
    create: async (payload: any): Promise<LocalResponse> => {
      return postJson('/api/invoices', payload);
    },
    fromSale: async (sale_id: string, client_name?: string): Promise<LocalResponse> => {
      return postJson('/api/invoices/from-sale', { sale_id, client_name });
    },
    void: async (id: string, reason: string): Promise<LocalResponse> => {
      return postJson(`/api/invoices/${encodeURIComponent(id)}/void`, { reason });
    },
    report: async (year: number, month: string): Promise<LocalResponse> => {
      let res: Response;
      try {
        res = await fetch(`/api/invoices/report?year=${year}&month=${encodeURIComponent(month)}`, { method: 'GET' });
      } catch (e: any) {
        return { data: null, error: { message: e?.message || 'Error de red', status: 503 } };
      }
      let parsed: any = {};
      try { parsed = await res.json(); } catch { /* ignore */ }
      if (!res.ok) return { data: null, error: parsed?.error || { message: `Error ${res.status}`, status: res.status } };
      return { data: parsed?.data ?? null, error: parsed?.error || null };
    },
  },
  // Alertas locales (spec 006).
  alerts: {
    status: async (): Promise<LocalResponse<{ at: string; alerts: { kind: string; title: string; detail: string; count: number; names: string[]; link: string }[] }>> => {
      return postJson('/api/alerts/status', {});
    },
  },
  // Ejecuta varias escrituras en una única transacción (rollback atómico).
  batch: async (commands: { table: string; method: 'insert' | 'upsert' | 'update' | 'delete'; data?: any; filters?: LocalFilter[]; onConflict?: string }[]): Promise<LocalResponse<{ success: boolean }>> => {
    return postJson('/api/query/batch', { commands });
  },
  // Multi-caja: asocia la sesión de este dispositivo a una caja/punto de venta.
  setRegister: async (registerId: string | null): Promise<LocalResponse<{ success: boolean; register?: any }>> => {
    return postJson('/api/rpc', { fn: 'set_register', args: { register_id: registerId } });
  },
  // Multi-caja: devuelve la sesión del dispositivo (rol + caja asignada).
  getMySession: async (): Promise<LocalResponse<{ session: { role: string; pin_name?: string; register?: any } | null }>> => {
    return postJson('/api/rpc', { fn: 'get_my_session', args: {} });
  },
  // Limpia el token de sesión del dispositivo (logout local).
  clearSessionToken: clearSessionToken,
};

export default localDb;
