import { useEffect, useState } from 'react';

/**
 * La app es 100% local: la UI es servida por el propio servidor Fastify embebido,
 * así que el estado de conexión a internet del sistema (navigator.onLine) NO aplica.
 * Se reporta siempre online para evitar falsos "offline" en LAN sin salida a internet.
 */
export function useIsOnline() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(true);
  }, []);

  return isOnline;
}
