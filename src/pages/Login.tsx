import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { useAuthStore } from '../store/authStore';
import { toast } from 'sonner';
import InventarioYLogo from '../components/InventarioYLogo';
import { Loader2, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const navigate = useNavigate();
  const { login, user, isAuthenticated, isLoading: authLoading } = useAuthStore();

  // Redirigir si ya está autenticado (restauración de sesión offline)
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary"></div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!pin || pin.length < 4) {
        setError('El PIN debe tener al menos 4 dígitos');
        setIsLoading(false);
        return;
      }

      const result = await login(pin.trim());
      
      if (!result.success) {
        setIsLoading(false);
        setError(String(result.error || 'Error al iniciar sesión'));
        return;
      }

      setIsLoading(false);
      toast.success('Sesión iniciada correctamente');
      navigate('/dashboard');
    } catch {
      setIsLoading(false);
      setError('Ocurrió un error inesperado. Intente de nuevo.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-border/50 bg-surface/80 backdrop-blur-xl p-8 shadow-[0_0_40px_-10px_rgba(255,193,7,0.15)]">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6">
<Link to="/">
            <InventarioYLogo size="xl" variant="image" className="cursor-pointer hover:opacity-80 transition-opacity" />
          </Link>
          </div>
          <h2 className="text-2xl font-bold text-text">Bienvenido de nuevo</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Ingrese su PIN para acceder al inventario
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && (
            <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label htmlFor="pin" className="block text-sm font-medium text-text-secondary mb-1">
                PIN de acceso
              </label>
              <div className="relative">
                <input
                  id="pin"
                  type={showPin ? "text" : "password"}
                  required
                  autoFocus
                  inputMode="numeric"
                  maxLength={24}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className="flex h-10 w-full rounded-xl border border-border bg-bg px-3 py-2 pr-10 text-sm text-text ring-offset-bg placeholder:text-text-secondary transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary focus-visible:shadow-[0_0_15px_-3px_rgba(255,193,7,0.3)]"
                  placeholder="••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text"
                >
                  {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <Button type="submit" className="px-8" disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Iniciando sesión...
                </span>
              ) : 'Iniciar Sesión'}
            </Button>
          </div>
        </form>

        <p className="text-center text-sm text-text-secondary mt-4">
          <Link to="/" className="text-primary hover:underline flex items-center justify-center gap-1">
            ← Volver al inicio
          </Link>
        </p>

        <p className="text-center text-sm text-text-secondary">
          ¿Primera vez?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Configurar mi negocio
          </Link>
        </p>
      </div>
    </div>
  );
}
