# Plan NNN — <título corto>

> Plantilla spec-driven. Describe CÓMO se implementa el spec. Referencia `spec.md` (Rn/CAn).

## 1. Decisiones
- D1: … (alternativas descartadas y por qué, 1 línea)

## 2. Archivos
| Acción | Ruta | Detalle |
|---|---|---|
| crear / modificar | … | … |

## 3. Datos (si aplica)
- Migración en `electron/db/schema.ts`: tablas/columnas nuevas.
- Endpoints en `electron/server/index.ts`: nuevos o modificados.
- Store/UI: interfaces en `dbStore.ts`, vistas en `src/pages/dashboard/`.

## 4. Estrategia UI (si aplica)
Componentes, rutas, estados. Sin red: todo local vía `localDb`.

## 5. Verificación
Comandos exactos para dar por hecho cada parte (lint, build, e2e, grep de reglas).

## 6. Rollback
Cómo deshacer si algo sale mal (qué commit/revert, qué datos toca).
