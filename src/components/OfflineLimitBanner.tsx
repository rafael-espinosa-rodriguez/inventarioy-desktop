import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useIsOffline } from '../hooks/useOfflineDisabled';

interface OfflineLimitBannerProps {
  moduleName: string;
}

export default function OfflineLimitBanner({ moduleName }: OfflineLimitBannerProps) {
  const isOffline = useIsOffline();
  const dismissKey = `offline-limit-dismissed-${moduleName}`;
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(dismissKey) === 'true');

  const handleDismiss = () => {
    sessionStorage.setItem(dismissKey, 'true');
    setDismissed(true);
  };

  if (!isOffline || dismissed) return null;

  return (
    <div
      role="alert"
      className="mx-4 mb-3 flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning animate-in slide-in-from-top-2 duration-300"
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1">
        Algunas funciones de <strong>{moduleName}</strong> requieren conexión con el servidor local. Sus cambios se guardarán localmente hasta que se restablezca la conexión.
      </span>
      <button
        onClick={handleDismiss}
        aria-label="Cerrar aviso"
        className="rounded-full p-0.5 text-warning/70 hover:text-warning hover:bg-warning/10 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
