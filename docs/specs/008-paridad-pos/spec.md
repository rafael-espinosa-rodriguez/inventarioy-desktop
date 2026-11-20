# Spec 008 — Paridad POS (Fase 1)

> **Estado: cerrado (2026-10-09)** — implementado; suite 41/41 en verde.

## 1. Contexto
Comparando con TuCuadre, InventarioY no tenía códigos de barras, fotos de producto,
descuentos por ítem, devoluciones/anulación de ventas, movimientos de caja del turno,
importación `.xlsx` ni exportación PDF de reportes.

## 2. Objetivo
Cerrar la paridad operativa del punto de venta sin romper la promesa 100% offline.

## 3. Alcance
- Dentro: SKU/código de barras (lector USB + cámara), fotos, descuento por ítem,
  devoluciones (reponer/merma por ítem), anulación con reposición, fondo/retiros/
  ingresos/propinas, importación `.xlsx`, exportación PDF.
- Fuera: compras/proveedores, conteo físico por sesión, multi-almacén en UI,
  contabilidad, tienda online.

## 4. Requisitos
- R1: Producto con `sku`, `barcode` y foto local; únicos por negocio.
- R2: Escaneo USB (teclado) y cámara (localhost/HTTPS) agregan al carrito.
- R3: Descuento/recargo por ítem con motivo; totales y ticket coherentes.
- R4: Devolución total/parcial con reposición o merma por ítem; auditoría.
- R5: Anulación con motivo; repone stock y excluye de totales/cierres.
- R6: Turno con fondo inicial, retiros, ingresos y propinas; cierre esperado correcto.
- R7: Importación `.xlsx` con las mismas validaciones que CSV.
- R8: PDF de ventas, cierres, inventario y kardex.

## 5. Criterios de aceptación
- CA1: Escanear un código agrega el producto correcto.
- CA2: Descuento por ítem reduce el total mostrado.
- CA3: Devolución repone stock y crea movimiento; sin reposición no cambia stock.
- CA4: Anulación repone stock, marca `voided_at` y registra auditoría.
- CA5: Movimientos de caja se guardan y el cierre refleja fondo/retiros/ingresos.
- CA6: `.xlsx` con 3 filas importa 3 productos.
- CA7: Suite completa en verde.

## Estado
`cerrado`
