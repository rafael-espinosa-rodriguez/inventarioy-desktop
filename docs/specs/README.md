# Spec-Driven Development — InventarioY

Flujo obligatorio para trabajo M/L (ver niveles). En 1 página:

## El flujo
1. **`spec.md`** — QUÉ + cómo se valida (requisitos Rn, aceptación CAn, no-alcance). Sin código.
2. **`plan.md`** — CÓMO (archivos, migraciones, endpoints, UI, verificación, rollback).
3. **`tasks.md`** — checklist atómico ejecutable. Se marca `[x]` solo con verificación en verde.
4. **Implementar** por tareas, en orden.
5. **Verificar**: `npm run lint` + `npm run build` (+ e2e si toca licencia/conversión). Sin verde, no se cierra.

## Niveles
- **S / quick-win (<1 día)**: mini-spec de ~10 líneas en `T0` de `tasks.md`. Sin `spec.md`/`plan.md` separados.
- **M / L**: `spec.md` + `plan.md` + `tasks.md` completos y aprobados antes de tocar código.

## Dónde vive cada spec
`docs/specs/NNN-nombre-corto/spec.md|plan.md|tasks.md`. Numeración secuencial (`001`, `002`…).
Plantillas: `_templates/`. Comandos: `/spec`, `/plan`, `/implement`.

## Reglas innegociables
- Leer `AGENTS.md` + `ARCHITECTURE.md` antes de redactar cualquier spec (son la constitución).
- Criterios de aceptación medibles o no existen.
- Respetar anti-patrones de `AGENTS.md` (cero red, licencia, migraciones con cuidado).
- Commits en español, conventional commits (`feat:`, `fix:`, …).
