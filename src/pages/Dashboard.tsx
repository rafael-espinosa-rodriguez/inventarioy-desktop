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
  AlertTriangle,
  WifiOff,
  KeyRound
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useDatabaseStore, MODULE_ROLES } from '../store/dbStore';
import { useIsOnline } from '../hooks/useIsOnline';
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
import { TableSkeleton } from '../components/Skeleton';
import { syncEngine } from '../lib/syncEngine';

export default function Dashboard() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutPendingCount, setLogoutPendingCount] = useState(0);
  const sidebarTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasCheckedUncontacted = useRef(false);
  const fetchedUserId = useRef<string | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isLoading: authLoading, initialize } = useAuthStore();
  const { fetchAll, isLoading: dbLoading, accessPins, verifiedRole, clearVerifiedRole, verifyPinSimple } = useDatabaseStore();
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

  const baseNav = useMemo(() => [
    // INVENTARIO
    { name: 'Almacén', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Inventario', href: '/dashboard/inventory', icon: Package },
    { name: 'Movimientos', href: '/dashboard/movements', icon: History },
    { name: 'Tránsito', href: '/dashboard/transit', icon: ArrowRightLeft },
    // VENTAS
    { name: 'Ventas', href: '/dashboard/sales', icon: ShoppingCart },
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
        console.error('Error parsing temp_access:', e);
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
          await syncEngine.processPending();
          await fetchAll();
        } catch (err) {
          console.error('[Dashboard] Error en inicialización:', err);
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
    
    const requiredRoles = MODULE_ROLES[currentPath];
    if (!requiredRoles || requiredRoles.length === 0) {
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

    if (verifiedRole && requiredRoles.includes(verifiedRole)) {
      setModuleAllowed(prev => ({ ...prev, [currentPath]: true }));
      return;
    }

    // Si hay un rol verificado (del PIN), verificar solo ese rol
    if (verifiedRole) {
      if (requiredRoles.includes(verifiedRole)) {
        setModuleAllowed(prev => ({ ...prev, [currentPath]: true }));
      } else {
        setModuleAllowed(prev => ({ ...prev, [currentPath]: false }));
        setPendingModule(currentPath);
        setShowPinModal(true);
      }
      return;
    }

    // Solo si no hay rol verificado, buscar pines (para usuarios dueñologueados)
    const userPin = accessPins.find(p => p.is_active && requiredRoles.includes(p.role));
    if (!userPin) {
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
    const unsub = syncEngine.onEvent((event: string, data: any) => {
      if (event === 'synced') {
        toast.success(`${data.count} cambio${data.count !== 1 ? 's' : ''} sincronizado${data.count !== 1 ? 's' : ''}`);
      }
      if (event === 'duplicate') {
        toast.info('Un producto duplicado fue ignorado durante la sincronización');
      }
    });
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      await syncEngine.processQueue();
      fetchAll().catch(() => {});
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
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
      try {
        const { getSyncQueueCount } = await import('../lib/dexieDb');
        const count = await getSyncQueueCount();
        if (count > 0) {
          setLogoutPendingCount(count);
          setShowLogoutConfirm(true);
          return;
        }
      } catch { }
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
            {navigation.map((item) => {
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
                        Sesión: {verifiedRole === 'owner' ? 'Dueño/a' : verifiedRole === 'economist' ? 'Económico/a' : verifiedRole === 'admin' ? 'Administrador/a' : verifiedRole === 'supervisor' ? 'Supervisor/a' : 'Dependiente/a'}
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

        {showLogoutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl border border-border mx-4">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-text flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Cambios sin sincronizar
                </h3>
                <p className="text-sm text-text-secondary">
                  Tenés <strong className="text-warning">{logoutPendingCount}</strong> cambio{logoutPendingCount !== 1 ? 's' : ''} pendiente{logoutPendingCount !== 1 ? 's' : ''} de sincronización.
                  Si cerrás sesión ahora, se perder{logoutPendingCount !== 1 ? 'án' : 'á'}.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium text-text hover:bg-surface-hover transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    setShowLogoutConfirm(false);
                    await logout();
                  }}
                  className="flex-1 px-4 py-2 rounded-lg bg-danger text-sm font-medium text-white hover:bg-danger/90 transition-colors"
                >
                  Cerrar sesión igual
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
