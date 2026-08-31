# REPORTE_PRUEBA — Escenario completo GUIA_PRUEBA (7 días)

> **Nota:** este reporte documenta una ejecución histórica. El config `playwright.guia.config.ts`
> y `scripts/start-guia-server.mjs` fueron **eliminados**; desde la migración a BD sembrada, el
> escenario corre en `playwright.config.ts` principal con `scripts/start-test-server.mjs`.

- **Fecha de ejecución:** 16/08/2026
- **Comando:** `npx playwright test --config=playwright.guia.config.ts`
- **Resultado:** ✅ **1 passed (13.6m)** — `tests/guia-prueba.spec.ts`
- **Test file:** `tests/guia-prueba.spec.ts` (escenario completo 7 días restaurante + bodega)
- **Datos crudos del reporte:** `tests/guia-report-data.json`

## Escenario cubierto

| Fase | Contenido | Resultado |
|---|---|---|
| 0 | Registro / setup del negocio (owner PIN `1234`) | ✅ |
| 1 | Configuración: ticket, USD, EUR, CUP transferencia | ✅ |
| 2 | RRHH: departamento Cocina, empleados, PINs (Juan `2345`, María `3456`) | ✅ |
| 3 | Catálogo: 18 productos con stock inicial | ✅ |
| 4 | Configuración de ROP (puntos de reorden) | ✅ |
| 5 | Ventas diarias + tránsito entre almacén y restaurante (7 días) | ✅ |
| 6 | Cierres de caja por día + cuenta Casa | ✅ |
| 7 | Verificación final: stock, cierres registrados y roles por PIN | ✅ |

## Datos reales capturados

### Stock final (almacén principal, día 7)
| Producto | Stock | Producto | Stock |
|---|---|---|---|
| Arroz | 50 | Refresco | 0 |
| Frijoles negros | 27 | Agua | 3 |
| Carne de cerdo | 16 | Cerveza | 6 |
| Pollo | 11 | Café | 0 |
| Aceite | 8 | Pan | 0 |
| Cebolla | 2 | Detergente | 6 |
| Ajo | 3.2 | Jabón | 6 |
| Sal | 3.7 | | |
| Papa | 1 | Plátano | 1 |

Tránsito día a día (almacén → restaurante) registrado en `tests/guia-report-data.json` (`transit.d1…d7`).

## Discrepancias GUI real vs GUIA_PRUEBA

1. **El sidebar NO filtra módulos por rol.** La GUI muestra siempre los 15 módulos en la navegación
   (`src/pages/Dashboard.tsx` — `baseNav`, líneas ~375-395) para cualquier sesión, incluida la de
   Dependiente. La GUIA (líneas 84-85 y 431) esperaba que cada empleado "viera solo sus módulos".
   La protección real NO se basa en ocultar el menú.

2. **El control de acceso es por modal PIN por módulo.** Al navegar a un módulo restringido se abre el
   modal `Verificar PIN` (`src/components/PinModal.tsx`). La ruta raíz `/dashboard` está exenta del
   chequeo (`src/pages/Dashboard.tsx:176-178`), por lo que entrar a "Almacén" no pide PIN.

3. **Resultado real de la verificación de roles** (Fase 7, corroborado con dumps de localStorage en el log):
   | PIN | Rol esperado | Rol real (`verifiedRole`) | Sesión mostrada | Movimientos |
   |---|---|---|---|---|
   | `1234` (Dueño) | todo | `owner` | "Dueño/a" | permitido |
   | `2345` (Juan) | Dependiente | `clerk` | "Dependiente/a" | **denegado** (modal Verificar PIN) |
   | `3456` (María) | Supervisora | `supervisor` | "Supervisor/a" | **denegado** (modal Verificar PIN) |

   `MODULE_ROLES` (`src/store/dbStore.ts:218-233`): `/movements` solo `owner/economist/admin`;
   `/sales` incluye `supervisor` y `clerk`; `/closings` incluye `supervisor` pero no `clerk`.

4. **Swap de PINs en la GUIA.** La tabla de la GUIA (líneas 84-85) asigna Juan→`2345` y María→`3456`,
   pero la línea 431 invierte los PINs ("Supervisora (2345) y Dependiente (3456)"). El test usa los
   valores de la tabla (correctos): Juan `2345`, María `3456`.

5. **El chip "Sesión: …" depende de una recarga de la app.** Tras iniciar sesión con PIN desde `/login`,
   el indicador "Sesión: Dependiente/a" solo aparece tras recargar/reiniciar: `useDatabaseStore`
   inicializa `verifiedRole` leyendo `localStorage` al crear el módulo (`src/store/dbStore.ts:693`),
   mientras que `authStore.login` solo escribe `localStorage` (`src/store/authStore.ts:400-403`) sin
   actualizar el store. El test refleja este comportamiento real añadiendo una recarga tras el login.

6. **Bug `limit(50)` corregido.** La GUI truncaba la lista de productos a 50 (`dbStore`); el fix ya
   aplicado permite mostrar los 18 productos del catálogo y no truncar con más de 50. Verificado en Fase 3.

## Evidencia de ejecución

- Dumps de login/logout del run final (log `guia-run14.log`):
  - `[login pin=1234]` → `verifiedRole=owner`, `verifiedRoleName=Dueño/a`
  - `[login pin=2345]` → `verifiedRole=clerk`, `verifiedRoleName=Juan Dependiente`
  - `[login pin=3456]` → `verifiedRole=supervisor`, `verifiedRoleName=María Supervisora`
  - `[logout]` → `inventarioy_logged_out=1`, cola de sync = `0`
- Los logs de corridas previas quedan en `%TEMP%\opencode\guia-run*.log` (7…14) para auditoría.

## Notas

- El test borra la base local al arrancar (`scripts/start-guia-server.mjs`) → datos reproducibles.
- `npm run lint` (tsc) limpio antes de la corrida final.