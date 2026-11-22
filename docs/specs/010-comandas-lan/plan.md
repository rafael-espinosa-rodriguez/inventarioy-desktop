# Plan 010 — Comandas a cocina

- Migración 19: `tables`, `kitchen_orders`, `kitchen_order_items`; módulo `kitchen`.
- Servidor: `TABLE_MODULES` (ventas/cocina), RPC `kitchen_send` (una comanda por
  mesa), RPC `kitchen_status`, cierre de comanda dentro de la venta.
- Store: estado y métodos de mesas/comandas; polling en la pantalla.
- UI: Configuración → Mesas; Ventas → selector de mesa + enviar/cargar comanda;
  ruta `/dashboard/kitchen` con columnas y avance de estados.
- Tests: `tests/kitchen.spec.ts` (4 casos).

## Estado
`cerrado`
