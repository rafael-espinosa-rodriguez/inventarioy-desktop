# Tasks 004 — Landing anuncia facturación (S)

> **Estado: ELIMINADO (2026-10-07)** — anuncio retirado de la landing junto
> con el módulo (spec 003). Historial conservado.

## T0. Mini-spec
- Qué: la landing debe anunciar la facturación (spec 003, ya real) sin
  introducir falsos. Cambios aditivos: 1 bullet en la matriz (17),
  1 FAQ ("¿Emite facturas o comprobantes?"), 1 enlace en footer.
- Done cuando: grep encuentra `folio` y `ONAT` en `Landing.tsx`, `lint` y
  `build` en verde, y ningún otro texto de la landing cambia.

## Tareas
- [x] T1: matriz FEATURES_16 → FEATURES + bullet "Comprobantes con folio anual
  y reporte para ONAT" — archivos: `Landing.tsx` — done cuando: grep lo confirma.
- [x] T2: FAQ facturas + enlace footer a `#faq` — archivos: `Landing.tsx` —
  done cuando: grep lo confirma.
- [x] T3 (verificación): `npm run lint` + `npm run build` en verde.

