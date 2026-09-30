# Tasks 002 — Respaldo y restauración

- [x] T1: `electron/db/index.ts` — generalizar backup a carpeta configurable
  (`backupNow(kind)`), `restoreDatabase(file)` con copia pre-restore,
  `listBackups()`, settings `backup_*`. Mantener `backupDatabase()` intacto.
  Done cuando: `lint` pasa.
- [x] T2: `electron/server/index.ts` — `GET /api/backup/status` (público),
  `POST /api/backup/now` y `POST /api/backup/restore` (con token). Done cuando:
  `lint` pasa.
- [x] T3: `electron/preload.ts` + `electron/main.ts` — `selectFolder` vía
  `dialog.showOpenDialog`; scheduler por intervalo en main + respaldo al salir
  (`will-quit`). Done cuando: `electron:build` (`tsc -p electron/tsconfig.json`) pasa.
- [x] T4: `src/lib/db/localClient.ts` (`localDb.backup`) + `SettingsView`
  sección "Respaldo" (owner-only por ruta) + hook en `createDailyClosing`
  (fire-and-forget). Done cuando: `lint` pasa.
- [x] T5: `npm run lint` + `npm run build` en verde + grep cero deps nuevas.
- [x] T6: prueba funcional en BD temporal (init, insert, backup manual,
  restore, asserts) sin tocar datos reales. Done cuando: script pasa.

