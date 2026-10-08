# Tasks 003 — Facturación + reporte ONAT

> **Estado: ELIMINADO (2026-10-07)** — módulo retirado; migración 16 revierte
> 14/15 (DROP tablas + roles + action_logs). Tareas siguientes canceladas.

- [x] T1: migración 14 (tablas) ✓ + migración 15 (módulo `invoices` en filas
  owner/economist/admin vía JSON1) + `LEGACY_ROLE_MODULES`. Done: electron:build.
- [x] T2: endpoints (list/create/from-sale/void/report), folio atómico en
  transacción, void con `action_logs`. Done: electron:build.
- [x] T3: `ROLE_MODULES`/`MODULE_ROLES`/`MODULE_BY_PATH` + interfaces y métodos
  en `dbStore` + `localDb.invoice`. Done: lint.
- [x] T4: `InvoicesView` + ruta + sidebar. Done: lint + abre autenticado.
- [x] T5: botón "Facturar" en `SalesView` + variante factura en `printTicket`.
  Done: lint.
- [x] T6: lint + build; temporal: 20 from-sale → folios únicos; void audita;
  reporte cuadra con `sales`. Done: todo pasa.

