// Servidor Fastify local de InventarioY sobre una base de datos TEMPORAL.
// Recrea la BD en cada arranque y siembra un negocio de prueba en modo trial.
// El front lo sirve Vite (npm run dev), que proxya /api a este puerto (4173).
// Uso: node --import tsx scripts/start-test-server.mjs
import os from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';

const E2E_DIR = path.join(os.tmpdir(), 'inventarioy-e2e');
rmSync(E2E_DIR, { recursive: true, force: true });

const { initDatabase } = await import('../electron/db/index.ts');
const { createServer } = await import('../electron/server/index.ts');

const db = initDatabase(E2E_DIR);

const now = new Date().toISOString();
db.prepare(
  `
  INSERT INTO user_session (
    id, email, name, businessName, role, phone, address, businessHours,
    subscriptionActive, subscriptionPlan, ticketMessage,
    usdEnabled, usdRate, eurEnabled, eurRate, cupTransferEnabled,
    business_code, trial_started_at, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
).run(
  'owner',
  'owner@inventarioy.local',
  'Dueño E2E',
  'Negocio E2E',
  'owner',
  '',
  '',
  '',
  1,
  'desktop',
  '¡Gracias por su visita!',
  0,
  0,
  0,
  0,
  0,
  'E2ETEST',
  now,
  now
);

const server = await createServer({
  port: 4173,
  host: '127.0.0.1',
  documentsDir: path.join(E2E_DIR, 'documents'),
});

await server.listen({ port: 4173, host: '127.0.0.1' });
console.log(`[e2e] Fastify temporal listo en http://127.0.0.1:4173`);
console.log(`[e2e] BD temporal: ${path.join(E2E_DIR, 'inventarioy.db')}`);
