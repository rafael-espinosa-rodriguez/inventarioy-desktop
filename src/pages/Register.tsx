import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Eye, EyeOff, Store } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import InventarioYLogo from '../components/InventarioYLogo';
import { localDb as supabase } from '../lib/db/localClient';

export default function Register() {
  const [businessName, setBusinessName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!businessName.trim()) {
        setError('El nombre del negocio es obligatorio');
        setIsLoading(false);
        return;
      }

      if (!pin || pin.length !== 4) {
        setError('El PIN debe tener exactamente 4 dígitos');
        setIsLoading(false);
        return;
      }

      if (confirmPin.length !== 4) {
        setError('El PIN debe tener exactamente 4 dígitos');
        setIsLoading(false);
        return;
      }

      if (pin !== confirmPin) {
        setError('Los PIN no coinciden');
        setIsLoading(false);
        return;
      }

      const result = await supabase.auth.signUp({
        businessName: businessName.trim(),
        pin,
      });

      if (result.error) {
        const msg = result.error?.message ?? String(result.error);
        if (msg.toLowerCase().includes('ya está configurado')) {
          toast.info('El negocio ya está configurado. Inicie sesión con su PIN.');
          navigate('/login');
          return;
        }
        setIsLoading(false);
        setError(msg);
        return;
      }

      setIsLoading(false);
      toast.success('Negocio configurado correctamente. Inicie sesión con su PIN.');
      navigate('/login');
    } catch {
      setIsLoading(false);
      setError('Ocurrió un error inesperado. Intente de nuevo.');
    }
  };

  const inputClass =
    'flex h-10 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text ring-offset-bg placeholder:text-text-secondary transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary focus-visible:shadow-[0_0_15px_-3px_rgba(255,193,7,0.3)]';

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4 py-12">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-border/50 bg-surface/80 backdrop-blur-xl p-8 shadow-[0_0_40px_-10px_rgba(255,193,7,0.15)]">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4">
            <InventarioYLogo size="lg" variant="image" />
          </div>
          <h2 className="text-2xl font-bold text-text text-gradient hero-glow">Configure su negocio</h2>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && (
            <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="businessName" className="block text-sm font-medium text-text-secondary mb-1">
                Nombre del Negocio
              </label>
              <input
                id="businessName"
                type="text"
                required
                autoFocus
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className={inputClass}
                placeholder="Mi Empresa S.A."
              />
            </div>
            <div>
              <label htmlFor="pin" className="block text-sm font-medium text-text-secondary mb-1">
                PIN de acceso (4 dígitos)
              </label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                <input
                  id="pin"
                  type={showPin ? "text" : "password"}
                  required
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className={`${inputClass} pl-9 pr-10`}
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
            <div>
              <label htmlFor="confirmPin" className="block text-sm font-medium text-text-secondary mb-1">
                Confirmar PIN
              </label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                <input
                  id="confirmPin"
                  type={showConfirmPin ? "text" : "password"}
                  required
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  className={`${inputClass} pl-9 pr-10`}
                  placeholder="••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPin(!showConfirmPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text"
                >
                  {showConfirmPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <Button type="submit" className="px-8" disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Configurando...
                </span>
              ) : 'Configurar y Comenzar'}
            </Button>
          </div>
        </form>

        <p className="text-center text-sm text-text-secondary">
          ¿Ya tiene cuenta?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
