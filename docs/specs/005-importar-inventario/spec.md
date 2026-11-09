# Spec 005 — Importar inventario desde Excel/CSV

> **Estado: cerrado (2026-10-08)** — implementado y verificado (suite 20/20).
> **Nota (2026-10-09):** se retiró la opción de pegar celdas (spec 006); la carga es solo por archivo CSV/TSV.

## 1. Contexto
Hoy el alta de productos es uno por uno (`InventoryView` → `addProduct`). Un negocio
que ya tiene su inventario en una hoja de Excel debe teclear decenas o cientos de
productos la primera vez, lo que frena la adopción y aumenta los errores. El dueño
pidió poder cargar el inventario completo de una vez, desde Excel o pegando celdas,
sin salir del modo 100% local.

## 2. Objetivo
Permitir cargar el inventario inicial en bloque desde un archivo CSV/TSV (o pegando
celdas de Excel), con vista previa validada, omisión de duplicados y reporte de
errores, sin dependencias de red ni librerías externas.

## 3. Alcance
- Dentro:
  - Botón **Importar inventario** en `InventoryView`.
  - Plantilla CSV descargable (separador `;`, BOM UTF-8, filas de ejemplo).
  - Carga de archivo `.csv/.tsv/.txt` o pegado de texto (TSV de Excel).
  - Vista previa con validación por fila (válidas / errores / duplicadas).
  - Importación transaccional por lotes, con movimiento `ENTRADA` de stock inicial
    y filas de `product_warehouse` por almacén.
  - Reporte final y descarga de errores en CSV.
  - Actualización de manual (nueva sección + FAQ), landing (bullet + FAQ).
- Fuera (no-alcance):
  - Lectura directa de `.xlsx` (no se añade SheetJS).
  - Actualización/mezcla de productos existentes (solo omitir y reportar).
  - Importación de ventas, movimientos históricos, recetas o empleados.
  - Importación desde otra instalación de InventarioY.

## 4. Requisitos
- R1: El botón solo aparece para roles con acceso a Inventario (owner/economist/admin).
- R2: Debe ofrecerse plantilla CSV con las columnas soportadas y ejemplos.
- R3: Debe aceptarse archivo CSV/TSV y texto pegado; separador `;`, `,` o tabulador
  autodetectado; comillas, BOM y CRLF soportados; codificación UTF-8 o Windows-1252.
- R4: Columnas: Nombre (obligatoria), Categoría, Unidad, Cantidad, Costo, Precio,
  ROP, EOQ, Vencimiento, Descripción, Individual, Gasto variable, Consumo directo.
  Cabeceras sin distinción de mayúsculas/acentos y con alias en español.
- R5: Números con coma decimal; booleanos `sí/no`, `1/0`, `x`, `true/false`;
  fechas `AAAA-MM-DD`, `DD/MM/AAAA` o `DD-MM-AAAA`.
- R6: Filas inválidas no bloquean la importación: se reportan con nº de fila y motivo.
- R7: Productos con nombre ya existente (sin distinguir mayúsculas/acentos) se omiten
  y se reportan; tampoco se duplican dentro del mismo archivo.
- R8: Si `cantidad > 0` se crea movimiento `ENTRADA` con motivo
  "Stock inicial (Importación)" y fila de almacén principal; los demás almacenes
  quedan en 0.
- R9: La escritura va por `localDb.batch` en lotes de 100 productos; si un lote falla
  se detiene y se informa lo ya importado (sin dejar lotes a medias).
- R10: Se registra un único `action_log` (`inventory` / `IMPORTAR`) con el resumen.
- R11: Licencia vencida bloquea la importación con mensaje claro (código
  `LICENSE_EXPIRED` del servidor).
- R12: Máximo 2 000 filas por importación.

## 5. Criterios de aceptación
- CA1 (R2/R4): Descargar la plantilla produce un CSV con cabecera completa y 3 ejemplos.
- CA2 (R3/R5): Un CSV con `;` y comas decimales se parsea correctamente; un TSV
  pegado también.
- CA3 (R6/R7): Con 3 filas válidas, 1 duplicada y 1 con unidad inválida, la vista
  previa muestra 3 válidas, 1 duplicada y 1 error con su motivo.
- CA4 (R8): Tras importar 3 productos con cantidad, existen 3 movimientos `ENTRADA`
  "Stock inicial (Importación)" y 3 filas en `product_warehouse` del almacén principal.
- CA5 (R9/R10): Un error de servidor en un lote devuelve mensaje con los importados
  hasta ese punto y no deja filas huérfanas.
- CA6 (R11): Con licencia vencida la importación falla con mensaje de activación.
- CA7 (R12): Más de 2 000 filas se rechaza antes de escribir.
- CA8: `npm run lint`, `npm run build`, `electron:build` y suite e2e completa en verde.

## 6. Supuestos y riesgos
- Supuesto: el usuario puede guardar desde Excel como CSV o copiar celdas.
- Riesgo: ambigüedad de separadores decimales → se documenta coma decimal y se
  ignoran separadores de miles; los tests cubren el caso.
- Riesgo: importaciones grandes → lotes de 100 y límite de 2 000 filas.
- Riesgo: el grid de la landing pasa a 17 ítems → verificado por `landing-smoke`.

## Estado
`cerrado`
