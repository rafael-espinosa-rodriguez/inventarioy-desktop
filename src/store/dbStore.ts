import { create } from 'zustand';
import { localDb } from '../lib/db/localClient';
import { useAuthStore } from './authStore';
import { toast } from 'sonner';
import { isDateClosed } from '../lib/dateUtils';
import { calcularNomina } from '../utils/payrollCalculations';
import { logger } from '../lib/logger';
import { normalizeStr, isActive, uuid } from '../lib/utils';
import { trackLocalCreation, untrackLocalCreation } from '../lib/realtimeGuard';

// Versión desktop: los datos viven en el servidor local embebido (Electron).
// Forzamos "online" para que todas las operaciones usen la ruta al shim local.
const IS_ONLINE = true;

let _isFetchingAll = false;
let _isConsumingTransit = false;

let _movementLock: Promise<void> = Promise.resolve();

async function withMovementLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _movementLock;
  let release: () => void = () => {};
  _movementLock = new Promise<void>((resolve) => { release = resolve; });
  try {
    await prev;
    return await fn();
  } finally {
    release();
  }
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  price: number;
  cost: number;
  rop: number;
  eoq: number;
  lead_time?: number;
  order_cost?: number;
  holding_cost?: number;
  expiration_date?: string;
  description?: string;
  is_individual: boolean;
  is_active: boolean;
  in_transit?: number;
  is_gasto_variable?: boolean;
  is_consumo_directo?: boolean;
  is_recipe?: boolean;
  recipe_ingredients?: any[];
  created_at: string;
}

export interface Movement {
  id: string;
  user_id: string;
  product_id: string;
  type: 'ENTRADA' | 'SALIDA' | 'MERMA' | 'AJUSTE';
  quantity: number;
  unit: string;
  date: string;
  cost: number;
  reason?: string;
  status?: string;
  justification?: string;
  justification_date?: string;
  is_gasto_variable?: boolean;
  is_consumo_directo?: boolean;
  note?: string;
  warehouse_id?: string;
  created_at: string;
}

export interface Warehouse {
  id: string;
  user_id: string;
  name: string;
  is_main: boolean;
  created_at: string;
}

export interface ProductWarehouse {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  in_transit: number;
  updated_at: string;
}

export interface TransitItem {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  consumed: number;
  remaining: number;
  reason?: string;
  sent_date: string;
  created_at: string;
  warehouse_id?: string;
}

export interface Sale {
  id: string;
  user_id: string;
  employee_id?: string;
  items: {
    product_id: string;
    quantity: number;
    unit_cost: number;
    selling_price: number;
    subtotal: number;
    is_recipe?: boolean;
    recipe_snapshot?: {
      name: string;
      ingredients: {
        product_id: string;
        quantity: number;
        cost: number;
      }[];
    } | null;
  }[];
  total_amount: number;
  date: string;
  sale_type: 'SALON' | 'DOMICILIO' | 'BAR' | 'VENTA_RAPIDA';
  is_account_house: boolean;
  notes?: string;
  discount: number;
  payment_method?: string | null;
  efectivo?: number;
  transferencia?: number;
  usd?: number;
  eur?: number;
  subtotal?: number;
  register_id?: string | null;
  shift?: string;
  created_at: string;
}

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  selling_price: number;
  ingredients: {
    product_id: string;
    quantity: number;
    unit: string;
  }[];
  created_at: string;
}

export interface PendingAccount {
  id: string;
  user_id: string;
  client_name: string;
  items: PendingItem[];
  total_amount: number;
  is_account_house: boolean;
  sale_type: 'SALON' | 'DOMICILIO' | 'BAR' | 'VENTA_RAPIDA';
  status: 'pending' | 'paid' | 'cancelled';
  created_at: string;
  created_at_local?: string;
  updated_at: string;
}

export interface PendingItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  added_at: string;
  is_recipe?: boolean;
  recipe_snapshot?: {
    name: string;
    ingredients: {
      product_id: string;
      quantity: number;
      cost: number;
    }[];
  } | null;
}

export interface AccessPin {
  id: string;
  user_id: string;
  pin_hash: string;
  role: string;
  pin_name: string;
  is_active: boolean;
  failed_attempts: number;
  blocked_until: string | null;
  created_at: string;
}

export interface Role {
  id: string;
  user_id: string;
  name: string;
  modules: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Dueño/a',
  economist: 'Económico/a',
  admin: 'Administrador/a',
  supervisor: 'Supervisor/a',
  clerk: 'Dependiente/a',
};

export const ROLE_MODULES: Record<string, string[]> = {
  owner: ['sales', 'inventory', 'movements', 'transit', 'recipes', 'consumption', 'closings', 'charts', 'analysis', 'filtered', 'hr', 'settings', 'invoices'],
  economist: ['sales', 'inventory', 'movements', 'transit', 'recipes', 'consumption', 'closings', 'charts', 'analysis', 'filtered', 'hr', 'invoices'],
  admin: ['inventory', 'movements', 'transit', 'invoices'],
  supervisor: ['sales', 'closings'],
  clerk: ['sales'],
};

export const MODULE_ROLES: Record<string, string[]> = {
  '/dashboard': ['owner', 'economist', 'admin'],
  '/inventory': ['owner', 'economist', 'admin'],
  '/movements': ['owner', 'economist', 'admin'],
  '/transit': ['owner', 'economist', 'admin'],
  '/sales': ['owner', 'economist', 'supervisor', 'clerk'],
  '/closings': ['owner', 'economist', 'supervisor'],
  '/hr': ['owner', 'economist'],
  '/recipes': ['owner', 'economist'],
  '/consumption': ['owner', 'economist'],
  '/analysis': ['owner', 'economist'],
  '/charts': ['owner', 'economist'],
  '/filtered': ['owner', 'economist'],
  '/settings': ['owner'],
  '/action-logs': ['owner', 'economist'],
  '/invoices': ['owner', 'economist', 'admin'],
};

// Módulo requerido por ruta de dashboard (verificación offline / gating).
export const MODULE_BY_PATH: Record<string, string> = {
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
  '/invoices': 'invoices',
};

function normalizeRoleModules(modules: any): string[] {
  if (Array.isArray(modules)) return modules.map(String);
  try {
    const parsed = JSON.parse(String(modules));
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch { /* noop */ }
  return [];
}

// Label de un rol desde la tabla `roles` (con fallback a los mapas legados).
export function getRoleLabel(roleId: string): string {
  const role = useDatabaseStore.getState().roles.find(r => r.id === roleId);
  if (role?.name) return role.name;
  return ROLE_LABELS[roleId] || roleId;
}

// Módulos de un rol desde la tabla `roles` (con fallback a los mapas legados).
export function getRoleModules(roleId: string): string[] {
  const role = useDatabaseStore.getState().roles.find(r => r.id === roleId);
  if (role?.modules) {
    const mods = normalizeRoleModules(role.modules);
    if (mods.length) return mods;
  }
  return ROLE_MODULES[roleId] || [];
}

export interface Employee {
  id: string;
  user_id: string;
  name: string;
  role: string;
  salary: number;
  phone?: string;
  email?: string;
  nit_id?: string;
  category?: string;
  photo_url?: string;
  hire_date?: string;
  person_type?: 'employee' | 'partner';
  base_contribution?: number;
  contract_type?: 'indefinite' | 'fixed' | 'probation';
  contract_end_date?: string;
  expediente?: number;
  vacation_balance?: number;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface DailyClosing {
  id: string;
  user_id: string;
  closing_date: string;
  total_sales: number;
  total_discounts: number;
  total_refunds: number;
  closing_amount: number;
  notes?: string;
  created_by?: string;
  created_by_name?: string;
  created_at?: string;
  cup_efectivo?: number;
  cup_transfer?: number;
  usd?: number;
  eur?: number;
  salon?: number;
  domicilio?: number;
  bar?: number;
  venta_rapida?: number;
  sales_count?: number;
  register_id?: string | null;
  shift?: string;
}

// Facturación con folio anual (spec 003). Display: `CR-AAAA-NNNNNN`.
export interface Invoice {
  id: string;
  user_id: string;
  folio_year: number;
  folio_seq: number;
  client_name: string;
  sale_id?: string | null;
  date: string;
  subtotal: number;
  discount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  payment_method?: string | null;
  efectivo: number;
  transferencia: number;
  usd: number;
  eur: number;
  status: 'emitida' | 'anulada';
  void_reason?: string | null;
  notes?: string | null;
  created_at: string;
  items_count?: number;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  price: number;
  subtotal: number;
  created_at: string;
}

export function folioLabel(inv: Pick<Invoice, 'folio_year' | 'folio_seq'>): string {
  return `CR-${inv.folio_year}-${String(inv.folio_seq).padStart(6, '0')}`;
}

export interface HRDocument {
  id: string;
  user_id: string;
  name: string;
  doc_type: 'MANUAL' | 'REGLAMENTO' | 'PNO';
  file_url: string;
  file_name: string;
  file_size?: number;
  created_at: string;
}

export interface EmployeeDocument {
  id: string;
  user_id: string;
  employee_id: string;
  name: string;
  doc_type: 'CONTRATO' | 'IDENTIFICACION' | 'OTRO';
  file_url: string;
  file_name: string;
  file_size?: number;
  created_at: string;
}

export interface Department {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface PayrollConfig {
  id: string;
  user_id: string;
  tax_exemption_base: number;
  tax_rate: number;
  special_contribution_rate: number;
  last_calculated_month?: string;
  // Fondo de tiempo estimado (horas/mes) para la tasa salarial horaria.
  monthly_hours?: number;
  // Días de vacaciones que se acumulan por mes (saldo estilo Versat).
  vacation_accrual_days?: number;
  created_at: string;
  updated_at: string;
}

export interface PayrollEntry {
  id: string;
  user_id: string;
  employee_id: string;
  employee_name: string;
  employee_category: string;
  month: number;
  year: number;
  base_salary: number;
  earned_salary: number;
  exemption_base: number;
  taxable_base: number;
  tax_amount: number;
  special_contribution: number;
  net_salary: number;
  vacation_days: number;
  vacation_base: number;
  employer_contribution: number;
  is_custom: boolean;
  // Conceptos de nómina (Fase 3)
  overtime_hours?: number;
  overtime_type?: 'diurna' | 'nocturna' | 'descanso' | 'feriado';
  overtime_pay?: number;
  bonus?: number;
  // Captación pre-nómina / pago por horas reales
  worked_hours?: number;
  hourly_rate?: number;
  days_paid?: number;
  vacation_pay?: number;
  advances?: number;
  loan_deduction?: number;
  other_deductions?: number;
  gross_salary?: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeeLoan {
  id: string;
  user_id: string;
  employee_id: string;
  total_amount: number;
  monthly_payment: number;
  balance: number;
  start_date?: string;
  status: 'active' | 'paid';
  // Tipo de deducción/retención (préstamo, inasistencia, sanción, etc.)
  deduction_type?: 'prestamo' | 'credito_bancario' | 'inasistencia' | 'sancion' | 'rotura_equipo' | 'otro';
  reason?: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollDraft {
  id: string;
  user_id: string;
  month: number;
  year: number;
  employee_id: string;
  include: number;
  worked_hours: number;
  hourly_rate: number;
  bonus: number;
  advances: number;
  retention: number;
  vacation_days: number;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollPeriod {
  id: string;
  user_id: string;
  month: number;
  year: number;
  status: 'draft' | 'applied';
  applied_at?: string;
  applied_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollLiquidation {
  id: string;
  user_id: string;
  employee_id: string;
  employee_name: string;
  base_salary: number;
  hire_date?: string;
  end_date?: string;
  months_worked: number;
  vacation_accumulated: number;
  vacation_taken: number;
  vacation_pending: number;
  vacation_pay: number;
  severance_months: number;
  severance_pay: number;
  notice_days: number;
  notice_pay: number;
  gross_total: number;
  cess: number;
  iip: number;
  net_total: number;
  created_at: string;
}

const capitalize = (str: string) =>
  str.trim().toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const formatBlockRemaining = (seconds: number): string => {
  const s = Math.max(1, Math.ceil(seconds));
  if (s >= 60) {
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${mins} min ${rem} s` : `${mins} min`;
  }
  return `${s} s`;
};

const DEFAULT_TIMEOUT = 15000; // 15 segundos

const isRateLimitError = (err: any): boolean => {
  return err?.status === 429 || err?.code === '429' || 
         err?.message?.includes('rate limit') || 
         err?.message?.includes('too many requests');
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<T> => {
  try {
    const result = await Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`TIMEOUT`)), timeoutMs)
      )
    ]);
    return result;
  } catch (err: any) {
    if (err.message === 'TIMEOUT') {
      throw new Error('TIMEOUT');
    }
    throw err;
  }
};

const NETWORK_ERROR_MESSAGES = [
  'Failed to fetch',
  'NetworkError',
  'Network request failed',
  'REFUSED_STREAM',
  'TIMEOUT',
  'network',
  'ERR_HTTP2',
];

function isNetworkError(err: any): boolean {
  const msg = err?.message || '';
  if (NETWORK_ERROR_MESSAGES.some((m) => msg.includes(m))) return true;
  if (err?.status === 503) return true;
  if (typeof navigator !== 'undefined' && !IS_ONLINE) return true;
  return false;
}

const RETRYABLE_ERRORS = [
  'Failed to fetch',
  'NetworkError',
  'Network request failed',
  'REFUSED_STREAM',
  'TIMEOUT',
  'La conexión está lenta',
  'network',
  'ERR_HTTP2',
];

const queryWithRetry = async <T>(
  queryFn: () => PromiseLike<{ data: T; error: any }>,
  maxRetries: number = 3
): Promise<{ data: T; error: any }> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(Promise.resolve(queryFn()), DEFAULT_TIMEOUT);
    } catch (err: any) {
      const errMsg = err?.message || '';
      const isRetryable = RETRYABLE_ERRORS.some(msg => errMsg.includes(msg));

      if (attempt < maxRetries && isRetryable) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
        if (import.meta.env.DEV) {
          logger.warn(`⚠️ Reintentando consulta (${attempt + 1}/${maxRetries}) en ${backoff}ms...`);
        }
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Error inesperado en queryWithRetry');
};

let lastOperationTime: Record<string, number> = {};
const operationCooldown = 1000; // 1 segundo entre operaciones del mismo tipo

const withCooldown = async <T>(
  operationKey: string,
  operation: () => Promise<T>
): Promise<T> => {
  const now = Date.now();
  const lastTime = lastOperationTime[operationKey] || 0;
  const timeSinceLastOp = now - lastTime;

  if (timeSinceLastOp < operationCooldown) {
    await new Promise(resolve => setTimeout(resolve, operationCooldown - timeSinceLastOp));
  }

  lastOperationTime[operationKey] = Date.now();
  return operation();
};

export const resetConnectionCooldown = () => {
  lastOperationTime = {};
};

export const forceRefreshData = async () => {
  logger.info('🔄 Forzando recarga de datos...');
  const { fetchAll } = useDatabaseStore.getState();
  await fetchAll();
  logger.info('✅ Datos recargados exitosamente');
};

interface DatabaseState {
  products: Product[];
  movements: Movement[];
  sales: Sale[];
  recipes: Recipe[];
  employees: Employee[];
  categories: Category[];
  transitItems: TransitItem[];
  dailyClosings: DailyClosing[];
  invoices: Invoice[];
  hrDocuments: HRDocument[];
  employeeDocuments: EmployeeDocument[];
  departments: Department[];
  payrollConfig: PayrollConfig | null;
  payrollEntries: PayrollEntry[];
  employeeLoans: EmployeeLoan[];
  payrollDrafts: PayrollDraft[];
  payrollPeriod: PayrollPeriod | null;
  payrollLiquidations: PayrollLiquidation[];
  pendingAccounts: PendingAccount[];
  accessPins: AccessPin[];
  roles: Role[];
  actionLogs: any[];
  warehouses: Warehouse[];
  productWarehouse: ProductWarehouse[];
  currentWarehouseId: string | null;
  isLoading: boolean;
  isFetchingWarehouses: boolean;
  employeesPage: number;
  employeesTotal: number;
  departmentsPage: number;
  departmentsTotal: number;
  payrollPage: number;
  payrollMonthFilter: number;
  payrollYearFilter: number;
  payrollTotal: number;
  employeeSearchTerm: string;
  departmentSearchTerm: string;

  fetchAll: (limit?: number) => Promise<void>;
  fetchMore: (limit?: number) => Promise<{ hasMore: boolean }>;
  addProduct: (product: Omit<Product, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  addMovement: (movement: Omit<Movement, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  justifyMovement: (id: string, justification: string) => Promise<void>;

  consumeFromTransit: (productId: string, quantity: number, reason?: string) => Promise<{ success: boolean; error?: string }>;
  cancelTransit: (transitItemId: string, quantity: number, reason: string) => Promise<{ success: boolean; error?: string }>;
  registerWasteFromTransit: (transitItemId: string, quantity: number, reason: string) => Promise<{ success: boolean; error?: string }>;
  registerManualConsumption: (transitItemId: string, quantity: number, note?: string) => Promise<{ success: boolean; error?: string }>;

  addSale: (sale: Omit<Sale, 'id' | 'user_id' | 'created_at'>) => Promise<{ success: boolean; saleId?: string; error?: string }>;

  addRecipe: (recipe: Omit<Recipe, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  updateRecipe: (id: string, updates: Partial<Recipe>) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;

  addEmployee: (employee: Omit<Employee, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  updateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;

  addCategory: (name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  recalculateStock: () => Promise<void>;
  createDailyClosing: (closing: Omit<DailyClosing, 'id' | 'created_at'>) => Promise<{ success: boolean; error?: string }>;
  getDailyClosings: () => Promise<void>;
  fetchInvoices: (filters?: { year?: number; month?: string; status?: string; q?: string }) => Promise<void>;
  fetchInvoiceItems: (invoiceId: string) => Promise<InvoiceItem[]>;
  createInvoiceManual: (payload: { client_name: string; date?: string; items: { description: string; quantity: number; price: number }[]; discount?: number; tax_rate?: number; payment_method?: string | null; efectivo?: number; transferencia?: number; usd?: number; eur?: number; notes?: string }) => Promise<{ success: boolean; invoice?: Invoice; error?: string }>;
  createInvoiceFromSale: (saleId: string, clientName?: string) => Promise<{ success: boolean; invoice?: Invoice; error?: string }>;
  voidInvoice: (id: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  invoiceReport: (year: number, month: string) => Promise<any>;

  uploadHRDocument: (file: File, docType: 'MANUAL' | 'REGLAMENTO' | 'PNO') => Promise<{ success: boolean; error?: string }>;
  fetchHRDocuments: () => Promise<void>;
  deleteHRDocument: (id: string, fileUrl: string) => Promise<void>;

  uploadEmployeeDocument: (file: File, employeeId: string, docType: 'CONTRATO' | 'IDENTIFICACION' | 'OTRO', name?: string) => Promise<{ success: boolean; error?: string }>;

  createPendingAccount: (clientName: string) => Promise<{ success: boolean; error?: string; accountId?: string }>;
addItemsToPendingAccount: (accountId: string, items: { product_id: string; product_name: string; quantity: number; unit_price: number; subtotal: number; is_recipe?: boolean; recipe_snapshot?: { name: string; ingredients: { product_id: string; quantity: number; cost: number }[] } }[], isAccountHouse?: boolean, saleType?: 'SALON' | 'DOMICILIO' | 'BAR' | 'VENTA_RAPIDA')
    => Promise<{ success: boolean; error?: string }>;
  updatePendingAccount: (accountId: string, updates: Partial<PendingAccount>) => Promise<{ success: boolean; error?: string }>;
  updatePendingAccountItems: (accountId: string, items: PendingItem[]) => Promise<{ success: boolean; error?: string }>;
  togglePendingAccountType: (accountId: string) => Promise<{ success: boolean; error?: string }>;
  deletePendingAccount: (accountId: string) => Promise<{ success: boolean; error?: string }>;
  getPendingAccounts: () => Promise<void>;
  chargePendingAccount: (accountId: string, employeeId: string, employeeName: string, saleDate?: string, paymentMethod?: string, efectivo?: number, transferencia?: number, usd?: number, eur?: number) => Promise<{ success: boolean; error?: string }>;

  saveAccessPin: (params: { roleId?: string; roleName?: string; modules?: string[]; pin: string; name: string; pinId?: string }) => Promise<{ success: boolean; error?: string }>;
  toggleAccessPin: (pinId: string, isActive: boolean) => Promise<{ success: boolean; error?: string }>;
  deleteAccessPin: (pinId: string) => Promise<{ success: boolean; error?: string }>;
  deleteRole: (roleId: string) => Promise<{ success: boolean; error?: string }>;
  fetchRoles: () => Promise<void>;
  verifyPinForModule: (modulePath: string, pin: string) => Promise<{ success: boolean; error?: string; blocked?: boolean; remainingTime?: number }>;
  verifyPinSimple: (pin: string) => Promise<{ success: boolean; error?: string; blocked?: boolean; remainingTime?: number; role?: string }>;
  verifiedRole: string | null;
  verifiedRoleName: string | null;
  verifiedRoleModules: string[] | null;
  clearVerifiedRole: () => void;
  fetchEmployeeDocuments: (employeeId: string) => Promise<void>;
  deleteEmployeeDocument: (id: string, fileUrl: string) => Promise<void>;

  addDepartment: (name: string) => Promise<void>;
  updateDepartment: (id: string, name: string) => Promise<void>;
  deleteDepartment: (id: string) => Promise<void>;

  getPayrollConfig: () => Promise<void>;
  updatePayrollConfig: (updates: Partial<PayrollConfig>) => Promise<void>;

  calculatePayroll: (month: number, year: number) => Promise<void>;
  getPayrollEntries: (month: number, year: number) => Promise<void>;
  updatePayrollEntry: (id: string, updates: Partial<PayrollEntry>) => Promise<void>;
  regeneratePayrollEntry: (id: string) => Promise<void>;
  // Captación pre-nómina y estados de la nómina
  getPayrollDrafts: (month: number, year: number) => Promise<void>;
  savePayrollDrafts: (month: number, year: number, rows: Partial<PayrollDraft>[]) => Promise<void>;
  getPayrollPeriod: (month: number, year: number) => Promise<void>;
  applyPayroll: (month: number, year: number) => Promise<void>;
  reopenPayroll: (month: number, year: number) => Promise<void>;

  getEmployeeLoans: () => Promise<void>;
  addLoan: (loan: { employee_id: string; total_amount: number; monthly_payment: number; start_date?: string; deduction_type?: EmployeeLoan['deduction_type']; reason?: string }) => Promise<void>;
  updateLoan: (id: string, updates: Partial<EmployeeLoan>) => Promise<void>;
  deleteLoan: (id: string) => Promise<void>;
  payLoanInstallment: (id: string) => Promise<void>;

  getLiquidations: () => Promise<void>;
  saveLiquidation: (liq: Omit<PayrollLiquidation, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  deleteLiquidation: (id: string) => Promise<void>;

  // Paginación optimizada
  getEmployeesPaginated: (page: number, search?: string, departmentId?: string, sortBy?: 'name' | 'salary', sortOrder?: 'asc' | 'desc') => Promise<void>;
  getDepartmentsPaginated: (page: number, search?: string) => Promise<void>;
  getPayrollEntriesPaginated: (page: number, month: number, year: number) => Promise<void>;
  getPayrollEntriesCount: (month: number, year: number) => Promise<number>;
  getEmployeesCount: (search?: string, departmentId?: string) => Promise<number>;
  getDepartmentsCount: (search?: string) => Promise<number>;

  forceRefreshData: () => Promise<void>;

  // Warehouse management
  fetchWarehouses: () => Promise<void>;
  setCurrentWarehouse: (warehouseId: string) => void;
  fetchProductWarehouse: (skipAutoHeal?: boolean) => Promise<void>;
  updateProductWarehouseQuantity: (productId: string, warehouseId: string, quantity: number, skipAutoHeal?: boolean) => Promise<void>;

  // Logging de acciones
  logAction: (module: string, action: string, details?: Record<string, any>) => Promise<void>;
  getActionLogs: () => Promise<void>;
  hashPin: (pin: string) => Promise<string>;
}

export const useDatabaseStore = create<DatabaseState>()((set, get) => ({
  products: [],
  movements: [],
  sales: [],
  recipes: [],
  employees: [],
  categories: [],
  transitItems: [],
  dailyClosings: [],
  invoices: [],
  hrDocuments: [],
  employeeDocuments: [],
  departments: [],
  payrollConfig: null,
  payrollEntries: [],
  employeeLoans: [],
  payrollDrafts: [],
  payrollPeriod: null,
  payrollLiquidations: [],
  accessPins: [],
  roles: [],
  // Paginación
  employeesPage: 1,
  employeesTotal: 0,
  departmentsPage: 1,
  departmentsTotal: 0,
  payrollPage: 1,
  payrollTotal: 0,
  employeeSearchTerm: '',
  departmentSearchTerm: '',
  payrollMonthFilter: 0,
  payrollYearFilter: 0,
  verifiedRole: typeof window !== 'undefined' ? localStorage.getItem('verifiedRole') : null,
  verifiedRoleName: typeof window !== 'undefined' ? localStorage.getItem('verifiedRoleName') : null,
  verifiedRoleModules: typeof window !== 'undefined' ? (() => {
    try {
      const v = localStorage.getItem('verifiedModules');
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  })() : null,
  actionLogs: [],
  warehouses: [],
  productWarehouse: [],
  currentWarehouseId: null,
  pendingAccounts: [],
  isLoading: true,
  isFetchingWarehouses: false,

  clearVerifiedRole: () => {
    localStorage.removeItem('verifiedRole');
    localStorage.removeItem('verifiedRoleName');
    localStorage.removeItem('verifiedModules');
    set({ verifiedRole: null, verifiedRoleName: null, verifiedRoleModules: null });
  },

  fetchAll: async (limit = 50) => {
    if (_isFetchingAll) {
      logger.info('fetchAll ya en progreso, ignorando...');
      return;
    }
    _isFetchingAll = true;

    const user = useAuthStore.getState().user;
    if (!user) {
      set({ products: [], movements: [], sales: [], recipes: [], employees: [], categories: [], transitItems: [], dailyClosings: [], invoices: [], hrDocuments: [], employeeDocuments: [], departments: [], payrollConfig: null, payrollEntries: [], employeeLoans: [], payrollDrafts: [], payrollPeriod: null, payrollLiquidations: [], pendingAccounts: [], accessPins: [], roles: [], actionLogs: [], warehouses: [], productWarehouse: [], currentWarehouseId: null, isLoading: false });
      _isFetchingAll = false;
      return;
    }

    set({ isLoading: true });

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // ── Grupo 1: Productos y Movimientos ──
    let productsData: any[] | null = null;
    let movementsData: any[] | null = null;

    try {
      logger.info('📥 Cargando datos principales...');
      const [productsRes, movementsRes] = await Promise.all([
        queryWithRetry(() => localDb.from('products').select('*').eq('user_id', user.id).order('created_at', { ascending: false })),
        queryWithRetry(() => localDb.from('movements').select('*').eq('user_id', user.id).order('created_at', { ascending: false })),
      ]);
      productsData = productsRes.data || [];
      movementsData = movementsRes.data || [];
      set({ products: productsData ?? [], movements: movementsData ?? [] });
      await delay(100);
    } catch (e) {
      logger.error('❌ Grupo 1 (productos/movimientos) falló:', e);
    }

    // ── Grupo 2: Ventas y Recetas ──
    let salesData: any[] | null = null;
    let recipesData: any[] | null = null;

    try {
      logger.info('📥 Cargando ventas y recetas...');
      const [salesRes, recipesRes] = await Promise.all([
        queryWithRetry(() => localDb.from('sales').select('*, sale_items(*)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5000)),
        queryWithRetry(() => localDb.from('recipes').select('*, recipe_ingredients(*)').eq('user_id', user.id).order('created_at', { ascending: false })),
      ]);
      salesData = salesRes.data?.map((s: any) => ({ ...s, items: s.sale_items || [] })) || [];
      recipesData = recipesRes.data?.map((r: any) => ({ ...r, ingredients: r.recipe_ingredients || [] })) || [];
      set({ sales: salesData ?? [], recipes: recipesData ?? [] });
      await delay(100);
    } catch (e) {
      logger.error('❌ Grupo 2 (ventas/recetas) falló:', e);
    }

    // ── Grupo 3: Empleados y RRHH ──
    let employeesData: any[] | null = null;
    let categoriesData: any[] | null = null;
    let hrDocsData: any[] | null = null;
    let departmentsData: any[] | null = null;

    try {
      logger.info('📥 Cargando empleados y RRHH...');
      const [employeesRes, categoriesRes, hrDocsRes, departmentsRes] = await Promise.all([
        queryWithRetry(() => localDb.from('employees').select('*').eq('user_id', user.id).order('created_at', { ascending: false })),
        queryWithRetry(() => localDb.from('categories').select('*').eq('user_id', user.id).order('created_at', { ascending: false })),
        queryWithRetry(() => localDb.from('hr_documents').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5000)),
        queryWithRetry(() => localDb.from('departments').select('*').eq('user_id', user.id).order('name', { ascending: true })),
      ]);
      employeesData = employeesRes.data || [];
      categoriesData = categoriesRes.data || [];
      hrDocsData = hrDocsRes.data || [];
      departmentsData = departmentsRes.data || [];
      set({ employees: employeesData ?? [], categories: categoriesData ?? [], hrDocuments: hrDocsData ?? [], departments: departmentsData ?? [] });
      await delay(100);
    } catch (e) {
      logger.error('❌ Grupo 3 (empleados/RRHH) falló:', e);
    }

    // ── Grupo 4: Tránsito, Cierres, Configuración ──
    let transitItemsData: any[] | null = null;
    let dailyClosingsData: any[] | null = null;
    let pendingData: any[] | null = null;
    let accessPinsData: any[] | null = null;
    let rolesData: any[] | null = null;
    let actionLogsData: any[] | null = null;
    let payrollConfigData: any = null;
    let employeeLoansData: any[] | null = null;
    let liquidationsData: any[] | null = null;
    let warehousesData: any[] | null = null;
    let productWarehouseData: any[] | null = null;

    try {
      logger.info(' Cargando cierres y configuración (parte 1/2)...');
      const [transitRes, dailyClosingsRes, pendingRes, accessPinsRes, rolesRes] = await Promise.all([
        queryWithRetry(() => localDb.from('transit_items').select('*').eq('user_id', user.id).order('created_at', { ascending: false })),
        queryWithRetry(() => localDb.from('daily_closings').select('*').eq('user_id', user.id).order('closing_date', { ascending: false }).limit(5000)),
        queryWithRetry(() => localDb.from('pending_accounts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5000)),
        queryWithRetry(() => localDb.from('access_pins').select('*').eq('user_id', user.id)),
        queryWithRetry(() => localDb.from('roles').select('*').eq('user_id', user.id)),
      ]);
      transitItemsData = (transitRes.data || []).filter((t: any) => t.remaining > 0);
      dailyClosingsData = dailyClosingsRes.data || [];
      pendingData = (pendingRes.data || []).filter((p: any) => p.status === 'pending');
      accessPinsData = accessPinsRes.data || [];
      rolesData = (rolesRes.data || []).map((r: any) => ({ ...r, modules: normalizeRoleModules(r.modules) }));
      await delay(100);

      logger.info('📥 Cargando cierres y configuración (parte 2/2)...');
      const [actionLogsRes, payrollConfigRes, employeeLoansRes, liquidationsRes, warehousesRes, productWarehouseRes] = await Promise.all([
        queryWithRetry(() => localDb.from('action_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5000)),
        queryWithRetry(() => localDb.from('payroll_config').select('*').eq('user_id', user.id).maybeSingle()),
        queryWithRetry(() => localDb.from('employee_loans').select('*').eq('user_id', user.id).order('created_at', { ascending: false })),
        queryWithRetry(() => localDb.from('payroll_liquidations').select('*').eq('user_id', user.id).order('created_at', { ascending: false })),
        queryWithRetry(() => localDb.from('warehouses').select('*').eq('user_id', user.id).order('name')),
        queryWithRetry(() => localDb.from('product_warehouse').select('*')),
      ]);
      actionLogsData = actionLogsRes.data || [];
      payrollConfigData = payrollConfigRes.data || null;
      employeeLoansData = employeeLoansRes.data || [];
      liquidationsData = liquidationsRes.data || [];
      warehousesData = warehousesRes.data || [];
      productWarehouseData = productWarehouseRes.data || [];
    } catch (e) {
      logger.error('❌ Grupo 4 (cierres/configuración) falló:', e);
    }

    // ── Computar in_transit y commit final ──
    // Usar los datos actuales del store como fallback para cada grupo que no se haya cargado
    const currentState = get();
    const effectiveTransitItems = transitItemsData ?? currentState.transitItems;
    const effectiveMovements = movementsData ?? currentState.movements;

    // Recalcular quantity desde movements (más fiable que el valor en BD).
    // ENTRADA/AJUSTE siempre suman (el stock inicial legacy puede no tener warehouse_id).
    // SALIDA/MERMA restan solo si tienen warehouse_id: las ventas/consumos desde tránsito
    // (sin warehouse_id) no descontaron el almacén y no deben contarse aquí.
    const qtyFromMovements = new Map<string, number>();
    for (const m of effectiveMovements) {
      const current = qtyFromMovements.get(m.product_id) || 0;
      if (m.type === 'ENTRADA') qtyFromMovements.set(m.product_id, current + Number(m.quantity));
      else if (m.type === 'AJUSTE') qtyFromMovements.set(m.product_id, current + Number(m.quantity));
      else if ((m.type === 'SALIDA' || m.type === 'MERMA') && (m as any).warehouse_id) {
        qtyFromMovements.set(m.product_id, current - Number(m.quantity));
      }
    }

    const productsWithTransit = (productsData ?? currentState.products).map(p => {
      const totalInTransit = effectiveTransitItems
        .filter((t: any) => t.product_id === p.id)
        .reduce((sum: number, t: any) => sum + Number(t.remaining), 0);
      const computedQty = qtyFromMovements.has(p.id)
        ? Math.max(0, qtyFromMovements.get(p.id)!)
        : p.quantity;
      return { ...p, quantity: computedQty, in_transit: totalInTransit };
    });

    // Recalcular productWarehouse.quantity desde movements con warehouse_id
    const qtyPerWarehouse = new Map<string, number>();
    for (const m of effectiveMovements) {
      if (!(m as any).warehouse_id) continue;
      const key = `${m.product_id}::${(m as any).warehouse_id}`;
      const current = qtyPerWarehouse.get(key) || 0;
      if (m.type === 'ENTRADA') qtyPerWarehouse.set(key, current + Number(m.quantity));
      else if (m.type === 'SALIDA' || m.type === 'MERMA') qtyPerWarehouse.set(key, current - Number(m.quantity));
      else if (m.type === 'AJUSTE') qtyPerWarehouse.set(key, current + Number(m.quantity));
    }

    const effectiveProductWarehouse = productWarehouseData ?? currentState.productWarehouse;
    const productWarehouseWithTransit = effectiveProductWarehouse.map((pw: any) => {
      const transitForWarehouse = effectiveTransitItems
        .filter((t: any) => t.product_id === pw.product_id && t.warehouse_id === pw.warehouse_id)
        .reduce((sum: number, t: any) => sum + Number(t.remaining), 0);
      const key = `${pw.product_id}::${pw.warehouse_id}`;
      const computedQty = qtyPerWarehouse.has(key)
        ? Math.max(0, qtyPerWarehouse.get(key)!)
        : pw.quantity;
      return { ...pw, quantity: computedQty, in_transit: transitForWarehouse };
    });

    set({
      products: productsWithTransit,
      movements: effectiveMovements,
      sales: salesData ?? currentState.sales,
      recipes: recipesData ?? currentState.recipes,
      employees: employeesData ?? currentState.employees,
      categories: categoriesData ?? currentState.categories,
      transitItems: effectiveTransitItems,
      dailyClosings: dailyClosingsData ?? currentState.dailyClosings,
      hrDocuments: hrDocsData ?? currentState.hrDocuments,
      departments: departmentsData ?? currentState.departments,
      payrollConfig: payrollConfigData !== null ? payrollConfigData : currentState.payrollConfig,
      employeeLoans: employeeLoansData ?? currentState.employeeLoans,
      payrollLiquidations: liquidationsData ?? currentState.payrollLiquidations,
      pendingAccounts: pendingData ?? currentState.pendingAccounts,
      accessPins: accessPinsData ?? currentState.accessPins,
      roles: rolesData ?? currentState.roles,
      actionLogs: actionLogsData ?? currentState.actionLogs,
      warehouses: warehousesData ?? currentState.warehouses,
      productWarehouse: productWarehouseWithTransit,
      isLoading: false,
    });

    logger.info('✅ Datos cargados completamente');
    localStorage.setItem('lastSyncedAt', new Date().toISOString());

    // Auto-crear almacén "Almacén" para usuarios nuevos
    if (warehousesData === null || warehousesData.length === 0) {
      logger.info('⚠️ No hay warehouses — disparando fetchWarehouses para auto-crear el principal');
      await get().fetchWarehouses();
    } else if (!get().currentWarehouseId) {
      const mainWarehouse = warehousesData.find((w: any) => w.is_main) || warehousesData[0];
      if (mainWarehouse) {
        set({ currentWarehouseId: mainWarehouse.id });
      }
    }
    _isFetchingAll = false;
  },

  fetchMore: async (limit = 50) => {
    const user = useAuthStore.getState().user;
    if (!user || get().isLoading) {
      return { hasMore: false };
    }

    try {
      const currentProducts = get().products;
      const currentMovements = get().movements;
      const currentSales = get().sales;
      const currentActionLogs = get().actionLogs;

      const lastProduct = currentProducts[currentProducts.length - 1];
      const lastMovement = currentMovements[currentMovements.length - 1];
      const lastSale = currentSales[currentSales.length - 1];
      const lastLog = currentActionLogs[currentActionLogs.length - 1];

      const [productsRes, movementsRes, salesRes, actionLogsRes] = await Promise.all([
        lastProduct 
          ? localDb.from('products').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).lt('created_at', lastProduct.created_at).limit(limit)
          : Promise.resolve({ data: [], count: 0, error: null }),
        lastMovement
          ? localDb.from('movements').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).lt('created_at', lastMovement.created_at).limit(limit)
          : Promise.resolve({ data: [], count: 0, error: null }),
        lastSale
          ? localDb.from('sales').select('*, sale_items(*)').eq('user_id', user.id).order('created_at', { ascending: false }).lt('created_at', lastSale.created_at).limit(limit)
          : Promise.resolve({ data: [], count: 0, error: null }),
        lastLog
          ? localDb.from('action_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).lt('created_at', lastLog.created_at).limit(limit)
          : Promise.resolve({ data: [], count: 0, error: null }),
      ]);

      const newSales = salesRes.data?.map((s: any) => ({
        ...s,
        items: s.sale_items || [],
      })) || [];

      const hasMoreProducts = productsRes.data?.length === limit;
      const hasMoreMovements = movementsRes.data?.length === limit;
      const hasMoreSales = newSales.length === limit;
      const hasMoreLogs = actionLogsRes.data?.length === limit;

      set({
        products: [...currentProducts, ...(productsRes.data || [])],
        movements: [...currentMovements, ...(movementsRes.data || [])],
        sales: [...currentSales, ...newSales],
        actionLogs: [...currentActionLogs, ...(actionLogsRes.data || [])],
      });

      return { 
        hasMore: hasMoreProducts || hasMoreMovements || hasMoreSales || hasMoreLogs 
      };
    } catch (error) {
      logger.error('Error en fetchMore:', error);
      return { hasMore: false };
    }
  },

addProduct: async (product) => {
    const { user } = useAuthStore.getState();
    if (!user) throw new Error('No hay usuario autenticado');

    const isDuplicate = get().products.some(
      p => p.user_id === user.id && p.is_active === true && normalizeStr(p.name) === normalizeStr(product.name)
    );

    if (isDuplicate) {
      throw new Error(`El producto "${product.name}" ya existe.`);
    }

    const productId = uuid();
    const now = new Date().toISOString();

    const productData: Product = {
      ...product,
      id: productId,
      name: capitalize(product.name),
      category: capitalize(product.category),
      user_id: user.id,
      expiration_date: product.expiration_date || null,
      created_at: now,
      updated_at: now,
    } as Product;

    const saveProductOffline = async (silent?: boolean) => {
      set((state) => ({ products: [productData, ...state.products] }));
      const mainWarehouse = get().warehouses.find(w => w.is_main) || get().warehouses[0];
      let pwEntry: any = null;
      if (mainWarehouse && Number(product.quantity) > 0) {
        pwEntry = {
          id: uuid(), product_id: productId, warehouse_id: mainWarehouse.id,
          quantity: Number(product.quantity), in_transit: 0, updated_at: now,
        };
        set((state) => ({ productWarehouse: [...state.productWarehouse, pwEntry] }));
      }

      const payload: any = { product: productData };
      let offlineMovement: Movement | null = null;
      if (Number(product.quantity) > 0) {
        const movementId = uuid();
        offlineMovement = {
          id: movementId, user_id: user.id, product_id: productId, type: 'ENTRADA',
          quantity: Number(product.quantity), unit: product.unit, date: now,
          cost: Number(product.cost), reason: 'Stock inicial (Registro de producto)',
          status: 'NORMAL', warehouse_id: mainWarehouse?.id || undefined, created_at: now,
        };
        payload.movement = offlineMovement;
        set((state) => ({ movements: [offlineMovement!, ...state.movements] }));
        if (mainWarehouse) {
          payload.productWarehouse = [{
            product_id: productId, warehouse_id: mainWarehouse.id,
            quantity: Number(product.quantity), in_transit: 0,
          }];
        }
      }


      if (!silent) {
        toast.success('Producto guardado localmente — se sincronizará al reconectar');
      }
    };

    if (!IS_ONLINE) {
      await saveProductOffline();
      return;
    }

    trackLocalCreation(productId);
    try {
      const { data, error } = await queryWithRetry(() =>
        localDb
          .from('products')
          .insert(productData)
          .select()
          .single()
      );

      if (error) {
        logger.error('Error adding product:', error);
        if (isNetworkError(error)) {
          await saveProductOffline();
          return;
        }
        throw new Error(error.message || 'Error al crear el producto');
      }

      if (Number(product.quantity) > 0) {
        const mainWarehouse = get().warehouses.find(w => w.is_main) || get().warehouses[0];

        const { error: movementError } = await queryWithRetry(() =>
          localDb
            .from('movements')
            .insert({
              user_id: user.id,
              product_id: data.id,
              type: 'ENTRADA',
              quantity: Number(product.quantity),
              unit: product.unit,
              date: now,
              cost: Number(product.cost),
              reason: 'Stock inicial (Registro de producto)',
              status: 'NORMAL',
              warehouse_id: mainWarehouse?.id || null,
            })
        );

        if (movementError && import.meta.env.DEV) {
          logger.error('Error creating initial movement:', movementError);
        }
      }

      const warehouses = get().warehouses;
      const mainWarehouse = warehouses.find(w => w.is_main) || warehouses[0];
      for (const warehouse of warehouses) {
        const initialQty = (warehouse.id === mainWarehouse?.id) ? Number(product.quantity) || 0 : 0;
        await queryWithRetry(() =>
          localDb.from('product_warehouse').upsert({
            product_id: data.id,
            warehouse_id: warehouse.id,
            quantity: initialQty,
            in_transit: 0
          }, { onConflict: 'product_id,warehouse_id' })
        );
      }

      await get().fetchAll();
      await get().fetchProductWarehouse();

      toast.success('Producto guardado exitosamente');
    } catch (error: any) {
      logger.error('Error en addProduct:', error);
      throw new Error(error.message || 'Error al crear el producto');
    } finally {
      untrackLocalCreation(productId);
    }
  },

  updateProduct: async (id, updates) => {
    const { user } = useAuthStore.getState();
    if (!user) throw new Error('No hay usuario autenticado');

    if (updates.name !== undefined) {
      const isDuplicate = get().products.some(
        p => p.id !== id && p.user_id === user.id && p.is_active === true && normalizeStr(p.name) === normalizeStr(updates.name!)
      );

      if (isDuplicate) {
        throw new Error(`El producto "${updates.name}" ya existe.`);
      }
    }

    const capitalizedUpdates = {
      ...updates,
      ...(updates.name !== undefined && { name: capitalize(updates.name) }),
      ...(updates.category !== undefined && { category: capitalize(updates.category) }),
      updated_at: new Date().toISOString(),
    };

    if (!IS_ONLINE) {
      set((state) => ({
        products: state.products.map(p => p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p),
      }));

      toast.success('Producto actualizado localmente (sin conexión)');
      return;
    }

    const { error } = await queryWithRetry(() =>
      localDb
        .from('products')
        .update(capitalizedUpdates)
        .eq('id', id)
    );

    if (error) {
      if (isNetworkError(error)) {

        toast.success('Producto actualizado localmente — se sincronizará al reconectar');
        return;
      }
      throw new Error('No se pudo actualizar el producto');
    }

    set((state) => ({
      products: state.products.map(p => p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p),
    }));
  },

  deleteProduct: async (id) => {
    if (!IS_ONLINE) {
      set((state) => ({
        products: state.products.map(p => p.id === id ? { ...p, is_active: false } : p),
      }));

      const productToDeactivate = get().products.find(p => p.id === id);
      toast.success('Producto eliminado (sin conexión)');
      return;
    }

    const { error } = await queryWithRetry(() =>
      localDb
        .from('products')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
    );

    if (error) {
      if (isNetworkError(error)) {

        toast.success('Producto eliminado — se sincronizará al reconectar');
        return;
      }
      throw new Error('No se pudo eliminar el producto');
    }

    set((state) => ({
      products: state.products.map(p => p.id === id ? { ...p, is_active: false } : p),
    }));
    toast.success('Producto eliminado');
  },

  addMovement: async (movement) => withMovementLock(async () => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('No hay usuario autenticado');

    const movementDate = movement.date || new Date().toISOString();
    if (isDateClosed(get().dailyClosings, new Date(movementDate).toISOString().split('T')[0])) {
      throw new Error('El día está cerrado, no se pueden registrar movimientos');
    }
    const product = get().products.find(p => p.id === movement.product_id);
    if (!product) throw new Error('Producto no encontrado');

    const saveOffline = async () => {
      const movementId = uuid();
      const offlineMovement = { ...movement, id: movementId, user_id: user.id, date: movementDate, created_at: new Date().toISOString() } as Movement;

      if (movement.warehouse_id) {
        const pw = get().productWarehouse.find(p => p.product_id === movement.product_id && p.warehouse_id === movement.warehouse_id);
        const currentQty = pw ? Number(pw.quantity) : 0;
        let newQty = currentQty;
        if (movement.type === 'ENTRADA') newQty = currentQty + Number(movement.quantity);
        else if (movement.type === 'SALIDA') {
          if (currentQty < Number(movement.quantity)) {
            throw new Error(`Stock insuficiente en almacén para ${product.name}: disponible ${currentQty}, solicitado ${movement.quantity}`);
          }
          newQty = currentQty - Number(movement.quantity);
        }
        else if (movement.type === 'MERMA') {
          if (currentQty < Number(movement.quantity)) {
            throw new Error(`Stock insuficiente en almacén para ${product.name}: disponible ${currentQty}, solicitado ${movement.quantity}`);
          }
          newQty = Math.max(0, currentQty - Number(movement.quantity));
        }
        else if (movement.type === 'AJUSTE') newQty = Math.max(0, currentQty + Number(movement.quantity));

        set((state) => ({
          productWarehouse: state.productWarehouse.map(pw =>
            pw.product_id === movement.product_id && pw.warehouse_id === movement.warehouse_id
              ? { ...pw, quantity: newQty } : pw
          ),
          products: movement.type !== 'SALIDA' ? state.products.map(p =>
            p.id === movement.product_id
              ? { ...p, quantity: Math.max(0, newQty) }
              : p
          ) : state.products,
        }));

        if (movement.type === 'ENTRADA') {
          const unitCost = Number(movement.cost) || Number(product.cost);
          const currentTotalValue = currentQty * Number(product.cost);
          const newTotalValue = Number(movement.quantity) * unitCost;
          const totalQty = currentQty + Number(movement.quantity);

          if (totalQty > 0) {
            const newCost = (currentTotalValue + newTotalValue) / totalQty;
            set((state) => ({
              products: state.products.map(p =>
                p.id === movement.product_id ? { ...p, cost: newCost } : p
              ),
            }));
          }
        }

        if (movement.type === 'SALIDA') {
          const transitId = uuid();
          const transitItem = {
            id: transitId, user_id: user.id, product_id: movement.product_id,
            quantity: Number(movement.quantity), consumed: 0, remaining: Number(movement.quantity),
            reason: movement.reason || 'Enviado a cocina/preparacion', sent_date: movementDate,
            created_at: new Date().toISOString(),
            warehouse_id: movement.warehouse_id,
          } as TransitItem;
          set((state) => ({
            transitItems: [transitItem, ...state.transitItems],
            products: state.products.map(p =>
              p.id === movement.product_id
                ? { ...p, quantity: Math.max(0, Number(p.quantity || 0) - Number(movement.quantity)), in_transit: Number(p.in_transit || 0) + Number(movement.quantity) }
                : p
            ),
          }));
        }
      } else {
        let newQuantity = Number(product.quantity);
        let newInTransit = Number(product.in_transit) || 0;
        if (movement.type === 'ENTRADA') newQuantity += Number(movement.quantity);
        else if (movement.type === 'SALIDA') {
          if (newQuantity < Number(movement.quantity)) {
            throw new Error(`Stock insuficiente para ${product.name}: disponible ${newQuantity}, solicitado ${movement.quantity}`);
          }
          newQuantity = newQuantity - Number(movement.quantity);
          newInTransit += Number(movement.quantity);
        }
        else if (movement.type === 'MERMA') {
          if (newQuantity < Number(movement.quantity)) {
            throw new Error(`Stock insuficiente para ${product.name}: disponible ${newQuantity}, solicitado ${movement.quantity}`);
          }
          newQuantity -= Number(movement.quantity);
        }
        else if (movement.type === 'AJUSTE') newQuantity += Number(movement.quantity);

        set((state) => ({
          products: state.products.map(p => p.id === movement.product_id
            ? { ...p, quantity: Math.max(0, newQuantity), in_transit: movement.type === 'SALIDA' ? newInTransit : p.in_transit } : p
          ),
        }));

        if (movement.type === 'SALIDA') {
          const transitId = uuid();
          const transitItem = {
            id: transitId, user_id: user.id, product_id: movement.product_id,
            quantity: Number(movement.quantity), consumed: 0, remaining: Number(movement.quantity),
            reason: movement.reason || 'Enviado a cocina/preparacion', sent_date: movementDate,
            created_at: new Date().toISOString(),
            warehouse_id: movement.warehouse_id,
          } as TransitItem;
          set((state) => ({ transitItems: [transitItem, ...state.transitItems] }));
        }
      }

      set((state) => ({ movements: [offlineMovement, ...state.movements] }));


      toast.success('Movimiento guardado localmente (sin conexión)');

    };

    if (!IS_ONLINE) {
      await saveOffline();
      return;
    }

    const movementId = uuid();
    trackLocalCreation(movementId);
    try {
      const { data: { session } } = await localDb.auth.getSession();
      if (!session) throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');

      const movementRow = { ...movement, id: movementId, user_id: user.id, date: movementDate };

      // Todas las escrituras del movimiento van en UNA transacción (/api/query/batch):
      // el servidor valida permisos por comando ANTES de ejecutar y revierte todo si
      // alguno falla. Así no quedan movimientos fantasma ni stock a medias, sin
      // importar qué combinación de módulos tenga el rol.
      const commands: any[] = [
        { table: 'movements', method: 'insert', data: movementRow },
      ];

      // Estado local optimista que se aplica SOLO si la transacción tuvo éxito.
      let pwRowNew: { id: string; quantity: number } | null = null;
      let pwQty: number | null = null;
      let localTransitItem: TransitItem | null = null;
      let localProductFields: Partial<Product> | null = null;

      if (movement.warehouse_id) {
        const pw = get().productWarehouse.find(
          p => p.product_id === movement.product_id && p.warehouse_id === movement.warehouse_id
        );
        const currentQty = pw ? Number(pw.quantity) : 0;

        let newQty = currentQty;
        if (movement.type === 'ENTRADA') {
          newQty = currentQty + Number(movement.quantity);
        } else if (movement.type === 'SALIDA') {
          if (currentQty < Number(movement.quantity)) {
            throw new Error(`Stock insuficiente en almacén para ${product.name}: disponible ${currentQty}, solicitado ${movement.quantity}`);
          }
          newQty = currentQty - Number(movement.quantity);
        } else if (movement.type === 'MERMA') {
          if (currentQty < Number(movement.quantity)) {
            throw new Error(`Stock insuficiente en almacén para ${product.name}: disponible ${currentQty}, solicitado ${movement.quantity}`);
          }
          newQty = Math.max(0, currentQty - Number(movement.quantity));
        } else if (movement.type === 'AJUSTE') {
          newQty = Math.max(0, currentQty + Number(movement.quantity));
        }

        // Escritura de la fila product_warehouse (update si existe, insert si no).
        pwQty = newQty;
        if (pw) {
          commands.push({
            table: 'product_warehouse',
            method: 'update',
            data: { quantity: newQty, updated_at: new Date().toISOString() },
            filters: [{ op: 'eq', column: 'id', value: pw.id }],
          });
        } else {
          pwRowNew = { id: uuid(), quantity: newQty };
          commands.push({
            table: 'product_warehouse',
            method: 'insert',
            data: {
              id: pwRowNew.id,
              product_id: movement.product_id,
              warehouse_id: movement.warehouse_id,
              quantity: newQty,
              in_transit: 0,
              updated_at: new Date().toISOString(),
            },
          });
        }

        if (movement.type === 'ENTRADA') {
          // Costo promedio ponderado sobre product.cost
          const unitCost = Number(movement.cost) || Number(product.cost);
          const currentTotalValue = currentQty * Number(product.cost);
          const newTotalValue = Number(movement.quantity) * unitCost;
          const totalQty = currentQty + Number(movement.quantity);

          localProductFields = { quantity: Math.max(0, Number(product.quantity || 0) + Number(movement.quantity)) };
          if (totalQty > 0) {
            const newCost = (currentTotalValue + newTotalValue) / totalQty;
            commands.push({
              table: 'products',
              method: 'update',
              data: { cost: newCost },
              filters: [{ op: 'eq', column: 'id', value: product.id }],
            });
            localProductFields.cost = newCost;
          }
        } else if (movement.type === 'SALIDA') {
          const transitItemId = uuid();
          commands.push({
            table: 'transit_items',
            method: 'insert',
            data: {
              id: transitItemId,
              user_id: user.id,
              product_id: movement.product_id,
              quantity: Number(movement.quantity),
              consumed: 0,
              remaining: Number(movement.quantity),
              reason: movement.reason || 'Enviado a cocina/preparacion',
              sent_date: movementDate,
              warehouse_id: movement.warehouse_id,
            },
          });
          localTransitItem = {
            id: transitItemId, user_id: user.id, product_id: movement.product_id,
            quantity: Number(movement.quantity), consumed: 0, remaining: Number(movement.quantity),
            reason: movement.reason || 'Enviado a cocina/preparacion', sent_date: movementDate,
            created_at: new Date().toISOString(),
            warehouse_id: movement.warehouse_id,
          } as TransitItem;
          localProductFields = {
            quantity: Math.max(0, Number(product.quantity || 0) - Number(movement.quantity)),
            in_transit: Number(product.in_transit || 0) + Number(movement.quantity),
          };
        } else if (movement.type === 'MERMA') {
          localProductFields = { quantity: Math.max(0, Number(product.quantity || 0) - Number(movement.quantity)) };
        } else if (movement.type === 'AJUSTE') {
          localProductFields = { quantity: Math.max(0, Number(product.quantity || 0) + Number(movement.quantity)) };
        }

      } else {
        // Sin almacén: los totales viven directamente en products.
        let newQuantity = Number(product.quantity);
        let newInTransit = Number(product.in_transit) || 0;
        const productData: Record<string, any> = {};

        if (movement.type === 'ENTRADA') {
          const unitCost = Number(movement.cost) || Number(product.cost);
          const currentTotalValue = Number(product.quantity) * Number(product.cost);
          const newTotalValue = Number(movement.quantity) * unitCost;
          newQuantity = Number(product.quantity) + Number(movement.quantity);

          if (newQuantity > 0) {
            productData.cost = (currentTotalValue + newTotalValue) / newQuantity;
          }
        } else if (movement.type === 'SALIDA') {
          if (Number(product.quantity) < Number(movement.quantity)) {
            throw new Error(`Stock insuficiente para ${product.name}: disponible ${product.quantity}, solicitado ${movement.quantity}`);
          }
          newQuantity = Number(product.quantity) - Number(movement.quantity);
          newInTransit = newInTransit + Number(movement.quantity);
          productData.in_transit = newInTransit;
        } else if (movement.type === 'MERMA') {
          if (Number(product.quantity) < Number(movement.quantity)) {
            throw new Error(`Stock insuficiente para ${product.name}: disponible ${product.quantity}, solicitado ${movement.quantity}`);
          }
          newQuantity = Number(product.quantity) - Number(movement.quantity);
        } else if (movement.type === 'AJUSTE') {
          newQuantity = Number(product.quantity) + Number(movement.quantity);
        }

        productData.quantity = Math.max(0, newQuantity);
        commands.push({
          table: 'products',
          method: 'update',
          data: productData,
          filters: [{ op: 'eq', column: 'id', value: product.id }],
        });

        localProductFields = {};
        if (productData.cost !== undefined) localProductFields.cost = productData.cost;
        if (productData.in_transit !== undefined) localProductFields.in_transit = productData.in_transit;
        localProductFields.quantity = Math.max(0, newQuantity);

        if (movement.type === 'SALIDA') {
          const transitItemId = uuid();
          const transitReason = movement.reason || 'Enviado a cocina/preparacion';
          commands.push({
            table: 'transit_items',
            method: 'insert',
            data: {
              id: transitItemId,
              user_id: user.id,
              product_id: movement.product_id,
              quantity: Number(movement.quantity),
              consumed: 0,
              remaining: Number(movement.quantity),
              reason: transitReason,
              sent_date: movementDate,
            },
          });
          localTransitItem = {
            id: transitItemId, user_id: user.id, product_id: movement.product_id,
            quantity: Number(movement.quantity), consumed: 0, remaining: Number(movement.quantity),
            reason: transitReason, sent_date: movementDate,
            created_at: new Date().toISOString(),
          } as TransitItem;
        }
      }

      // Ejecutar TODAS las escrituras en una única transacción:
      // o se guarda el movimiento completo, o no se guarda nada.
      const batchRes = await localDb.batch(commands);

      if (batchRes.error) {
        logger.error('Error addMovement (batch):', batchRes.error);
        // Error de red (503 del shim local) → guardar offline en vez de fallar
        if ((batchRes.error as any)?.status === 503) {
          logger.warn('⚠️ Error de red en addMovement — guardando offline');
          await saveOffline();
          return;
        }
        throw new Error(batchRes.error.message || 'No se pudo registrar el movimiento');
      }

      // Éxito: aplicar el estado optimista calculado SOLO ahora.
      if (localProductFields && Object.keys(localProductFields).length > 0) {
        set((state) => ({
          products: state.products.map(p =>
            p.id === movement.product_id ? { ...p, ...localProductFields! } : p
          ),
        }));
      }
      if (localTransitItem) {
        set((state) => ({ transitItems: [localTransitItem, ...state.transitItems] }));
      }
      if (pwRowNew) {
        set((state) => ({
          productWarehouse: [...state.productWarehouse, {
            id: pwRowNew.id,
            product_id: movement.product_id,
            warehouse_id: movement.warehouse_id as string,
            quantity: pwRowNew.quantity,
            in_transit: 0,
            updated_at: new Date().toISOString(),
          }],
        }));
      } else if (pwQty !== null) {
        set((state) => ({
          productWarehouse: state.productWarehouse.map(pw =>
            pw.product_id === movement.product_id && pw.warehouse_id === movement.warehouse_id
              ? { ...pw, quantity: pwQty }
              : pw
          ),
        }));
      }

      set((state) => ({ movements: [{ ...movementRow, created_at: new Date().toISOString() } as Movement, ...state.movements] }));

    } catch (error: any) {
      const errMsg = error?.message || '';
      const isNetworkErr = errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('net::ERR_') || errMsg.includes('TypeError');
      if (isNetworkErr) {
        logger.warn('⚠️ Error de red en addMovement — guardando offline:', error);
        await saveOffline();
        return;
      }
      logger.error('Error en addMovement:', error);
      throw new Error(error.message || 'Error al registrar el movimiento');
    } finally {
      untrackLocalCreation(movementId);
    }
  }),

  justifyMovement: async (id, justification) => {
    if (!IS_ONLINE) {
      set((state) => ({
        movements: state.movements.map(m =>
          m.id === id ? { ...m, status: 'JUSTIFICADO', justification, justification_date: new Date().toISOString() } : m
        ),
      }));

      return;
    }

    try {
      const { error } = await queryWithRetry(() =>
        localDb
          .from('movements')
          .update({ 
            status: 'JUSTIFICADO', 
            justification, 
            justification_date: new Date().toISOString() 
          })
          .eq('id', id)
      );

      if (error) {
        throw new Error('No se pudo justificar el movimiento');
      }

      set((state) => ({
        movements: state.movements.map(m =>
          m.id === id ? { ...m, status: 'JUSTIFICADO', justification, justification_date: new Date().toISOString() } : m
        ),
      }));
    } catch (error: any) {
      logger.error('Error en justifyMovement:', error);
      throw new Error(error.message || 'Error al justificar movimiento');
    }
  },

  fetchWarehouses: async () => {
    if (get().isFetchingWarehouses) return;
    set({ isFetchingWarehouses: true });
    try {
      const user = useAuthStore.getState().user;
      if (!user) return;

      const { data, error } = await localDb
        .from('warehouses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Error fetching warehouses:', error);
        return;
      }

      let warehouses = data as Warehouse[];

      // Auto-crear Almacén Principal si no existe ninguno
      if (warehouses.length === 0) {
        const { data: newWarehouse, error: createError } = await localDb
          .from('warehouses')
          .insert({ user_id: user.id, name: 'Almacén', is_main: true })
          .select()
          .single();

        if (createError) {
          if (createError.code !== '23505') {
            logger.error('Error auto-creating warehouse:', createError);
          }
          // Duplicado por race condition: re-fetch
          const { data: existing } = await localDb
            .from('warehouses')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });
          if (existing && existing.length > 0) {
            warehouses = existing as Warehouse[];
          }
        } else if (newWarehouse) {
          warehouses = [newWarehouse as Warehouse];
        }
      }

      set({ warehouses });

      const mainWarehouse = warehouses.find(w => w.is_main) || warehouses[0];
      if (mainWarehouse && !get().currentWarehouseId) {
        set({ currentWarehouseId: mainWarehouse.id });
      }
    } finally {
      set({ isFetchingWarehouses: false });
    }
  },

  setCurrentWarehouse: (warehouseId: string) => {
    set({ currentWarehouseId: warehouseId });
  },

  fetchProductWarehouse: async (skipAutoHeal: boolean = false) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data, error } = await localDb
      .from('product_warehouse')
      .select('*');

    if (error) {
      logger.error('Error fetching product_warehouse:', error);
      return;
    }

    if (skipAutoHeal) {
      set({ productWarehouse: data as ProductWarehouse[] });
      return;
    }

    // Auto-heal: detectar y corregir entradas faltantes o con valores incorrectos
    const warehouses = get().warehouses;
    const products = get().products.filter(isActive);
    const mainWarehouse = warehouses.find(w => w.is_main) || warehouses[0];

    let created = 0;
    for (const warehouse of warehouses) {
      for (const product of products) {
        const existingPw = data.find(
          (pw: any) => pw.product_id === product.id && pw.warehouse_id === warehouse.id
        );
        const expectedQty = (warehouse.id === mainWarehouse?.id) ? Number(product.quantity) || 0 : 0;

        // Crear o actualizar: siempre hace UPSERT para corregir valores incorrectos
        if (!existingPw || Number(existingPw.quantity) !== expectedQty) {
          await localDb.from('product_warehouse').upsert({
            product_id: product.id,
            warehouse_id: warehouse.id,
            quantity: expectedQty,
            in_transit: Number(product.in_transit) || 0
          }, { onConflict: 'product_id,warehouse_id' });
          created++;
        }
      }
    }

    if (created > 0) {
      logger.info(`🔧 Auto-heal product_warehouse: ${created} entradas creadas`);
      // Volver a fetch si se crearon nuevas
      const { data: newData } = await localDb.from('product_warehouse').select('*');
      set({ productWarehouse: newData as ProductWarehouse[] });
    } else {
      set({ productWarehouse: data as ProductWarehouse[] });
    }
  },

  updateProductWarehouseQuantity: async (productId: string, warehouseId: string, quantity: number, skipAutoHeal: boolean = false) => {
    const existing = get().productWarehouse.find(pw => pw.product_id === productId && pw.warehouse_id === warehouseId);

    if (existing) {
      await localDb
        .from('product_warehouse')
        .update({ quantity, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await localDb
        .from('product_warehouse')
        .insert({ product_id: productId, warehouse_id: warehouseId, quantity, in_transit: 0 });
    }

    await get().fetchProductWarehouse(skipAutoHeal);
  },

  addSale: async (sale) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No hay usuario autenticado' };

    const saleDate = new Date(sale.date).toISOString().split('T')[0];
    // Turno de la venta (doble turno opcional). El turno se determina por la HORA
    // ACTUAL (el POS vende "ahora"; sale.date solo lleva el día, sin hora). El
    // servidor es la autoridad final: aquí solo se hace un pre-check de UX.
    let saleShift = '1';
    try {
      const allRes = await localDb.settings.get('');
      const all = (allRes as any)?.data || {};
      const enabled = !!all.double_shift_enabled;
      const cutoff = typeof all.shift_cutoff_hour === 'number' ? all.shift_cutoff_hour : 15;
      if (enabled) {
        saleShift = new Date().getHours() < cutoff ? '1' : '2';
      }
    } catch { /* si falla, se valida en el servidor */ }
    if (isDateClosed(get().dailyClosings, saleDate, saleShift)) {
      return { success: false, error: 'El día está cerrado, no se pueden registrar ventas' };
    }

    const itemsToConsume: { productId: string; name: string; qtyNeeded: number; qtyAvailable: number }[] = [];
    const productsMap = new Map(get().products.map(p => [p.id, p]));
    const transitMap = new Map<string, number>();
    for (const t of get().transitItems) {
      const current = transitMap.get(t.product_id) || 0;
      transitMap.set(t.product_id, current + t.remaining);
    }

    for (const item of sale.items) {
      if (!item.is_recipe) {
        const transitAvailable = transitMap.get(item.product_id) || 0;
        const product = productsMap.get(item.product_id);
        const productName = product?.name || 'producto';

        if (transitAvailable < item.quantity) {
          console.error('ADD_SALE_PRECONDITION: TRANSITO INSUFICIENTE simple', item.product_id, item.quantity, transitAvailable);
          return { 
            success: false, 
            error: `No hay suficiente "${productName}" en transito. Necesitas: ${item.quantity}, Disponible: ${transitAvailable}` 
          };
        }
        itemsToConsume.push({ productId: item.product_id, name: productName, qtyNeeded: item.quantity, qtyAvailable: transitAvailable });
      } else if (item.is_recipe && item.recipe_snapshot) {
        for (const ing of item.recipe_snapshot.ingredients) {
          const transitAvailable = transitMap.get(ing.product_id) || 0;
          const needed = ing.quantity * item.quantity;

          const ingProduct = productsMap.get(ing.product_id);
          const ingProductName = ingProduct?.name || 'ingrediente';

          if (transitAvailable < needed) {
            console.error('ADD_SALE_PRECONDITION: TRANSITO INSUFICIENTE receta', ing.product_id, needed, transitAvailable);
            return { 
              success: false, 
              error: `No hay suficiente "${ingProductName}" en transito para la receta "${item.recipe_snapshot?.name}". Necesitas: ${needed}, Disponible: ${transitAvailable}` 
            };
          }
          const existingIdx = itemsToConsume.findIndex(i => i.productId === ing.product_id);
          if (existingIdx >= 0) {
            itemsToConsume[existingIdx].qtyNeeded += needed;
          } else {
            itemsToConsume.push({ productId: ing.product_id, name: ingProductName, qtyNeeded: needed, qtyAvailable: transitAvailable });
          }
        }
      }
    }

    if (!IS_ONLINE) {
      const tempId = uuid();
      const tempSale = {
        id: tempId,
        user_id: user.id,
        employee_id: sale.employee_id,
        total_amount: sale.total_amount,
        date: sale.date,
        sale_type: sale.sale_type,
        is_account_house: sale.is_account_house || false,
        notes: sale.notes,
        discount: sale.discount,
        payment_method: sale.payment_method || null,
        efectivo: sale.efectivo || 0,
        transferencia: sale.transferencia || 0,
        usd: sale.usd || 0,
        eur: sale.eur || 0,
        created_at: new Date().toISOString(),
      };
      const saleItems = sale.items.map(item => ({
        sale_id: tempId,
        product_id: item.product_id,
        product_name: item.is_recipe ? (item.recipe_snapshot?.name || 'Receta') : (productsMap.get(item.product_id)?.name || 'Producto'),
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        selling_price: item.selling_price,
        subtotal: item.subtotal,
        is_recipe: item.is_recipe || false,
        recipe_snapshot: item.recipe_snapshot,
      }));
      const saleWithItems = { ...tempSale, items: saleItems };
      set((state) => ({ sales: [saleWithItems, ...state.sales] }));
      for (const ci of itemsToConsume) {
        set((state) => {
          let remainingLocal = ci.qtyNeeded;
          let consumedLocal = 0;
          const updatedTransitItems = [...state.transitItems]
            .sort((a, b) => new Date(a.sent_date).getTime() - new Date(b.sent_date).getTime())
            .map(t => {
              if (t.product_id !== ci.productId || t.remaining <= 0) return t;
              if (remainingLocal <= 0) return t;
              const toConsume = Math.min(t.remaining, remainingLocal);
              remainingLocal -= toConsume;
              consumedLocal += toConsume;
              return { ...t, remaining: t.remaining - toConsume, consumed: (t.consumed || 0) + toConsume };
            });
          const newInTransit = Math.max(0, Number(state.products.find(p => p.id === ci.productId)?.in_transit || 0) - consumedLocal);
          return {
            transitItems: updatedTransitItems,
            products: state.products.map(p =>
              p.id === ci.productId ? { ...p, in_transit: newInTransit } : p
            ),
          };
        });
      }

      set((state) => ({
        transitItems: state.transitItems.filter(t => t.remaining > 0)
      }));


      toast.success('Venta guardada localmente (sin conexión)');
      return { success: true, saleId: tempId };
    }

const saleId = uuid();
    trackLocalCreation(saleId);
    try {
      // Venta atómica en el servidor (multi-caja en LAN): el backend valida el
      // stock, inserta la venta + ítems y descuenta del tránsito (FIFO) en una
      // única transacción SQLite. Evita que dos cajas vendan la última unidad.
      const { data, error } = await localDb.rpc('sale', { sale });
      if (error || !data?.success) {
        const msg = error?.message || (data as any)?.error || 'Error al registrar la venta';
        logger.error('Error en addSale (RPC):', error || data);
        return { success: false, error: msg };
      }

      const saleWithItems = {
        ...(data.sale || {}),
        id: data.sale?.id || saleId,
        user_id: user.id,
        items: Array.isArray(data.items) ? data.items : [],
      } as any;
      set((state) => ({ sales: [saleWithItems, ...state.sales] }));

      // Multi-caja: tras vender, el dispositivo queda al día al momento (stock,
      // tránsito y movimientos los actualiza el servidor; aquí se re-sincronizan).
      get().forceRefreshData().catch(() => {});

      return { success: true, saleId: (data as any)?.sale?.id || saleId };
    } catch (error: any) {
      logger.error('Error en addSale:', error);
      return { success: false, error: error.message || 'Error al registrar la venta' };
    } finally {
      untrackLocalCreation(saleId);
    }
  },

  consumeFromTransit: async (productId: string, qtyNeeded: number, reason?: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No hay usuario autenticado' };

    const product = get().products.find(p => p.id === productId);
    if (!product) return { success: false, error: 'Producto no encontrado' };

    if (_isConsumingTransit) return { success: false, error: 'Ya hay un consumo en progreso, espere un momento' };
    _isConsumingTransit = true;
    try {

    let remaining = qtyNeeded;
    const transitItemsForProduct = get().transitItems
      .filter(t => t.product_id === productId && t.remaining > 0)
      .sort((a, b) => new Date(a.sent_date).getTime() - new Date(b.sent_date).getTime());

    const updatedItems: { id: string; newRemaining: number; newConsumed: number; toConsume: number }[] = [];

    if (!IS_ONLINE) {
      let remainingLocal = qtyNeeded;
      const consumptionItems: { transitItemId: string; quantity: number }[] = [];
      for (const item of transitItemsForProduct) {
        if (remainingLocal <= 0) break;
        const toConsume = Math.min(item.remaining, remainingLocal);
        consumptionItems.push({ transitItemId: item.id, quantity: toConsume });
        remainingLocal -= toConsume;
      }
      if (remainingLocal > 0) {
        return { success: false, error: 'No habia suficiente cantidad en transito' };
      }
      const consumedQty = consumptionItems.reduce((s, c) => s + c.quantity, 0);
      const updatedTransitItems = get().transitItems
        .map(t => {
          const ci = consumptionItems.find(c => c.transitItemId === t.id);
          if (ci) return { ...t, remaining: Math.max(0, t.remaining - ci.quantity), consumed: (t.consumed || 0) + ci.quantity };
          return t;
        });
      set((state) => ({
        transitItems: updatedTransitItems.filter(t => t.remaining > 0),
        products: state.products.map(p =>
          p.id === productId ? { ...p, in_transit: Math.max(0, Number(p.in_transit || 0) - consumedQty) } : p
        ),
      }));



      return { success: true };
    }

    try {
      const totalAvailable = transitItemsForProduct.reduce((sum, item) => sum + item.remaining, 0);
      if (totalAvailable < qtyNeeded) {
        return { success: false, error: 'No habia suficiente cantidad en transito' };
      }

      for (const item of transitItemsForProduct) {
        if (remaining <= 0) break;

        const toConsume = Math.min(item.remaining, remaining);
        const newRemaining = item.remaining - toConsume;
        const newConsumed = item.consumed + toConsume;
        remaining -= toConsume;
        updatedItems.push({ id: item.id, newRemaining, newConsumed, toConsume });

        const { error: te } = await withTimeout(
          Promise.resolve(
            localDb
              .from('transit_items')
              .update({ remaining: newRemaining, consumed: newConsumed, updated_at: new Date().toISOString() })
              .eq('id', item.id)
          ),
          10000
        );
        if (te) throw new Error('No se pudo actualizar el item en tránsito');
      }

      if (remaining > 0) {
        return { success: false, error: 'No habia suficiente cantidad en transito' };
      }

      // Tránsito total restante del producto tras el consumo: suma de TODOS los
      // transit_items (los consumidos con su nuevo remaining y los no tocados),
      // para no perder stock "en tránsito" cuando hay más de un item.
      const newTotalInTransit = get().transitItems
        .filter(t => t.product_id === productId && t.remaining > 0)
        .map(t => {
          const updated = updatedItems.find(u => u.id === t.id);
          return updated ? updated.newRemaining : t.remaining;
        })
        .reduce((sum, r) => sum + r, 0);
      let newMovement = null;

      const { data: movementData, error: movementError } = await queryWithRetry(() =>
        localDb
          .from('movements')
          .insert({
            user_id: user.id,
            product_id: productId,
            type: 'SALIDA',
            quantity: qtyNeeded,
            unit: product.unit,
            date: new Date().toISOString(),
            cost: Number(product.cost),
            reason: reason || 'Venta de producto/ingrediente',
            status: 'NORMAL'
          })
          .select()
          .single()
      );

      newMovement = movementData;

      if (movementError) {
        logger.error('Error recording sale movement:', movementError);
        throw new Error('No se pudo registrar el movimiento de venta');
      }

      const { error: productError } = await queryWithRetry(() =>
        localDb
          .from('products')
          .update({ 
            in_transit: newTotalInTransit,
            updated_at: new Date().toISOString()
          })
          .eq('id', productId)
      );

      if (productError) {
        throw new Error('No se pudo actualizar el tránsito del producto');
      }

      set((state) => {
        const updatedTransitItems = state.transitItems
          .map(t => {
            const updated = updatedItems.find(u => u.id === t.id);
            if (updated) {
              return { ...t, remaining: updated.newRemaining, consumed: updated.newConsumed };
            }
            return t;
          })
          .filter(t => t.remaining > 0);

        const movements = newMovement ? [newMovement, ...state.movements] : state.movements;

        return {
          transitItems: updatedTransitItems,
          movements,
          products: state.products.map(p => 
            p.id === productId ? { ...p, in_transit: newTotalInTransit } : p
          ),
        };
      });



      return { success: true };
    } catch (error: any) {
      logger.error('Error en consumeFromTransit:', error);
      return { success: false, error: error.message || 'Error al consumir de tránsito' };
    }
    } finally {
      _isConsumingTransit = false;
    }
  },

  cancelTransit: async (transitItemId: string, quantity: number, reason: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No autenticado' };

    const transitItem = get().transitItems.find(t => t.id === transitItemId);
    if (!transitItem) return { success: false, error: 'Item no encontrado' };

    if (quantity <= 0) return { success: false, error: 'La cantidad debe ser mayor a 0' };
    if (quantity > transitItem.remaining) {
      return { success: false, error: `La cantidad no puede exceder ${transitItem.remaining}` };
    }

    const product = get().products.find(p => p.id === transitItem.product_id);
    if (!product) return { success: false, error: 'Producto no encontrado' };

    const newRemaining = transitItem.remaining - quantity;
    const newInTransit = Math.max(0, Number(product.in_transit || 0) - quantity);
    const newQuantity = Number(product.quantity) + quantity;

    if (!IS_ONLINE) {
      const localMovement: Movement = {
        id: uuid(),
        user_id: user.id,
        product_id: product.id,
        type: 'ENTRADA',
        quantity,
        unit: product.unit,
        cost: Number(product.cost),
        reason: `Devolución de tránsito: ${reason}`,
        status: 'NORMAL',
        warehouse_id: transitItem.warehouse_id || undefined,
        date: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      set((state) => {
        const updated = state.transitItems
          .map(t => t.id === transitItemId ? { ...t, remaining: newRemaining } : t)
          .filter(t => t.remaining > 0);
        const productWarehouseUpdated = state.productWarehouse.map(pw =>
          pw.product_id === product.id && pw.warehouse_id === transitItem.warehouse_id
            ? { ...pw, quantity: Number(pw.quantity) + quantity } : pw
        );
        return {
          transitItems: updated,
          products: state.products.map(p => p.id === product.id ? { ...p, in_transit: newInTransit, quantity: newQuantity } : p),
          productWarehouse: productWarehouseUpdated,
          movements: [localMovement, ...state.movements],
        };
      });

      toast.success('Cancelación guardada localmente (sin conexión)');

      return { success: true };
    }

    // Todas las escrituras en una única transacción: ajustar tránsito, devolver
    // stock y registrar el movimiento ENTRADA, o no se guarda nada.
    const pwRow = transitItem.warehouse_id
      ? get().productWarehouse.find(x => x.product_id === product.id && x.warehouse_id === transitItem.warehouse_id)
      : undefined;

    const movementId = uuid();
    const movementRow = {
      id: movementId,
      user_id: user.id,
      product_id: product.id,
      type: 'ENTRADA',
      quantity,
      unit: product.unit,
      date: new Date().toISOString(),
      cost: Number(product.cost),
      reason: `Devolución de tránsito: ${reason}`,
      status: 'NORMAL',
      warehouse_id: transitItem.warehouse_id || null,
    };

    const commands: any[] = [
      {
        table: 'transit_items',
        method: 'update',
        data: { remaining: newRemaining },
        filters: [{ op: 'eq', column: 'id', value: transitItemId }],
      },
      {
        table: 'products',
        method: 'update',
        data: { in_transit: newInTransit, quantity: newQuantity },
        filters: [{ op: 'eq', column: 'id', value: product.id }],
      },
      { table: 'movements', method: 'insert', data: movementRow },
    ];

    if (pwRow) {
      commands.push({
        table: 'product_warehouse',
        method: 'update',
        data: { quantity: Number(pwRow.quantity) + quantity, updated_at: new Date().toISOString() },
        filters: [{ op: 'eq', column: 'id', value: pwRow.id }],
      });
    }

    const batchRes = await localDb.batch(commands);

    if (batchRes.error) {
      logger.error('Error cancelTransit (batch):', batchRes.error);
      return { success: false, error: batchRes.error.message || 'No se pudo registrar la devolución' };
    }

    // Éxito: aplicar el estado local completo.
    set((state) => ({
      transitItems: newRemaining <= 0
        ? state.transitItems.filter(t => t.id !== transitItemId)
        : state.transitItems.map(t =>
            t.id === transitItemId ? { ...t, remaining: newRemaining } : t
          ),
      products: state.products.map(p =>
        p.id === product.id ? { ...p, in_transit: newInTransit, quantity: newQuantity } : p
      ),
      productWarehouse: pwRow
        ? state.productWarehouse.map(x =>
            x.product_id === product.id && x.warehouse_id === transitItem.warehouse_id
              ? { ...x, quantity: Number(x.quantity) + quantity }
              : x
          )
        : state.productWarehouse,
      movements: [{ ...movementRow, created_at: new Date().toISOString() } as Movement, ...state.movements],
    }));

    return { success: true };
  },

  registerWasteFromTransit: async (transitItemId: string, quantity: number, reason: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No autenticado' };

    const transitItem = get().transitItems.find(t => t.id === transitItemId);
    if (!transitItem) return { success: false, error: 'Item no encontrado' };

    if (quantity <= 0) return { success: false, error: 'La cantidad debe ser mayor a 0' };
    if (quantity > transitItem.remaining) {
      return { success: false, error: `La cantidad no puede exceder ${transitItem.remaining}` };
    }

    const product = get().products.find(p => p.id === transitItem.product_id);
    if (!product) return { success: false, error: 'Producto no encontrado' };

    const newRemaining = transitItem.remaining - quantity;
    const newInTransitVal = Math.max(0, Number(product.in_transit || 0) - quantity);

    if (!IS_ONLINE) {
      set((state) => ({
        transitItems: state.transitItems.map(t => t.id === transitItemId ? { ...t, remaining: newRemaining } : t).filter(t => t.remaining > 0),
        products: state.products.map(p => p.id === product.id ? { ...p, in_transit: newInTransitVal } : p),
      }));

      toast.success('Merma guardada localmente (sin conexión)');

      return { success: true };
    }

    // Todas las escrituras en una única transacción: ajustar tránsito y registrar
    // el movimiento MERMA, o no se guarda nada.
    const movementId = uuid();
    const movementRow = {
      id: movementId,
      user_id: user.id,
      product_id: product.id,
      type: 'MERMA',
      quantity,
      unit: product.unit,
      date: new Date().toISOString(),
      cost: Number(product.cost),
      reason: `Merma en tránsito: ${reason}`,
      status: 'NORMAL',
    };

    const commands: any[] = [
      {
        table: 'transit_items',
        method: 'update',
        data: { remaining: newRemaining },
        filters: [{ op: 'eq', column: 'id', value: transitItemId }],
      },
      {
        table: 'products',
        method: 'update',
        data: { in_transit: newInTransitVal },
        filters: [{ op: 'eq', column: 'id', value: product.id }],
      },
      { table: 'movements', method: 'insert', data: movementRow },
    ];

    const batchRes = await localDb.batch(commands);

    if (batchRes.error) {
      logger.error('Error registerWasteFromTransit (batch):', batchRes.error);
      return { success: false, error: batchRes.error.message || 'No se pudo registrar la merma' };
    }

    // Éxito: aplicar el estado local completo.
    set((state) => ({
      transitItems: state.transitItems
        .map(t => t.id === transitItemId ? { ...t, remaining: newRemaining } : t)
        .filter(t => t.remaining > 0),
      products: state.products.map(p =>
        p.id === product.id ? { ...p, in_transit: newInTransitVal } : p
      ),
      movements: [{ ...movementRow, created_at: new Date().toISOString() } as Movement, ...state.movements],
    }));

    return { success: true };
  },

  registerManualConsumption: async (transitItemId: string, quantity: number, note?: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No autenticado' };

    const transitItem = get().transitItems.find(t => t.id === transitItemId);
    if (!transitItem) return { success: false, error: 'Item no encontrado' };

    if (quantity <= 0) return { success: false, error: 'La cantidad debe ser mayor a 0' };
    if (quantity > transitItem.remaining) {
      return { success: false, error: `La cantidad no puede exceder ${transitItem.remaining}` };
    }

    const product = get().products.find(p => p.id === transitItem.product_id);
    if (!product) return { success: false, error: 'Producto no encontrado' };

    const newRemaining = transitItem.remaining - quantity;
    const newConsumed = (transitItem.consumed || 0) + quantity;
    const newInTransit = Math.max(0, Number(product.in_transit || 0) - quantity);

    if (!IS_ONLINE) {
      set((state) => ({
        transitItems: state.transitItems.map(t => t.id === transitItemId ? { ...t, remaining: newRemaining, consumed: newConsumed } : t).filter(t => t.remaining > 0),
        products: state.products.map(p => p.id === product.id ? { ...p, in_transit: newInTransit } : p),
      }));

      toast.success('Consumo guardado localmente (sin conexión)');

      return { success: true };
    }

    // Todas las escrituras en una única transacción: ajustar tránsito y registrar
    // el movimiento de consumo, o no se guarda nada.
    const isGastoVariable = product.is_gasto_variable === true;

    const movementId = uuid();
    const movementRow = {
      id: movementId,
      user_id: user.id,
      product_id: product.id,
      type: 'SALIDA',
      quantity,
      unit: product.unit,
      date: new Date().toISOString(),
      cost: Number(product.cost),
      reason: isGastoVariable ? 'Gasto variable registrado desde tránsito' : 'Consumo manual desde tránsito',
      note: note || null,
      is_consumo_directo: !isGastoVariable,
      is_gasto_variable: isGastoVariable,
      status: 'NORMAL',
    };

    const commands: any[] = [
      {
        table: 'transit_items',
        method: 'update',
        data: { remaining: newRemaining, consumed: newConsumed },
        filters: [{ op: 'eq', column: 'id', value: transitItemId }],
      },
      {
        table: 'products',
        method: 'update',
        data: { in_transit: newInTransit },
        filters: [{ op: 'eq', column: 'id', value: product.id }],
      },
      { table: 'movements', method: 'insert', data: movementRow },
    ];

    const batchRes = await localDb.batch(commands);

    if (batchRes.error) {
      logger.error('Error registerManualConsumption (batch):', batchRes.error);
      return { success: false, error: batchRes.error.message || 'No se pudo registrar el consumo' };
    }

    // Éxito: aplicar el estado local completo.
    set((state) => ({
      transitItems: state.transitItems
        .map(t => t.id === transitItemId ? { ...t, remaining: newRemaining, consumed: newConsumed } : t)
        .filter(t => t.remaining > 0),
      products: state.products.map(p =>
        p.id === product.id ? { ...p, in_transit: newInTransit } : p
      ),
      movements: [{ ...movementRow, created_at: new Date().toISOString() } as Movement, ...state.movements],
    }));

    return { success: true };
  },

  getPendingAccounts: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    if (!IS_ONLINE) return;

    const { data, error } = await localDb
      .from('pending_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!error) {
      set({ pendingAccounts: data || [] });
    }
  },

  createPendingAccount: async (clientName: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No hay usuario autenticado' };

    const accountId = uuid();
    trackLocalCreation(accountId);
    try {
      const { data, error } = await queryWithRetry(() =>
        localDb
          .from('pending_accounts')
          .insert({
            id: accountId,
            user_id: user.id,
            client_name: clientName,
            items: [],
            total_amount: 0,
            status: 'pending',
            created_at_local: new Date().toISOString(),
          })
          .select()
          .single()
      );

      if (error) {
        logger.error('Error createPendingAccount:', error);
        throw new Error(error.message || 'Error al crear la cuenta');
      }

      await get().getPendingAccounts();
      return { success: true, accountId: data.id };
    } catch (err: any) {
      logger.error('Error en createPendingAccount:', err);
      return { success: false, error: err.message || 'Error al crear la cuenta' };
    } finally {
      untrackLocalCreation(accountId);
    }
  },

  addItemsToPendingAccount: async (accountId: string, items: { product_id: string; product_name: string; quantity: number; unit_price: number; subtotal: number; is_recipe?: boolean; recipe_snapshot?: { name: string; ingredients: { product_id: string; quantity: number; cost: number }[] } }[], isAccountHouse: boolean = false, saleType: 'SALON' | 'DOMICILIO' | 'BAR' | 'VENTA_RAPIDA' = 'SALON') => {
    const account = get().pendingAccounts.find(a => a.id === accountId);
    if (!account) return { success: false, error: 'Cuenta no encontrada' };

    // Guardar el estado de Cuenta Casa para toda la cuenta
    const accountIsAccountHouse = account.is_account_house || isAccountHouse;
    // Usar el tipo de venta proporcionado o el que ya tenga la cuenta
    const accountSaleType = saleType || account.sale_type || 'SALON';

    // Verificar tránsito disponible antes de agregar
    for (const item of items) {
      const product = get().products.find(p => p.id === item.product_id);

      const itemIsRecipe = item.is_recipe;
      const itemRecipeSnapshot = item.recipe_snapshot;

      if (itemIsRecipe && itemRecipeSnapshot?.ingredients) {
        // Si es receta, verificar cada ingrediente usando recipe_snapshot del item
        for (const ing of itemRecipeSnapshot.ingredients) {
          const transitAvailable = get().transitItems
            .filter(t => t.product_id === ing.product_id)
            .reduce((sum, t) => sum + t.remaining, 0);
          const needed = ing.quantity * item.quantity;

          if (transitAvailable < needed) {
            const ingProduct = get().products.find(p => p.id === ing.product_id);
            return { 
              success: false, 
              error: `No hay suficiente "${ingProduct?.name || 'ingrediente'}" en tránsito. Necesitas: ${needed}, Disponible: ${transitAvailable}` 
            };
          }
        }
      } else {
        // Si no es receta, verificar el producto directo
        const transitAvailable = get().transitItems
          .filter(t => t.product_id === item.product_id)
          .reduce((sum, t) => sum + t.remaining, 0);

        if (transitAvailable < item.quantity) {
          return { 
            success: false, 
            error: `No hay suficiente "${item.product_name}" en tránsito. Necesitas: ${item.quantity}, Disponible: ${transitAvailable}` 
          };
        }
      }
    }

    const newItems = items.map(item => ({
      ...item,
      added_at: new Date().toISOString(),
    }));

    const allItems = [...account.items, ...newItems];
    const newTotal = allItems.reduce((sum, item) => sum + item.subtotal, 0);

    if (!IS_ONLINE) {
      set((state) => ({
        pendingAccounts: state.pendingAccounts.map(a =>
          a.id === accountId
            ? { ...a, items: allItems, total_amount: accountIsAccountHouse ? 0 : newTotal, is_account_house: accountIsAccountHouse, sale_type: accountSaleType, updated_at: new Date().toISOString() }
            : a
        ),
      }));

      toast.success('Items agregados a la cuenta (sin conexión)');
      return { success: true };
    }

    const { error } = await localDb
      .from('pending_accounts')
      .update({
        items: allItems,
        total_amount: accountIsAccountHouse ? 0 : newTotal,
        is_account_house: accountIsAccountHouse,
        sale_type: accountSaleType,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId);

    if (error) {
      return { success: false, error: error.message };
    }

    await get().getPendingAccounts();
    return { success: true };
  },

  updatePendingAccount: async (accountId: string, updates: Partial<PendingAccount>) => {
    if (!IS_ONLINE) {
      set((state) => ({
        pendingAccounts: state.pendingAccounts.map(a =>
          a.id === accountId ? { ...a, ...updates, updated_at: new Date().toISOString() } : a
        ),
      }));

      return { success: true };
    }

    const { error } = await localDb
      .from('pending_accounts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', accountId);

    if (error) {
      return { success: false, error: error.message };
    }

    await get().getPendingAccounts();
    return { success: true };
  },

  updatePendingAccountItems: async (accountId: string, items: PendingItem[]) => {
    const account = get().pendingAccounts.find(a => a.id === accountId);
    if (!account) return { success: false, error: 'Cuenta no encontrada' };

    const isAccountHouse = account.is_account_house || false;
    const newTotal = isAccountHouse ? 0 : items.reduce((sum, item) => sum + item.subtotal, 0);

    if (!IS_ONLINE) {
      set((state) => ({
        pendingAccounts: state.pendingAccounts.map(a =>
          a.id === accountId
            ? { ...a, items: items, total_amount: newTotal, updated_at: new Date().toISOString() }
            : a
        ),
      }));

      toast.success('Items actualizados (sin conexión)');
      return { success: true };
    }

    const { error } = await localDb
      .from('pending_accounts')
      .update({
        items: items,
        total_amount: newTotal,
        updated_at: new Date().toISOString()
      })
      .eq('id', accountId);

    if (error) {
      return { success: false, error: error.message };
    }

    await get().getPendingAccounts();
    return { success: true };
  },

  togglePendingAccountType: async (accountId: string) => {
    const account = get().pendingAccounts.find(a => a.id === accountId);
    if (!account) return { success: false, error: 'Cuenta no encontrada' };

    const currentIsAccountHouse = account.is_account_house || false;
    const newIsAccountHouse = !currentIsAccountHouse;

    const accountItems = account.items || [];
    const newTotal = newIsAccountHouse ? 0 : accountItems.reduce((sum, item) => sum + item.subtotal, 0);

    if (!IS_ONLINE) {
      set((state) => ({
        pendingAccounts: state.pendingAccounts.map(a =>
          a.id === accountId
            ? { ...a, is_account_house: newIsAccountHouse, total_amount: newTotal, updated_at: new Date().toISOString() }
            : a
        ),
      }));

      toast.success('Tipo de cuenta cambiado (sin conexión)');
      return { success: true };
    }

    const { error } = await localDb
      .from('pending_accounts')
      .update({ 
        is_account_house: newIsAccountHouse,
        total_amount: newTotal,
        updated_at: new Date().toISOString()
      })
      .eq('id', accountId);

    if (error) return { success: false, error: error.message };

    await get().getPendingAccounts();
    return { success: true };
  },

deletePendingAccount: async (accountId: string) => {
    const account = get().pendingAccounts.find(a => a.id === accountId);
    if (!account) return { success: false, error: 'Cuenta no encontrada' };

    // Los ítems de una cuenta pendiente NUNCA se consumieron del tránsito al
    // agregarse (solo se validó disponibilidad). El consumo ocurre al cobrar
    // (chargePendingAccount → addSale). Por tanto, al eliminar la cuenta NO se
    // devuelve stock al tránsito: eso inflaría stock fantasma.

    if (!IS_ONLINE) {
      set((state) => ({
        pendingAccounts: state.pendingAccounts.filter(a => a.id !== accountId),
      }));


      return { success: true };
    }

    const { error } = await localDb
      .from('pending_accounts')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', accountId);

    if (error) {
      return { success: false, error: error.message };
    }

    await get().getPendingAccounts();
    return { success: true };
  },

  chargePendingAccount: async (accountId: string, employeeId: string, employeeName: string, saleDate?: string, paymentMethod?: string, efectivo?: number, transferencia?: number, usd?: number, eur?: number) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No hay usuario autenticado' };

    const account = get().pendingAccounts.find(a => a.id === accountId);
    if (!account) return { success: false, error: 'Cuenta no encontrada' };
    if (!account.items || account.items.length === 0) {
      return { success: false, error: 'La cuenta no tiene productos' };
    }

    const date = saleDate || new Date().toISOString().split('T')[0];

    if (isDateClosed(get().dailyClosings, date)) {
      return { success: false, error: 'El día está cerrado, no se puede cobrar' };
    }

    if (!IS_ONLINE) {
      const saleItems = account.items.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: 0,
        selling_price: item.unit_price,
        subtotal: item.subtotal,
        is_recipe: item.is_recipe || false,
        recipe_snapshot: item.recipe_snapshot || null,
      }));

    const isAccountHouse = account.is_account_house || false;
      const saleType = account.sale_type || 'SALON';
      const totalPaidCup = (efectivo || 0) + (transferencia || 0) + ((usd || 0) * (user.usdRate || 0)) + ((eur || 0) * (user.eurRate || 0));

      const result = await get().addSale({
        employee_id: employeeId,
        items: saleItems,
        total_amount: isAccountHouse ? 0 : account.total_amount,
        date,
        sale_type: saleType,
        is_account_house: isAccountHouse,
        notes: `Cobro de cuenta pendiente: ${account.client_name}`,
        discount: 0,
        payment_method: paymentMethod || 'Cobro de cuenta pendiente',
        efectivo: efectivo || 0,
        transferencia: transferencia || 0,
        usd: usd || 0,
        eur: eur || 0,
      });

      if (!result.success) return result;

      set((state) => ({
        pendingAccounts: state.pendingAccounts.filter(a => a.id !== accountId),
      }));


      return { success: true };
    }

    const saleItems = account.items.map(item => {
      const itemIsRecipe = item.is_recipe || false;
      const itemRecipeSnapshot = item.recipe_snapshot || null;

      return {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: 0,
        selling_price: item.unit_price,
        subtotal: item.subtotal,
        is_recipe: itemIsRecipe,
        recipe_snapshot: itemRecipeSnapshot,
      };
    });

    const isAccountHouse = account.is_account_house || false;
    const saleType = account.sale_type || 'SALON';
    const totalPaidCup = (efectivo || 0) + (transferencia || 0) + ((usd || 0) * (user.usdRate || 0)) + ((eur || 0) * (user.eurRate || 0));

    const result = await get().addSale({
      employee_id: employeeId,
      items: saleItems,
      total_amount: isAccountHouse ? 0 : account.total_amount,
      date: date,
      sale_type: saleType,
      is_account_house: isAccountHouse,
      notes: `Cobro de cuenta pendiente: ${account.client_name}`,
      discount: 0,
      payment_method: paymentMethod || 'Cobro de cuenta pendiente',
      efectivo: efectivo || 0,
      transferencia: transferencia || 0,
      usd: usd || 0,
      eur: eur || 0,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const { error } = await localDb
      .from('pending_accounts')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', accountId);

    if (error) {
      return { success: false, error: error.message };
    }

    try {
      await get().getPendingAccounts();
    } catch (err) {
      logger.warn('[chargePendingAccount] Error recargando cuentas pendientes:', err);
    }
    return { success: true };
  },

  hashPin: async (pin: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + 'inventarioy_pin_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  saveAccessPin: async (params) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No hay usuario autenticado' };
    const name = String(params?.name || '').trim();
    if (!name) return { success: false, error: 'El nombre es obligatorio' };

    // El hash scrypt se calcula EN EL SERVIDOR (RPC save_access_pin), nunca en el
    // cliente. Esto evita el SHA-256 con salt fijo que era fácil de romper.
    const existingPin = params.pinId
      ? get().accessPins.find(p => p.id === params.pinId)
      : params.roleId === 'owner'
        ? get().accessPins.find(p => p.role === 'owner')
        : undefined;

    const { data, error } = await localDb.rpc('save_access_pin', {
      roleId: params.roleId || undefined,
      roleName: params.roleName || undefined,
      modules: params.modules || [],
      pin: String(params.pin || ''),
      name,
      pinId: existingPin?.id || params.pinId || undefined,
    });

    if (error) return { success: false, error: error.message };
    // El servidor puede rechazar la operación con éxito HTTP pero success:false en data
    // (p. ej. PIN duplicado). Propagar ese error a la UI.
    if (data && (data as any).success === false) {
      return { success: false, error: String((data as any).error || 'Error al guardar el PIN') };
    }

    const { data: pinsData } = await localDb.from('access_pins').select('*').eq('user_id', user.id);
    set({ accessPins: pinsData || [] });
    await get().fetchRoles();
    return { success: true };
  },

  fetchRoles: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    try {
      const { data } = await localDb.from('roles').select('*').eq('user_id', user.id);
      set({ roles: (data || []).map((r: any) => ({ ...r, modules: normalizeRoleModules(r.modules) })) });
    } catch (err) {
      logger.warn('[fetchRoles] Error cargando roles:', err);
    }
  },

  toggleAccessPin: async (pinId: string, isActive: boolean) => {
    const { error } = await localDb
      .from('access_pins')
      .update({ is_active: isActive })
      .eq('id', pinId);

    if (error) return { success: false, error: error.message };

    const user = useAuthStore.getState().user;
    if (user) {
      const { data } = await localDb.from('access_pins').select('*').eq('user_id', user.id);
      set({ accessPins: data || [] });
    }
    return { success: true };
  },

  deleteAccessPin: async (pinId: string) => {
    const { error } = await localDb
      .from('access_pins')
      .delete()
      .eq('id', pinId);

    if (error) return { success: false, error: error.message };

    const user = useAuthStore.getState().user;
    if (user) {
      const { data } = await localDb.from('access_pins').select('*').eq('user_id', user.id);
      set({ accessPins: data || [] });
    }
    return { success: true };
  },

  deleteRole: async (roleId: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No hay usuario autenticado' };
    if (roleId === 'owner') return { success: false, error: 'El rol de Dueño no se puede eliminar' };

    const { error } = await localDb
      .from('roles')
      .delete()
      .eq('id', roleId)
      .eq('user_id', user.id);

    if (error) return { success: false, error: error.message };

    await get().fetchRoles();
    return { success: true };
  },

  verifyPinForModule: async (modulePath: string, pin: string): Promise<{ success: boolean; error?: string; blocked?: boolean; remainingTime?: number; verifiedRole?: string }> => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No hay usuario autenticado' };

    const requiredRoles = MODULE_ROLES[modulePath] || [];
    if (requiredRoles.length === 0) return { success: true };

    const anyPin = get().accessPins.find(p => p.is_active);
    if (!anyPin) return { success: false, error: 'No hay pines activos configurados' };

    // Online: verify server-side via RPC (secure)
    if (IS_ONLINE) {
      try {
        const { data, error: rpcError } = await localDb.rpc('verify_access_pin', {
          p_pin: pin,
          p_module_path: modulePath,
        });
        if (rpcError) throw rpcError;
        if (data) {
          if (data.success) {
            const modules = Array.isArray(data.modules) ? data.modules.map(String) : [];
            set({ verifiedRole: data.role, verifiedRoleName: data.pin_name, verifiedRoleModules: modules });
            localStorage.setItem('verifiedRole', data.role);
            localStorage.setItem('verifiedRoleName', data.pin_name || '');
            localStorage.setItem('verifiedModules', JSON.stringify(modules));
            await get().fetchAll();
            return { success: true, verifiedRole: data.role };
          }
          return {
            success: false,
            error: data.error || 'PIN incorrecto',
            blocked: data.blocked || false,
            remainingTime: data.remaining_seconds || 0,
          };
        }
      } catch (err: any) {
        logger.warn('RPC verify_access_pin falló, usando fallback offline:', err?.message);
      }
    }

    // Offline fallback: client-side hash comparison
    const pinHash = await get().hashPin(pin);
    const moduleKey = MODULE_BY_PATH[modulePath];
    const matchingPins = get().accessPins.filter(p => {
      if (!p.is_active) return false;
      if (!moduleKey) return requiredRoles.includes(p.role);
      return getRoleModules(p.role).includes(moduleKey);
    });
    const userPin = matchingPins.find(p => p.pin_hash === pinHash);

    if (!userPin) {
      const existingPin = matchingPins[0];
      if (!existingPin) return { success: false, error: 'Tu PIN no tiene acceso a este módulo' };

      if (IS_ONLINE) {
        await localDb.from('access_pins').update({ failed_attempts: existingPin.failed_attempts + 1 }).eq('id', existingPin.id);
      } else {
        const newAttempts = existingPin.failed_attempts + 1;
        const blockedUntil = newAttempts >= 3 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
        if (blockedUntil) {
          return { success: false, error: 'PIN bloqueado por 3 intentos fallidos. Intente de nuevo en 5 min.', blocked: true, remainingTime: 300 };
        }
      }
      return { success: false, error: 'PIN incorrecto' };
    }

    if (userPin.blocked_until) {
      const blockedUntil = new Date(userPin.blocked_until);
      const now = new Date();
      if (blockedUntil > now) {
        return { success: false, error: `PIN bloqueado. Intente de nuevo en ${formatBlockRemaining(Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000))}.`, blocked: true, remainingTime: Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000) };
      }
    }

    const offlineModules = getRoleModules(userPin.role);
    set({ verifiedRole: userPin.role, verifiedRoleName: userPin.pin_name, verifiedRoleModules: offlineModules });
    localStorage.setItem('verifiedRole', userPin.role);
    localStorage.setItem('verifiedRoleName', userPin.pin_name || '');
    localStorage.setItem('verifiedModules', JSON.stringify(offlineModules));
    return { success: true, verifiedRole: userPin.role };
  },

  verifyPinSimple: async (pin: string): Promise<{ success: boolean; error?: string; blocked?: boolean; remainingTime?: number; role?: string }> => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No hay usuario autenticado' };

    // Online: verify server-side via RPC (secure)
    if (IS_ONLINE) {
      try {
        const { data, error: rpcError } = await localDb.rpc('verify_access_pin', {
          p_pin: pin,
          p_module_path: null,
        });
        if (rpcError) throw rpcError;
        if (data) {
          if (data.success) {
            const modules = Array.isArray(data.modules) ? data.modules.map(String) : [];
            set({ verifiedRole: data.role, verifiedRoleName: data.pin_name, verifiedRoleModules: modules });
            localStorage.setItem('verifiedRole', data.role);
            localStorage.setItem('verifiedRoleName', data.pin_name || '');
            localStorage.setItem('verifiedModules', JSON.stringify(modules));
            await get().fetchAll();
            return { success: true, role: data.role };
          }
          return {
            success: false,
            error: data.error || 'PIN incorrecto',
            blocked: data.blocked || false,
            remainingTime: data.remaining_seconds || 0,
          };
        }
      } catch (err: any) {
        logger.warn('RPC verify_access_pin falló, usando fallback offline:', err?.message);
      }
    }

    // Offline fallback
    const pinHash = await get().hashPin(pin);
    const userPin = get().accessPins.find(p => p.is_active && p.pin_hash === pinHash);

    if (!userPin) {
      const anyPin = get().accessPins.find(p => p.is_active);
      if (!anyPin) return { success: false, error: 'No hay pines activos configurados' };
      if (!IS_ONLINE) {
        const newAttempts = anyPin.failed_attempts + 1;
        const blockedUntil = newAttempts >= 3 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
        if (blockedUntil) {
          return { success: false, error: 'PIN bloqueado por 3 intentos fallidos. Intente de nuevo en 5 min.', blocked: true, remainingTime: 300 };
        }
      }
      return { success: false, error: 'PIN incorrecto' };
    }

    if (userPin.blocked_until) {
      const blockedUntil = new Date(userPin.blocked_until);
      if (blockedUntil > new Date()) {
        return { success: false, error: `PIN bloqueado. Intente de nuevo en ${formatBlockRemaining(Math.ceil((blockedUntil.getTime() - Date.now()) / 1000))}.`, blocked: true, remainingTime: Math.ceil((blockedUntil.getTime() - Date.now()) / 1000) };
      }
    }

    const offlineModules = getRoleModules(userPin.role);
    set({ verifiedRole: userPin.role, verifiedRoleName: userPin.pin_name, verifiedRoleModules: offlineModules });
    localStorage.setItem('verifiedRole', userPin.role);
    localStorage.setItem('verifiedRoleName', userPin.pin_name || '');
    localStorage.setItem('verifiedModules', JSON.stringify(offlineModules));
    return { success: true, role: userPin.role };
  },

  logAction: async (module: string, action: string, details: Record<string, any> = {}) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const verifiedRole = get().verifiedRole;
    const verifiedRoleName = get().verifiedRoleName;
    const activePin = get().accessPins.find(p => p.is_active);
    const role = verifiedRole || activePin?.role || user.role || 'owner';
    const roleLabel = verifiedRole ? `${getRoleLabel(verifiedRole)}${verifiedRoleName ? `: ${verifiedRoleName}` : ''}` : (activePin ? `${getRoleLabel(activePin.role)}${activePin.pin_name ? `: ${activePin.pin_name}` : ''}` : (user.name || 'Dueño/a'));

    if (!IS_ONLINE) {

      return;
    }

    await localDb.from('action_logs').insert({
      user_id: user.id,
      role: role,
      pin_role_label: roleLabel,
      module,
      action,
      details,
      created_at: new Date().toISOString(),
    });
  },

  getActionLogs: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    // Si está offline, no intentar cargar desde el servidor local para evitar crash
    // Mantener los datos existentes en memoria
    if (!IS_ONLINE) {
      logger.info('[getActionLogs] Offline: manteniendo datos existentes');
      return;
    }

    try {
      const { data, error } = await localDb
        .from('action_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        set({ actionLogs: data });
      }
    } catch (err) {
      logger.warn('[getActionLogs] Error cargando logs:', err);
    }
  },

  addRecipe: async (recipe) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('No hay usuario autenticado');

    if (!IS_ONLINE) {
      const recipeId = uuid();
      const now = new Date().toISOString();
      const offlineRecipe = {
        id: recipeId,
        user_id: user.id,
        name: capitalize(recipe.name),
        selling_price: recipe.selling_price,
        ingredients: (recipe.ingredients || []).map(ing => ({
          ...ing,
          recipe_id: recipeId,
        })),
        created_at: now,
      };

      set((state) => ({
        recipes: [offlineRecipe, ...state.recipes],
      }));


      toast.success('Receta guardada localmente (sin conexión)');
      return;
    }

    const recipeId = uuid();
    trackLocalCreation(recipeId);
    try {
      const { data: newRecipe, error } = await queryWithRetry(() =>
        localDb
          .from('recipes')
          .insert({ 
            id: recipeId,
            user_id: user.id, 
            name: capitalize(recipe.name), 
            selling_price: recipe.selling_price 
          })
          .select()
          .single()
      );

      if (error) {
        throw new Error('No se pudo crear la receta');
      }

      if (recipe.ingredients.length > 0) {
        const ingredients = recipe.ingredients.map(ing => ({
          recipe_id: newRecipe.id,
          product_id: ing.product_id,
          quantity: ing.quantity,
          unit: ing.unit,
        }));

        await queryWithRetry(() =>
          localDb.from('recipe_ingredients').insert(ingredients)
        );
      }

      set((state) => ({ 
        recipes: [{ ...newRecipe, ingredients: recipe.ingredients }, ...state.recipes] 
      }));
    } catch (error: any) {
      logger.error('Error en addRecipe:', error);
      throw new Error(error.message || 'Error al crear la receta');
    } finally {
      untrackLocalCreation(recipeId);
    }
  },

  updateRecipe: async (id, updates) => {
    if (!IS_ONLINE) {
      set((state) => ({
        recipes: state.recipes.map(r => r.id === id ? { ...r, ...updates } : r),
      }));

      toast.success('Receta actualizada (sin conexión)');
      return;
    }

    const { error } = await queryWithRetry(() =>
      localDb
        .from('recipes')
        .update({ 
          name: updates.name ? capitalize(updates.name) : undefined, 
          selling_price: updates.selling_price 
        })
        .eq('id', id)
    );

    if (error) {
      throw new Error('No se pudo actualizar la receta');
    }

    if (updates.ingredients) {
      await queryWithRetry(() =>
        localDb.from('recipe_ingredients').delete().eq('recipe_id', id)
      );

      if (updates.ingredients.length > 0) {
        const ingredients = updates.ingredients.map(ing => ({
          recipe_id: id,
          product_id: ing.product_id,
          quantity: ing.quantity,
          unit: ing.unit,
        }));
        await queryWithRetry(() =>
          localDb.from('recipe_ingredients').insert(ingredients)
        );
      }
    }

    set((state) => ({
      recipes: state.recipes.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
  },

  deleteRecipe: async (id) => {
    if (!IS_ONLINE) {
      const recipeToDelete = get().recipes.find(r => r.id === id);
      set((state) => ({ recipes: state.recipes.filter(r => r.id !== id) }));

      toast.success('Receta eliminada (sin conexión)');
      return;
    }

    await queryWithRetry(() =>
      localDb.from('recipe_ingredients').delete().eq('recipe_id', id)
    );
    const { error } = await queryWithRetry(() =>
      localDb.from('recipes').delete().eq('id', id)
    );

    if (error) {
      throw new Error('No se pudo eliminar la receta');
    }

    set((state) => ({ recipes: state.recipes.filter(r => r.id !== id) }));
  },

  addEmployee: async (employee) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('No hay usuario autenticado');

    if (!IS_ONLINE) {
      const tempId = uuid();
      const tempEmployee = {
        ...employee,
        id: tempId,
        user_id: user.id,
        name: capitalize(employee.name),
        created_at: new Date().toISOString(),
      };
      set((state) => ({ employees: [tempEmployee, ...state.employees] }));

      return;
    }

    const employeeId = uuid();
    trackLocalCreation(employeeId);
    try {
      // Número de expediente secuencial por negocio (ine ditable a partir de aquí).
      const { data: maxRow } = await localDb
        .from('employees')
        .select('expediente')
        .eq('user_id', user.id)
        .order('expediente', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextExpediente = (maxRow?.expediente ?? 0) + 1;

      const { data, error } = await queryWithRetry(() =>
        localDb
          .from('employees')
          .insert({ ...employee, id: employeeId, name: capitalize(employee.name), user_id: user.id, expediente: nextExpediente })
          .select()
          .single()
      );

      if (error) {
        logger.error('Error addEmployee:', error);
        throw new Error(error.message || 'No se pudo agregar el empleado');
      }

      set((state) => ({ employees: [data, ...state.employees] }));
    } catch (error: any) {
      logger.error('Error en addEmployee:', error);
      throw new Error(error.message || 'Error al agregar empleado');
    } finally {
      untrackLocalCreation(employeeId);
    }
  },

  updateEmployee: async (id, updates) => {
    const capitalizedUpdates = {
      ...updates,
      ...(updates.name !== undefined && { name: capitalize(updates.name) }),
    };
    const { error } = await queryWithRetry(() =>
      localDb.from('employees').update(capitalizedUpdates).eq('id', id)
    );

    if (error) {
      throw new Error('No se pudo actualizar el empleado');
    }

    set((state) => ({
      employees: state.employees.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
  },

  deleteEmployee: async (id) => {
    // Borrar en cascada: nómina, préstamos, liquidaciones y documentos del empleado
    // se eliminan en la misma transacción para no dejar registros huérfanos.
    const user = useAuthStore.getState().user;
    const deleteFilters = (column: string) => [
      ...(user ? [{ op: 'eq' as const, column: 'user_id', value: user.id }] : []),
      { op: 'eq' as const, column, value: id },
    ];
    const batch = await localDb.batch([
      { table: 'employees', method: 'delete', filters: [{ op: 'eq', column: 'id', value: id }] },
      { table: 'payroll_entries', method: 'delete', filters: deleteFilters('employee_id') },
      { table: 'employee_loans', method: 'delete', filters: deleteFilters('employee_id') },
      { table: 'payroll_liquidations', method: 'delete', filters: deleteFilters('employee_id') },
      { table: 'employee_documents', method: 'delete', filters: deleteFilters('employee_id') },
    ]);
    if (batch.error) {
      throw new Error(batch.error.message || 'No se pudo eliminar el empleado');
    }

    set((state) => ({ employees: state.employees.filter(e => e.id !== id) }));
  },

  addDepartment: async (name) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('No hay usuario autenticado');

    const { data, error } = await localDb
      .from('departments')
      .insert({ name: capitalize(name), user_id: user.id })
      .select()
      .single();

    if (error) {
      logger.error('Error addDepartment:', error);
      throw new Error(error.message || 'No se pudo agregar el departamento');
    }

    set((state) => ({ departments: [data, ...state.departments] }));
  },

  updateDepartment: async (id, name) => {
    const { error } = await localDb.from('departments').update({ name: capitalize(name) }).eq('id', id);

    if (error) {
      throw new Error('No se pudo actualizar el departamento');
    }

    set((state) => ({
      departments: state.departments.map(d => d.id === id ? { ...d, name: capitalize(name) } : d),
    }));
  },

  deleteDepartment: async (id) => {
    const { error } = await localDb.from('departments').delete().eq('id', id);

    if (error) {
      throw new Error('No se pudo eliminar el departamento');
    }

    set((state) => ({ departments: state.departments.filter(d => d.id !== id) }));
  },

  getPayrollConfig: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data, error } = await localDb
      .from('payroll_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('Error fetching payroll config:', error);
      return;
    }

    if (data) {
      set({ payrollConfig: data });
    } else {
      const defaultConfig = {
        tax_exemption_base: 3260,
        tax_rate: 5,
        special_contribution_rate: 5,
        monthly_hours: 190.6,
        vacation_accrual_days: 2.5,
      };

      const { data: newData, error: insertError } = await localDb
        .from('payroll_config')
        .insert({ ...defaultConfig, user_id: user.id })
        .select()
        .single();

      if (!insertError && newData) {
        set({ payrollConfig: newData });
      }
    }
  },

  updatePayrollConfig: async (updates) => {
    const user = useAuthStore.getState().user;
    const config = get().payrollConfig;
    if (!user || !config) return;

    const { error } = await localDb
      .from('payroll_config')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', config.id);

    if (error) {
      throw new Error('No se pudo actualizar la configuración de nómina');
    }

    set((state) => ({ payrollConfig: state.payrollConfig ? { ...state.payrollConfig, ...updates } : null }));
  },

  calculatePayroll: async (month, year) => {
    const user = useAuthStore.getState().user;
    const config = get().payrollConfig;
    if (!user || !config) {
      await get().getPayrollConfig();
    }

    const currentConfig = get().payrollConfig;
    if (!currentConfig) return;

    // Re-check user after config fetch
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;

    // Guarda: un período Aplicado (certificado) no puede regenerarse.
    const { data: appliedPeriod } = await localDb
      .from('payroll_periods')
      .select('status')
      .eq('user_id', currentUser.id)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();
    if (appliedPeriod?.status === 'applied') {
      throw new Error('La nómina de este período está Aplicada (bloqueada). Reábrela como Dueño/a para poder modificarla.');
    }

    const monthlyHours = currentConfig.monthly_hours || 190.6;
    const accrualDays = currentConfig.vacation_accrual_days || 2.5;

    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const { data: existingEntries } = await localDb
      .from('payroll_entries')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('month', month)
      .eq('year', year);

    const employees = get().employees;
    if (employees.length === 0) {
      throw new Error('No hay personal que generarle nómina');
    }
    const departments = get().departments;
    const loans = get().employeeLoans;

    // ── Captación pre-nómina ───────────────────────────────────────────────
    // Si no hay captación previa para el mes, se crean borradores por defecto
    // (todos incluidos, con el fondo de tiempo completo). Así los tests y el
    // flujo "Generar Nómina" directo siguen funcionando sin captación manual.
    let drafts = get().payrollDrafts.filter(d => d.month === month && d.year === year);
    if (drafts.length === 0) {
      const now = new Date().toISOString();
      const seed: any[] = employees.map(emp => ({
        id: uuid(),
        user_id: currentUser.id,
        month,
        year,
        employee_id: emp.id,
        include: 1,
        worked_hours: monthlyHours,
        hourly_rate: Math.round((emp.salary / monthlyHours) * 100) / 100,
        bonus: 0,
        advances: 0,
        retention: 0,
        vacation_days: 0,
        note: '',
        created_at: now,
        updated_at: now,
      }));
      const seedBatch = await localDb.batch([
        { table: 'payroll_drafts', method: 'insert', data: seed },
      ]);
      if (!seedBatch.error) {
        drafts = seed;
        set((state) => ({ payrollDrafts: [...state.payrollDrafts, ...seed] }));
      }
    }

    // Solo los trabajadores marcados como incluidos en la captación.
    const included = employees.filter(emp => {
      const d = drafts.find(x => x.employee_id === emp.id);
      return d ? d.include === 1 : true;
    });
    if (included.length === 0) {
      throw new Error('No hay trabajadores seleccionados para la nómina de este mes');
    }

    const entriesToInsert = included.map(emp => {
      const draft = drafts.find(x => x.employee_id === emp.id);
      const hourly_rate = draft?.hourly_rate || Math.round((emp.salary / monthlyHours) * 100) / 100;
      const worked_hours = draft?.worked_hours || monthlyHours;
      // Salario del período = tasa horaria × horas reales trabajadas (modelo Versat).
      const earned_salary = Math.round(hourly_rate * worked_hours * 100) / 100;
      const days_paid = Math.round((worked_hours / 8) * 100) / 100;

      const exemption_base = currentConfig.tax_exemption_base;
      const isPartner = emp.person_type === 'partner';
      // Cuota de préstamo activo del empleado (si tiene).
      const activeLoan = loans.find(l => l.employee_id === emp.id && l.status === 'active');
      const loanDeduction = activeLoan ? activeLoan.monthly_payment : 0;
      const result = calcularNomina(earned_salary, {
        personType: isPartner ? 'partner' : 'employee',
        baseContribution: emp.base_contribution,
        loanDeduction,
        exemptionBase: currentConfig.tax_exemption_base,
        bonus: draft?.bonus,
        vacationDays: draft?.vacation_days,
        advances: draft?.advances,
        otherDeductions: draft?.retention,
      });

      const empDept = departments.find(d => d.id === emp.category);

      return {
        user_id: currentUser.id,
        employee_id: emp.id,
        employee_name: emp.name,
        employee_category: empDept?.name || 'Sin Departamento',
        month,
        year,
        base_salary: emp.salary,
        earned_salary,
        exemption_base,
        taxable_base: result.taxableBase,
        tax_amount: result.taxAmount,
        special_contribution: result.specialContribution,
        net_salary: result.netSalary,
        vacation_days: draft?.vacation_days || 0,
        vacation_base: result.vacationBase,
        employer_contribution: result.employerContribution,
        is_custom: false,
        overtime_hours: 0,
        overtime_pay: result.overtimePay,
        bonus: result.bonus,
        vacation_pay: result.vacationPay,
        advances: result.advances,
        loan_deduction: result.loanDeduction,
        other_deductions: result.otherDeductions,
        gross_salary: result.grossSalary,
        worked_hours,
        hourly_rate,
        days_paid,
      };
    });

    const isFirstGeneration = !existingEntries || existingEntries.length === 0;

    // Descuento de préstamos: solo en la PRIMERA generación del mes.
    const loanUpdates: { id: string; balance: number; status: 'active' | 'paid' }[] = [];
    if (isFirstGeneration) {
      for (const emp of included) {
        const activeLoan = loans.find(l => l.employee_id === emp.id && l.status === 'active');
        if (activeLoan && activeLoan.monthly_payment > 0) {
          const newBalance = Math.max(0, activeLoan.balance - activeLoan.monthly_payment);
          loanUpdates.push({
            id: activeLoan.id,
            balance: newBalance,
            status: newBalance <= 0 ? 'paid' : 'active',
          });
        }
      }
    }

    // Movimientos de vacaciones: se RECALCULAN en cada generación del mes
    // (delete + reinsert del período) para que el saldo refleje siempre la
    // nómina vigente, incluso tras reabrir, editar la captación y regenerar.
    // Saldo del trabajador = suma de TODOS sus movimientos históricos.
    const vacMoves: any[] = [];
    for (const emp of included) {
      const draft = drafts.find(x => x.employee_id === emp.id);
      const paidDays = draft?.vacation_days || 0;
      // Acumulación mensual (crédito).
      vacMoves.push({
        id: uuid(),
        user_id: currentUser.id,
        employee_id: emp.id,
        month,
        year,
        type: 'accrual',
        days: accrualDays,
        note: 'Acumulación mensual',
        created_at: new Date().toISOString(),
      });
      // Vacaciones pagadas (débito).
      if (paidDays > 0) {
        vacMoves.push({
          id: uuid(),
          user_id: currentUser.id,
          employee_id: emp.id,
          month,
          year,
          type: 'paid',
          days: -paidDays,
          note: 'Vacaciones pagadas',
          created_at: new Date().toISOString(),
        });
      }
    }

    // Saldos resultantes: suma de movimientos de MESES ANTERIORES + el mes actual
    // recalculado, para todo trabajador afectado (incluidos ahora o antes).
    const { data: allVacMoves } = await localDb
      .from('employee_vacation_movements')
      .select('employee_id, month, year, days')
      .eq('user_id', currentUser.id);
    const prevVacSum: Record<string, number> = {};
    const affectedEmployees = new Set<string>(included.map(e => e.id));
    for (const m of allVacMoves || []) {
      if (m.month === month && m.year === year) {
        affectedEmployees.add(m.employee_id);
        continue; // el mes actual se borra y se reinserta
      }
      prevVacSum[m.employee_id] = (prevVacSum[m.employee_id] || 0) + (m.days || 0);
    }
    const empVacBalanceUpdates: Record<string, { id: string; balance: number }> = {};
    for (const empId of affectedEmployees) {
      const emp = employees.find(e => e.id === empId);
      if (!emp) continue;
      const draft = drafts.find(x => x.employee_id === empId);
      const isIncluded = included.some(i => i.id === empId);
      let bal = prevVacSum[empId] || 0;
      if (isIncluded) {
        bal += accrualDays;
        bal -= draft?.vacation_days || 0;
      }
      empVacBalanceUpdates[empId] = { id: empId, balance: Math.max(0, Math.round(bal * 100) / 100) };
    }

    // Asegurar el registro de período (estado borrador) sin pisar uno ya aplicado.
    const { data: existingPeriod } = await localDb
      .from('payroll_periods')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();
    const periodCommands: any[] = [];
    if (!existingPeriod) {
      periodCommands.push({
        table: 'payroll_periods',
        method: 'insert',
        data: {
          id: uuid(),
          user_id: currentUser.id,
          month,
          year,
          status: 'draft',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
    }

    // Borrado + re-inserción de la nómina del mes en UNA transacción.
    const commands: any[] = [...periodCommands];
    if (existingEntries && existingEntries.length > 0) {
      commands.push({
        table: 'payroll_entries',
        method: 'delete',
        filters: [{ op: 'eq', column: 'user_id', value: currentUser.id }, { op: 'eq', column: 'month', value: month }, { op: 'eq', column: 'year', value: year }],
      });
    }
    if (entriesToInsert.length > 0) {
      commands.push({ table: 'payroll_entries', method: 'insert', data: entriesToInsert });
    }
    commands.push({
      table: 'payroll_config',
      method: 'update',
      data: { last_calculated_month: monthStr },
      filters: [{ op: 'eq', column: 'user_id', value: currentUser.id }],
    });
    for (const lu of loanUpdates) {
      commands.push({
        table: 'employee_loans',
        method: 'update',
        data: { balance: lu.balance, status: lu.status },
        filters: [{ op: 'eq', column: 'id', value: lu.id }],
      });
    }
    // Los movimientos de vacaciones del mes se reemplazan completos
    commands.push({
      table: 'employee_vacation_movements',
      method: 'delete',
      filters: [{ op: 'eq', column: 'user_id', value: currentUser.id }, { op: 'eq', column: 'month', value: month }, { op: 'eq', column: 'year', value: year }],
    });
    for (const vm of vacMoves) {
      commands.push({ table: 'employee_vacation_movements', method: 'insert', data: vm });
    }
    for (const v of Object.values(empVacBalanceUpdates)) {
      commands.push({
        table: 'employees',
        method: 'update',
        data: { vacation_balance: v.balance },
        filters: [{ op: 'eq', column: 'id', value: v.id }],
      });
    }

    const batch = await localDb.batch(commands);
    if (batch.error) {
      throw new Error('No se pudo generar la nómina: ' + (batch.error.message || ''));
    }

    if (entriesToInsert.length > 0) {
      const { data: savedEntries } = await localDb
        .from('payroll_entries')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('month', month)
        .eq('year', year);
      set((state) => ({
        payrollEntries: savedEntries || [],
        payrollConfig: state.payrollConfig ? { ...state.payrollConfig, last_calculated_month: monthStr } : null,
      }));
    }

    set((state) => ({
      employees: state.employees.map(e =>
        empVacBalanceUpdates[e.id] ? { ...e, vacation_balance: empVacBalanceUpdates[e.id].balance } : e
      ),
    }));

    if (loanUpdates.length > 0) {
      set((state) => ({
        employeeLoans: state.employeeLoans.map(l => {
          const lu = loanUpdates.find(u => u.id === l.id);
          return lu ? { ...l, ...lu } : l;
        }),
      }));
    }

    await get().logAction('payroll', 'GENERAR_NOMINA', {
      month,
      year,
      total_employees: included.length,
      total_net: entriesToInsert.reduce((sum, e) => sum + e.net_salary, 0),
    });
  },

  // ── Captación pre-nómina ──────────────────────────────────────────────────
  getPayrollDrafts: async (month, year) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data, error } = await localDb
      .from('payroll_drafts')
      .select('*')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year);

    if (error) {
      logger.error('Error fetching payroll drafts:', error);
      return;
    }

    // Conserva en el estado los borradores de este mes/año (los demás meses
    // quedan en memoria por si se vuelve a seleccionar el mes).
    set((state) => ({
      payrollDrafts: [...state.payrollDrafts.filter(d => !(d.month === month && d.year === year)), ...(data || [])],
    }));
  },

  savePayrollDrafts: async (month, year, rows) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('No hay usuario autenticado');

    // Guarda: la captación de un período Aplicado es inmutable.
    const { data: appliedPeriod } = await localDb
      .from('payroll_periods')
      .select('status')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();
    if (appliedPeriod?.status === 'applied') {
      throw new Error('La nómina de este período está Aplicada (bloqueada). Reábrela como Dueño/a para modificar la captación.');
    }

    const now = new Date().toISOString();
    const commands: any[] = rows.map(r => {
      const full = {
        id: r.id || uuid(),
        user_id: user.id,
        month,
        year,
        employee_id: r.employee_id!,
        include: r.include ?? 1,
        worked_hours: r.worked_hours ?? 0,
        hourly_rate: r.hourly_rate ?? 0,
        bonus: r.bonus ?? 0,
        advances: r.advances ?? 0,
        retention: r.retention ?? 0,
        vacation_days: r.vacation_days ?? 0,
        note: r.note ?? '',
        updated_at: now,
      };
      return { table: 'payroll_drafts', method: 'upsert', data: full, onConflict: 'user_id,month,year,employee_id' };
    });

    const batch = await localDb.batch(commands);
    if (batch.error) {
      throw new Error('No se pudo guardar la captación: ' + (batch.error.message || ''));
    }

    const saved = rows.map(r => ({
      ...r,
      id: r.id || uuid(),
      user_id: user.id,
      month,
      year,
      include: r.include ?? 1,
      worked_hours: r.worked_hours ?? 0,
      hourly_rate: r.hourly_rate ?? 0,
      bonus: r.bonus ?? 0,
      advances: r.advances ?? 0,
      retention: r.retention ?? 0,
      vacation_days: r.vacation_days ?? 0,
      note: r.note ?? '',
      updated_at: now,
    })) as PayrollDraft[];

    set((state) => {
      const others = state.payrollDrafts.filter(d => !(d.month === month && d.year === year));
      // Fusiona: los existentes (con id) se actualizan; los nuevos se agregan.
      const byEmp = new Map(saved.map(s => [s.employee_id, s]));
      const merged = others.filter(d => !(d.month === month && d.year === year));
      void merged;
      const current = state.payrollDrafts.filter(d => d.month === month && d.year === year);
      const updated = current.map(d => byEmp.get(d.employee_id) ? { ...d, ...byEmp.get(d.employee_id) } : d);
      const newOnes = saved.filter(s => !current.some(d => d.employee_id === s.employee_id));
      return { payrollDrafts: [...others, ...updated, ...newOnes] };
    });
  },

  getPayrollPeriod: async (month, year) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data, error } = await localDb
      .from('payroll_periods')
      .select('*')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching payroll period:', error);
      return;
    }

    set({ payrollPeriod: data || null });
  },

  applyPayroll: async (month, year) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('No hay usuario autenticado');

    const now = new Date().toISOString();
    const { data: existing } = await localDb
      .from('payroll_periods')
      .select('id')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();

    const periodId = existing?.id || uuid();
    const command: any = existing
      ? {
          table: 'payroll_periods',
          method: 'update',
          data: { status: 'applied', applied_at: now, applied_by: user.name || '', updated_at: now },
          filters: [{ op: 'eq', column: 'id', value: periodId }],
        }
      : {
          table: 'payroll_periods',
          method: 'insert',
          data: {
            id: periodId,
            user_id: user.id,
            month,
            year,
            status: 'applied',
            applied_at: now,
            applied_by: user.name || '',
            created_at: now,
            updated_at: now,
          },
        };

    const batch = await localDb.batch([command]);
    if (batch.error) {
      throw new Error('No se pudo aplicar la nómina: ' + (batch.error.message || ''));
    }

    // Refresca el período desde la BD para que el estado quede consistente.
    const { data: periodRow } = await localDb
      .from('payroll_periods')
      .select('*')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();
    set({ payrollPeriod: (periodRow as PayrollPeriod) || null });

    await get().logAction('payroll', 'APLICAR_NOMINA', { month, year });
  },

  reopenPayroll: async (month, year) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('No hay usuario autenticado');

    const now = new Date().toISOString();
    const { error } = await localDb
      .from('payroll_periods')
      .update({ status: 'draft', applied_at: null, applied_by: null, updated_at: now })
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year);

    if (error) {
      throw new Error('No se pudo reabrir la nómina');
    }

    set((state) => ({
      payrollPeriod: state.payrollPeriod ? { ...state.payrollPeriod, status: 'draft', applied_at: undefined, applied_by: undefined } : state.payrollPeriod,
    }));

    await get().logAction('payroll', 'REABRIR_NOMINA', { month, year });
  },

  getPayrollEntries: async (month, year) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data, error } = await localDb
      .from('payroll_entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year)
      .order('employee_category', { ascending: true })
      .order('employee_name', { ascending: true });

    if (error) {
      logger.error('Error fetching payroll entries:', error);
      return;
    }

    set({ payrollEntries: data || [] });
  },

  getEmployeesPaginated: async (page, search, departmentId, sortBy = 'name', sortOrder = 'asc') => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const pageSize = 10;
    const offset = (page - 1) * pageSize;

    let query = localDb
      .from('employees')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id);

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    if (departmentId) {
      query = query.eq('category', departmentId);
    }

    const sortField = sortBy === 'salary' ? 'salary' : 'name';
    query = query.order(sortField, { ascending: sortOrder === 'asc' });

    const { data, error, count } = await query.range(offset, offset + pageSize - 1);

    if (error) {
      logger.error('Error fetching employees paginated:', error);
      return;
    }

    set({ 
      employees: data || [], 
      employeesPage: page,
      employeesTotal: count || 0 
    });
  },

  getEmployeesCount: async (search, departmentId) => {
    const user = useAuthStore.getState().user;
    if (!user) return 0;

    // Si está offline, retornar 0 para evitar crash
    if (!IS_ONLINE) {
      logger.info('[getEmployeesCount] Offline: returning 0');
      return 0;
    }

    try {
      let query = localDb
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (search) {
        query = query.ilike('name', `%${search}%`);
      }

      if (departmentId) {
        query = query.eq('category', departmentId);
      }

      const { count, error } = await query;

      if (error) {
        logger.error('Error counting employees:', error);
        return 0;
      }

      return count || 0;
    } catch (err) {
      logger.warn('[getEmployeesCount] Error:', err);
      return 0;
    }
  },

  getDepartmentsPaginated: async (page, search) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const pageSize = 10;
    const offset = (page - 1) * pageSize;

    let query = localDb
      .from('departments')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id);

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error, count } = await query
      .order('name', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      logger.error('Error fetching departments paginated:', error);
      return;
    }

    set({ 
      departments: data || [], 
      departmentsPage: page,
      departmentsTotal: count || 0 
    });
  },

  getDepartmentsCount: async (search) => {
    const user = useAuthStore.getState().user;
    if (!user) return 0;

    // Si está offline, retornar 0 para evitar crash
    if (!IS_ONLINE) {
      logger.info('[getDepartmentsCount] Offline: returning 0');
      return 0;
    }

    try {
      let query = localDb
        .from('departments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (search) {
        query = query.ilike('name', `%${search}%`);
      }

      const { count, error } = await query;

      if (error) {
        logger.error('Error counting departments:', error);
        return 0;
      }

      return count || 0;
    } catch (err) {
      logger.warn('[getDepartmentsCount] Error:', err);
      return 0;
    }
  },

  getPayrollEntriesPaginated: async (page, month, year) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const { data, error, count } = await localDb
      .from('payroll_entries')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year)
      .order('employee_category', { ascending: true })
      .order('employee_name', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      logger.error('Error fetching payroll entries paginated:', error);
      return;
    }

    set({ 
      payrollEntries: data || [], 
      payrollPage: page,
      payrollMonthFilter: month,
      payrollYearFilter: year,
      payrollTotal: count || 0 
    });
  },

  getPayrollEntriesCount: async (month, year) => {
    const user = useAuthStore.getState().user;
    if (!user) return 0;

    // Si está offline, retornar 0 para evitar crash
    if (!IS_ONLINE) {
      logger.info('[getPayrollEntriesCount] Offline: returning 0');
      return 0;
    }

    try {
      const { count, error } = await localDb
        .from('payroll_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('month', month)
        .eq('year', year);

      if (error) {
        logger.error('Error counting payroll entries:', error);
        return 0;
      }

      return count || 0;
    } catch (err) {
      logger.warn('[getPayrollEntriesCount] Error:', err);
      return 0;
    }
  },

  updatePayrollEntry: async (id, updates) => {
    const currentEntry = get().payrollEntries.find(e => e.id === id);
    if (!currentEntry) return;

    const config = get().payrollConfig;
    if (!config) return;

    // Guarda: los registros de un período Aplicado son inmutables.
    const { data: appliedPeriod } = await localDb
      .from('payroll_periods')
      .select('status')
      .eq('user_id', currentEntry.user_id)
      .eq('month', currentEntry.month)
      .eq('year', currentEntry.year)
      .maybeSingle();
    if (appliedPeriod?.status === 'applied') {
      throw new Error('La nómina de este período está Aplicada (bloqueada). Reábrela como Dueño/a para poder modificarla.');
    }

    let finalUpdates = { ...updates };

    // Recalcular cuando cambia cualquiera de los conceptos de nómina.
    const conceptKeys = ['earned_salary', 'overtime_hours', 'overtime_type', 'bonus', 'vacation_days', 'advances', 'loan_deduction', 'other_deductions'] as const;
    if (conceptKeys.some(k => (updates as any)[k] !== undefined)) {
      const earned_salary = (updates as any).earned_salary !== undefined ? (updates as any).earned_salary : currentEntry.earned_salary;
      const overtimeHours = (updates as any).overtime_hours !== undefined ? (updates as any).overtime_hours : (currentEntry.overtime_hours || 0);
      const overtimeType = (updates as any).overtime_type !== undefined ? (updates as any).overtime_type : (currentEntry.overtime_type || 'diurna');
      const bonus = (updates as any).bonus !== undefined ? (updates as any).bonus : currentEntry.bonus;
      const vacationDays = (updates as any).vacation_days !== undefined ? (updates as any).vacation_days : currentEntry.vacation_days;
      const advances = (updates as any).advances !== undefined ? (updates as any).advances : currentEntry.advances;
      const loanDeduction = (updates as any).loan_deduction !== undefined ? (updates as any).loan_deduction : currentEntry.loan_deduction;
      const otherDeductions = (updates as any).other_deductions !== undefined ? (updates as any).other_deductions : currentEntry.other_deductions;
      const exemption_base = config.tax_exemption_base;
      const employee = get().employees.find(e => e.id === currentEntry.employee_id);
      const isPartner = employee?.person_type === 'partner';
      const result = calcularNomina(earned_salary, {
        personType: isPartner ? 'partner' : 'employee',
        baseContribution: employee?.base_contribution,
        exemptionBase: config.tax_exemption_base,
        monthlyHours: config.monthly_hours || 190.6,
        overtimeHours,
        overtimeType,
        bonus,
        vacationDays,
        advances,
        loanDeduction,
        otherDeductions,
      });

      finalUpdates = {
        ...updates,
        earned_salary,
        exemption_base,
        taxable_base: result.taxableBase,
        tax_amount: result.taxAmount,
        special_contribution: result.specialContribution,
        net_salary: result.netSalary,
        vacation_base: result.vacationBase,
        employer_contribution: result.employerContribution,
        overtime_hours: overtimeHours,
        overtime_type: overtimeType,
        overtime_pay: result.overtimePay,
        bonus: result.bonus,
        vacation_pay: result.vacationPay,
        advances: result.advances,
        loan_deduction: result.loanDeduction,
        other_deductions: result.otherDeductions,
        gross_salary: result.grossSalary,
      };
    }

    const { error } = await localDb
      .from('payroll_entries')
      .update({ ...finalUpdates, updated_at: new Date().toISOString(), is_custom: true })
      .eq('id', id);

    if (error) {
      throw new Error('No se pudo actualizar el registro de nómina');
    }

    set((state) => ({
      payrollEntries: state.payrollEntries.map(e => e.id === id ? { ...e, ...finalUpdates, is_custom: true } : e),
    }));

    const entry = get().payrollEntries.find(e => e.id === id);
    if (entry) {
      await get().logAction('payroll', 'ACTUALIZAR_NOMINA', {
        employee_name: entry.employee_name,
        field: Object.keys(updates)[0],
        old_value: Object.values(updates)[0],
      });
    }
  },

  regeneratePayrollEntry: async (id) => {
    const entry = get().payrollEntries.find(e => e.id === id);
    if (!entry) return;

    const config = get().payrollConfig;
    if (!config) return;

    const employee = get().employees.find(e => e.id === entry.employee_id);
    if (!employee) return;

    // Base del período: respeta las horas trabajadas de la captación
    // (tasa × horas); sin captación, el salario mensual completo.
    const monthlyHours = config.monthly_hours || 190.6;
    const hourly_rate = entry.hourly_rate || Math.round((employee.salary / monthlyHours) * 100) / 100;
    const worked_hours = entry.worked_hours || monthlyHours;
    const earned_salary = Math.round(hourly_rate * worked_hours * 100) / 100;
    const exemption_base = config.tax_exemption_base;
    const isPartner = employee.person_type === 'partner';
    const activeLoan = get().employeeLoans.find(l => l.employee_id === employee.id && l.status === 'active');
    const loanDeduction = activeLoan ? activeLoan.monthly_payment : 0;
    const result = calcularNomina(earned_salary, {
      personType: isPartner ? 'partner' : 'employee',
      baseContribution: employee.base_contribution,
      loanDeduction,
      exemptionBase: config.tax_exemption_base,
      monthlyHours,
    });

    await get().updatePayrollEntry(id, {
      base_salary: employee.salary,
      earned_salary,
      exemption_base,
      taxable_base: result.taxableBase,
      tax_amount: result.taxAmount,
      special_contribution: result.specialContribution,
      net_salary: result.netSalary,
      vacation_base: result.vacationBase,
      employer_contribution: result.employerContribution,
      overtime_hours: 0,
      overtime_type: 'diurna',
      overtime_pay: 0,
      bonus: 0,
      vacation_days: 0,
      vacation_pay: 0,
      advances: 0,
      loan_deduction: result.loanDeduction,
      other_deductions: 0,
      gross_salary: result.grossSalary,
      is_custom: false,
    });
  },

  getEmployeeLoans: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const { data, error } = await localDb
      .from('employee_loans')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('Error fetching employee loans:', error);
      return;
    }
    set({ employeeLoans: data || [] });
  },

  addLoan: async (loan) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('No hay usuario autenticado');
    try {
      const { data, error } = await queryWithRetry(() =>
        localDb
          .from('employee_loans')
          .insert({
            ...loan,
            user_id: user.id,
            balance: loan.total_amount,
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .select()
          .single()
      );
      if (error) {
        logger.error('Error addLoan:', error);
        throw new Error(error.message || 'No se pudo agregar el préstamo');
      }
      set((state) => ({ employeeLoans: [data, ...state.employeeLoans] }));
    } catch (error: any) {
      logger.error('Error en addLoan:', error);
      throw new Error(error.message || 'Error al agregar préstamo');
    }
  },

  updateLoan: async (id, updates) => {
    const { error } = await queryWithRetry(() =>
      localDb
        .from('employee_loans')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
    );
    if (error) throw new Error('No se pudo actualizar el préstamo');
    set((state) => ({
      employeeLoans: state.employeeLoans.map(l => (l.id === id ? { ...l, ...updates } : l)),
    }));
  },

  deleteLoan: async (id) => {
    const { error } = await queryWithRetry(() =>
      localDb.from('employee_loans').delete().eq('id', id)
    );
    if (error) throw new Error(error.message || 'No se pudo eliminar el préstamo');
    set((state) => ({ employeeLoans: state.employeeLoans.filter(l => l.id !== id) }));
  },

  payLoanInstallment: async (id) => {
    const loan = get().employeeLoans.find(l => l.id === id);
    if (!loan) return;
    const newBalance = Math.max(0, loan.balance - loan.monthly_payment);
    const newStatus = newBalance <= 0 ? 'paid' : 'active';
    await get().updateLoan(id, { balance: newBalance, status: newStatus });
  },

  getLiquidations: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const { data, error } = await localDb
      .from('payroll_liquidations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('Error fetching liquidations:', error);
      return;
    }
    set({ payrollLiquidations: data || [] });
  },

  saveLiquidation: async (liq) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('No hay usuario autenticado');
    try {
      const { data, error } = await queryWithRetry(() =>
        localDb
          .from('payroll_liquidations')
          .insert({ ...liq, user_id: user.id })
          .select()
          .single()
      );
      if (error) {
        logger.error('Error saveLiquidation:', error);
        throw new Error(error.message || 'No se pudo guardar la liquidación');
      }
      set((state) => ({ payrollLiquidations: [data, ...state.payrollLiquidations] }));
    } catch (error: any) {
      logger.error('Error en saveLiquidation:', error);
      throw new Error(error.message || 'Error al guardar liquidación');
    }
  },

  deleteLiquidation: async (id) => {
    const { error } = await queryWithRetry(() =>
      localDb.from('payroll_liquidations').delete().eq('id', id)
    );
    if (error) throw new Error(error.message || 'No se pudo eliminar la liquidación');
    set((state) => ({ payrollLiquidations: state.payrollLiquidations.filter(l => l.id !== id) }));
  },

  addCategory: async (name) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('No hay usuario autenticado');

    try {
      const { data, error } = await queryWithRetry(() =>
        localDb
          .from('categories')
          .insert({ user_id: user.id, name: capitalize(name) })
          .select()
          .single()
      );

      if (error) {
        throw new Error('No se pudo agregar la categoría');
      }

      set((state) => ({ categories: [data, ...state.categories] }));
    } catch (error: any) {
      logger.error('Error en addCategory:', error);
      throw new Error(error.message || 'Error al agregar categoría');
    }
  },

  deleteCategory: async (id) => {
    const { error } = await queryWithRetry(() =>
      localDb.from('categories').delete().eq('id', id)
    );

    if (error) {
      throw new Error('No se pudo eliminar la categoría');
    }

    set((state) => ({ categories: state.categories.filter(c => c.id !== id) }));
  },

  getDailyClosings: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data, error } = await localDb
      .from('daily_closings')
      .select('*')
      .eq('user_id', user.id)
      .order('closing_date', { ascending: false });

    if (error) {
      throw new Error('No se pudieron cargar los cierres de caja');
    }

    set({ dailyClosings: data || [] });
  },

createDailyClosing: async (closing) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No autenticado' };

    const closingDate = new Date(closing.closing_date).toISOString().split('T')[0];
    const closingShift = closing.shift || '1';
    if (isDateClosed(get().dailyClosings, closingDate, closingShift)) {
      return { success: false, error: 'Ya existe un cierre para esta fecha y turno' };
    }

    // Etiquetar el cierre con la caja/punto de venta de este dispositivo (multi-caja).
    let registerId: string | null = null;
    try {
      const sessRes = await localDb.getMySession();
      registerId = sessRes?.data?.session?.register?.id || null;
    } catch { /* se registra sin caja */ }
    const closingWithRegister = { ...closing, register_id: registerId };

    if (!IS_ONLINE) {
      const id = uuid();
      const offlineClosing = { ...closingWithRegister, id, user_id: user.id, created_at: new Date().toISOString(), sales_count: closing.sales_count || 0 } as DailyClosing;
      set((state) => ({ dailyClosings: [offlineClosing, ...state.dailyClosings] }));
      // Respaldo automático al cerrar caja (spec 002; no bloquea el cierre).
      try { (localDb.backup.now() as Promise<any>).catch(() => {}); } catch { /* ignore */ }

      return { success: true };
    }

    try {
      const { data, error } = await queryWithRetry(() =>
        localDb
          .from('daily_closings')
          .insert({ ...closingWithRegister, user_id: user.id, sales_count: closing.sales_count || 0 })
          .select()
          .single()
      );

      if (error) {
        logger.error('Error createDailyClosing:', error);
        if (error.code === '23505') {
          return { success: false, error: 'Ya existe un cierre para esta fecha y turno' };
        }
        throw new Error(error.message || 'No se pudo registrar el cierre de caja');
      }

      set((state) => ({ dailyClosings: [data, ...state.dailyClosings] }));
      // Respaldo automático al cerrar caja (spec 002; no bloquea el cierre).
      try { (localDb.backup.now() as Promise<any>).catch(() => {}); } catch { /* ignore */ }
      return { success: true };
    } catch (error: any) {
      logger.error('Error en createDailyClosing:', error);
      return { success: false, error: error.message || 'Error al registrar cierre de caja' };
    }
  },

  fetchInvoices: async (filters) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    try {
      const { data, error } = await localDb.invoice.list(filters || {});
      if (error) throw new Error(error.message || 'No se pudieron cargar las facturas');
      set({ invoices: Array.isArray(data) ? data : [] });
    } catch (error: any) {
      logger.error('Error en fetchInvoices:', error);
      throw new Error(error.message || 'No se pudieron cargar las facturas');
    }
  },

  fetchInvoiceItems: async (invoiceId) => {
    try {
      const { data, error } = await queryWithRetry(() =>
        localDb.from('invoice_items').select('*').eq('invoice_id', invoiceId)
      );
      if (error) throw new Error(error.message || 'No se pudieron cargar las líneas');
      const items = Array.isArray(data) ? data : [];
      set((state) => ({
        invoices: state.invoices.map((inv) => (inv.id === invoiceId ? { ...inv, items } : inv)),
      }));
      return items;
    } catch (error: any) {
      logger.error('Error en fetchInvoiceItems:', error);
      throw new Error(error.message || 'No se pudieron cargar las líneas');
    }
  },

  createInvoiceManual: async (payload) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No autenticado' };
    try {
      const { data, error } = await localDb.invoice.create(payload);
      if (error || !data) {
        logger.error('Error en createInvoiceManual:', error);
        return { success: false, error: error?.message || 'No se pudo crear la factura' };
      }
      set((state) => ({ invoices: [data as Invoice, ...state.invoices] }));
      return { success: true, invoice: data as Invoice };
    } catch (error: any) {
      logger.error('Error en createInvoiceManual:', error);
      return { success: false, error: error.message || 'No se pudo crear la factura' };
    }
  },

  createInvoiceFromSale: async (saleId, clientName) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No autenticado' };
    try {
      const { data, error } = await localDb.invoice.fromSale(saleId, clientName);
      if (error || !data) {
        logger.error('Error en createInvoiceFromSale:', error);
        return { success: false, error: error?.message || 'No se pudo facturar la venta' };
      }
      set((state) => ({ invoices: [data as Invoice, ...state.invoices] }));
      return { success: true, invoice: data as Invoice };
    } catch (error: any) {
      logger.error('Error en createInvoiceFromSale:', error);
      return { success: false, error: error.message || 'No se pudo facturar la venta' };
    }
  },

  voidInvoice: async (id, reason) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No autenticado' };
    try {
      const { data, error } = await localDb.invoice.void(id, reason);
      if (error || !data) {
        logger.error('Error en voidInvoice:', error);
        return { success: false, error: error?.message || 'No se pudo anular la factura' };
      }
      set((state) => ({
        invoices: state.invoices.map((inv) => (inv.id === id ? (data as Invoice) : inv)),
      }));
      return { success: true };
    } catch (error: any) {
      logger.error('Error en voidInvoice:', error);
      return { success: false, error: error.message || 'No se pudo anular la factura' };
    }
  },

  invoiceReport: async (year, month) => {
    try {
      const { data, error } = await localDb.invoice.report(year, month);
      if (error) throw new Error(error.message || 'No se pudo generar el reporte');
      return data;
    } catch (error: any) {
      logger.error('Error en invoiceReport:', error);
      throw new Error(error.message || 'No se pudo generar el reporte');
    }
  },

  recalculateStock: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data: movements } = await localDb
      .from('movements')
      .select('*')
      .eq('user_id', user.id);

    const { data: products } = await localDb
      .from('products')
      .select('*')
      .eq('user_id', user.id);

    if (!movements || !products) return;

    for (const product of products) {
      let calculatedQty = 0;
      movements
        .filter((m: any) => m.product_id === product.id)
        .forEach((m: any) => {
          // ENTRADA/AJUSTE suman;
          // SALIDA/MERMA restan solo si tienen warehouse_id (las ventas/consumos
          // desde tránsito no descontaron el almacén y no deben contarse aquí).
          if (m.type === 'ENTRADA' || m.type === 'AJUSTE') {
            calculatedQty += Number(m.quantity);
          } else if (m.type === 'SALIDA' || m.type === 'MERMA') {
            if (m.warehouse_id) calculatedQty -= Number(m.quantity);
          }
        });

      await localDb
        .from('products')
        .update({ quantity: Math.max(0, calculatedQty), updated_at: new Date().toISOString() })
        .eq('id', product.id);
    }

    await get().fetchAll();
  },

  uploadHRDocument: async (file: File, docType: 'MANUAL' | 'REGLAMENTO' | 'PNO') => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No autenticado' };

    if (!IS_ONLINE) {
      return { success: false, error: 'No hay conexión — los documentos se pueden subir solo cuando hay internet' };
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${docType}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = `hr-documents/${fileName}`;

    const { error: uploadError } = await localDb.storage
      .from('hr-documents')
      .upload(filePath, file, { upsert: false });

    if (uploadError) {
      return { success: false, error: 'Error al subir el archivo: ' + uploadError.message };
    }

    const { data: urlData } = localDb.storage.from('hr-documents').getPublicUrl(filePath);

    const docName = file.name.replace(`.${fileExt}`, '').replace(/_/g, ' ').replace(/[.-]/g, ' ');

    const { error: dbError } = await localDb
      .from('hr_documents')
      .insert({
        user_id: user.id,
        name: docName,
        doc_type: docType,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_size: file.size,
      });

    if (dbError) {
      await localDb.storage.from('hr-documents').remove([filePath]);
      return { success: false, error: 'Error al guardar el registro: ' + dbError.message };
    }

    await get().fetchHRDocuments();
    return { success: true };
  },

  fetchHRDocuments: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data, error } = await localDb
      .from('hr_documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error('No se pudieron cargar los documentos');
    }

    set({ hrDocuments: data || [] });
  },

  deleteHRDocument: async (id: string, fileUrl: string) => {
    const { error: dbError } = await localDb
      .from('hr_documents')
      .delete()
      .eq('id', id);

    if (dbError) {
      throw new Error('No se pudo eliminar el registro');
    }

    const filePath = fileUrl.split('/hr-documents/')[1];
    if (filePath) {
      await localDb.storage.from('hr-documents').remove([`${filePath}`]);
    }

    set((state) => ({
      hrDocuments: state.hrDocuments.filter((d) => d.id !== id),
    }));
  },

  uploadEmployeeDocument: async (file: File, employeeId: string, docType: 'CONTRATO' | 'IDENTIFICACION' | 'OTRO', name?: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'No autenticado' };

    if (!IS_ONLINE) {
      return { success: false, error: 'No hay conexión — los documentos se pueden subir solo cuando hay internet' };
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/employees/${employeeId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = `hr-documents/${fileName}`;

    const { error: uploadError } = await localDb.storage
      .from('hr-documents')
      .upload(filePath, file, { upsert: false });

    if (uploadError) {
      return { success: false, error: 'Error al subir el archivo: ' + uploadError.message };
    }

    const { data: urlData } = localDb.storage.from('hr-documents').getPublicUrl(filePath);

    const docName = name || file.name.replace(`.${fileExt}`, '').replace(/_/g, ' ').replace(/[.-]/g, ' ');

    const { error: dbError } = await localDb
      .from('employee_documents')
      .insert({
        user_id: user.id,
        employee_id: employeeId,
        name: docName,
        doc_type: docType,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_size: file.size,
      });

    if (dbError) {
      await localDb.storage.from('hr-documents').remove([filePath]);
      return { success: false, error: 'Error al guardar el registro: ' + dbError.message };
    }

    await get().fetchEmployeeDocuments(employeeId);
    return { success: true };
  },

  fetchEmployeeDocuments: async (employeeId: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data, error } = await localDb
      .from('employee_documents')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error('No se pudieron cargar los documentos');
    }

    set({ employeeDocuments: data || [] });
  },

  deleteEmployeeDocument: async (id: string, fileUrl: string) => {
    const { error: dbError } = await localDb
      .from('employee_documents')
      .delete()
      .eq('id', id);

    if (dbError) {
      throw new Error('No se pudo eliminar el registro');
    }

    const filePath = fileUrl.split('/hr-documents/')[1];
    if (filePath) {
      await localDb.storage.from('hr-documents').remove([`${filePath}`]);
    }

    set((state) => ({
      employeeDocuments: state.employeeDocuments.filter((d) => d.id !== id),
    }));
  },

forceRefreshData: async () => {
    logger.info('[forceRefreshData] Refreshing data from local server...');
    const { fetchAll } = useDatabaseStore.getState();
    await fetchAll();
  },
}));
