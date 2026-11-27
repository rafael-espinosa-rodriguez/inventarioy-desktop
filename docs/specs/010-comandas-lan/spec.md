# Spec 010 — Comandas a cocina por LAN

> **Estado: cerrado (2026-10-09)** — implementado; suite 63/63.

## 1. Contexto
El POS no tenía mesas ni comandas: la cocina no veía pedidos y no había forma de
preparar antes de cobrar. Todo debe funcionar por LAN sin internet.

## 2. Objetivo
Permitir mesas, enviar comandas a una pantalla de Cocina por LAN, avanzar estados
y cerrar la comanda al cobrar (el stock se descuenta al cobrar).

## 3. Alcance
- Dentro: mesas (lista simple), comandas con ítems, estados
  pendiente/preparando/listo/entregado/cancelado, pantalla Cocina con polling,
  una comanda abierta por mesa, agregar ítems tras enviar, rol personalizado.
- Fuera: mapa de salón, impresión de comandas, división de cuentas.

## 4. Requisitos
- R1: Crear/eliminar mesas (nombre y zona).
- R2: Enviar la comanda desde Ventas; si la mesa ya tiene comanda abierta se
  agregan ítems a la misma.
- R3: Pantalla `/dashboard/kitchen` con polling cada 5 s y avance de estados.
- R4: El cobro cierra la comanda (`delivered`, `sale_id`) y descuenta stock.
- R5: Módulo `kitchen`; rol personalizado “Cocina” solo ve la pantalla.
- R6: El envío a cocina no mueve stock.

## 5. Criterios de aceptación
- CA1: Enviar dos veces a la misma mesa reutiliza la comanda.
- CA2: Un rol sin Ventas ni Cocina no puede enviar (403).
- CA3: Los estados avanzan y `ready_at` se registra.
- CA4: Cobrar deja la comanda `delivered` con `sale_id`.
- CA5: La pantalla de Cocina muestra la comanda y permite avanzar.
- CA6: Suite completa en verde.

## Estado
`cerrado`
