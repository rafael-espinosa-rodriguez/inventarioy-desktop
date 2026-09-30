# Spec 001 — Porte de la landing al Diseño B + correcciones + tier vitalicio

## 1. Contexto
La landing actual (`src/pages/Landing.tsx`) es funcional pero genérica. Se dispone
de un Diseño B ("Terminal Táctica") en HTML estático con mejor identidad,
interactividad (tabs, presets, calculadora de mermas) y copy cubano quirúrgico,
pero con afirmaciones falsas contra la app real y bloqueadores de porte
(CDN, Google Fonts, Material Symbols, anclas muertas). Auditoría completa en el
historial de la sesión (puntos 1-21 + comparativa A/B).

## 2. Objetivo
Sustituir la landing por el Diseño B portado a React + Tailwind v4, sin ninguna
afirmación falsa, con tier vitalicio 130,000 CUP, manteniendo rutas,
auth-redirect y modal de tutorial.

## 3. Alcance
- Dentro:
  - R1: Estructura y estética del Diseño B (header, hero split, terminal con
    tabs, infraestructura, calculadora, pasos, testimonios, pricing, FAQ, CTA,
    footer).
  - R2: Aplicar las 9 correcciones de la auditoría (sin arqueo ciego, sin
    servicio 10%, sin Linux/macOS, sin 42/45MB, sin import Excel, sin backup USB
    1-clic, sin pulso de gaveta, sin MLC, versión/año correctos).
  - R3: Rescates del Diseño A (lista de 16 features honestas, trío de confianza
    donde encaje, FAQ de onboarding).
  - R4: Tier vitalicio 130,000 CUP como 3er estado del selector + FAQ de pago único.
  - R5: Cero dependencias de red (sin CDN, sin Google Fonts, sin Material Symbols;
    iconos `lucide-react`, tokens `@theme`).
  - R6: Preservar comportamiento existente (redirect `/dashboard` si autenticado,
    `TutorialPromptModal`, toggle de precios como estado React, año dinámico).
  - R7: Instagram `@inventario_y` en todos los enlaces (incluye el fix de
    `Landing.tsx:580`, que desaparece con la reescritura).
- Fuera (no-alcance explícito):
  - Implementar arqueo ciego, import Excel, backup USB o apertura de gaveta
    (son propuestas P1/P3 del reporte de mejoras, specs futuros).
  - Cambiar rutas, auth, pricing real o lógica de licencia (el vitalicio ya
    funciona vía `--vitalicia` + badge `esVitalicia`).

## 4. Requisitos
- R1-R7 según alcance.

## 5. Criterios de aceptación
- CA1: `npm run lint` y `npm run build` en verde.
- CA2: grep confirma cero `cdn.tailwindcss`, `fonts.googleapis`, `Material Symbols`,
  `MLC`, `42 MB`, `Linux`, `macOS`, `gaveta`, `Servicio (10%)`, `rafael.espinosar`,
  `v3.4.1`/`v3.8`, `© 2024` en `Landing.tsx`.
- CA3: selector de precios con 3 estados (mensual 5,000 / anual 54,000 /
  vitalicio 130,000 pago único) funcional con `useState`.
- CA4: todos los CTA llevan a rutas reales (`/register`, `/acceso`, `/login`) o
  URLs externas verificadas (WhatsApp, YouTube, Instagram `@inventario_y`).
- CA5: `npm run desktop` renderiza sin peticiones de red (offline real).

## 6. Supuestos y riesgos
- Supuesto: precios y canales de pago no cambian (5,000/54,000/130,000 CUP).
- Riesgo: regresión visual en móvil → mitigación: revisión responsive en `desktop`.

## Estado
`cerrado` (2026-09-30: lint + build verdes, smoke 10/10, captura `landing-b.png` verificada)
