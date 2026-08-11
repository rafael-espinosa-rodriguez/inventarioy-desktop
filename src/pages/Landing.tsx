import { Package, ShoppingCart, ChefHat, Sparkles, ChevronDown, CheckCircle2, Loader2, Users, Instagram, Facebook, Phone, MapPin, DollarSign, Headphones, MessageCircle, Menu, X, LogIn, UserPlus, ClipboardList, Store, BarChart3, Database, Activity, Star, Quote, Play } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import InventarioYLogo from '../components/InventarioYLogo';
import TutorialPromptModal, { shouldShowTutorialPrompt } from '../components/TutorialPromptModal';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAuthStore } from '../store/authStore';

gsap.registerPlugin(ScrollTrigger);

export default function Landing() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showTutorialPrompt, setShowTutorialPrompt] = useState(() => shouldShowTutorialPrompt());
  const [isAnnual, setIsAnnual] = useState(false);

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
      heroTl.fromTo('.hero-fade', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.15 });

      document.querySelectorAll('.fade-up').forEach((el) => {
        ScrollTrigger.create({
          trigger: el,
          start: 'top 85%',
          once: true,
          onEnter: () => {
            gsap.fromTo(el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
          },
        });
      });
    });

    return () => ctx.revert();
  }, []);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-primary/30">
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(255,193,7,0.15); }
          50% { box-shadow: 0 0 40px rgba(255,193,7,0.3); }
        }
        .animate-float { animation: float 4s ease-in-out infinite; }
        .animate-pulse-glow { animation: pulse-glow 3s ease-in-out infinite; }
      `}</style>
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-bg/80 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/60 shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <InventarioYLogo size="lg" variant="image" />
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-text-secondary">
            <a href="#features" className="hover:text-primary transition-colors">Características</a>
            <a href="#pricing" className="hover:text-primary transition-colors">Plan</a>
            <a href="#faq" className="hover:text-primary transition-colors">FAQ</a>
          </nav>
          <button
            className="md:hidden p-2 text-text-secondary hover:text-text transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="hidden md:flex items-center gap-4">
            <Link to="/login">
              <Button variant="outline" className="hidden sm:inline-flex">Acceder</Button>
            </Link>
            <Link to="/register">
              <Button>Registrarse</Button>
            </Link>
            <Link to="/acceso">
              <Button 
                variant="outline" 
                className="text-sm border-primary/50 text-primary bg-primary/5 hover:bg-primary/10 hover:border-primary shadow-[0_0_10px_rgba(255,193,7,0.2)] hover:shadow-[0_0_20px_rgba(255,193,7,0.4)] transition-all duration-300"
              >
                <Users className="h-4 w-4 mr-1" />
                Acceso de Empleados
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Menú móvil */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-64 bg-surface border-l border-border shadow-2xl animate-in slide-in-from-right">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <InventarioYLogo size="md" variant="image" />
              <button onClick={() => setIsMobileMenuOpen(false)} className="text-text-secondary hover:text-text">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col p-4 space-y-2">
              <a href="#features" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text transition-colors">
                <Package className="h-4 w-4" />
                Características
              </a>
              <a href="#pricing" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text transition-colors">
                <DollarSign className="h-4 w-4" />
                Plan
              </a>
              <a href="#faq" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text transition-colors">
                <MessageCircle className="h-4 w-4" />
                FAQ
              </a>
              <hr className="my-2 border-border" />
              <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text transition-colors">
                <LogIn className="h-4 w-4" />
                Acceder
              </Link>
              <Link to="/register" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors">
                <UserPlus className="h-4 w-4" />
                Registrarse
              </Link>
              <Link to="/acceso" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text transition-colors">
                <Users className="h-4 w-4" />
                Acceso de Empleados
              </Link>
            </nav>
          </div>
        </div>
      )}

      <main className="flex-1">
        <section className="relative overflow-hidden py-12 lg:py-32">
          <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat', backgroundSize: '128px 128px' }}></div>
          <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-bg to-bg"></div>
          
          <div className="container relative mx-auto px-4 text-center">
              <div className="mx-auto max-w-3xl space-y-6 lg:space-y-8">
              <div className="hero-fade inline-flex items-center rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-sm font-medium text-primary shadow-[0_0_15px_rgba(255,193,7,0.2)]">
                <Sparkles className="mr-2 h-4 w-4 drop-shadow-[0_0_5px_rgba(255,193,7,0.8)]" />
                100% Offline — Funciona sin internet
              </div>
              <h1 className="hero-fade text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                Gestione su inventario <span className="text-gradient">fácil y potente</span>
              </h1>
              <p className="hero-fade mx-auto max-w-2xl text-lg text-text-secondary sm:text-xl">
                La solución de escritorio para restaurantes, cafeterías y comercios en Cuba. Controle su stock, ventas, recetas y personal, sin necesidad de internet.
              </p>
              <div className="hero-fade flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-2 sm:pt-4">
                <Link to="/register">
                  <Button size="lg" className="w-full sm:w-auto text-sm sm:text-base h-11 sm:h-12 px-6 sm:px-8">
                    Configurar mi negocio
                  </Button>
                </Link>
                <a href="#pricing">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto text-sm sm:text-base h-11 sm:h-12 px-6 sm:px-8">
                    Ver Plan
                  </Button>
                </a>
                <a href="https://youtu.be/DWl2cgeqcRA" target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="w-full sm:w-auto text-sm sm:text-base h-11 sm:h-12 px-6 sm:px-8 gap-2 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 transition-all duration-300" variant="default">
                    <Play className="h-4 w-4" />
                    Aprende a usar la App
                  </Button>
                </a>
              </div>

              {/* Dashboard Mockup */}
              <div className="hero-fade mx-auto mt-16 max-w-4xl animate-float">
                <div className="relative rounded-2xl border border-border/50 bg-surface/80 backdrop-blur-sm shadow-2xl overflow-hidden animate-pulse-glow">
                  <div className="flex items-center gap-1.5 border-b border-border/50 px-4 py-3">
                    <div className="h-3 w-3 rounded-full bg-red-500/80" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                    <div className="h-3 w-3 rounded-full bg-green-500/80" />
                    <span className="ml-3 text-xs text-text-secondary">InventarioY Dashboard</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3 p-4">
                    <div className="col-span-1 space-y-3">
                      {['Productos', 'Movimientos', 'Ventas'].map((label) => (
                        <div key={label} className="rounded-lg bg-primary/10 p-3 text-left">
                          <p className="text-xs text-text-secondary">{label}</p>
                          <div className="mt-1 h-4 w-16 rounded bg-primary/20" />
                        </div>
                      ))}
                    </div>
                    <div className="col-span-3 space-y-3">
                      <div className="flex gap-3">
                        {['Stock Total', 'Valor Inventario', 'Ventas Hoy'].map((label) => (
                          <div key={label} className="flex-1 rounded-lg bg-primary/5 p-3 text-left">
                            <p className="text-xs text-text-secondary">{label}</p>
                            <div className="mt-1 h-4 w-12 rounded bg-primary/20" />
                          </div>
                        ))}
                      </div>
                      <div className="rounded-lg border border-border/30 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-medium text-text-secondary">Productos Recientes</p>
                          <div className="h-3 w-16 rounded bg-primary/20" />
                        </div>
                        {[80, 60, 40].map((w) => (
                          <div key={w} className="mb-1.5 flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-primary/40" />
                            <div className="h-3 flex-1 rounded bg-primary/10" style={{ maxWidth: `${w}%` }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Por qué elegirnos */}
        <section className="py-16 border-y border-border/50">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12 fade-up">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">¿Por qué elegir InventarioY?</h2>
              <p className="text-text-secondary max-w-2xl mx-auto">Diseñado específicamente para las necesidades de negocios cubanos</p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="text-center fade-up" style={{ transitionDelay: '0ms' }}>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <MapPin className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Hecho en Cuba</h3>
                <p className="text-text-secondary text-sm">Desarrollado específicamente para negocios cubanos, entiende la realidad local</p>
              </div>
              <div className="text-center fade-up" style={{ transitionDelay: '100ms' }}>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <DollarSign className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Precio Accesible</h3>
                <p className="text-text-secondary text-sm">Pensado para su negocio en Cuba. Plan de 5,000 CUP al mes por negocio, sin costos ocultos. Empiece con 7 días de prueba gratis.</p>
              </div>
              <div className="text-center fade-up" style={{ transitionDelay: '200ms' }}>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Headphones className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Soporte Cercano</h3>
                <p className="text-text-secondary text-sm">Atención personalizada directamente por nosotros. Le acompañamos en todo el proceso</p>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-24 bg-surface/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16 fade-up">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">Todo lo que necesita para crecer</h2>
              <p className="text-text-secondary max-w-2xl mx-auto">Herramientas profesionales diseñadas específicamente para PYMES, restaurantes y comercios.</p>
            </div>
            
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "Gestión de Inventario",
                  description: "Control preciso de stock, alertas de mínimo y máximo, y seguimiento de mermas.",
                  icon: Package,
                },
                {
                  title: "Control de Ventas",
                  description: "Punto de venta integrado, gestión de carritos y reportes detallados de ingresos.",
                  icon: ShoppingCart,
                },
                {
                  title: "Recetas y Cocciones",
                  description: "Calcula costos exactos por porción y descuenta ingredientes automáticamente.",
                  icon: ChefHat,
                },
              ].map((feature, index) => (
                <div key={feature.title} className="relative overflow-hidden rounded-2xl border border-border bg-surface p-8 transition-all hover:border-primary/50 hover:shadow-[0_0_30px_-10px_rgba(255,193,7,0.3)] fade-up" style={{ transitionDelay: `${index * 100}ms` }}>
                  <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold">{feature.title}</h3>
                  <p className="text-text-secondary leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>

            <div className="text-center mt-12 fade-up">
              <Link to="/register">
                <Button size="lg" className="text-base h-12 px-8">
                  Comenzar ahora
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Cómo funciona */}
        <section className="py-20 border-y border-border/50">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12 fade-up">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">Así de fácil es empezar</h2>
              <p className="text-text-secondary max-w-2xl mx-auto">En solo 3 pasos puede tener su negocio controlado</p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="text-center fade-up" style={{ transitionDelay: '0ms' }}>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary relative">
                  <UserPlus className="h-7 w-7 text-black" />
                  <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black text-xs font-bold text-primary">1</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">Configure su negocio</h3>
                <p className="text-text-secondary text-sm">Regístrese con el nombre de su negocio y un PIN de acceso. Todo queda en su equipo.</p>
              </div>
              <div className="text-center fade-up" style={{ transitionDelay: '100ms' }}>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary relative">
                  <Sparkles className="h-7 w-7 text-black" />
                  <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black text-xs font-bold text-primary">2</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">Cree sus PINs de acceso</h3>
                <p className="text-text-secondary text-sm">Asigne PINs con roles a sus empleados y controle quién accede a cada módulo.</p>
              </div>
              <div className="text-center fade-up" style={{ transitionDelay: '200ms' }}>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary relative">
                  <DollarSign className="h-7 w-7 text-black" />
                  <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black text-xs font-bold text-primary">3</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">Gestione sin internet</h3>
                <p className="text-text-secondary text-sm">Inventario, ventas, recetas y personal, todo disponible 100% sin conexión.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonios */}
        <section className="py-24 bg-surface/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16 fade-up">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">Lo que dicen nuestros usuarios</h2>
              <p className="text-text-secondary max-w-2xl mx-auto">Dueños de negocios como el suyo ya confían en InventarioY</p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                {
                  name: 'María García',
                  role: 'Dueña de Cafetería, La Habana',
                  quote: 'Antes perdía el control de mi inventario todos los meses. Con InventarioY sé exactamente qué tengo, qué falta y cuánto he vendido en tiempo real.',
                  rating: 5,
                },
                {
                  name: 'Carlos Pérez',
                  role: 'Restaurante El Criollo, Matanzas',
                  quote: 'El módulo de recetas me cambió la vida. Ahora calculo costos por plato al instante y sé cuánto gano en cada comida que sirvo.',
                  rating: 5,
                },
                {
                  name: 'Laura Sánchez',
                  role: 'Dueña de Paladar, Santiago',
                  quote: 'Lo mejor es que mis empleados pueden acceder con PIN sin necesidad de email. Y el soporte siempre responde rápido por WhatsApp.',
                  rating: 5,
                },
              ].map((t, idx) => (
                <div key={t.name} className="fade-up rounded-2xl border border-border/50 bg-surface p-8 transition-all hover:border-primary/30 hover:shadow-[0_0_30px_-10px_rgba(255,193,7,0.15)]" style={{ transitionDelay: `${idx * 100}ms` }}>
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <Quote className="h-6 w-6 text-primary/30 mb-3" />
                  <p className="text-text-secondary text-sm leading-relaxed mb-6">"{t.quote}"</p>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                      {t.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-text-secondary">{t.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16 fade-up">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">Precio simple y transparente</h2>
              <p className="text-text-secondary max-w-2xl mx-auto">Sin sorpresas ni costos ocultos. Un solo plan con todo incluido. Pago manual y activación sin conexión.</p>
            </div>

            {/* Toggle Anual / Mensual */}
            <div className="flex items-center justify-center gap-4 mb-10 fade-up">
              <span className={`text-sm font-medium transition-colors ${!isAnnual ? 'text-text' : 'text-text-secondary'}`}>Mensual</span>
              <button
                onClick={() => setIsAnnual(!isAnnual)}
                className="relative h-7 w-14 rounded-full bg-primary/20 border border-primary/30 transition-colors hover:bg-primary/30"
              >
                <div className={`absolute top-0.5 h-6 w-6 rounded-full bg-primary shadow-md transition-transform duration-300 ${isAnnual ? 'translate-x-7' : 'translate-x-0.5'}`} />
              </button>
              <span className={`text-sm font-medium transition-colors ${isAnnual ? 'text-text' : 'text-text-secondary'}`}>
                Anual
                <span className="ml-1.5 inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Ahorra 10%</span>
              </span>
            </div>

            <div className="mx-auto max-w-md">
              <div className="relative rounded-3xl border border-primary bg-surface p-8 shadow-2xl fade-up">
                <div className="absolute -top-5 left-0 right-0 mx-auto w-fit rounded-full bg-primary px-4 py-1 text-sm font-bold text-black">
                  Plan Profesional
                </div>
                <div className="mb-8 text-center pt-4">
                  {isAnnual ? (
                    <>
                      <span className="text-5xl font-extrabold">54,000 CUP</span>
                      <span className="text-text-secondary">/año</span>
                      <p className="mt-2 text-sm">
                        <span className="text-text-secondary line-through">60,000 CUP</span>
                        <span className="text-success ml-2 font-medium">Ahorras 6,000 CUP</span>
                      </p>
                      <p className="mt-1 text-xs text-text-secondary">Equivale a 4,500 CUP/mes</p>
                    </>
                  ) : (
                    <>
                      <span className="text-5xl font-extrabold">5,000 CUP</span>
                      <span className="text-text-secondary">/mes</span>
                      <p className="mt-4 text-sm text-text-secondary">Activación por clave de licencia. Funciona 100% sin internet.</p>
                    </>
                  )}
                </div>

                <div className="mb-6 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-center">
                  <p className="text-sm font-medium text-success">Pruebe gratis 7 días</p>
                  <p className="mt-0.5 text-xs text-text-secondary">Configure su negocio y use todas las funciones sin pagar. Después, actívelo con su clave.</p>
                </div>
                
                <ul className="mb-8 grid grid-cols-2 gap-3">
                  {[
                    "Productos ilimitados",
                    "Control de inventario con alertas de stock",
                    "Registro de movimientos (entradas, salidas, mermas)",
                    "Ajuste de inventario con auditoría completa",
                    "Módulo de Tránsito para control de ingredientes",
                    "Cierres de caja diarios",
                    "Gestión de pagos y gastos",
                    "Punto de venta integrado",
                    "Recetas y control de producción",
                    "Control de empleados y nómina",
                    "Biblioteca de documentos para empleados (PNO, Reglamento)",
                    "Gráficos y estadísticas en tiempo real",
                    "Análisis de rotación y auditoría de inventario",
                    "Exportación de datos a Excel",
                    "Funciona 100% sin internet",
                    "Soporte prioritario",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm text-text-secondary">{item}</span>
                    </li>
                  ))}
                </ul>
                
                <Link to="/register" className="block">
                  <Button className="w-full h-12 text-base">Comenzar Ahora</Button>
                </Link>
                <p className="mt-3 text-center text-xs text-text-secondary">
                  ¿Dudas? Contáctenos por WhatsApp <span className="font-medium">+53 54523884</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="py-24 bg-surface/30">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="text-center mb-16 fade-up">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">Preguntas Frecuentes</h2>
            </div>
            
            <div className="space-y-4 fade-up" style={{ transitionDelay: '100ms' }}>
              {[
                {
                  q: "¿Cómo empiezo a usar InventarioY?",
                  a: "Abra la aplicación y en la pantalla de registro configure el nombre de su negocio y un PIN de acceso. Con ese PIN podrá iniciar sesión y crear PINs con roles para sus empleados."
                },
                {
                  q: "¿Necesito internet para usarlo?",
                  a: "No. InventarioY es una aplicación de escritorio que funciona 100% sin conexión. Todos sus datos se guardan localmente en su equipo."
                },
                {
                  q: "¿Puedo tener múltiples usuarios?",
                  a: "Sí, puede crear PINs de acceso con distintos roles (dueño, administrador, supervisor, dependiente). El sistema está diseñado para que el dueño y su equipo de confianza lo utilicen."
                },
                {
                  q: "¿Cómo adquiero la aplicación?",
                  a: "Descargue la versión de escritorio y configúrela: tendrá 7 días de prueba gratis con todas las funciones. Para seguir usándola, contacte a nuestro equipo por WhatsApp, realice el pago (efectivo o transferencia) y reciba su clave de activación."
                },
                {
                  q: "¿Cuánto cuesta y cómo se renueva?",
                  a: "El plan profesional cuesta 5,000 CUP al mes. Se renueva de forma manual: cuando su licencia venza, contáctenos para generar una nueva clave. Existen planes de 3, 6 y 12 meses con descuento."
                }
              ].map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={faq.q} className="rounded-xl border border-border bg-surface overflow-hidden">
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="flex w-full cursor-pointer items-center justify-between gap-1.5 p-6 font-medium text-text transition-colors hover:bg-bg/30"
                    >
                      <h3 className="text-lg text-left">{faq.q}</h3>
                      <span className="shrink-0 rounded-full bg-bg p-1.5 text-text-secondary sm:p-3 transition-transform duration-300" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        <ChevronDown className="h-5 w-5" />
                      </span>
                    </button>
                    <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: isOpen ? '200px' : '0px' }}>
                      <p className="px-6 pb-6 leading-relaxed text-text-secondary">
                        {faq.a}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="contact" className="py-24">
          <div className="container mx-auto px-4 max-w-xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">Contáctanos</h2>
              <p className="text-text-secondary">¿Tienes alguna duda? Escríbenos y te responderemos lo antes posible.</p>
            </div>
            
            <div className="flex justify-center">
              <a 
                href="https://wa.me/5354523884?text=Hola,%20tengo%20una%20consulta%20sobre%20InventarioY"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-3 h-14 px-8 text-lg font-medium bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors shadow-lg shadow-green-500/20"
              >
                <MessageCircle className="h-6 w-6" />
                Escríbenos por WhatsApp
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface py-12">
        <div className="container mx-auto px-4 text-center text-text-secondary">
          <div className="flex items-center justify-center gap-2 mb-6">
            <InventarioYLogo size="lg" variant="image" />
          </div>
          
          {/* Redes Sociales */}
          <div className="flex justify-center gap-6 mb-8">
            <a 
              href="https://instagram.com/rafael.espinosar" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <Instagram className="h-5 w-5" />
              <span>Instagram</span>
            </a>
            <a 
              href="https://facebook.com/Rafael Nicolas Espinosa Rodriguez" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <Facebook className="h-5 w-5" />
              <span>Facebook</span>
            </a>
            <a 
              href="https://wa.me/5354523884" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <Phone className="h-5 w-5" />
              <span>WhatsApp</span>
            </a>
          </div>
          
          <div className="flex justify-center gap-6 mb-8 text-sm">
            <a href="#features" className="hover:text-primary transition-colors">Características</a>
            <a href="#pricing" className="hover:text-primary transition-colors">Precios</a>
            <a href="#faq" className="hover:text-primary transition-colors">FAQ</a>
          </div>
          <p className="text-sm">© {new Date().getFullYear()} InventarioY. Todos los derechos reservados.</p>
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
