import { useEffect, useState } from 'react';
import { AlertTriangle, KeyRound, LogOut, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function LicenseBanner() {
  const { user, logout, activateLicense, refreshLicense } = useAuthStore();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(15);
  const [showModal, setShowModal] = useState(false);
  const [key, setKey] = useState('');
  const [activating, setActivating] = useState(false);

  const status = user?.license?.status || 'trialing';
  const isExpired = status === 'expired';
  const isTrialing = status === 'trialing';

  // Refrescar estado de licencia periódicamente (detecta vencimiento en vivo)
  useEffect(() => {
    const timer = setInterval(() => {
      void refreshLicense();
    }, 60000);
    return () => clearInterval(timer);
  }, [refreshLicense]);

  // Si la licencia está vencida, forzar el modal de activación (modo solo-lectura)
  useEffect(() => {
    if (isExpired) {
      setShowModal(true);
    }
  }, [isExpired]);

  // Auto-cierre de sesión si vence sin activar.
  // Pausado mientras el modal de activación está abierto (para poder pegar la
  // clave con calma); al cerrar el modal el conteo se reinicia a 15s.
  useEffect(() => {
    if (!isExpired || showModal) return;
    setCountdown(15);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void logout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isExpired, showModal]);

  const handleActivate = async () => {
    if (!key.trim()) {
      toast.error('Ingrese la clave de activación');
      return;
    }
    setActivating(true);
    const res = await activateLicense(key);
    setActivating(false);
    if (res.success) {
      toast.success('Licencia activada correctamente');
      setShowModal(false);
      setKey('');
    } else {
      toast.error(res.error || 'Clave de activación inválida');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (!isExpired && !isTrialing) return null;

  return (
    <>
      {isTrialing && !isExpired && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-primary/90 text-bg px-4 py-2.5 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-medium">
                {user?.license?.daysRemaining && user.license.daysRemaining > 0
                  ? `Prueba gratis: quedan ${user.license.daysRemaining} día${user.license.daysRemaining === 1 ? '' : 's'}.`
                  : 'Prueba gratis de 7 días.'}{' '}
                Al vencer, active su licencia con su clave o coordine el pago mensual.
              </span>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-bg/20 hover:bg-bg/30 rounded-lg text-sm font-medium transition-colors"
            >
              <KeyRound className="h-4 w-4" />
              Activar licencia
            </button>
          </div>
        </div>
      )}

      {isExpired && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-danger text-white px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm font-medium">
                Su licencia de InventarioY está vencida. La app quedó en modo solo-lectura: no se pueden guardar cambios hasta renovar. Active su licencia o coordine el pago mensual con +53 54523884. Su sesión se cerrará en {countdown} segundos.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
              >
                <KeyRound className="h-4 w-4" />
                Activar
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text">Activar licencia</h2>
                <p className="text-sm text-text-secondary">
                  {user?.license?.status === 'trialing'
                    ? 'Active su licencia para seguir usando InventarioY sin límites.'
                    : 'Su período de prueba o licencia venció. Active su licencia para poder guardar cambios.'}
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-border/50 bg-bg/40 p-3 text-sm text-text-secondary">
              <p className="font-medium text-text">Su código de negocio</p>
              <p className="mt-1 text-xl font-bold tracking-widest text-primary">{user?.businessCode || user?.license?.businessCode || '—'}</p>
              <p className="mt-1 text-xs">
                Envíe este código al vendedor (+53 54523884) junto con el pago mensual de <strong>5,000 CUP</strong> para recibir su clave de activación.
              </p>
            </div>

            <label className="mb-1 block text-sm font-medium text-text">Clave de activación</label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
              placeholder="XXXXX XXXXX XXXXX XXXXX"
              autoFocus
              className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 placeholder:text-text-secondary/60"
            />

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:text-text transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={handleActivate}
                disabled={activating}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-bg transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                {activating ? 'Activando...' : 'Activar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
