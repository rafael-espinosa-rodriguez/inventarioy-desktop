# Plan 003 — Facturación (comprobantes) + reporte mensual ONAT

Referencia `spec.md` (R1-R6, CA1-CA6).

## 1. Decisiones
- D1: Migración 14 aditiva (`invoices`, `invoice_items`); sin tocar `sales`.
- D2: Endpoints dedicados (no RPC genérica): claridad + validación de folio.
- D3: Folio en transacción SQLite (`transaction()` existente en db layer).
- D4: Impresión = variante de `printTicket` (`TicketView.tsx:173`) con parámetro
  de ancho (58/80mm vs A5); mismo `window.open + document.write`.
- D5: Reporte ONAT = agregación servidor + `exportToExcel` cliente (patrón usado
  en 8 vistas).
- D6: Roles: módulo `invoices` en `ROLE_MODULES`/`MODULE_ROLES`/`MODULE_BY_PATH`
  para owner/economist/admin; enlace en sidebar junto a Ventas.

## 2. Archivos
| Acción | Ruta | Detalle |
|---|---|---|
| modificar | `electron/db/schema.ts` | Migración 14: `invoices`, `invoice_items`, índices. |
| modificar | `electron/server/index.ts` | `GET /api/invoices`, `POST /api/invoices`, `POST /api/invoices/from-sale`, `POST /api/invoices/:id/void`, `GET /api/invoices/report`. |
| modificar | `src/store/dbStore.ts` | Interfaces `Invoice/InvoiceItem` + métodos (grep, no leer completo). |
| crear | `src/pages/dashboard/InvoicesView.tsx` | Listado + filtros + crear manual + anular + imprimir + reporte. |
| modificar | `src/pages/dashboard/SalesView.tsx` | Botón "Facturar" post-venta (llama from-sale). |
| modificar | `src/pages/dashboard/TicketView.tsx` | `printTicket` con variante factura/A5. |
| modificar | router + sidebar + `MODULE_ROLES` | Ruta `/invoices`, módulo `invoices`. |

## 3. Datos
- `invoices(id, user_id, folio_year, folio_seq, client_name, sale_id?, date,
  subtotal, discount, tax_rate, tax_amount, total, payment_method, efectivo,
  transferencia, usd, eur, status, void_reason?, created_at)`,
  `UNIQUE(user_id, folio_year, folio_seq)`.
- `invoice_items(id, invoice_id, description, quantity, price, subtotal)`.

## 4. Estrategia UI
Vista con tabla + filtros (mes/estado/cliente), modal crear-manual (cliente +
líneas libres), modal motivo al anular, botón imprimir por fila, botón
"Reporte ONAT del mes" (Excel). Botón "Facturar" en resumen de venta
(deshabilitado si la venta ya tiene factura: lookup por `sale_id`).

## 5. Verificación
- `lint` + `build`; script temporal: 20 from-sale concurrentes → folios únicos;
  void → estado + log; reporte cuadra con `sales` del mes.
- Grep: módulo visible solo a roles permitidos; cero deps nuevas.

## 6. Rollback
Revert del commit (migración aditiva: `DROP TABLE invoice_items, invoices` si se
desea limpiar; no afecta datos existentes).
