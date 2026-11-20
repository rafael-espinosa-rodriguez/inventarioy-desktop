# Plan 008 — Paridad POS

## 1. Datos (migración 17)
`products.sku/barcode/photo_path`; `sale_items.discount/discount_reason`;
`sales.voided_at/void_reason/voided_by`; tablas `sale_returns`, `sale_return_items`
(con `restock`), `cash_movements`; `daily_closings.opening_cash/withdrawals/tips`.

## 2. Backend
- RPC `void_sale`: transacción (repone stock/ingredientes, marca anulada, audita).
- RPC `sale_return`: transacción (valida cantidades, repone o merma, audita).
- `sale` inserta descuentos por ítem; `menu-data` expone foto y SKU.
- Nuevas tablas registradas en `TABLE_MODULES`.

## 3. Frontend
- Inventario: SKU, código, foto comprimida (storage local).
- Ventas: buffer de lector USB, cámara (zxing), búsqueda por código, descuento por
  ítem, devoluciones/anulación desde el cierre, fondo/retiros/ingresos/propinas.
- Importación: `.xlsx` con SheetJS reutilizando el parser.
- PDF: `exportReportPdf` (impresión del sistema) en ventas, cierres, inventario y kardex.

## 4. Pruebas
`tests/pos-parity.spec.ts`: escaneo + descuento, devolución con/sin reposición y tope,
anulación, movimientos de caja, importación `.xlsx`. Suite completa.

## Estado
`cerrado`
