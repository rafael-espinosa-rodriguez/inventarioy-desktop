// Realtime (Postgres changes) no aplica en la versión desktop local:
// hay un solo usuario y una sola base de datos local (Fastify + SQLite),
// por lo que no hay cambios remotos que suscribir.
import { logger } from './logger';

let _subscribedUserId: string | null = null;

export function startRealtimeSync() {
  logger.info('[Realtime] no disponible en versión desktop local');
}

export function stopRealtimeSync() {
  // No-op: no hay canal realtime abierto.
}

export function setRealtimeUserId(userId: string | null) {
  _subscribedUserId = userId;
}
