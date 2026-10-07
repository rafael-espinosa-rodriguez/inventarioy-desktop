# Spec 003 — Facturación (comprobantes) + reporte mensual ONAT

## 1. Contexto
Propuesta P2 del reporte de mejoras (prioridad Alta) + P10 (botón facturar en
POS, absorbido aquí). La ONAT exige comprobantes y resúmenes; hoy solo hay
ticket sin folio ni validez documental. La nómina cubana ya existe: la factura
cierra el círculo fiscal.

## 2. Objetivo
Emitir comprobantes con folio secuencial anual desde una venta, anularlos con
auditoría, imprimirlos (térmico 58/80 y hoja A5) y exportar el resumen mensual
para ONAT. Todo offline.

## 3. Alcance
- Dentro:
  - R1: Tablas `invoices` + `invoice_items` (folio_year + folio_seq únicos por
    negocio/año, cliente, desglose de pago espejo de `sales`, impuestos
    opcionales, estado emitida/anulada, `sale_id` opcional).
  - R2: Folio atómico en servidor (transacción MAX+1 por año; formato
    `CR-AAAA-NNNNNN` solo display).
  - R3: Crear solo desde venta (`POST /api/invoices/from-sale`); listar
    (`GET /api/invoices` con filtros).
  - R4: Anular con motivo + registro en `action_logs` (no borrado físico).
  - R5: Vista `InvoicesView` (ruta `/invoices`, módulo `invoices`, roles
    owner/economist/admin) + botón "Facturar" post-venta en `SalesView`.
  - R6: Impresión reutilizando patrón `printTicket` (térmico + A5) y reporte
    mensual ONAT con `exportToExcel`.
- Fuera (no-alcance explícito):
  - Factura electrónica / envío online a ONAT (no existe canal offline).
  - Firma digital del comprobante.
  - Creación manual de facturas (eliminada 2026-10-06: la vía manual duplicaba
    el registro de ingresos del POS y el campo "Impuesto %" inducía a error;
    la única vía es desde venta, que ya descontó stock).

## 4. Requisitos
- R1-R6 según alcance.

## 5. Criterios de aceptación
- CA1 (R2): 20 creaciones concurrentes → 20 folios únicos y secuenciales.
- CA2 (R3): factura desde venta replica ítems e importes exactos.
- CA3 (R4): anulada conserva fila + motivo + log; no reaparece como emitida.
- CA4 (R5): supervisor/clerk no ven `/invoices` (MODULE_ROLES).
- CA5 (R6): impresión térmica y A5 renderizan; Excel mensual cuadra con ventas.
- CA6: `lint` + `build` verdes; sin dependencias nuevas.

## 6. Supuestos y riesgos
- Supuesto: formato CR-AAAA-NNNNNN es convención interna, no norma ONAT.
- Riesgo: doble folio por doble clic → mitigación: transacción + botón con
  estado `emitiendo`.

## Estado
`cerrado` (2026-09-30: lint + electron:build + build verdes, funcional 17/17 en servidor temporal)
`enmienda 2026-10-06`: eliminada la creación manual (`POST /api/invoices`,
modal y campo impuesto) — única vía: desde venta. Tests 003 reescritos
(folios/void/clerk vía from-sale). Motivo: redundancia con el POS.
