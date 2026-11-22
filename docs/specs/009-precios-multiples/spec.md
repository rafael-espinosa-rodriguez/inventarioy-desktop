# Spec 009 — Precios múltiples (solo productos)

> **Estado: cerrado (2026-10-09)** — implementado; suite 53/53.

## 1. Contexto
La app tenía un único precio por producto. Negocios con mostrador y mayorista
necesitan listas distintas y una referencia en USD, sin conexión.

## 2. Objetivo
Permitir listas de precios en CUP asignadas a cada rol y un precio USD de
referencia/cobro, manteniendo el histórico de la lista usada en cada venta.

## 3. Alcance
- Dentro: listas (nombre, predeterminada), asignación por rol, precios por
  producto y lista, precio USD, badge en POS, venta guarda la lista.
- Fuera: listas para recetas, precios por cliente, promociones automáticas.

## 4. Requisitos
- R1: CRUD de listas y asignación configurable de roles (incluye personalizados).
- R2: Precio por producto y lista; fallback al precio base.
- R3: El POS resuelve la lista por el rol de la sesión (sin selector).
- R4: Precio USD opcional por producto (referencia y cobro con la tasa).
- R5: La venta guarda `price_list_id` y `price_list_name`.
- R6: Solo dueño/económico gestionan listas y precios (módulo `pricing`).

## 5. Criterios de aceptación
- CA1: Dependiente no puede crear listas (403); dueño sí.
- CA2: El POS usa el precio de la lista del rol; sin precio usa el base.
- CA3: La venta registra la lista usada.
- CA4: El precio USD se muestra como referencia.
- CA5: Suite completa en verde.

## Estado
`cerrado`
