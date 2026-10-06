import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, Store, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { localDb } from '../lib/db/localClient';
import { toast } from 'sonner';
import InventarioYLogo from '../components/InventarioYLogo';

export default function AccessPage() {
  const { businessCode } = useParams<{ businessCode: string }>();
  const navigate = useNavigate();
  const [code, setCode] = useState(businessCode || '');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [foundBusiness, setFoundBusiness] = useState<string | null>(null);

  useEffect(() => {
    if (code.length >= 3) {
      searchBusiness();
    } else {
      setFoundBusiness(null);
    }
  }, [code]);

  const searchBusiness = async () => {
    try {
      const { data: profiles, error } = (await localDb
        .from('user_session')
        .select('name, businessName')
        .eq('business_code', code.toUpperCase().trim())
        .limit(1)) as any;

      if (error) throw error;

      if (profiles && profiles.length > 0) {
        setFoundBusiness(profiles[0].businessName || profiles[0].name || null);
      } else {
        setFoundBusiness(null);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error searching business:', err);
      setFoundBusiness(null);
    }
  };

  const handleAccess = async () => {
    if (!code.trim() || pin.length < 4) {
      toast.error('Ingrese el código del negocio y un PIN de al menos 4 dígitos');
      return;
    }

    setIsLoading(true);

    try {
      // Verify PIN via local server RPC (PIN hashes never leave the server)
      const { data, error: rpcError } = (await localDb.rpc('verify_access_pin', {
        p_pin: pin,
      })) as any;

      if (rpcError) {
        if (import.meta.env.DEV) console.error('Error verifying PIN:', rpcError);
        toast.error('Error al verificar el PIN. Intente de nuevo.');
        setIsLoading(false);
        return;
      }

      if (!data || !data.success) {
        if (data?.blocked) {
          const remaining = Math.max(1, Math.ceil(Number(data.remaining_seconds) || 300));
          const mins = Math.floor(remaining / 60);
          const secs = remaining % 60;
          const duration = remaining >= 60 ? (secs > 0 ? `${mins} min ${secs} s` : `${mins} min`) : `${remaining} s`;
          toast.error(`PIN bloqueado por 3 intentos fallidos. Intente de nuevo en ${duration}.`);
        } else {
          toast.error(data?.error || 'PIN incorrecto. Verifique su PIN e intente de nuevo.');
        }
        setPin('');
        setIsLoading(false);
        return;
      }

      localStorage.setItem('temp_access', JSON.stringify({
        businessCode: code.toUpperCase().trim(),
        role: data.role,
        pinName: data.pin_name || '',
        accessTime: Date.now()
      }));

      localStorage.setItem('verifiedRole', data.role);
      localStorage.setItem('verifiedRoleName', data.pin_name || '');
      const modules = Array.isArray(data.modules) ? data.modules.map(String) : [];
      localStorage.setItem('verifiedModules', JSON.stringify(modules));

      toast.success('¡Acceso exitoso!');
      navigate('/dashboard');
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error verifying PIN:', err);
      toast.error('Error al verificar el PIN. Intente de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button
          onClick={() => navigate('/')}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al inicio
        </button>

        <div className="text-center mb-8">
          <InventarioYLogo size="xl" variant="image" />
          <h1 className="mt-4 text-2xl font-bold text-text">Acceso de Empleados</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Ingrese el código del negocio y su PIN para acceder
          </p>
        </div>

        <div className="bg-surface rounded-2xl border border-border/50 p-6 shadow-2xl">
          {foundBusiness && (
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-primary/10 border border-primary/20">
              <Store className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">{foundBusiness}</span>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Código del Negocio</label>
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ingrese el código del negocio"
              className="h-12"
              disabled={isLoading}
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-text-secondary mb-1.5">PIN de Acceso</label>
            <div className="relative">
              <Input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 24);
                  setPin(value);
                }}
                placeholder="0000"
                className="h-12 text-center text-2xl font-mono tracking-[0.5em] pr-12"
                disabled={isLoading}
                autoComplete="new-password"
                inputMode="numeric"
                maxLength={24}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                disabled={isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text"
              >
                {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <Button
            onClick={handleAccess}
            disabled={isLoading || !code.trim() || pin.length < 4}
            className="w-full h-12"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Lock className="h-5 w-5 mr-2" />
            )}
            {isLoading ? 'Verificando...' : 'Acceder'}
          </Button>
        </div>
      </div>
    </div>
  );
}