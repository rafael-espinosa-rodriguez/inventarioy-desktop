---
description: Ejecuta las tasks.md de un spec aprobado, en orden, marcando avance solo con verificación en verde.
---

Actúa bajo el flujo spec-driven de este repo (`docs/specs/README.md`, `AGENTS.md`).

1. Lee `AGENTS.md` y `ARCHITECTURE.md` completos.
2. Localiza el spec indicado en `$ARGUMENTS`; exige `spec.md` y `plan.md`
   `aprobado`. Si no lo están, detente y pide aprobación.
3. Si no existe `tasks.md`, créalo desde `docs/specs/_templates/tasks.md`
   (desglose atómico del plan, cada tarea con archivos + "done cuando").
4. Ejecuta las tareas en orden con `todowrite` (una `in_progress` a la vez),
   marcando `[x]` solo con su verificación en verde.
5. Al cerrar: `npm run lint` + `npm run build` en verde (+ e2e si el plan lo
   exige), actualiza el estado del spec a `cerrado` y resume con commits
   sugeridos (español, conventional commits).

$ARGUMENTS
