# Tasks 006 — Alertas y notificaciones locales

- [x] T1: `electron/alerts.ts` (`collectAlerts` pura y testeable) + `main.ts`
  (`Notification`, intervalo 60 min, chequeo al arrancar, anti-spam por firma)
  + helpers settings en `db/index.ts`. Done: `electron:build` pasa.
- [x] T2: `SettingsView` sección "Alertas" (switch + 2 umbrales). Done: `lint`.
- [x] T3: `POST /api/alerts/status` + `localDb.alerts` + card en `StockView`
  con enlaces. Done: `lint`.
- [x] T4: `lint` + `electron:build` + `build`; temporal: seed (1 bajo ROP,
  1 por vencer, licencia a 5 días) → 3 categorías; `alerts_enabled=false` → 0.
  Done: todo pasa.

