import { Menu, X, Zap, Play, MessageCircle, Pin, ShoppingCart, Calculator, WifiOff, Hash, ShieldCheck, ReceiptText, Banknote, Printer, Download, SlidersHorizontal, Monitor, Terminal, Laptop, ArrowLeftRight, KeyRound, Save, BookOpen, Store, PackageX, Camera, MonitorPlay, ExternalLink, CheckCircle2, Star, TriangleAlert, Trash2, Wallet, Rocket, User, LogIn, UserPlus, Users, DollarSign } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import InventarioYLogo from '../components/InventarioYLogo';
import TutorialPromptModal, { shouldShowTutorialPrompt } from '../components/TutorialPromptModal';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAuthStore } from '../store/authStore';

gsap.registerPlugin(ScrollTrigger);

type Billing = 'mensual' | 'anual' | 'vitalicio';

const BUSINESS_PRESETS = [
  { id: 'paladar', label: 'Paladares' },
  { id: 'cafeteria', label: 'Cafeterías' },
  { id: 'bar', label: 'Bares & Pubs' },
  { id: 'panaderia', label: 'Panaderías' },
  { id: 'tienda', label: 'Tiendas' },
];

const FEATURES_16 = [
  'Productos y categorías ilimitadas',
  'Alertas de stock mínimo configurables',
  'Movimientos: entradas, salidas, mermas y ajustes',
  'Módulo de Tránsito para movimientos internos',
  'Cierres de caja por turno con validación de cuadre',
  'Punto de venta: Salón, Domicilio, Bar y Venta rápida',
  'Cobro mixto: efectivo CUP, transferencia, USD, EUR, Zelle',
  'Recetas con descuento automático de ingredientes',
  'Personal, roles por PIN y nómina cubana',
  'Biblioteca de documentos (PNO, Reglamento)',
  'Gráficos y análisis en tiempo real',
  'Menú digital QR para tus clientes',
  'Tickets de 58/80mm e impresión',
  'Exportación de datos a Excel',
  'Multi-caja en red local (LAN)',
  '100% offline + soporte por WhatsApp',
];

export default function Landing() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showTutorialPrompt, setShowTutorialPrompt] = useState(() => shouldShowTutorialPrompt());
  const [billing, setBilling] = useState<Billing>('mensual');
  const [activeTab, setActiveTab] = useState<'pos' | 'receta'>('pos');
  const [preset, setPreset] = useState('paladar');
  const [dishes, setDishes] = useState(40);
  const [grams, setGrams] = useState(20);
  const [costPerKg, setCostPerKg] = useState(1850);

  // Redirigir si ya está autenticado
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, user, authLoading, navigate]);

  useEffect(() => {
    if (shouldShowTutorialPrompt()) {
      setShowTutorialPrompt(true);
    }
  }, []);

  // Animaciones con GSAP ScrollTrigger
  useEffect(() => {
    const ctx = gsap.context(() => {
      const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      heroTl.fromTo('.hero-fade', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.12 });

      document.querySelectorAll('.fade-up').forEach((el) => {
        ScrollTrigger.create({
          trigger: el,
          start: 'top 88%',
          once: true,
          onEnter: () => {
            gsap.fromTo(el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
          },
        });
      });
    });

    return () => ctx.revert();
  }, []);

  // Calculadora de mermas: platos/día × gramos × 30 días × costo/kg
  const kgPerMonth = (dishes * grams * 30) / 1000;
  const monthlyLoss = Math.round(kgPerMonth * costPerKg);
  const annualLoss = monthlyLoss * 12;

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg font-sans text-text antialiased selection:bg-primary selection:text-black">
      {/* ==================== HEADER ==================== */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-8">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <InventarioYLogo size="lg" variant="image" />
            </Link>
            <div className="hidden items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-xs sm:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-success"></span>
              <span className="font-medium text-success">SQLITE LOCAL · 100% OFFLINE</span>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-text-secondary lg:flex">
            <a href="#features" className="transition-colors hover:text-primary">Herramientas POS</a>
            <a href="#infraestructura" className="transition-colors hover:text-primary">Infraestructura Cuba</a>
            <a href="#calculadora" className="transition-colors hover:text-primary">Simulador Mermas</a>
            <a href="#pricing" className="transition-colors hover:text-primary">Plan CUP</a>
            <a href="#faq" className="transition-colors hover:text-primary">Preguntas</a>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link to="/acceso" className="hidden items-center gap-1 rounded border border-border bg-surface px-3 py-1.5 font-mono text-xs text-text transition-all hover:bg-surface-hover md:inline-flex">
              <Pin className="h-3.5 w-3.5 text-primary" />
              <span>Acceso PIN</span>
            </Link>
            <Link to="/login" className="hidden px-2 py-1.5 font-mono text-xs text-text-secondary transition-colors hover:text-text sm:block">
              Ingresar
            </Link>
            <Link to="/register" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 font-sans text-xs font-bold uppercase tracking-wider text-black shadow-md transition-all hover:bg-primary-hover active:scale-95">
              <Zap className="h-3.5 w-3.5" />
              <span>Prueba 7 Días</span>
            </Link>
            <button
              className="p-2 text-text-secondary transition-colors hover:text-text lg:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Abrir menú"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Menú móvil */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-64 border-l border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <InventarioYLogo size="md" variant="image" />
              <button onClick={() => setIsMobileMenuOpen(false)} className="text-text-secondary hover:text-text">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col space-y-2 p-4">
              <a href="#features" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text">
                <ShoppingCart className="h-4 w-4" />
                Herramientas POS
              </a>
              <a href="#infraestructura" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text">
                <WifiOff className="h-4 w-4" />
                Infraestructura Cuba
              </a>
              <a href="#calculadora" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text">
                <Calculator className="h-4 w-4" />
                Simulador Mermas
              </a>
              <a href="#pricing" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text">
                <DollarSign className="h-4 w-4" />
                Plan CUP
              </a>
              <a href="#faq" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text">
                <MessageCircle className="h-4 w-4" />
                Preguntas
              </a>
              <hr className="my-2 border-border" />
              <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text">
                <LogIn className="h-4 w-4" />
                Ingresar
              </Link>
              <Link to="/register" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20">
                <UserPlus className="h-4 w-4" />
                Prueba 7 Días
              </Link>
              <Link to="/acceso" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text">
                <Users className="h-4 w-4" />
                Acceso PIN
              </Link>
            </nav>
          </div>
        </div>
      )}

      <main className="w-full pt-16">
        {/* ==================== HERO ==================== */}
        <section className="grid-bg-pattern relative w-full overflow-hidden border-b border-border px-4 pb-16 pt-8 md:px-8 md:pb-24 md:pt-14">
          <div className="pointer-events-none absolute left-10 top-20 h-96 w-96 rounded-full bg-primary/5 blur-[140px]"></div>
          <div className="pointer-events-none absolute bottom-0 right-10 h-96 w-96 rounded-full bg-success/5 blur-[160px]"></div>
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-10">
            {/* Columna izquierda */}
            <div className="z-10 flex flex-col justify-start lg:col-span-6">
              <div className="hero-fade mb-4 flex flex-wrap items-center gap-2 font-mono text-xs">
                <span className="inline-flex items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                  <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary"></span>
                  SISTEMA INDEPENDIENTE
                </span>
                <span className="rounded border border-border bg-surface px-2.5 py-1 text-text-secondary">
                  Cero nube / Sin internet
                </span>
                <span className="rounded border border-border bg-surface px-2.5 py-1 text-text-secondary">
                  Multi-caja en red local
                </span>
              </div>
              <h1 className="hero-fade mb-5 text-3xl font-extrabold leading-[1.12] tracking-tight text-text sm:text-4xl md:text-5xl">
                El control de tu negocio en Cuba, <span className="text-primary">incluso sin internet.</span>
              </h1>
              <p className="hero-fade mb-6 text-base leading-relaxed text-text-secondary md:text-lg">
                Punto de venta, escandallo de recetas al gramo, control de mermas y cierres
                de caja en moneda nacional. Instalado en tu equipo, resistente a apagones
                y caídas de conexión.
              </p>

              {/* Selector de sector */}
              <div className="hero-fade mb-6 rounded-lg border border-border bg-surface p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-primary">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Elige tu sector:
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-xs sm:grid-cols-5">
                  {BUSINESS_PRESETS.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setPreset(b.id)}
                      className={`rounded border px-2 py-1.5 text-center transition-all ${preset === b.id ? 'border-primary bg-surface-hover font-medium text-text' : 'border-border bg-bg text-text-secondary hover:text-text'}`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hero-fade space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Link to="/register" className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3.5 text-sm font-bold tracking-wide text-black shadow-lg transition-all hover:bg-primary-hover active:scale-95 sm:flex-initial">
                    <Download className="h-4 w-4" />
                    <span>Empezar prueba gratis 7 días</span>
                  </Link>
                  <a href="https://youtu.be/DWl2cgeqcRA" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-3.5 text-sm font-medium text-text transition-all hover:bg-surface-hover">
                    <Play className="h-5 w-5 text-primary" />
                    <span>Ver demostración</span>
                  </a>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 font-mono text-xs text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <Monitor className="h-4 w-4 text-success" />
                    <span>Windows 10/11 (64-bit)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Terminal className="h-4 w-4 text-success" />
                    <span>Instalador único · Sin servidores pesados</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Laptop className="h-4 w-4 text-success" />
                    <span>Funciona en equipos de gama básica</span>
                  </span>
                </div>
              </div>

              <div className="hero-fade mt-6 flex items-center gap-3 rounded-md border border-border bg-surface/80 p-3 text-xs">
                <span className="flex h-8 w-8 items-center justify-center rounded bg-success/20 font-bold text-success">CU</span>
                <div className="flex-1">
                  <span className="block font-medium text-text">Soporte directo por WhatsApp en Cuba</span>
                  <span className="font-mono text-text-secondary">Asistencia técnica personalizada</span>
                </div>
                <a href="https://wa.me/5354523884" target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-xs font-semibold text-success hover:underline">
                  <span>+53 54523884</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            {/* Columna derecha: terminal */}
            <div className="hero-fade z-10 lg:col-span-6">
              <div className="hardware-border amber-glow w-full overflow-hidden rounded-xl bg-surface">
                <div className="flex items-center justify-between border-b border-border bg-bg px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-danger/80"></span>
                    <span className="h-3 w-3 rounded-full bg-primary/80"></span>
                    <span className="h-3 w-3 rounded-full bg-success/80"></span>
                    <span className="ml-2 font-mono text-xs font-medium text-text-secondary">TERMINAL-01 // TU NEGOCIO</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded bg-surface px-2 py-0.5 font-mono text-xs text-success">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success"></span>
                    <span>LOCAL · SIN INTERNET</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 border-b border-border bg-surface px-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('pos')}
                    className={`flex items-center gap-2 rounded-t border-b-2 px-4 py-2 font-mono text-xs transition-all ${activeTab === 'pos' ? 'border-primary bg-bg font-bold text-text' : 'border-transparent font-medium text-text-secondary hover:text-text'}`}
                  >
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    <span>1. CAJA RÁPIDA POS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('receta')}
                    className={`flex items-center gap-2 rounded-t border-b-2 px-4 py-2 font-mono text-xs transition-all ${activeTab === 'receta' ? 'border-primary bg-bg font-bold text-text' : 'border-transparent font-medium text-text-secondary hover:text-text'}`}
                  >
                    <Calculator className="h-4 w-4 text-success" />
                    <span>2. ESCANDALLO E INSUMOS</span>
                  </button>
                </div>

                {activeTab === 'pos' ? (
                  <div className="space-y-4 p-4">
                    <div className="grid grid-cols-3 gap-2 font-mono">
                      <div className="rounded border border-border bg-surface p-2.5">
                        <span className="block text-[10px] text-text-secondary">VENTA DEL TURNO</span>
                        <span className="text-base font-bold tracking-tight text-text">168,450 <span className="text-[10px] text-primary">CUP</span></span>
                      </div>
                      <div className="rounded border border-border bg-surface p-2.5">
                        <span className="block text-[10px] text-text-secondary">TASA CONFIGURABLE</span>
                        <span className="text-base font-bold tracking-tight text-success">325 <span className="text-[10px] text-text-secondary">CUP/USD</span></span>
                      </div>
                      <div className="rounded border border-border bg-surface p-2.5">
                        <span className="block text-[10px] text-text-secondary">CIERRE CON VALIDACIÓN</span>
                        <span className="text-base font-bold tracking-tight text-text">ACTIVO</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                      <div className="flex flex-col justify-between rounded-lg border border-border bg-surface p-3 sm:col-span-7">
                        <div>
                          <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
                            <div className="flex items-center gap-1.5 font-mono text-xs text-text">
                              <ReceiptText className="h-3.5 w-3.5 text-primary" />
                              <span className="font-bold">Mesa #06 · Salón</span>
                            </div>
                            <span className="rounded bg-bg px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">Mozo: Yanelis (PIN 104)</span>
                          </div>
                          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 font-mono text-xs">
                            <div className="flex items-center justify-between rounded bg-bg/80 p-1.5">
                              <div>
                                <div className="font-medium text-text">2x Pizza Especial Jamón y Queso</div>
                                <div className="text-[10px] text-text-secondary">Descuenta masa e insumos al vender</div>
                              </div>
                              <span className="font-bold text-text">1,600 CUP</span>
                            </div>
                            <div className="flex items-center justify-between rounded bg-bg/80 p-1.5">
                              <div>
                                <div className="font-medium text-text">2x Mojito Añejo</div>
                                <div className="text-[10px] text-success">Escandallo: -100ml Ron, -30g Azúcar</div>
                              </div>
                              <span className="font-bold text-text">1,300 CUP</span>
                            </div>
                            <div className="flex items-center justify-between rounded bg-bg/80 p-1.5">
                              <div>
                                <div className="font-medium text-text">1x Cerveza Cristal 350ml</div>
                                <div className="text-[10px] text-text-secondary">Botellero principal</div>
                              </div>
                              <span className="font-bold text-text">350 CUP</span>
                            </div>
                          </div>
                        </div>
                        <div className="mb-2 mt-2 border-t border-border pt-3 font-mono">
                          <div className="flex justify-between text-xs text-text-secondary">
                            <span>Subtotal comanda:</span>
                            <span className="text-text">3,250 CUP</span>
                          </div>
                          <div className="flex items-baseline justify-between pt-1">
                            <span className="text-xs font-bold uppercase text-primary">Total:</span>
                            <div className="text-right">
                              <span className="text-xl font-bold text-primary">3,250 CUP</span>
                              <span className="block text-[10px] text-text-secondary">≈ $10.00 USD (tasa 325)</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col justify-between rounded-lg border border-border bg-surface p-3 sm:col-span-5">
                        <span className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-text-secondary">Cobro rápido</span>
                        <div className="mb-2 grid grid-cols-3 gap-1 font-mono text-xs">
                          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '↵'].map((k) => (
                            <div key={k} className={`rounded border border-border bg-bg p-2 text-center font-bold ${k === '↵' ? 'text-primary' : 'text-text'}`}>{k}</div>
                          ))}
                        </div>
                        <div className="space-y-1.5 font-mono text-xs">
                          <div className="flex w-full items-center justify-center gap-1.5 rounded bg-primary py-2 font-bold text-black">
                            <Banknote className="h-3.5 w-3.5" />
                            <span>Efectivo [F12]</span>
                          </div>
                          <div className="flex w-full items-center justify-center gap-1.5 rounded border border-border bg-bg py-1.5 text-[11px] text-text">
                            <span className="h-1.5 w-1.5 rounded-full bg-success"></span>
                            <span>Transferencia CUP</span>
                          </div>
                          <div className="flex w-full items-center justify-center gap-1.5 rounded border border-border bg-bg py-1.5 text-[11px] text-text">
                            <Printer className="h-3.5 w-3.5" />
                            <span>Ticket 58/80mm</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1 font-mono text-[11px] text-text-secondary">
                      <span>Base de datos local en tu equipo (WAL atómico)</span>
                      <span className="font-semibold text-success">SIN INTERNET</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 p-4">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-primary"></span>
                        <span className="font-mono text-xs font-bold text-text">ESCANDALLO: PIZZA ARTESANAL EXTRA QUESO</span>
                      </div>
                      <span className="rounded border border-success/20 bg-success/10 px-2 py-0.5 font-mono text-[11px] text-success">
                        MARGEN: 72.8%
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-border bg-surface font-mono text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-bg text-[10px] uppercase text-text-secondary">
                          <tr>
                            <th className="p-2">Insumo</th>
                            <th className="p-2 text-right">Porción</th>
                            <th className="p-2 text-right">Costo</th>
                            <th className="p-2 text-right">Stock</th>
                            <th className="p-2 text-center">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-[11px]">
                          <tr>
                            <td className="p-2 font-medium text-text">Queso Gouda</td>
                            <td className="p-2 text-right text-primary">140 g</td>
                            <td className="p-2 text-right text-text">259 CUP</td>
                            <td className="p-2 text-right text-text">4.8 kg</td>
                            <td className="p-2 text-center"><span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] text-success">OK</span></td>
                          </tr>
                          <tr>
                            <td className="p-2 font-medium text-text">Masa de trigo</td>
                            <td className="p-2 text-right text-primary">250 g</td>
                            <td className="p-2 text-right text-text">48 CUP</td>
                            <td className="p-2 text-right text-text">18.5 kg</td>
                            <td className="p-2 text-center"><span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] text-success">OK</span></td>
                          </tr>
                          <tr>
                            <td className="p-2 font-medium text-text">Jamón de pierna</td>
                            <td className="p-2 text-right text-primary">100 g</td>
                            <td className="p-2 text-right text-text">110 CUP</td>
                            <td className="p-2 text-right font-bold text-danger">1.2 kg</td>
                            <td className="p-2 text-center"><span className="rounded bg-danger/20 px-1.5 py-0.5 text-[10px] text-danger">REORDEN</span></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-3">
                      <div className="rounded border border-border bg-surface p-2.5">
                        <span className="block text-[10px] text-text-secondary">COSTO MATERIA PRIMA</span>
                        <span className="text-base font-bold text-text">449.00 <span className="text-[10px]">CUP</span></span>
                      </div>
                      <div className="rounded border border-border bg-surface p-2.5">
                        <span className="block text-[10px] text-text-secondary">PRECIO DE VENTA</span>
                        <span className="text-base font-bold text-primary">1,650.00 <span className="text-[10px]">CUP</span></span>
                      </div>
                      <div className="rounded border border-border bg-surface p-2.5">
                        <span className="block text-[10px] text-text-secondary">BENEFICIO / UNIDAD</span>
                        <span className="text-base font-bold text-success">1,201.00 <span className="text-[10px]">CUP</span></span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/10 p-3 font-mono text-xs">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                      <div className="flex-1">
                        <div className="flex justify-between font-bold text-danger">
                          <span>MERMA REGISTRADA EN EL TURNO</span>
                          <span>-1,450 CUP</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-text-secondary">
                          Diferencia de 350g de Queso Gouda entre porciones teóricas vendidas y
                          conteo físico. Guardada con motivo y auditoría de turno.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ==================== INFRAESTRUCTURA CUBA ==================== */}
        <section id="infraestructura" className="w-full border-b border-border bg-bg px-4 py-20 md:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="fade-up mb-12 flex flex-col justify-between md:flex-row md:items-end">
              <div>
                <div className="mb-2 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-primary">
                  <Zap className="h-3.5 w-3.5" />
                  <span>Ingeniería para el entorno real cubano</span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-text md:text-4xl">
                  Construido para resistir lo que tumba a los demás.
                </h2>
              </div>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-text-secondary md:mt-0 md:text-base">
                Sin mensualidades en dólares a servidores extranjeros que se vuelven
                inaccesibles cuando falla la conexión.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="fade-up flex flex-col justify-between rounded-xl border border-border bg-surface p-6 transition-all hover:border-primary/40 md:p-8">
                <div>
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-bg text-primary">
                    <WifiOff className="h-6 w-6" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-text">Blindado contra apagones y desconexión</h3>
                  <p className="mb-6 text-sm leading-relaxed text-text-secondary">
                    Base de datos SQLite local en modo WAL: si el equipo se apaga de golpe
                    por un corte eléctrico, las operaciones quedan selladas en disco sin
                    corrupción. Al encender, todo sigue donde quedó.
                  </p>
                  <div className="space-y-2 rounded-lg border border-border bg-bg p-3 font-mono text-xs">
                    <div className="flex items-center justify-between text-[11px] text-text-secondary">
                      <span>RED LOCAL SIN INTERNET</span>
                      <span className="text-success">Router local: OK</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded border border-border bg-surface p-1.5 text-center text-text">Barra</div>
                      <ArrowLeftRight className="h-3 w-3 text-primary" />
                      <div className="flex-1 rounded border border-border bg-surface p-1.5 text-center text-text">Cocina</div>
                      <ArrowLeftRight className="h-3 w-3 text-primary" />
                      <div className="flex-1 rounded border border-border bg-surface p-1.5 text-center text-text">Admin</div>
                    </div>
                    <div className="text-center text-[10px] text-success">Consumo de datos móviles: 0 MB</div>
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-border pt-6 font-mono text-xs">
                  <span className="text-text-secondary">Respuesta local</span>
                  <span className="font-bold text-success">Instantánea</span>
                </div>
              </div>
              <div className="fade-up flex flex-col justify-between rounded-xl border border-border bg-surface p-6 transition-all hover:border-primary/40 md:p-8">
                <div>
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-bg text-success">
                    <Hash className="h-6 w-6" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-text">Multi-PIN sin correos ni contraseñas</h3>
                  <p className="mb-6 text-sm leading-relaxed text-text-secondary">
                    Cada empleado accede en segundos con su PIN numérico de 4 dígitos.
                    Sin correos, sin contraseñas que olvidar. Cada rol ve solo sus módulos.
                  </p>
                  <div className="rounded-lg border border-border bg-bg p-3 font-mono text-xs">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] text-text-secondary">AUDITORÍA POR TURNO</span>
                      <span className="font-bold text-primary">PIN: [ • • • • ]</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between rounded bg-surface p-1 text-[11px]">
                        <span className="text-text">PIN 101 · Mozo Salón</span>
                        <span className="text-success">Comanda #41</span>
                      </div>
                      <div className="flex items-center justify-between rounded bg-surface p-1 text-[11px]">
                        <span className="text-text">PIN 204 · Cajero Barra</span>
                        <span className="text-primary">Cobro 2,800 CUP</span>
                      </div>
                      <div className="flex items-center justify-between rounded bg-surface p-1 text-[11px]">
                        <span className="text-text">PIN 900 · Admin</span>
                        <span className="text-text-secondary">Auditoría</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-border pt-6 font-mono text-xs">
                  <span className="text-text-secondary">Seguridad de caja</span>
                  <span className="font-bold text-success">Roles estrictos</span>
                </div>
              </div>
              <div className="fade-up flex flex-col justify-between rounded-xl border border-border bg-surface p-6 transition-all hover:border-primary/40 md:p-8">
                <div>
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-bg text-primary">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-text">Moneda nacional y cierre con validación</h3>
                  <p className="mb-6 text-sm leading-relaxed text-text-secondary">
                    Cobra en efectivo CUP, transferencia, USD, EUR o Zelle con tasa
                    configurable. Al cerrar el turno, el sistema compara lo contado
                    contra lo esperado y muestra cualquier descuadre al instante.
                  </p>
                  <div className="rounded-lg border border-border bg-bg p-3 font-mono text-xs">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded border border-border bg-surface p-2">
                        <span className="block text-[10px] text-text-secondary">EFECTIVO CONTADO</span>
                        <span className="text-sm font-bold text-text">62,800 CUP</span>
                      </div>
                      <div className="rounded border border-border bg-surface p-2">
                        <span className="block text-[10px] text-text-secondary">TRANSFERENCIA</span>
                        <span className="text-sm font-bold text-success">18,500 CUP</span>
                      </div>
                    </div>
                    <div className="mt-2 rounded bg-primary/10 p-1 text-center text-[11px] font-bold text-primary">
                      DESCUADRE: 0.00 CUP (CIERRE EXACTO)
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-border pt-6 font-mono text-xs">
                  <span className="text-text-secondary">Tasa CUP/USD</span>
                  <span className="font-bold text-primary">Configurable</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== CALCULADORA ==================== */}
        <section id="calculadora" className="w-full border-b border-border bg-bg px-4 py-20 md:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="fade-up mx-auto mb-12 max-w-2xl text-center">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-danger/30 bg-danger/10 px-3 py-1 font-mono text-xs font-semibold text-danger">
                <Calculator className="h-3.5 w-3.5" />
                <span>SIMULADOR DE FUGA FINANCIERA</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-text md:text-4xl">
                Calcula tus pérdidas silenciosas
              </h2>
              <p className="mt-2 text-sm text-text-secondary md:text-base">
                Comprueba cuántos CUP se escapan al mes cuando se cocina "al ojo"
                sin escandallo estricto.
              </p>
            </div>
            <div className="fade-up hardware-border rounded-2xl bg-surface p-6 md:p-10">
              <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
                <div className="space-y-6 md:col-span-7">
                  <div>
                    <div className="mb-2 flex items-center justify-between font-mono text-xs">
                      <span className="font-medium text-text">Platos o tragos vendidos por día:</span>
                      <span className="rounded bg-surface px-2 py-0.5 text-sm font-bold text-primary">{dishes} /día</span>
                    </div>
                    <input type="range" min={10} max={150} step={5} value={dishes} onChange={(e) => setDishes(Number(e.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-bg accent-primary" />
                    <div className="mt-1 flex justify-between font-mono text-[10px] text-text-secondary">
                      <span>10</span><span>75</span><span>150</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between font-mono text-xs">
                      <span className="font-medium text-text">Exceso no medido por ración:</span>
                      <span className="rounded bg-surface px-2 py-0.5 text-sm font-bold text-danger">{grams} gramos</span>
                    </div>
                    <input type="range" min={5} max={50} step={1} value={grams} onChange={(e) => setGrams(Number(e.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-bg accent-danger" />
                    <div className="mt-1 flex justify-between font-mono text-[10px] text-text-secondary">
                      <span>5 g</span><span>25 g</span><span>50 g (grave)</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between font-mono text-xs">
                      <span className="font-medium text-text">Costo medio del insumo:</span>
                      <span className="rounded bg-surface px-2 py-0.5 text-sm font-bold text-success">{costPerKg.toLocaleString('en-US')} CUP/kg</span>
                    </div>
                    <input type="range" min={800} max={4000} step={50} value={costPerKg} onChange={(e) => setCostPerKg(Number(e.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-bg accent-success" />
                    <div className="mt-1 flex justify-between font-mono text-[10px] text-text-secondary">
                      <span>800</span><span>2,400</span><span>4,000</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-between rounded-xl border border-border bg-surface p-6 text-center md:col-span-5">
                  <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-text-secondary">Fuga estimada al mes</span>
                  <div className="my-4">
                    <div className="my-1 text-3xl font-extrabold tracking-tight text-danger sm:text-4xl">
                      {monthlyLoss.toLocaleString('en-US')} CUP
                    </div>
                    <div className="font-mono text-xs text-text-secondary">
                      Equivale a <span className="font-bold text-text">{kgPerMonth.toFixed(1)} kg</span> de insumo no cobrado
                    </div>
                  </div>
                  <div className="mb-4 space-y-1 rounded-lg border border-border bg-bg p-3 text-left font-mono text-xs">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-text-secondary">Pérdida anual estimada:</span>
                      <span className="font-bold text-text">{annualLoss.toLocaleString('en-US')} CUP</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-text-secondary">Plan InventarioY:</span>
                      <span className="font-bold text-primary">desde 5,000 CUP/mes</span>
                    </div>
                  </div>
                  <Link to="/register" className="w-full rounded bg-primary py-2.5 px-4 text-xs font-bold uppercase tracking-wider text-black transition-all hover:bg-primary-hover">
                    Blindar mis recetas ahora
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== PASOS ==================== */}
        <section id="features" className="w-full border-b border-border bg-bg px-4 py-20 md:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="fade-up mx-auto mb-16 max-w-xl text-center">
              <span className="mb-2 block font-mono text-xs font-semibold uppercase tracking-widest text-primary">Despliegue rápido</span>
              <h2 className="text-2xl font-bold tracking-tight text-text md:text-4xl">
                De la instalación al primer ticket en minutos
              </h2>
              <p className="mt-2 text-sm text-text-secondary">
                Sin técnicos complicados y sin internet para activar.
              </p>
            </div>
            <div className="relative grid grid-cols-1 gap-6 md:grid-cols-4">
              {[
                { n: '01', t: 'Instala en tu equipo', d: 'Instalador único para Windows 10/11 de 64-bit. No requiere SQL Server ni motores pesados.', time: '2 min', hot: false },
                { n: '02', t: 'Registra tus productos', d: 'Carga insumos, platos y precios en CUP con entrada rápida por teclado y categorías.', time: '5 min', hot: false },
                { n: '03', t: 'Asigna PINs y roles', d: 'Crea el PIN de cada empleado y controla qué módulos ve cada rol.', time: '3 min', hot: false },
                { n: '04', t: 'Abre caja y cobra', d: 'Vende, imprime tickets de 58/80mm y controla mermas desde el primer turno.', time: '5 min', hot: true },
              ].map((s) => (
                <div key={s.n} className="fade-up relative flex flex-col justify-between rounded-xl border border-border bg-surface p-6">
                  <div>
                    <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded font-mono text-lg font-black ${s.hot ? 'bg-success text-black' : 'bg-primary text-black'}`}>
                      {s.n}
                    </div>
                    <h3 className="mb-2 text-lg font-bold text-text">{s.t}</h3>
                    <p className="text-xs leading-relaxed text-text-secondary">{s.d}</p>
                  </div>
                  <div className={`mt-4 border-t border-border pt-4 font-mono text-[10px] ${s.hot ? 'text-success' : 'text-primary'}`}>
                    Tiempo estimado: {s.time}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== TESTIMONIOS ==================== */}
        <section className="w-full border-b border-border bg-bg px-4 py-20 md:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="fade-up mx-auto mb-16 max-w-2xl text-center">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs font-semibold text-primary">
                <Store className="h-3.5 w-3.5" />
                <span>COMUNIDAD EN CUBA</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-text md:text-4xl">
                Negocios que ya operan sin estrés
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                { init: 'MG', color: 'text-primary', name: 'María González', place: 'Paladar La Terraza · Playa, La Habana', quote: 'Teníamos un sistema en la nube que se quedaba colgado cada vez que fallaba la conexión, con las mesas esperando la cuenta. Con InventarioY la laptop de la barra sigue cobrando como si nada.' },
                { init: 'AR', color: 'text-success', name: 'Alejandro Ramos', place: 'Cafetería 23 y L · Vedado, La Habana', quote: 'El cierre con validación terminó las discusiones de fin de turno. Cada empleado registra su conteo y el sistema dice si cuadra. Pusimos una tablet en cocina por el Wi-Fi del local, sin gastar datos móviles.' },
                { init: 'DR', color: 'text-primary', name: 'David Rodríguez', place: 'Restaurante El Criollo · Matanzas', quote: 'Pagar en CUP por transferencia es un alivio. Lo instalamos en una máquina antigua del almacén y funciona fluido. El soporte por WhatsApp nos ayudó a configurarlo todo.' },
              ].map((t) => (
                <div key={t.init} className="fade-up flex flex-col justify-between rounded-xl border border-border bg-surface p-6">
                  <div>
                    <div className="mb-4 flex items-center gap-1 text-primary">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-primary text-primary" />
                      ))}
                    </div>
                    <p className="mb-6 text-sm italic leading-relaxed text-text-secondary">“{t.quote}”</p>
                  </div>
                  <div className="flex items-center gap-3 border-t border-border pt-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded border border-border bg-bg font-mono font-bold ${t.color}`}>
                      {t.init}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-text">{t.name}</h4>
                      <p className="font-mono text-[11px] text-text-secondary">{t.place}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== PRICING ==================== */}
        <section id="pricing" className="w-full border-b border-border bg-bg px-4 py-20 md:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="fade-up mx-auto mb-10 max-w-xl text-center">
              <span className="mb-2 block font-mono text-xs font-semibold uppercase tracking-widest text-primary">Tarifa simple en moneda nacional</span>
              <h2 className="text-2xl font-bold tracking-tight text-text md:text-4xl">
                Un solo plan con todo incluido
              </h2>
              <p className="mt-2 text-sm text-text-secondary">
                Sin límites de productos ni tarifas por venta. Pago manual en CUP.
              </p>
            </div>
            <div className="fade-up mb-10 flex items-center justify-center gap-2 sm:gap-3">
              {(['mensual', 'anual', 'vitalicio'] as Billing[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBilling(b)}
                  className={`rounded-lg border px-3 py-2 font-mono text-xs font-bold transition-all sm:px-4 ${billing === b ? 'border-primary bg-primary/10 text-text' : 'border-border bg-surface text-text-secondary hover:text-text'}`}
                >
                  {b === 'mensual' ? 'Mensual' : b === 'anual' ? 'Anual' : 'Vitalicio'}
                </button>
              ))}
              {billing === 'anual' && (
                <span className="rounded bg-success/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-success">
                  Ahorras 6,000 CUP
                </span>
              )}
              {billing === 'vitalicio' && (
                <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
                  Mejor valor
                </span>
              )}
            </div>
            <div className="fade-up hardware-border amber-glow relative overflow-hidden rounded-2xl bg-surface p-6 md:p-10">
              <div className="mb-8 flex flex-col justify-between gap-6 border-b border-border pb-8 md:flex-row md:items-center">
                <div>
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs font-bold uppercase text-primary">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Licencia profesional</span>
                  </div>
                  <h3 className="text-2xl font-bold text-text">Instalación local ilimitada</h3>
                  <p className="mt-1 text-xs text-text-secondary md:text-sm">Paladares, cafeterías, bares, panaderías y tiendas en Cuba.</p>
                </div>
                <div className="text-left md:text-right">
                  <div className="flex items-baseline gap-1.5 md:justify-end">
                    <span className="text-4xl font-extrabold text-text sm:text-5xl">
                      {billing === 'mensual' ? '5,000' : billing === 'anual' ? '54,000' : '130,000'}
                    </span>
                    <span className="font-mono text-xl font-bold text-primary">CUP</span>
                  </div>
                  <span className="mt-0.5 block font-mono text-xs text-text-secondary">
                    {billing === 'mensual' ? 'por mes' : billing === 'anual' ? 'por año' : 'pago único'}
                  </span>
                  {billing === 'anual' && (
                    <span className="mt-1 block font-mono text-[11px] text-success">
                      Equivale a 4,500 CUP/mes
                    </span>
                  )}
                  {billing === 'vitalicio' && (
                    <span className="mt-1 block font-mono text-[11px] text-primary">
                      Actualizaciones incluidas de por vida · Sin renovaciones
                    </span>
                  )}
                </div>
              </div>
              <div className="mb-8 grid grid-cols-1 gap-x-8 gap-y-3 font-mono text-xs md:grid-cols-2">
                {FEATURES_16.map((f) => (
                  <div key={f} className="flex items-center gap-2.5 text-text">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <div className="mb-8 flex flex-col items-center justify-between gap-4 rounded-xl border border-border bg-bg p-4 font-mono text-xs sm:flex-row">
                <div className="flex items-center gap-2 text-text-secondary">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <span><strong className="text-text">7 días de prueba gratis,</strong> con todo incluido y sin compromiso.</span>
                </div>
                <div className="flex items-center gap-2 text-text">
                  <span className="rounded border border-border bg-surface px-2 py-1">Transferencia</span>
                  <span className="rounded border border-border bg-surface px-2 py-1">Efectivo</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <Link to="/register" className="w-full rounded-lg bg-primary py-3.5 px-6 text-center text-sm font-bold text-black shadow-md transition-all hover:bg-primary-hover active:scale-95 sm:flex-1">
                  Comenzar 7 días gratis
                </Link>
                <a href="https://wa.me/5354523884" target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg px-6 py-3.5 font-mono text-xs text-text transition-all hover:bg-surface-hover sm:w-auto">
                  <MessageCircle className="h-4 w-4 text-success" />
                  <span>WhatsApp +53 54523884</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== FAQ ==================== */}
        <section id="faq" className="w-full border-b border-border bg-bg px-4 py-20 md:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="fade-up mx-auto mb-16 max-w-xl text-center">
              <span className="mb-2 block font-mono text-xs font-semibold uppercase tracking-widest text-primary">Despeja tus dudas</span>
              <h2 className="text-2xl font-bold tracking-tight text-text md:text-4xl">
                Preguntas frecuentes
              </h2>
            </div>
            <div className="fade-up space-y-4">
              {[
                { icon: Zap, color: 'text-primary', q: '¿Qué pasa si se va la luz de golpe?', a: 'No pierdes nada. La base de datos local trabaja en modo WAL con escritura atómica: al encender el equipo, el turno, los tickets y el stock están exactamente como quedaron. Por eso el sistema sobrevive a los apagones mejor que cualquier hoja de cálculo.' },
                { icon: Save, color: 'text-success', q: '¿Cómo respaldo mis datos sin internet?', a: 'La aplicación guarda respaldos automáticos internos de la base de datos. Además, puedes copiar manualmente el archivo de datos a una memoria USB como copia externa. Ninguna información sale a internet: eres el dueño físico de tus datos.' },
                { icon: Printer, color: 'text-primary', q: '¿Funciona con impresoras térmicas?', a: 'Sí, imprime tickets en impresoras térmicas de 58mm y 80mm conectadas por USB, las más comunes en Cuba.' },
                { icon: KeyRound, color: 'text-success', q: '¿Cómo se activa la licencia después de la prueba?', a: 'Nos escribes por WhatsApp al +53 54523884, realizas el pago en CUP por transferencia o en efectivo, y recibes tu clave de activación digital para tu equipo. Sin trámites bancarios ni tarjetas internacionales.' },
                { icon: Rocket, color: 'text-primary', q: '¿Cómo empiezo a usar InventarioY?', a: 'Instala la aplicación, registra tu negocio con un nombre y un PIN de acceso, y tendrás 7 días de prueba gratis con todas las funciones. Con ese PIN creas accesos por rol para tus empleados.' },
                { icon: Users, color: 'text-success', q: '¿Puedo tener múltiples usuarios?', a: 'Sí. Cada empleado accede con su PIN de 4 dígitos y un rol (dueño, económico, admin, supervisor, dependiente). Cada rol ve solo los módulos que le corresponden.' },
                { icon: ShieldCheck, color: 'text-primary', q: '¿Existe la opción de pago único?', a: 'Sí: 130,000 CUP en un solo pago, con licencia vitalicia y actualizaciones del producto incluidas de por vida (entrega manual, sin costo). Se solicita igual por WhatsApp y se activa con tu clave permanente.' },
              ].map((f) => (
                <div key={f.q} className="rounded-xl border border-border bg-surface p-5">
                  <h3 className="mb-2 flex items-center justify-between text-base font-bold text-text">
                    <span>{f.q}</span>
                    <f.icon className={`h-5 w-5 shrink-0 ${f.color}`} />
                  </h3>
                  <p className="text-xs leading-relaxed text-text-secondary md:text-sm">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== CTA FINAL ==================== */}
        <section id="contact" className="w-full bg-bg px-4 py-16 md:px-8">
          <div className="fade-up hardware-border mx-auto flex max-w-5xl flex-col items-center justify-between gap-8 rounded-2xl bg-surface p-8 md:flex-row md:p-12">
            <div className="max-w-xl">
              <div className="mb-2 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-success">
                <span className="h-2 w-2 animate-pulse rounded-full bg-success"></span>
                <span>Despliegue inmediato</span>
              </div>
              <h2 className="mb-3 text-2xl font-bold tracking-tight text-text md:text-3xl">
                Toma el control de tu negocio hoy mismo.
              </h2>
              <p className="text-sm leading-relaxed text-text-secondary">
                Instala InventarioY en tu equipo. Prueba el escandallo, el cierre con
                validación y el punto de venta durante 7 días sin costo.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 font-mono text-xs sm:w-auto">
              <Link to="/register" className="rounded-lg bg-primary px-6 py-3.5 text-center text-sm font-bold text-black shadow-lg transition-all hover:bg-primary-hover active:scale-95">
                Probar 7 días gratis
              </Link>
              <a href="https://wa.me/5354523884" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg border border-border bg-bg px-6 py-3 text-text transition-all hover:bg-surface-hover">
                <MessageCircle className="h-4 w-4 text-success" />
                <span>WhatsApp: +53 54523884</span>
              </a>
              <a href="https://instagram.com/inventario_y" target="_blank" rel="noreferrer" className="mt-1 flex items-center justify-center gap-1 text-center text-[11px] text-text-secondary transition-colors hover:text-primary">
                <Camera className="h-3 w-3" />
                <span>Instagram: @inventario_y</span>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ==================== FOOTER ==================== */}
      <footer className="w-full border-t border-border bg-bg px-4 py-12 font-mono text-xs md:px-8">
        <div className="mx-auto mb-12 grid max-w-7xl grid-cols-1 gap-8 md:grid-cols-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <InventarioYLogo size="md" variant="image" />
              <span className="text-lg font-bold tracking-tight"><span className="text-primary">Inventario</span><span className="text-text">Y</span></span>
            </div>
            <p className="font-sans text-xs leading-relaxed text-text-secondary">
              Punto de venta, inventario y gestión para negocios en Cuba.
              100% offline, instalado en tu equipo.
            </p>
            <div className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 text-[10px] text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success"></span>
              <span>AUTÓNOMO · LOCAL · SIN NUBE</span>
            </div>
          </div>
          <div>
            <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text">Módulos</h4>
            <ul className="space-y-2 text-text-secondary">
              <li><a href="#features" className="transition-colors hover:text-primary">Punto de venta</a></li>
              <li><a href="#features" className="transition-colors hover:text-primary">Escandallo de recetas</a></li>
              <li><a href="#infraestructura" className="transition-colors hover:text-primary">Cierre con validación</a></li>
              <li><a href="#infraestructura" className="transition-colors hover:text-primary">Multi-PIN por roles</a></li>
              <li><a href="#infraestructura" className="transition-colors hover:text-primary">Multi-caja en red local</a></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text">Contacto Cuba</h4>
            <ul className="space-y-2 text-text-secondary">
              <li>
                <a href="https://wa.me/5354523884" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-success">
                  <MessageCircle className="h-3.5 w-3.5 text-success" />
                  <span>WhatsApp: +53 54523884</span>
                </a>
              </li>
              <li>
                <a href="https://instagram.com/inventario_y" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-primary">
                  <Camera className="h-3.5 w-3.5 text-primary" />
                  <span>Instagram: @inventario_y</span>
                </a>
              </li>
              <li>
                <a href="https://youtu.be/DWl2cgeqcRA" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-text">
                  <MonitorPlay className="h-3.5 w-3.5" />
                  <span>Demostración en video</span>
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text">Seguridad y datos</h4>
            <ul className="space-y-2 text-text-secondary">
              <li><span>Base de datos SQLite local (WAL)</span></li>
              <li><span>Cero almacenamiento en nube</span></li>
              <li><span>Respaldos automáticos locales</span></li>
              <li><span>Auditoría de acciones por turno</span></li>
            </ul>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-border pt-6 text-[11px] text-text-secondary sm:flex-row">
          <div>
            © {new Date().getFullYear()} InventarioY. Todos los derechos reservados.
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="transition-colors hover:text-text">Ingresar</Link>
            <span>•</span>
            <Link to="/register" className="transition-colors hover:text-text">Registro</Link>
            <span>•</span>
            <Link to="/acceso" className="transition-colors hover:text-text">Acceso PIN</Link>
          </div>
        </div>
      </footer>

      <TutorialPromptModal
        isOpen={showTutorialPrompt}
        onClose={() => setShowTutorialPrompt(false)}
        onAccept={() => {
          window.open('https://youtu.be/DWl2cgeqcRA', '_blank', 'noopener,noreferrer');
          setShowTutorialPrompt(false);
        }}
      />
    </div>
  );
}
