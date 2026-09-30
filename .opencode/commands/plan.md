---
description: Redacta el plan.md (CÓMO técnico) de un spec existente en docs/specs/ siguiendo la plantilla.
---

Actúa bajo el flujo spec-driven de este repo (`docs/specs/README.md`, `AGENTS.md`).

1. Lee `AGENTS.md` y `ARCHITECTURE.md` completos.
2. Localiza el spec indicado en `$ARGUMENTS` (ej. `001-porte-landing`); si no se
   indica, pide cuál. Lee su `spec.md` (debe estar `aprobado`; si está en
   `borrador`, avisa y no continúes sin confirmación).
3. Explora el código real implicado (grep, nunca `dbStore.ts` completo) y redacta
   `plan.md` desde `docs/specs/_templates/plan.md`: decisiones, archivos exactos,
   migraciones/endpoints/UI, verificación, rollback. Respeta los anti-patrones
   (cero red, licencia, migraciones con cuidado).
4. Resume el plan y qué falta para aprobarlo. No implementes en este paso.

$ARGUMENTS
