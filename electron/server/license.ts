// Licencia desktop (InventarioY) — validación de claves de activación
// Esquema: las claves las genera el vendedor con scripts/generar-licencia.mjs
// usando la clave PRIVADA ed25519 (nunca distribuida). La app solo conoce la
// clave PÚBLICA embebida aquí, por lo que un cliente no puede auto-generarse
// licencias extrayendo el binario.
import { verify as edVerify, sign as edSign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Par clave ed25519: generar con `node scripts/generar-claves.mjs`.
// Clave pública PEM (solo verificación; no permite firmar).
export const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi20PSGp0rbgyJC0pPWBq7foIsiKtZ1JKdosi1lOQYwQ=
-----END PUBLIC KEY-----`;

export type LicenseStatus = 'trialing' | 'active' | 'expired';

export interface LicenseState {
  status: LicenseStatus;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  validUntil: string | null;
  daysRemaining: number;
}

export const TRIAL_DAYS = 7;

// ---------- Generación de claves (herramienta de desarrollador) ----------
// Replica scripts/generar-licencia.mjs dentro del servidor. Solo la máquina del
// vendedor tiene la clave PRIVADA ed25519, así que estas funciones devuelven
// null/undefined cuando no hay clave y el servidor responde 403.

/**
 * Localiza y carga la clave PRIVADA ed25519. Orden de resolución:
 *   1. env INVENTARIOY_LICENSE_PRIVATE_KEY (contenido PEM completo)
 *   2. <dataDir>/license-private.pem (dir de datos de la app)
 *   3. <appPath>/scripts/license-private.pem (repo del vendedor)
 * Devuelve el PEM o null si no existe.
 */
export function loadPrivateKey(dataDir: string, appPath?: string): string | null {
  const envKey = process.env.INVENTARIOY_LICENSE_PRIVATE_KEY;
  if (envKey && envKey.includes('PRIVATE KEY')) return envKey.trim();
  const candidates = [
    path.join(dataDir, 'license-private.pem'),
    ...(appPath ? [path.join(appPath, 'scripts', 'license-private.pem')] : []),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      return fs.readFileSync(file, 'utf8');
    } catch {
      /* intentar el siguiente candidato */
    }
  }
  return null;
}

/**
 * Calcula la fecha de vencimiento de una licencia.
 * - Si se pasa `until` (ISO YYYY-MM-DD o fecha completa) se usa esa fecha a las 23:59:59.
 * - Si no, se suman `months` * 30 días desde ahora (1 por defecto).
 * Devuelve ISO string o null si la fecha es inválida.
 */
export function computeValidUntil(months?: number, until?: string): string | null {
  let validUntil: Date;
  if (until && String(until).trim()) {
    validUntil = new Date(`${String(until).trim()}T23:59:59`);
  } else {
    const ms = (months && months > 0 ? months : 1) * 30 * 24 * 60 * 60 * 1000;
    validUntil = new Date(Date.now() + ms);
  }
  if (Number.isNaN(validUntil.getTime())) return null;
  return validUntil.toISOString();
}

/**
 * Firma una clave de activación con la clave privada.
 * Formato: base64url(JSON.stringify({ code, validUntil })) + '.' + base64url(signature).
 */
export function generateLicenseKey(code: string, validUntilISO: string, privPem: string): string {
  const payload = JSON.stringify({ code, validUntil: validUntilISO });
  const signature = edSign(null, Buffer.from(payload, 'utf8'), privPem);
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${signature.toString('base64url')}`;
}

/**
 * Formato legible en grupos de 5 caracteres separados por espacios.
 * NOTA: no usar guiones: base64url incluye '-' como carácter válido y rompería la verificación.
 */
export function formatLicenseKey(key: string): string {
  const groups = key.match(/.{1,5}/g) || [];
  return groups.join(' ');
}

export function getTrialEnd(startedAt: string): string {
  return new Date(new Date(startedAt).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Verifica la firma ed25519 de una clave de activación.
 * La clave tiene el formato: base64url(payload).base64url(signature)
 * donde payload = JSON.stringify({ code, validUntil }).
 * base64url usa '-' y '_' como caracteres válidos, por lo que la
 * normalización solo elimina espacios (los guiones de agrupación
 * legibles ya no se usan: se agrupa con espacios, también ignorados).
 */
export function verifyLicenseKey(key: string, expectedCode: string): { ok: boolean; validUntil?: string; error?: string } {
  const normalized = key.replace(/\s/g, '');
  const dot = normalized.indexOf('.');
  if (dot <= 0 || dot >= normalized.length - 1) {
    return { ok: false, error: 'Formato de clave inválido' };
  }
  const payloadB64 = normalized.slice(0, dot);
  const sigB64 = normalized.slice(dot + 1);
  let payloadJson: string;
  let signature: Buffer;
  try {
    payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    signature = Buffer.from(sigB64, 'base64url');
  } catch {
    return { ok: false, error: 'Formato de clave inválido' };
  }
  let payload: { code?: string; validUntil?: string };
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { ok: false, error: 'Formato de clave inválido' };
  }
  if (!payload.code || !payload.validUntil) {
    return { ok: false, error: 'Clave incompleta' };
  }
  if (payload.code !== expectedCode) {
    return { ok: false, error: 'La clave no corresponde a este negocio' };
  }
  const valid = edVerify(
    null,
    Buffer.from(payloadJson, 'utf8'),
    LICENSE_PUBLIC_KEY,
    signature
  );
  if (!valid) {
    return { ok: false, error: 'Clave de activación inválida' };
  }
  const validUntil = new Date(payload.validUntil);
  if (Number.isNaN(validUntil.getTime())) {
    return { ok: false, error: 'Clave con fecha de vencimiento inválida' };
  }
  return { ok: true, validUntil: validUntil.toISOString() };
}

// ---------- Restablecimiento de PIN (herramienta del vendedor) ----------
// El vendedor genera una clave firmada de un solo uso (válida 24h) con
// `generatePinResetKey`. El cliente la introduce junto con su Código de
// Negocio y un PIN nuevo en la pantalla de inicio de sesión. El servidor
// verifica la firma ed25519, comprueba que no se haya usado ya (tabla
// `pin_reset_used`) y actualiza el PIN del dueño. El cliente no puede
// auto-generarse estas claves porque solo conoce la clave pública.

export const PIN_RESET_TTL_MS = 24 * 60 * 60 * 1000;
export const PIN_RESET_KIND = 'pin-reset';

export interface PinResetKeyResult {
  key: string;
  expiresAt: string;
}

/**
 * Firma una clave de restablecimiento de PIN.
 * Formato: base64url(JSON.stringify({ kind, code, expiresAt })) + '.' + base64url(signature).
 */
export function generatePinResetKey(code: string, privPem: string): PinResetKeyResult {
  const expiresAt = new Date(Date.now() + PIN_RESET_TTL_MS).toISOString();
  const payload = JSON.stringify({ kind: PIN_RESET_KIND, code, expiresAt });
  const signature = edSign(null, Buffer.from(payload, 'utf8'), privPem);
  const key = `${Buffer.from(payload, 'utf8').toString('base64url')}.${signature.toString('base64url')}`;
  return { key, expiresAt };
}

/**
 * Verifica la firma de una clave de restablecimiento de PIN.
 * El Código de Negocio se compara sin distinguir mayúsculas (el cliente puede
 * teclearlo en minúsculas).
 */
export function verifyPinResetKey(
  key: string,
  expectedCode: string
): { ok: boolean; error?: string } {
  const normalized = key.replace(/\s/g, '');
  const dot = normalized.indexOf('.');
  if (dot <= 0 || dot >= normalized.length - 1) {
    return { ok: false, error: 'Formato de clave inválido' };
  }
  const payloadB64 = normalized.slice(0, dot);
  const sigB64 = normalized.slice(dot + 1);
  let payloadJson: string;
  let signature: Buffer;
  try {
    payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    signature = Buffer.from(sigB64, 'base64url');
  } catch {
    return { ok: false, error: 'Formato de clave inválido' };
  }
  let payload: { kind?: string; code?: string; expiresAt?: string };
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { ok: false, error: 'Formato de clave inválido' };
  }
  if (payload.kind !== PIN_RESET_KIND) {
    return { ok: false, error: 'Clave de restablecimiento inválida' };
  }
  if (String(payload.code ?? '').toUpperCase() !== String(expectedCode ?? '').toUpperCase()) {
    return { ok: false, error: 'La clave no corresponde a este negocio' };
  }
  const valid = edVerify(null, Buffer.from(payloadJson, 'utf8'), LICENSE_PUBLIC_KEY, signature);
  if (!valid) {
    return { ok: false, error: 'Clave de restablecimiento inválida' };
  }
  const expiresAt = new Date(payload.expiresAt ?? '');
  if (Number.isNaN(expiresAt.getTime())) {
    return { ok: false, error: 'Clave con fecha de vencimiento inválida' };
  }
  if (Date.now() > expiresAt.getTime()) {
    return { ok: false, error: 'La clave de restablecimiento venció. Solicite una nueva' };
  }
  return { ok: true };
}

export interface SessionRow {
  id?: string;
  business_code?: string;
  trial_started_at?: string | null;
  license_key?: string | null;
  license_valid_until?: string | null;
  license_activated_at?: string | null;
  subscriptionActive?: number;
  subscriptionPlan?: string;
  created_at?: string;
}

/**
 * Calcula el estado de licencia actual del negocio.
 * - Si hay una licencia activa (validUntil > now) → active
 * - Si no, y el trial aún no venció → trialing
 * - De lo contrario → expired
/**
 * Regla anti-manipulación de reloj: si `maxSeenTime` (settings) existe y `now`
 * retrocede más de un día respecto a él, se considera expired.
 * Se evalúa DESPUÉS de la licencia activa para que un retroceso de reloj no
 * invalide una licencia pagada vigente.
 *
 * Riesgos aceptados (limitación inherente a la licencia offline):
 * - El cliente posee el SQLite local y puede editar trial_started_at,
 *   license_valid_until y maxSeenTime directamente; ed25519 solo protege la
 *   generación de claves, no el estado almacenado.
 * - Retrocesos de reloj de menos de 24h permiten extender el trial.
 * Ambos se consideran disuasión, no cifrado.
 */
export function getLicenseState(
  session: SessionRow | undefined,
  maxSeenTime: string | null
): LicenseState {
  const now = Date.now();

  // Licencia activa (prioridad máxima: un cliente pagado nunca queda vencido
  // por un cambio de reloj)
  if (session?.license_valid_until) {
    const validUntil = new Date(session.license_valid_until).getTime();
    if (Number.isFinite(validUntil) && validUntil > now) {
      const daysRemaining = Math.max(1, Math.ceil((validUntil - now) / (24 * 60 * 60 * 1000)));
      return {
        status: 'active',
        trialStartedAt: session.trial_started_at || null,
        trialEndsAt: session.trial_started_at ? getTrialEnd(session.trial_started_at) : null,
        validUntil: session.license_valid_until,
        daysRemaining,
      };
    }
  }

  // Anti-manipulación de reloj (solo aplica sin licencia activa)
  if (maxSeenTime) {
    const max = new Date(maxSeenTime).getTime();
    if (Number.isFinite(max) && now < max - 24 * 60 * 60 * 1000) {
      return {
        status: 'expired',
        trialStartedAt: session?.trial_started_at || null,
        trialEndsAt: session?.trial_started_at ? getTrialEnd(session.trial_started_at) : null,
        validUntil: session?.license_valid_until || null,
        daysRemaining: 0,
      };
    }
  }

  // Trial vigente
  if (session?.trial_started_at) {
    const trialEnd = getTrialEnd(session.trial_started_at);
    const trialEndMs = new Date(trialEnd).getTime();
    if (Number.isFinite(trialEndMs) && trialEndMs > now) {
      const daysRemaining = Math.max(1, Math.ceil((trialEndMs - now) / (24 * 60 * 60 * 1000)));
      return {
        status: 'trialing',
        trialStartedAt: session.trial_started_at,
        trialEndsAt: trialEnd,
        validUntil: null,
        daysRemaining,
      };
    }
  }

  // Sin trial ni licencia (setup no completado) o vencido
  return {
    status: 'expired',
    trialStartedAt: session?.trial_started_at || null,
    trialEndsAt: session?.trial_started_at ? getTrialEnd(session.trial_started_at) : null,
    validUntil: session?.license_valid_until || null,
    daysRemaining: 0,
  };
}
