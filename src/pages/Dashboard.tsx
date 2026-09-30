import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Link, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  LayoutDashboard, 
  Package, 
  ArrowRightLeft, 
  ShoppingCart, 
  Users, 
  ChefHat, 
  TrendingUp, 
  BarChart3, 
  PieChart, 
  Filter, 
  Settings, 
  LogOut,
  Menu,
  X,
  History,
  ChevronRight,
  DollarSign,
  FileText,
  LockOpen,
  Crown,
  WifiOff,
  KeyRound,
  Store,
  ReceiptText
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useDatabaseStore, MODULE_BY_PATH, getRoleModules, getRoleLabel } from '../store/dbStore';
import { useIsOnline } from '../hooks/useIsOnline';
import { localDb } from '../lib/db/localClient';
import InventarioYLogo from '../components/InventarioYLogo';
import LicenseBanner from '../components/LicenseBanner';
import PinModal from '../components/PinModal';
import ThemeToggle from '../components/ThemeToggle';
import Breadcrumbs from '../components/Breadcrumbs';
const StockView = lazy(() => import('./dashboard/StockView'));
const InventoryView = lazy(() => import('./dashboard/InventoryView'));
const TransitView = lazy(() => import('./dashboard/TransitView'));
const MovementsView = lazy(() => import('./dashboard/MovementsView'));
const SalesView = lazy(() => import('./dashboard/SalesView'));
const HRView = lazy(() => import('./dashboard/HRView'));
const RecipesView = lazy(() => import('./dashboard/RecipesView'));
const AnalysisView = lazy(() => import('./dashboard/AnalysisView'));
const ChartsView = lazy(() => import('./dashboard/ChartsView'));
const ConsumptionView = lazy(() => import('./dashboard/ConsumptionView'));
const FilteredCenterView = lazy(() => import('./dashboard/FilteredCenterView'));
const SettingsView = lazy(() => import('./dashboard/SettingsView'));
const LicenseView = lazy(() => import('./dashboard/LicenseView'));
const ActionLogsView = lazy(() => import('./dashboard/ActionLogsView'));
const DailyClosingsView = lazy(() => import('./dashboard/DailyClosingsView'));
const InvoicesView = lazy(() => import('./dashboard/InvoicesView'));
import { TableSkeleton } from '../components/Skeleton';

export default function Dashboard() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const sidebarTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasCheckedUncontacted = useRef(false);
  const fetchedUserId = useRef<string | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isLoading: authLoading, initialize } = useAuthStore();
  const { fetchAll, isLoading: dbLoading, accessPins, roles, verifiedRole, clearVerifiedRole, verifyPinSimple } = useDatabaseStore();
  const isOnline = useIsOnline();
  const [localVerifiedRole, setLocalVerifiedRole] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('verifiedRole');
    }
    return null;
  });
  const [localVerifiedRoleName, setLocalVerifiedRoleName] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('verifiedRoleName') || null;
    }
    return null;
  });
  const [showPinModal, setShowPinModal] = useState(false);
  const [showInitialPinModal, setShowInitialPinModal] = useState(false);
  const [pendingModule, setPendingModule] = useState('');
  const [moduleAllowed, setModuleAllowed] = useState<Record<string, boolean>>({});
  const [isPinAccess, setIsPinAccess] = useState(false);
  const [cajas, setCajas] = useState<any[]>([]);
  const [currentRegister, setCurrentRegister] = useState<any>(null);

  // Multi-caja: cargar cajas activas y la caja asignada a este dispositivo.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [cajasRes, sessRes] = await Promise.all([
          localDb.from('cajas').select('*').order('created_at', { ascending: true }),
          localDb.getMySession(),
        ]);
        if (!active) return;
        const list = Array.isArray(cajasRes.data) ? cajasRes.data.filter((c: any) => !!c.is_active) : [];
        setCajas(list);
        setCurrentRegister(sessRes?.data?.session?.register || null);
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, [location.pathname]);

  const handleSelectRegister = async (registerId: string) => {
    const res = await localDb.setRegister(registerId);
    if (res.error || !res.data?.success) {
      toast.error(res.error?.message || 'No se pudo cambiar la caja');
      return;
    }
    setCurrentRegister(res.data?.register || null);
    toast.success(res.data?.register ? `Caja activa: ${res.data.register.name}` : 'Sin caja asignada');
  };

  const baseNav = useMemo(() => [
    // INVENTARIO
    { name: 'Almacén', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Inventario', href: '/dashboard/inventory', icon: Package },
    { name: 'Movimientos', href: '/dashboard/movements', icon: History },
    { name: 'Tránsito', href: '/dashboard/transit', icon: ArrowRightLeft },
    // VENTAS
    { name: 'Ventas', href: '/dashboard/sales', icon: ShoppingCart },
    { name: 'Facturación', href: '/dashboard/invoices', icon: ReceiptText },
    { name: 'Cierres de Caja', href: '/dashboard/closings', icon: DollarSign },
    // PRODUCCIÓN
    { name: 'Recetas', href: '/dashboard/recipes', icon: ChefHat },
    { name: 'Consumo', href: '/dashboard/consumption', icon: TrendingUp },
    // ANÁLISIS
    { name: 'Análisis', href: '/dashboard/analysis', icon: BarChart3 },
    { name: 'Gráficos', href: '/dashboard/charts', icon: PieChart },
    { name: 'Centro Filtrado', href: '/dashboard/filtered', icon: Filter },
    // RRHH
    { name: 'RRHH', href: '/dashboard/hr', icon: Users, offlineLimited: true },
    // CONFIGURACIÓN
    { name: 'Configuración', href: '/dashboard/settings', icon: Settings, offlineLimited: true },
    { name: 'Registro de Acciones', href: '/dashboard/action-logs', icon: FileText, requiresOwnerPin: true },
  ], []);

  const navigation = useMemo(() => {
    // Ítem dev (solo visible en la máquina del vendedor, donde hay clave privada).
    const devItems: (typeof baseNav)[number][] = user?.license?.isDeveloper
      ? [{ name: 'Licencia', href: '/dashboard/license', icon: KeyRound }]
      : [];
    return [...baseNav, ...devItems];
  }, [baseNav, user?.license?.isDeveloper]);

  // Oculta los módulos a los que el rol verificado no tiene acceso.
  const visibleNav = useMemo(() => {
    const mods = verifiedRole ? getRoleModules(verifiedRole) : null;
    if (!mods) return navigation;
    return navigation.filter(item => {
      if (item.href === '/dashboard') return true;
      const mk = MODULE_BY_PATH[item.href.replace('/dashboard', '') || '/'];
      if (!mk) return true;
      return mods.includes(mk);
    });
  }, [navigation, verifiedRole, roles]);

  // Detectar acceso por PIN y cargar datos del negocio
  useEffect(() => {
    const tempAccess = localStorage.getItem('temp_access');
    const tempUserId = localStorage.getItem('temp_user_id');
    
    if (tempAccess && tempUserId) {
      try {
        const accessData = JSON.parse(tempAccess);
        if (accessData.role) {
          setIsPinAccess(true);
          setLocalVerifiedRole(accessData.role);
          localStorage.setItem('verifiedRole', accessData.role);
          if (accessData.pinName) {
            localStorage.setItem('verifiedRoleName', accessData.pinName);
            setLocalVerifiedRoleName(accessData.pinName);
          }
        }
      } catch (e) {
        if (import.meta.env.DEV) console.error('Error parsing temp_access:', e);
      }
    }
  }, []);

  useEffect(() => {
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user && user.id !== fetchedUserId.current) {
      fetchedUserId.current = user.id;
      (async () => {
        try {
          await fetchAll();
        } catch (err) {
          if (import.meta.env.DEV) console.error('[Dashboard] Error en inicialización:', err);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (user && accessPins.length > 0 && !localVerifiedRole) {
      setShowInitialPinModal(true);
    }
  }, [user, accessPins, localVerifiedRole]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      // No limpiar el localStorage al recargar - permitir persistencia
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    const currentPath = location.pathname.replace('/dashboard', '') || '/';
    if (currentPath === '/') return;

    const moduleKey = MODULE_BY_PATH[currentPath];
    // Rutas sin módulo mapeado: permitidas (shell del dashboard).
    if (!moduleKey) {
      setModuleAllowed(prev => ({ ...prev, [currentPath]: true }));
      return;
    }

    const anyPinExists = accessPins && accessPins.length > 0;
    const hasOwnerPin = accessPins?.some(p => p.role === 'owner');
    const isSettingsWithoutOwnerPin = currentPath === '/settings' && !hasOwnerPin;

    if (!anyPinExists || isSettingsWithoutOwnerPin) {
      setModuleAllowed(prev => ({ ...prev, [currentPath]: true }));
      return;
    }

    // ¿El rol verificado (PIN) tiene acceso a este módulo?
    if (verifiedRole && getRoleModules(verifiedRole).includes(moduleKey)) {
      setModuleAllowed(prev => ({ ...prev, [currentPath]: true }));
      return;
    }

    // ¿Algún PIN activo tiene el módulo? (para forzar verificación por PIN)
    const matchingPin = accessPins.find(p => p.is_active && getRoleModules(p.role).includes(moduleKey));
    if (verifiedRole) {
      // Rol verificado pero sin acceso a este módulo.
      setModuleAllowed(prev => ({ ...prev, [currentPath]: false }));
      setPendingModule(currentPath);
      setShowPinModal(true);
      return;
    }

    if (!matchingPin) {
      setModuleAllowed(prev => ({ ...prev, [currentPath]: false }));
      setPendingModule(currentPath);
      setShowPinModal(true);
      return;
    }

    if (moduleAllowed[currentPath] === undefined) {
      setModuleAllowed(prev => ({ ...prev, [currentPath]: false }));
      setPendingModule(currentPath);
      setShowPinModal(true);
    }
  }, [location.pathname, accessPins, verifiedRole]);

  const handleSidebarMouseEnter = () => {
    setIsSidebarVisible(true);
    if (sidebarTimeoutRef.current) {
      clearTimeout(sidebarTimeoutRef.current);
    }
  };

  const handleSidebarMouseLeave = () => {
    sidebarTimeoutRef.current = setTimeout(() => {
      setIsSidebarVisible(false);
    }, 500);
  };

  useEffect(() => {
    handleSidebarMouseLeave();
    return () => {
      if (sidebarTimeoutRef.current) clearTimeout(sidebarTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      fetchAll().catch(() => {});
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [fetchAll]);

  // Multi-caja: polling cada 5 s + refresco al volver a la pestaña, solo cuando la
  // pestaña está visible. Exclusivo de producción: la suite e2e (Vite dev) necesita
  // silencio de datos entre pasos.
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchAll().catch(() => {});
      }
    };
    const interval = setInterval(refreshIfVisible, 5000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [fetchAll]);

  const checkUncontactedUsers = useCallback(async () => {
    // Desktop local: no hay usuarios remotos que contactar
    return;
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin' || hasCheckedUncontacted.current) return;
    hasCheckedUncontacted.current = true;
    checkUncontactedUsers();
  }, [user, checkUncontactedUsers]);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <InventarioYLogo size="xl" variant="image" />
          <p className="text-text-secondary drop-shadow-[0_0_8px_rgba(255,193,7,0.8)]">Cargando...</p>
        </div>
      </div>
    );
  }

  // Permitir acceso si es PIN access o si hay usuario logueado
  if (!user && !isPinAccess) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    clearVerifiedRole();
    localStorage.removeItem('verifiedRole');
    localStorage.removeItem('verifiedRoleName');
    setLocalVerifiedRole(null);
    setLocalVerifiedRoleName(null);
    
    if (isPinAccess) {
      localStorage.removeItem('temp_access');
      localStorage.removeItem('temp_user_id');
      setIsPinAccess(false);
      navigate('/acceso');
    } else {
      await logout();
    }
  };

  const bannerPadding =
    user?.license?.status === 'trialing' || user?.license?.status === 'expired' ? 'pt-16' : '';

  return (
    <div className={`flex h-screen overflow-hidden bg-bg ${bannerPadding}`}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-bg focus:rounded-lg focus:text-sm focus:font-medium focus:outline-none"
      >
        Saltar al contenido
      </a>
      <LicenseBanner />
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div 
        className="fixed inset-y-0 left-0 w-4 z-40 hidden lg:flex items-center justify-center group cursor-pointer"
        onClick={() => setIsSidebarVisible(true)}
      >
        {!isSidebarVisible && (
          <div className="absolute left-0 w-6 h-12 bg-surface/80 border border-border/50 border-l-0 rounded-r-xl flex items-center justify-center shadow-[0_0_10px_rgba(255,193,7,0.2)] transition-all group-hover:w-8 group-hover:bg-surface cursor-pointer">
            <ChevronRight className="h-4 w-4 text-primary animate-pulse" />
          </div>
        )}
      </div>

      <aside
        onMouseLeave={handleSidebarMouseLeave}
        className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border/50 bg-surface/80 backdrop-blur-xl transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen || isSidebarVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <InventarioYLogo size="md" variant="image" />
            <InventarioYLogo size="md" variant="text" />
          </div>
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              setIsSidebarVisible(false);
            }} 
            className="text-danger/80 hover:text-danger transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex h-[calc(100vh-4rem)] flex-col justify-between overflow-y-auto p-4">
          <nav className="space-y-1">
            {visibleNav.map((item) => {
              const isActive = location.pathname === item.href || (item.href === '/dashboard' && location.pathname === '/dashboard/');
              const isExclusive = item.name === 'Gestión de Usuarios';
              const isOfflineLimited = item.offlineLimited && !isOnline;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-r from-primary/20 to-transparent border-l-2 border-primary shadow-[inset_0_0_20px_rgba(255,193,7,0.05)]'
                      : isExclusive
                        ? 'text-text-secondary hover:bg-surface-hover hover:text-text border-l-2 border-warning/30'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                  }`}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? 'text-primary drop-shadow-[0_0_8px_rgba(255,193,7,0.5)]' : 'text-text-secondary'}`} />
                  {item.name}
                  {isOfflineLimited && (
                    <WifiOff className="h-3.5 w-3.5 text-warning ml-auto" aria-label="Funciones limitadas sin conexión" />
                  )}
                  {isExclusive && <Crown className="h-3 w-3 text-warning ml-auto" />}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 border-t border-border pt-4">
            <div className="mb-4 px-3">
              <p className="text-sm font-medium text-text">{user?.businessName || user?.name}</p>
              <p className="text-xs text-text-secondary truncate">{user?.role === 'owner' ? 'Dueño/a' : 'Usuario'}</p>
              <div className="mt-2 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {user?.license?.status === 'trialing' ? 'Prueba Gratis' : user?.license?.status === 'expired' ? 'Licencia vencida' : 'Plan Profesional'}
              </div>
            </div>
            {verifiedRole && (
              <div className="mb-3 px-3">
                <div className="flex items-center justify-between rounded-lg bg-warning/10 border border-warning/30 px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <LockOpen className="h-4 w-4 text-warning" />
                      <span className="text-sm font-medium text-warning">
                        Sesión: {getRoleLabel(verifiedRole)}
                        {localVerifiedRoleName && <span className="text-warning/80"> - {localVerifiedRoleName}</span>}
                      </span>
                    </div>
                    {localVerifiedRoleName && (
                      <span className="text-xs text-text-secondary ml-6">
                        Accedido por PIN
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      clearVerifiedRole();
                      setLocalVerifiedRole(null);
                    }}
                    className="text-xs text-text-secondary hover:text-warning"
                    title="Cerrar sesión de PIN"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
            {(cajas.length > 0 || currentRegister) && (
              <div className="mb-3 px-3">
                <div className="flex items-center justify-between rounded-lg bg-surface-hover/60 border border-border/60 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Store className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-text-secondary">Caja activa</p>
                      <select
                        value={currentRegister?.id || ''}
                        onChange={(e) => handleSelectRegister(e.target.value)}
                        className="w-full max-w-[150px] bg-bg text-sm font-medium text-text outline-none rounded px-1 py-0.5 border border-border/60"
                        title="Seleccione el punto de venta de este dispositivo"
                      >
                        <option value="">Sin caja</option>
                        {cajas.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="mb-2">
              <ThemeToggle />
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden bg-transparent">
        <header className="flex h-16 items-center justify-between border-b border-border/50 bg-surface/80 backdrop-blur-xl px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <InventarioYLogo size="lg" variant="image" />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleLogout}
              className="rounded-full p-2 text-danger/70 hover:text-danger hover:bg-danger/10 transition-colors"
              title="Cerrar Sesión"
              aria-label="Cerrar Sesión"
            >
              <LogOut className="h-5 w-5" />
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="text-text-secondary hover:text-text"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </header>

        <main id="main-content" className="flex-1 overflow-y-auto bg-transparent p-4 md:p-6 lg:p-8">
          <div className="w-full">
            <Breadcrumbs />
            <Suspense fallback={<div className="p-6"><TableSkeleton rows={8} cols={6} /></div>}>
              <Routes>
                <Route path="/" element={<StockView />} />
                <Route path="/inventory" element={<InventoryView />} />
                <Route path="/movements" element={<MovementsView />} />
                <Route path="/transit" element={<TransitView />} />
                <Route path="/sales" element={<SalesView />} />
                <Route path="/invoices" element={<InvoicesView />} />
                <Route path="/closings" element={<DailyClosingsView />} />
                <Route path="/hr" element={<HRView />} />
                <Route path="/recipes" element={<RecipesView />} />
                <Route path="/consumption" element={<ConsumptionView />} />
                <Route path="/analysis" element={<AnalysisView />} />
                <Route path="/charts" element={<ChartsView />} />
                <Route path="/filtered" element={<FilteredCenterView />} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/license" element={<LicenseView />} />
                <Route path="/action-logs" element={<ActionLogsView />} />
              </Routes>
            </Suspense>
          </div>
        </main>

        <PinModal
          isOpen={showPinModal}
          moduleName={pendingModule}
          onSuccess={() => {
            setShowPinModal(false);
            setLocalVerifiedRole(localStorage.getItem('verifiedRole'));
            setLocalVerifiedRoleName(localStorage.getItem('verifiedRoleName'));
            setModuleAllowed(prev => ({ ...prev, [pendingModule]: true }));
          }}
          onCancel={() => {
            setShowPinModal(false);
            navigate('/dashboard');
          }}
        />

        <PinModal
          isOpen={showInitialPinModal}
          moduleName="/"
          isInitialVerification={true}
          onSuccess={() => {
            setShowInitialPinModal(false);
            setLocalVerifiedRole(localStorage.getItem('verifiedRole'));
            setLocalVerifiedRoleName(localStorage.getItem('verifiedRoleName'));
          }}
          onCancel={() => {
            logout();
          }}
        />

        {!moduleAllowed[location.pathname.replace('/dashboard', '') || '/'] && location.pathname !== '/dashboard' && (
          <div className="fixed inset-0 z-40 bg-surface/80 flex items-center justify-center">
            <div className="text-center">
              <p className="text-text-secondary">Verificando acceso...</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
