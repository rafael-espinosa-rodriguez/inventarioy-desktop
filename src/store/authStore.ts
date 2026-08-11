import { create } from 'zustand';
import { localDb as supabase } from '../lib/db/localClient';
import { clearLocalData } from '../lib/dexieDb';
import { useDatabaseStore } from './dbStore';
import { logger } from '../lib/logger';
import { syncEngine } from '../lib/syncEngine';
import { setRealtimeUserId } from '../lib/realtimeSync';

// Versión desktop: el servidor local siempre está disponible.
const checkRealInternetConnection = async (): Promise<boolean> => {
  return true;
};

const withTimeout = async <T>(promise: Promise<T> | any, timeoutMs: number = 10000): Promise<T> => {
  try {
    const result = await Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs))
    ]);
    return result;
  } catch (err: any) {
    if (err.message === 'TIMEOUT') {
      throw new Error('TIMEOUT');
    }
    throw err;
  }
};

export interface LicenseInfo {
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
}

export interface User {
  id: string;
  email: string;
  name: string;
  businessName: string;
  role: string;
  createdAt: string;
  subscription: {
    status: 'trialing' | 'active' | 'past_due' | 'canceled';
    trialEndsAt: string;
    validUntil: string | null;
  };
  license: LicenseInfo;
  isSubscriptionActive: boolean;
  generateTicket: boolean;
  ticketMessage: string;
  usdEnabled: boolean;
  usdRate: number;
  eurEnabled: boolean;
  eurRate: number;
  cupTransferEnabled: boolean;
  phone: string;
  address: string;
  businessHours: string;
  businessCode: string;
  themePreference: 'light' | 'dark';
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (pin: string, businessCode?: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name: string, businessName: string, phone?: string) => Promise<{ success: boolean; error?: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateSubscription: (updates: Partial<User['subscription']>) => void;
  activateLicense: (key: string) => Promise<{ success: boolean; error?: string }>;
  refreshLicense: () => Promise<void>;
  generateLicense: (code: string, months?: number, until?: string) => Promise<{ success: boolean; key?: string; validUntil?: string; error?: string }>;
  simulateLicense: (action: string, options?: { code?: string; months?: number; until?: string }) => Promise<{ success: boolean; key?: string; error?: string }>;
  fetchUser: () => Promise<boolean>;
  initialize: () => Promise<void>;
}

let _isInitializing = false;

const DEFAULT_LICENSE: LicenseInfo = {
  status: 'trialing',
  trialStartedAt: null,
  trialEndsAt: null,
  validUntil: null,
  daysRemaining: 7,
  trialDays: 7,
  businessCode: '',
};

const licenseToSubscription = (license: LicenseInfo): User['subscription'] => {
  if (license.status === 'active') {
    return { status: 'active', trialEndsAt: license.trialEndsAt || '', validUntil: license.validUntil };
  }
  if (license.status === 'trialing') {
    return { status: 'trialing', trialEndsAt: license.trialEndsAt || '', validUntil: null };
  }
  return { status: 'canceled', trialEndsAt: license.trialEndsAt || '', validUntil: null };
};

const checkSubscriptionActive = (subscription: User['subscription']): boolean => {
  if (subscription.status === 'canceled') {
    return false;
  }
  
  if (subscription.status === 'past_due') {
    return false;
  }
  
  if (subscription.status === 'active') {
    if (subscription.validUntil) {
      const validUntil = new Date(subscription.validUntil);
      if (validUntil > new Date()) {
        return true;
      }
    }
    return false;
  }
  
  if (subscription.status === 'trialing') {
    const trialEnd = new Date(subscription.trialEndsAt);
    if (trialEnd > new Date()) {
      return true;
    }
    return false;
  }
  
  return false;
};

const translateError = (message: string): string => {
  const errorTranslations: Record<string, string> = {
    'Invalid login credentials': 'Credenciales de inicio de sesión inválidas',
    'Email not confirmed': 'Correo electrónico no confirmado',
    'User already registered': 'Este correo electrónico ya está registrado',
    'User already exists': 'Este usuario ya existe',
    'Invalid email': 'Correo electrónico inválido',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
    'Signup requires a valid password': 'Para registrarse se requiere una contraseña válida',
    'Unable to validate email address: Invalid email format': 'No se pudo validar el correo electrónico: Formato inválido',
    'No valid workers found': 'No se encontraron trabajadores válidos',
    'Not authorized': 'No autorizado',
    'Session expired': 'Sesión expirada',
    'Token expired': 'Token expirado',
    'Invalid token': 'Token inválido',
    'Failed to parse signlink URL': 'Error al analizar la URL de enlace',
    'Linking requires a confirmation': 'La vinculación requiere una confirmación',
    'A user with this email address has already been registered': 'Ya existe un usuario con este correo electrónico',
    'To sign up, you must accept the Terms': 'Para registrarte, debes aceptar los Términos',
    'Security key issue': 'Problema con la clave de seguridad',
    'Phone number is invalid': 'El número de teléfono es inválido',
    'Invalid phone number': 'Número de teléfono inválido',
    'Too many requests': 'Demasiadas solicitudes. Por favor, espera un momento',
    'Network request failed': 'Error de solicitud de red',
    'Invalid URL': 'URL inválida',
    'Missing requirements for Sozial Login': 'Requisitos faltantes para inicio de sesión social',
    'Failed to fetch': 'Sin conexión a internet',
    'Failed to fetch (offline)': 'Sin conexión a internet',
    'NetworkError': 'Sin conexión a internet',
  };

  if (errorTranslations[message]) {
    return errorTranslations[message];
  }

  if (message.includes('Invalid login credentials')) {
    return 'Credenciales de inicio de sesión inválidas';
  }
  if (message.includes('already registered') || message.includes('already exists')) {
    return 'Este correo electrónico ya está registrado';
  }
  if (message.includes('invalid email') || message.includes('Invalid email')) {
    return 'Correo electrónico inválido';
  }
  if (message.includes('password')) {
    return 'Contraseña incorrecta';
  }
  if (message.includes('not confirmed')) {
    return 'Correo electrónico no confirmado. Revise su bandeja de entrada';
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Demasiadas solicitudes. Por favor, espera un momento';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'Error de conexión. Verifique su internet';
  }

  return message;
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    if (_isInitializing) {
      logger.info('initialize ya está en progreso, ignorando...');
      return;
    }
    _isInitializing = true;

    // Detección de multi-pestaña para evitar conflictos IndexedDB
    if (typeof window !== 'undefined') {
      const tabKey = 'inventarioy_tab_active';
      const existing = localStorage.getItem(tabKey);
      if (existing) {
        const age = Date.now() - parseInt(existing, 10);
        if (age < 3000) {
          logger.warn('⚠️ Otra pestaña de InventarioY está activa — pueden ocurrir conflictos de sincronización');
        }
      }
      localStorage.setItem(tabKey, String(Date.now()));
    }

    logger.info('Inicializando autenticación...');

    // Si el usuario cerró sesión explícitamente, NO restaurar la sesión del servidor
    // (el servidor local /api/auth/session siempre devuelve el owner).
    if (localStorage.getItem('inventarioy_logged_out') === '1') {
      logger.info('Sesión cerrada previamente — no restaurar');
      set({ user: null, isAuthenticated: false, isLoading: false });
      _isInitializing = false;
      return;
    }

    const savedUserData = localStorage.getItem('inventarioy_user');

    // Si hay datos de usuario guardados, mostrarlos inmediatamente mientras se verifica la sesión local
    if (savedUserData) {
      try {
        const userData = JSON.parse(savedUserData);
        set({ user: userData, isAuthenticated: true, isLoading: true });
      } catch {
        set({ isLoading: true });
      }
    } else {
      set({ isLoading: true });
    }

    try {
      const { data: { session } } = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AuthTimeout')), 15000)
        ),
      ]);

      if (session?.id) {
        if (!get().user) {
          await get().fetchUser();
        } else {
          set({ isLoading: false });
        }
      } else if (savedUserData) {
        try {
          const userData = JSON.parse(savedUserData);
          set({ user: userData, isAuthenticated: true, isLoading: false });
        } catch {
          set({ isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } catch (err: any) {
      logger.warn('Error en getSession local:', err?.message || err);
      if (savedUserData) {
        try {
          const userData = JSON.parse(savedUserData);
          set({ user: userData, isAuthenticated: true, isLoading: false });
        } catch {
          set({ isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } finally {
      _isInitializing = false;
      // Refrescar la licencia de inmediato (no esperar el primer tick de 60s):
      // cuando se restaura un usuario cacheado, el estado de licencia puede estar
      // desactualizado (p. ej. vencida mientras la app estuvo cerrada).
      if (get().user) {
        void get().refreshLicense();
      }
    }
  },

  fetchUser: async () => {
    logger.info('fetchUser llamado...');
    try {
      const { data, error } = (await withTimeout(
        supabase.auth.getSession(),
        10000
      )) as any;

      if (error) {
        logger.error('Error en getSession:', error);
        set({ isLoading: false });
        return false;
      }

      const profile = data?.session || null;

      if (!profile) {
        logger.info('No hay sesión local activa');
        set({ isLoading: false });
        return false;
      }

      const user: User = {
        id: profile.id || 'owner',
        email: profile.email || '',
        name: profile.name || '',
        businessName: profile.businessName || '',
        role: profile.role || 'owner',
        createdAt: profile.created_at || new Date().toISOString(),
        subscription: {
          status: 'active',
          trialEndsAt: '',
          validUntil: null,
        },
        license: DEFAULT_LICENSE,
        isSubscriptionActive: true,
        generateTicket: !!profile.ticketMessage || false,
        ticketMessage: profile.ticketMessage || '¡Gracias por su visita!',
        usdEnabled: !!profile.usdEnabled,
        usdRate: profile.usdRate ?? 320,
        eurEnabled: !!profile.eurEnabled,
        eurRate: profile.eurRate ?? 350,
        cupTransferEnabled: !!profile.cupTransferEnabled,
        phone: profile.phone || '',
        address: profile.address || '',
        businessHours: profile.businessHours || '',
        businessCode: profile.business_code || '',
        themePreference: (localStorage.getItem('theme-preference') as 'light' | 'dark') || 'dark',
      };

      // Consultar estado de licencia real (trial / activa / vencida)
      const licenseRes = (await supabase.license.status()) as any;
      if (licenseRes?.data) {
        const lic: LicenseInfo = {
          status: licenseRes.data.status || 'trialing',
          trialStartedAt: licenseRes.data.trialStartedAt || null,
          trialEndsAt: licenseRes.data.trialEndsAt || null,
          validUntil: licenseRes.data.validUntil || null,
          daysRemaining: licenseRes.data.daysRemaining ?? 0,
          trialDays: licenseRes.data.trialDays ?? 7,
          businessCode: licenseRes.data.businessCode || user.businessCode,
          isDeveloper: !!licenseRes.data.isDeveloper,
          hasLicenseKey: !!licenseRes.data.hasLicenseKey,
          maxSeenTime: licenseRes.data.maxSeenTime ?? null,
        };
        user.license = lic;
        user.subscription = licenseToSubscription(lic);
        user.businessCode = lic.businessCode || user.businessCode;
        user.isSubscriptionActive = checkSubscriptionActive(user.subscription);
      }

      logger.info('Usuario cargado', { email: user.email, role: user.role, license: user.license.status });
      
      // Guardar usuario en localStorage para persistencia de sesión
      if (typeof window !== 'undefined') {
        localStorage.setItem('inventarioy_user', JSON.stringify(user));
        localStorage.removeItem('inventarioy_logged_out');
      }
      
      set({ user, isAuthenticated: true, isLoading: false });
      setRealtimeUserId(user.id);
      return true;
    } catch (err) {
      logger.error('Error en fetchUser:', err);
      set({ isLoading: false });
      return false;
    }
  },

  login: async (pin: string) => {
    try {
      const { data, error } = (await supabase.auth.signInWithPassword({
        pin,
      })) as any;

      if (error) {
        const msg = error?.message ?? String(error);
        return { success: false, error: translateError(msg) };
      }

      if (data?.success) {
        // Guardar rol verificado (sistema de roles por PIN)
        if (data.pinRole) {
          localStorage.setItem('verifiedRole', data.pinRole);
          localStorage.setItem('verifiedRoleName', data.pinName || '');
        }

        const userLoaded = await get().fetchUser();
        if (!userLoaded) {
          return { success: false, error: 'Error al cargar los datos del negocio. Intente de nuevo.' };
        }
        return { success: true };
      }

      return { success: false, error: 'Error desconocido al iniciar sesión' };
    } catch (err) {
      logger.error('Error inesperado en login:', err);
      return { success: false, error: 'No se pudo conectar con el servidor local. Verifique la aplicación.' };
    }
  },

  register: async () => {
    return { success: false, error: 'El registro no está disponible en la versión desktop. Use el PIN configurado por el administrador.' };
  },

  forgotPassword: async () => {
    return { success: false, error: 'La recuperación de contraseña no está disponible en la versión desktop. Contacte al administrador.' };
  },

  logout: async () => {
    logger.info('Logout llamado...');
    syncEngine.stop();
    setRealtimeUserId(null);
    try {
      // Código SQLite eliminado

      localStorage.removeItem('saved_email');
      localStorage.removeItem('inventarioy_user');
      localStorage.removeItem('verifiedRole');
      localStorage.removeItem('verifiedRoleName');
      localStorage.setItem('inventarioy_logged_out', '1');

      _isInitializing = false;
      set({ user: null, isAuthenticated: false, isLoading: false });
      logger.info('Estado limpiado');

      // Resetear Zustand store de base de datos para evitar que datos del usuario anterior
      // queden en memoria y se filtren al siguiente login
      useDatabaseStore.setState({
        products: [],
        movements: [],
        sales: [],
        recipes: [],
        employees: [],
        employeeDocuments: [],
        categories: [],
        transitItems: [],
        dailyClosings: [],
        hrDocuments: [],
        departments: [],
        payrollConfig: null,
        payrollEntries: [],
        accessPins: [],
        actionLogs: [],
        warehouses: [],
        productWarehouse: [],
        currentWarehouseId: null,
        pendingAccounts: [],
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
        syncQueueCount: 0,
        syncStatus: 'idle',
        syncProgress: null,
        isLoading: true,
      });
      logger.info('Zustand dbStore reseteado');

      await supabase.auth.signOut();
      logger.info('SignOut exitoso');

      try {
        await clearLocalData();
        logger.info('IndexedDB limpiado');
      } catch (dbErr) {
        logger.warn('Error limpiando IndexedDB:', dbErr);
      }
    } catch (err) {
      logger.error('Error en logout:', err);
    } finally {
      // Reactivar el motor de sincronización para el próximo usuario
      syncEngine.start();
      // Forzar redirección
      logger.info('Redireccionando...');
      window.location.href = '/';
    }
  },

  updateSubscription: async (updates) => {
    const { user } = get();
    if (!user) return;

    const newSubscription = { ...user.subscription, ...updates };

    try {
      await supabase.settings.set('subscription', {
        status: newSubscription.status,
        validUntil: newSubscription.validUntil,
      });
    } catch (e) {
      logger.warn('No se pudo guardar la suscripción local:', e);
    }

    set({
      user: { ...user, subscription: newSubscription },
    });
  },

  activateLicense: async (key) => {
    try {
      const res = (await supabase.license.activate(String(key).trim())) as any;
      if (res?.error) {
        return { success: false, error: res.error?.message || 'Clave de activación inválida' };
      }
      if (res?.data?.state) {
        const prevLicense = get().user?.license;
        const lic: LicenseInfo = {
          status: res.data.state.status || 'active',
          trialStartedAt: res.data.state.trialStartedAt || null,
          trialEndsAt: res.data.state.trialEndsAt || null,
          validUntil: res.data.state.validUntil || null,
          daysRemaining: res.data.state.daysRemaining ?? 0,
          trialDays: res.data.state.trialDays ?? 7,
          businessCode: get().user?.businessCode || '',
          isDeveloper: prevLicense?.isDeveloper,
          hasLicenseKey: prevLicense?.hasLicenseKey,
          maxSeenTime: prevLicense?.maxSeenTime,
        };
        const user = get().user;
        if (user) {
          const next: User = {
            ...user,
            license: lic,
            subscription: licenseToSubscription(lic),
            isSubscriptionActive: checkSubscriptionActive(licenseToSubscription(lic)),
          };
          set({ user: next });
          if (typeof window !== 'undefined') {
            localStorage.setItem('inventarioy_user', JSON.stringify(next));
          }
        }
      }
      return { success: true };
    } catch (err: any) {
      logger.error('Error activando licencia:', err);
      return { success: false, error: 'No se pudo conectar con el servidor local.' };
    }
  },

  refreshLicense: async () => {
    const { user } = get();
    if (!user) return;
    try {
      const res = (await supabase.license.status()) as any;
      if (!res?.data) return;
      const lic: LicenseInfo = {
        status: res.data.status || 'trialing',
        trialStartedAt: res.data.trialStartedAt || null,
        trialEndsAt: res.data.trialEndsAt || null,
        validUntil: res.data.validUntil || null,
        daysRemaining: res.data.daysRemaining ?? 0,
        trialDays: res.data.trialDays ?? 7,
        businessCode: res.data.businessCode || user.businessCode,
        isDeveloper: !!res.data.isDeveloper,
        hasLicenseKey: !!res.data.hasLicenseKey,
        maxSeenTime: res.data.maxSeenTime ?? null,
      };
      const next: User = {
        ...user,
        license: lic,
        subscription: licenseToSubscription(lic),
        isSubscriptionActive: checkSubscriptionActive(licenseToSubscription(lic)),
        businessCode: lic.businessCode || user.businessCode,
      };
      set({ user: next });
    } catch (err) {
      logger.warn('Error refrescando licencia:', err);
    }
  },

  generateLicense: async (code, months, until) => {
    try {
      const res = (await supabase.license.generate({
        code: String(code).trim(),
        months,
        until: until ? String(until).trim() : undefined,
      })) as any;
      if (res?.error) {
        return { success: false, error: res.error?.message || 'No se pudo generar la clave' };
      }
      return { success: true, key: res.data?.key, validUntil: res.data?.validUntil };
    } catch (err: any) {
      logger.error('Error generando licencia:', err);
      return { success: false, error: 'No se pudo conectar con el servidor local.' };
    }
  },

  simulateLicense: async (action, options) => {
    try {
      const res = (await supabase.license.simulate({
        action: String(action).trim(),
        code: options?.code ? String(options.code).trim() : undefined,
        months: options?.months,
        until: options?.until ? String(options.until).trim() : undefined,
      })) as any;
      if (res?.error) {
        return { success: false, error: res.error?.message || 'No se pudo simular' };
      }
      // Refrescar el estado de licencia desde el servidor tras simular.
      await get().refreshLicense();
      return { success: true, key: res.data?.key };
    } catch (err: any) {
      logger.error('Error simulando licencia:', err);
      return { success: false, error: 'No se pudo conectar con el servidor local.' };
    }
  },
}));
