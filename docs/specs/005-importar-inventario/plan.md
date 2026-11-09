# Plan 005 — Importar inventario desde Excel/CSV

Referencia `spec.md` (R1-R12, CA1-CA8).

## 1. Decisiones
- D1: Sin dependencias nuevas (regla offline). Parser CSV/TSV propio (~80 líneas).
- D2: Sin migración de BD: `products`, `movements` y `product_warehouse` ya cubren
  todos los campos.
- D3: Reutilizar `localDb.batch` (`POST /api/query/batch`) por ser transaccional y
  respetar rol/licencia ya existentes en el servidor.
- D4: Duplicados = omitir y reportar (decisión del usuario).
- D5: La lógica de parseo/validación vive en `src/lib/importProducts.ts` (testeable y
  reutilizable); la escritura en `dbStore.importProducts`.
- D6: UI en `InventoryView` con `Modal` existente y patrón de toasts `sonner`.

## 2. Archivos
- Nuevo `docs/specs/005-importar-inventario/{spec,plan,tasks}.md`.
- Nuevo `src/lib/importProducts.ts`: parser, validación, plantilla y reporte.
- Nuevo `src/components/shared/ImportProductsDialog.tsx`: modal 2 pasos.
- `src/store/dbStore.ts`: tipo `ImportProductsResult` + método `importProducts`.
- `src/pages/dashboard/InventoryView.tsx`: botón y montaje del diálogo.
- `src/pages/Landing.tsx`: bullet de importación + FAQ + precio vitalicio 250 USD.
- `docs/Manual-de-uso.md` (+ HTML/PDF): nueva §5, renumeración y FAQ.
- Nuevo `tests/import-products.spec.ts`: e2e.

## 3. Contrato de datos
```
ImportRow { line, name, category, unit, quantity, cost, price, rop, eoq,
            expiration_date?, description?, is_individual, is_gasto_variable,
            is_consumo_directo }
ImportPreview { rows: ImportRow[], errors: {line, name, message}[],
                duplicates: {line, name, message}[] }
```
`parseImportText(text, existingNames)` devuelve el preview; `buildTemplateCsv()` y
`buildErrorsCsv(errors)` generan los archivos.

## 4. Validación
- Nombre: obligatorio, 1-120 caracteres, único (normalizado) contra BD y archivo.
- Categoría: vacío → "Otros" con aviso.
- Unidad: alias vía `normalizeUnit` + `UNIT_LABELS`; vacío → `u`; desconocida → error.
- Cantidad/Costo/Precio/ROP/EOQ: ≥ 0, default 0; coma decimal.
- Vencimiento: `AAAA-MM-DD` | `DD/MM/AAAA` | `DD-MM-AAAA` → ISO; inválida → error.
- Booleanos: `sí/no`, `1/0`, `x`, `true/false`; otro → error.

## 5. Escritura
- Lotes de 100 productos; por producto: 1 `products`, 1 `movements` (si cantidad>0)
  y 1 `product_warehouse` por almacén (principal con cantidad, resto 0).
- Al terminar: `fetchAll()` + `fetchProductWarehouse()` y `logAction('inventory',
  'IMPORTAR', { imported, skipped, total })`.
- Error de lote → `Error` con importados parciales; el diálogo lo muestra y refresca.

## 6. UI
- Botón "Importar inventario" (icono `Upload`) junto al título "Alta de Producto".
- Paso 1: plantilla, selector de archivo, textarea de pegado, contadores y tabla
  de las primeras 50 filas con motivo de error.
- Paso 2: confirmar → progreso → reporte final + descarga de errores.
- Botón deshabilitado mientras procesa; límite de 2 000 filas.

## 7. Docs y verificación
- Manual: §5 "Cargar el inventario inicial (importar desde Excel)" + renumerar 5-11
  a 6-12 + ítem FAQ; regenerar HTML y PDF.
- Landing: bullet `FEATURES` (16→17) + FAQ de importación; smoke test.
- Tests: CA1-CA7 en `tests/import-products.spec.ts`; suite completa 17/17.
- Cierre: lint + build + electron:build; instalador y entrega regenerados.

## Estado
`cerrado`
