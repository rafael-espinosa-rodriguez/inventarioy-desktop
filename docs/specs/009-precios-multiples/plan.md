# Plan 009 — Precios múltiples

- Migración 18: `price_lists`, `price_list_roles`, `product_prices`,
  `products.price_usd`, `sales.price_list_id/name`; módulo `pricing` en roles.
- Servidor: `TABLE_MODULES` (pricing), venta guarda la lista; `LEGACY_ROLE_MODULES`.
- Store: estado y métodos (`fetchPriceLists`, `savePriceList`, `deletePriceList`,
  `setProductPrices`, `resolvePriceListForRole`).
- UI: Configuración → Listas de precios; Almacén → Editar producto → Precios por
  lista + USD; POS con badge de lista y precio resuelto; USD de referencia.
- Tests: `tests/price-lists.spec.ts` (4 casos).

## Estado
`cerrado`
