# Plan 006 — Alertas y notificaciones locales

Referencia `spec.md` (R1-R5, CA1-CA5).

## 1. Decisiones
- D1: Evaluación en main process con `Notification` de Electron (nativo, sin
  deps). El renderer solo muestra el centro de alertas.
- D2: Datos vía consultas directas a la BD en main (`getDb()` ya disponible) —
  no se usa el servidor HTTP para auto-consumo.
- D3: Estado "último aviso" en `settings` (`alert_last_digest`) para no spamear.
- D4: Card en `StockView` (home del dueño) reutilizando estilos de sección;
  enlaces con `Link` a rutas existentes.

## 2. Archivos
| Acción | Ruta | Detalle |
|---|---|---|
| modificar | `electron/main.ts` | `checkAlerts()` + `Notification` + `setInterval` 60 min + chequeo al arrancar. |
| crear | `electron/alerts.ts` | Lógica pura y testeable: `collectAlerts(db, settings)` → lista tipada. |
| modificar | `src/pages/dashboard/StockView.tsx` | Card "Alertas" con las 4 categorías + enlaces. |
| modificar | `src/pages/dashboard/SettingsView.tsx` | Umbrales (`alert_expiry_days`, `alert_license_days`, `alerts_enabled`). |

## 3. Datos
- Solo lectura + claves en `settings` (`alert_expiry_days` def 7,
  `alert_license_days` def 7, `alerts_enabled` def true, `alert_last_digest`).
- Sin migraciones de schema.

## 4. Estrategia UI
Card compacta al tope de StockView (colapsable): conteos por categoría, clic
lleva a la vista correspondiente. En Ajustes: 2 números + 1 switch.

## 5. Verificación
- `lint` + `electron:build` + `build`.
- Script temporal: BD semilla (1 bajo ROP, 1 por vencer, licencia a 5 días) →
  `collectAlerts` devuelve 3 categorías; con `alerts_enabled=false` → 0.

## 6. Rollback
Revert del commit (solo lectura de BD + settings nuevas; sin cambios de schema).
