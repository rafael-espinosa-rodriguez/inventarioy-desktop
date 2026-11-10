# Spec 006 — Cierre pre-venta (coherencia de precios + endurecer importación)

> **Estado: cerrado (2026-10-09)** — implementado; suite 36/36 + verify:import en verde.

## 1. Contexto
Antes de cobrar la primera licencia hay tres riesgos detectados en la revisión:
(a) la landing mezcla CUP y USD de forma contradictoria; (b) la importación rechaza
unidades comunes (`caja`, `bolsa`) y no avisa de números ambiguos (`1,600` → 1.6);
(c) faltan pruebas de estrés/Excel real/rollback y documentación de tablets como cajas.

## 2. Objetivo
Dejar la app lista para venta: precios coherentes, importación tolerante con avisos,
cobertura automatizada ampliada, validación con Excel real y documentación completa.

## 3. Alcance
- Dentro: textos de precios, avisos de importación, unidades desconocidas → `u`,
  reporte descargable, tests de estrés/rollback/encodings/multi-almacén, script de
  validación con Excel, manual (tablets + avisos), checklist QA, regenerar artefactos.
- Fuera: lectura `.xlsx` directa, impresión térmica por red, firma de código.

## 4. Requisitos
- R1: Landing sin contradicciones: mensual/anual en CUP; vitalicio 250 USD; navegación
  "Planes"; FAQ de pago y de tablets coherentes.
- R2: Importación: unidad desconocida se carga como `u` con aviso (no rechaza la fila).
- R3: Importación: números tipo `1,600`/`1.600` se aceptan pero generan aviso con el
  valor interpretado.
- R4: La vista previa muestra contadores de avisos y permite descargarlos.
- R5: Tras importar se puede descargar el resultado (importados/omitidos).
- R6: Tests: matriz de casos límite, encodings (UTF‑8, UTF‑16, ANSI), 600 filas reales,
  límite 2 000, multi‑almacén, duplicado inactivo y rollback de lote.
- R7: Script `npm run verify:import` valida CSV generados por Excel real (COM).
- R8: Manual: subsección tablets/celulares como cajas y avisos de importación.
- R9: Checklist manual `docs/QA-IMPORTACION.md` para la app instalada.

## 5. Criterios de aceptación
- CA1 (R1): `landing-smoke` valida 250 USD y no queda "Plan CUP"/"Pago manual en CUP".
- CA2 (R2/R3): CSV con `caja` y `1,600` importa con 2 avisos y valores correctos.
- CA3 (R5): El CSV de resultado contiene las filas importadas y omitidas.
- CA4 (R6): Todos los tests nuevos y la suite completa en verde.
- CA5 (R7): `npm run verify:import` en verde con los 3 formatos de Excel.
- CA6 (R8/R9): Manual regenerado y checklist disponible.

## Estado
`cerrado`
