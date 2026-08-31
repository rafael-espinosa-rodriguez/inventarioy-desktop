import { useIsOnline } from './useIsOnline';
import { useEffect, useState } from 'react';

/**
 * La app es 100% local: nunca está "offline" desde el punto de vista del servidor local.
 * El flag de internet del sistema (navigator.onLine) no aplica, por lo que estas
 * funciones reportan siempre online.
 */
export function useIsOffline(): boolean {
  const isOnline = useIsOnline();
  return !isOnline;
}

/**
 * Hook que retorna { disabled, message } para acciones que requieren el servidor local.
 * Siempre devuelve disabled=false porque el servidor local es la propia app.
 */
export function useOfflineAction(actionName: string = 'esta acción') {
  const isOffline = useIsOffline();
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (isOffline) {
      setShowHint(true);
    } else {
      setShowHint(false);
    }
  }, [isOffline]);

  return {
    disabled: false,
    message: undefined,
    showHint: false,
    setShowHint,
  };
}
