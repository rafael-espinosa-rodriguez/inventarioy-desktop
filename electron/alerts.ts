// Alertas locales (spec 006): lógica pura sobre la BD. Sin red, sin Electron,
// testeable en isolation. Usada por main.ts (Notification) y por el servidor
// (POST /api/alerts/status para la card del dashboard).
import type { DatabaseSync } from 'node:sqlite';

export type AlertKind = 'stock' | 'expiry' | 'license' | 'payroll';

export interface AlertItem {
  kind: AlertKind;
  title: string;
  detail: string;
  count: number;
  names: string[];
  link: string;
}

export interface AlertOptions {
  expiryDays: number;
  licenseDays: number;
}

export interface AlertsDigest {
  at: string;
  alerts: AlertItem[];
}

const MAX_NAMES = 5;

function rows(d: DatabaseSync, sql: string, params: any[] = []): any[] {
  try {
    return d.prepare(sql).all(...params) as any[];
  } catch {
    return [];
  }
}

function one(d: DatabaseSync, sql: string, params: any[] = []): any {
  try {
    return d.prepare(sql).get(...params) as any;
  } catch {
    return undefined;
  }
}

export function collectAlerts(d: DatabaseSync, opts: AlertOptions): AlertsDigest {
  const alerts: AlertItem[] = [];
  const expiryDays = Math.max(1, Math.floor(Number(opts.expiryDays) || 7));
  const licenseDays = Math.max(1, Math.floor(Number(opts.licenseDays) || 7));

  // Stock bajo ROP (agregado multi-almacén: SUM product_warehouse.quantity).
  const low = rows(
    d,
    `SELECT p.name AS name, COALESCE(SUM(pw.quantity), 0) AS stock
     FROM products p LEFT JOIN product_warehouse pw ON pw.product_id = p.id
     WHERE COALESCE(p.is_active, 1) != 0 AND p.rop > 0
     GROUP BY p.id HAVING stock <= p.rop ORDER BY stock ASC`
  );
  if (low.length) {
    alerts.push({
      kind: 'stock',
      title: 'Stock bajo el mínimo',
      detail: 'Productos en o bajo su punto de reorden (ROP)',
      count: low.length,
      names: low.slice(0, MAX_NAMES).map((r: any) => String(r.name)),
      link: '/dashboard/inventory',
    });
  }

  // Próximos a vencer (expiration_date YYYY-MM-DD).
  const exp = rows(
    d,
    `SELECT name, expiration_date AS exp FROM products
     WHERE COALESCE(is_active, 1) != 0
       AND expiration_date IS NOT NULL AND expiration_date != ''
       AND date(expiration_date) <= date('now', '+' || ? || ' days')
     ORDER BY date(expiration_date) ASC`,
    [expiryDays]
  );
  if (exp.length) {
    alerts.push({
      kind: 'expiry',
      title: `Por vencer (≤ ${expiryDays} días)`,
      detail: 'Revisa caducidades antes de vender',
      count: exp.length,
      names: exp.slice(0, MAX_NAMES).map((r: any) => `${r.name} (${r.exp})`),
      link: '/dashboard/inventory',
    });
  }

  // Licencia por vencer (réplica de license.ts: activa > trial > vencida).
  // Vencida no alerta: LicenseBanner ya la cubre.
  const sess = one(d, `SELECT trial_started_at, license_valid_until FROM user_session WHERE id = 'owner'`);
  if (sess) {
    const now = Date.now();
    let days = -1;
    if (sess.license_valid_until) {
      const v = new Date(sess.license_valid_until).getTime();
      if (Number.isFinite(v) && v > now) days = Math.ceil((v - now) / 86400000);
    } else if (sess.trial_started_at) {
      const end = new Date(sess.trial_started_at).getTime() + 7 * 86400000;
      if (Number.isFinite(end) && end > now) days = Math.ceil((end - now) / 86400000);
    }
    if (days >= 0 && days <= licenseDays) {
      alerts.push({
        kind: 'license',
        title: days === 0 ? 'La licencia vence hoy' : `Licencia vence en ${days} día(s)`,
        detail: 'Renueva tu clave para no interrumpir ventas',
        count: 1,
        names: [],
        link: '/dashboard/settings',
      });
    }
  }

  // Nómina en borrador del período más reciente.
  const period = one(
    d,
    `SELECT month, year FROM payroll_periods WHERE status = 'draft' ORDER BY year DESC, month DESC LIMIT 1`
  );
  if (period?.month && period?.year) {
    alerts.push({
      kind: 'payroll',
      title: `Nómina ${String(period.month).padStart(2, '0')}/${period.year} en borrador`,
      detail: 'Aplica la nómina del período en RRHH',
      count: 1,
      names: [],
      link: '/dashboard/hr',
    });
  }

  return { at: new Date().toISOString(), alerts };
}

// Firma anti-spam: cambia solo si cambian los conteos por categoría.
export function digestSignature(digest: AlertsDigest): string {
  return digest.alerts.map((a) => `${a.kind}:${a.count}`).join('|');
}
