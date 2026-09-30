# Spec 002 — Respaldo y restauración (automático + manual)

## 1. Contexto
Propuesta P1 del reporte de mejoras (prioridad Alta): los apagones y discos que
mueren son el riesgo #1 de un sistema 100% local. Hoy solo existe rotación
automática interna en `dataDir` (`electron/db/index.ts`); no hay respaldo
configurable por el usuario ni restauración desde la UI. La landing 001 ya
promete "respaldos automáticos locales + copia manual a USB": este spec lo hace
realidad.

## 2. Objetivo
Que el dueño pueda configurar dónde y cada cuánto se respalda la BD, lanzar un
respaldo manual en 1 clic y restaurar una copia con confirmación, sin internet
y sin conocimientos técnicos.

## 3. Alcance
- Dentro:
  - R1: Respaldo manual inmediato a carpeta configurable (incluye USB).
  - R2: Respaldo automático programado (al cerrar caja + cada X horas).
  - R3: Rotación de copias (conservar N últimas).
  - R4: Restauración con doble confirmación + copia de seguridad previa
    automática del estado actual.
  - R5: Sección "Respaldo" en Ajustes (carpeta, frecuencia, N, último respaldo,
    estado) visible según rol.
- Fuera (no-alcance explícito):
  - Nube, red, cifrado de copias, compresión con contraseña.
  - Respaldo de documentos adjuntos fuera de la BD (solo `inventarioy.db`).

## 4. Requisitos
- R1-R5 según alcance.

## 5. Criterios de aceptación
- CA1 (R1): clic en "Respaldar ahora" genera `inventarioy-manual-<fecha>.db`
  en la carpeta elegida y toast de confirmación con la ruta.
- CA2 (R2): con frecuencia "cada 6h", aparecen copias nuevas sin intervención
  tras el intervalo (verificable por fecha de archivo).
- CA3 (R3): con N=5, nunca hay más de 5 copias automáticas en la carpeta.
- CA4 (R4): restaurar exige 2 confirmaciones y deja copia `pre-restore-<fecha>.db`.
- CA5 (R5): la sección Ajustes muestra último respaldo y permite cambiar
  carpeta/frecuencia/N sin reiniciar.
- CA6: `npm run lint` + `npm run build` en verde; restore probado en BD temporal
  e2e sin tocar datos reales.

## 6. Supuestos y riesgos
- Supuesto: la copia en caliente es consistente (WAL + checkpoint previo,
  patrón ya usado en `db/index.ts`).
- Riesgo: restaurar pisa la BD viva → mitigación: CA4 + bloqueo de escritura
  durante restore.
- Riesgo: carpeta en USB ausente al momento del respaldo → mitigación: reintento
  silencioso + aviso en Ajustes (no toast que bloquee ventas).

## Estado
`cerrado` (2026-09-30: lint + electron:build + build verdes, funcional 10/10 en BD temporal)
