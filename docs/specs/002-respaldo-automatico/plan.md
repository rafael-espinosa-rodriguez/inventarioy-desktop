# Plan 002 — Respaldo y restauración (automático + manual)

Referencia `spec.md` (R1-R5, CA1-CA6).

## 1. Decisiones
- D1: Reutilizar y extender la rotación existente en `electron/db/index.ts`
  (checkpoint WAL + copia física) en vez de reinventarla.
- D2: RPC nuevas en `electron/server/index.ts` (`backup_now`, `restore_backup`,
  y lectura de estado vía `settings` existente) — el renderer solo habla vía `localDb`.
- D3: Diálogo de carpeta nativo vía `dialog.showOpenDialog` en `electron/main.ts`
  expuesto por `preload.ts` (cero dependencias nuevas).
- D4: Programador con timers del proceso main (sin red, sin cron externo);
  dispara al cerrar caja (hook en flujo de cierre) y por intervalo configurable.
- D5: Config en `settings` (clave/valor): `backup_dir`, `backup_interval_h`,
  `backup_keep_n`, `backup_last_at`, `backup_last_error`.

## 2. Archivos
| Acción | Ruta | Detalle |
|---|---|---|
| modificar | `electron/db/index.ts` | Generalizar backup/rotación a carpeta configurable + restore con copia previa. |
| modificar | `electron/server/index.ts` | RPC `backup_now`, `restore_backup`, estado. |
| modificar | `electron/main.ts`, `electron/preload.ts` | Diálogo de carpeta + scheduler. |
| modificar | `src/pages/dashboard/SettingsView.tsx` | Sección "Respaldo" (solo roles con acceso a Ajustes). |
| crear | `docs/specs/002-respaldo-automatico/tasks.md` | En fase implement. |

## 3. Datos
- Sin migraciones de schema (config en `settings`, archivos `.db` en disco).
- Formato: `inventarioy-manual-<ts>.db`, `inventarioy-auto-<ts>.db`,
  `inventarioy-pre-restore-<ts>.db`.

## 4. Estrategia UI
Sección compacta en Ajustes: estado (último respaldo/error), carpeta
(seleccionar), intervalo, conservar N, botón "Respaldar ahora", botón
"Restaurar…" (doble confirmación). Textos en español, sin tecnicismos.

## 5. Verificación
- `npm run lint` + `npm run build`.
- E2E/manual contra BD temporal: CA1-CA5 con archivos reales; CA6 sin tocar
  la BD real del negocio (usar `start-test-server.mjs` como base).
- Grep: cero dependencias nuevas en `package.json`.

## 6. Rollback
Revert del commit; las copias `.db` generadas son archivos sueltos y no afectan
el schema (borrado manual si se desea).
