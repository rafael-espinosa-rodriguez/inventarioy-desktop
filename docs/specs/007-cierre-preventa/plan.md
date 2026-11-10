# Plan 006 — Cierre pre-venta

Referencia `spec.md` (R1-R9).

## 1. Cambios
- `src/pages/Landing.tsx`: "Tarifa simple", pago CUP/USD, navegación "Planes",
  bullet y FAQ de tablets/celulares.
- `src/lib/importProducts.ts`: `warnings` en el preview, unidades desconocidas → `u`,
  detección de números ambiguos, decodificación UTF‑16, `buildResultCsv`.
- `src/components/ImportProductsDialog.tsx`: contador/lista de avisos, descarga de
  avisos y de resultado.
- `docs/Manual-de-uso.md`: avisos de importación + subsección tablets/celulares.
- `docs/QA-IMPORTACION.md`: checklist manual sobre la app instalada.
- `scripts/verificar-importacion-excel.mjs` + script npm `verify:import`.

## 2. Tests
- `tests/import-parser.spec.ts`: matriz (separadores, comillas, decimales, fechas,
  booleanos, duplicados, inactivos, ambigüedad, UTF‑8/UTF‑16/ANSI, límite).
- `tests/import-products.spec.ts`: avisos, resultado descargable, multi‑almacén,
  duplicado inactivo, 600 filas, 2 000 filas y rollback de lote vía API.
- `tests/landing-smoke.spec.ts`: 250 USD y textos coherentes.

## 3. Verificación
`npm run verify:import` → `npm run lint` → `npm run build` → `electron:build` →
suite completa → regenerar manual/HTML/PDF → instalador + entrega → commit/push.

## Estado
`cerrado`
