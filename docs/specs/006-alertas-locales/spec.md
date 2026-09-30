# Spec 006 — Alertas y notificaciones locales

## 1. Contexto
Propuesta P5 del reporte de mejoras (prioridad Alta). La app ya muestra estados
(ROP "Bajo", "Productos críticos") pero solo si el dueño abre esas vistas. Sin
internet no hay push externo: la proactividad debe ser local (Electron
`Notification` + centro de alertas en el dashboard).

## 2. Objetivo
Que el dueño se entere al abrir la app (y por temporizador) de lo crítico sin
buscarlo: stock bajo ROP, productos próximos a vencer, licencia por vencer y
fechas de nómina/impuestos. Cero red.

## 3. Alcance
- Dentro:
  - R1: Notificación nativa Electron al arranque con resumen crítico (si hay).
  - R2: Revisión por temporizador en main (cada 60 min) solo con la app abierta.
  - R3: Fuentes: `products` (quantity ≤ rop > 0), `products.expiration_date`
    ≤ N días, `license_valid_until` ≤ M días, `payroll_period` abierto próximo
    a cierre.
  - R4: Umbrales configurables en `settings` (`alert_expiry_days`,
    `alert_license_days`, `alerts_enabled`) + interruptor maestro.
  - R5: Centro de alertas (card en Almacén/StockView con las 4 categorías y
    enlaces a sus vistas).
- Fuera (no-alcance explícito):
  - Sonido, notificaciones con la app cerrada, email/SMS, notificaciones en
    cajas remotas (solo equipo servidor).

## 4. Requisitos
- R1-R5 según alcance.

## 5. Criterios de aceptación
- CA1 (R1): con 1 producto bajo ROP, al arrancar aparece 1 notificación nativa
  con conteo (y ninguna si no hay nada crítico).
- CA2 (R3): producto con `expiration_date` en 5 días y umbral 7 → incluido;
  con umbral 3 → excluido.
- CA3 (R4): `alerts_enabled=false` → cero notificaciones y card oculta.
- CA4 (R5): cada alerta enlaza a su vista (Stock/Inventario, Licencia, RRHH).
- CA5: `lint` + `build` verdes; cero deps nuevas.

## 6. Supuestos y riesgos
- Supuesto: `Notification` de Electron funciona sin red en Windows 10/11.
- Riesgo: spam de notificaciones → mitigación: máximo 1 resumen por arranque y
  1 por intervalo, solo si hay cambios desde el último aviso.

## Estado
`borrador`
