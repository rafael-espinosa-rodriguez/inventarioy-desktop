# AGENTS.md — InventarioY Desktop

## Stack
React 19 + TypeScript 5.8 + Vite 6 + Tailwind v4 + Zustand 5 + Fastify local + SQLite (`node:sqlite`, API experimental de Node 22+) + Electron.

## Setup / Entorno
- `npm install` (no requiere API keys; la app es 100% local).
- `npm run desktop` — build vite + tsc electron + `electron .` (levanta Fastify local en `http://127.0.0.1:<port>` y sirve `dist/`).
- `npm run dev` — solo Vite (para desarrollo de UI).

## Estructura
```
/electron
├── db/          # schema.ts (migraciones SQLite) + conexión
├── server/      # index.ts (API Fastify local) + license.ts (validación ed25519)
├── main.ts      # proceso principal Electron
└── preload.ts   # expone window.desktop
src/
├── store/       # authStore + dbStore (Zustand)
├── lib/         # db/localClient.ts (shim localDb), unitConversion, etc.
├── components/  # ui/ + shared (LicenseBanner, OfflineLimitBanner...)
├── pages/       # Landing, Login, Register (setup) + Dashboard + dashboard/ (16 views)
├── design-system/# ThemeProvider + tokens
└── hooks/       # useIsOnline, useOfflineDisabled
```

## dbStore (~5k líneas) — NO LEER COMPLETO
Usar grep/búsqueda por nombre de interfaz (`Product`, `Sale`, `Recipe`...) o método (`addProduct`, `addSale`...).

## Auth / Roles
- **PIN-based puro**: no hay email/password. `/register` = setup inicial (negocio + PIN) → `POST /api/auth/setup`.
- Pines en tabla `access_pins` → roles: `owner`, `economist`, `admin`, `supervisor`, `clerk`.
- `MODULE_ROLES` controla qué rol ve qué módulo del dashboard.
- Licencia offline: trial 7 días + clave ed25519 (ver `electron/server/license.ts`).

## Modelo de datos / Backend
- **Backend local**: Fastify embebido. El renderer usa `src/lib/db/localClient.ts` (shim `localDb`, API tipo Supabase sobre HTTP local).
- **Base de datos**: SQLite local. Migraciones en `electron/db/schema.ts`.
- **NO hay tráfico a internet en runtime** (ni Supabase, ni Google Fonts, ni PWA).
- Endpoints de licencia: `GET /api/license/status`, `POST /api/license/activate`.
- Escrituras bloqueadas (403 `LICENSE_EXPIRED`) cuando la licencia vence; solo `settings` queda escribible.

## Módulo Ventas (SalesView)
- `rawInputValues: Record<string, string>` preserva input al tipear.
- Coma `,` como decimal; blur parsea + clamp + toast.
- Recetas: solo enteros (`getUnitStep(u, true)=1`, `getUnitMin(u, true)=1`, initial=1).
- Cart: `displayUnit` + selector (excluye u/sac/lat); `convertUnit()` con `normalizeUnit()` previo.
- `unit: 'porción'` en recetas es intencional (display informativo); `normalizeUnit('porción')` → `'u'` — no se intenta conversión.

## Manejo de errores
- Logger: localStorage (`logger.info/warn/error`, máx 200 entradas).
- Toasts: `sonner` para feedback de usuario.
- ErrorBoundary envolviendo rutas de dashboard.
- No Sentry / No error tracking externo.

## Testing
- **Solo e2e con Playwright**: `tests/offline-stress.spec.ts`, `tests/cuban-cycle.spec.ts`.
- **No hay unit tests.** Si se toca lógica crítica (licencia, conversión de unidades), considerar agregar test e2e.
- No asumir cobertura existente.

## Convenciones de código
- Componentes: PascalCase, funcionales + hooks, props interface exportada.
- UI primitives: PascalCase en `components/ui/`.
- Stores/utils: camelCase.
- `cn()` para Tailwind merging; CVA para variantes (Button).
- Estado global (Zustand) para datos de dominio; `useState` para UI efímera.
- Código (variables, funciones, tipos) en inglés; comentarios en español.

## Commits
- Español, formato conventional commits: `feat:`, `fix:`, `refactor:`, `style:`.

## Anti-patrones / No hacer
- No reintroducir dependencias de red (Supabase, Google Fonts, PWA, service workers).
- No cambiar el estado de licencia sin revisar `electron/server/license.ts` + migraciones.
- No leer `dbStore.ts` completo — usar grep siempre.
- No hacer fetch directo a servicios externos desde componentes — pasar por `localDb` (Fastify local).
- No ejecutar migraciones ni deletes/cambios masivos sin confirmación explícita — no hay staging, toca la BD local real.

## Flujo Spec-Driven (obligatorio en M/L)
- Specs en `docs/specs/NNN-nombre/` (`spec.md` → `plan.md` → `tasks.md`). Flujo y niveles en `docs/specs/README.md`; plantillas en `docs/specs/_templates/`.
- **S / quick-win (<1 día)**: mini-spec en `T0` de `tasks.md`. Sin spec/plan separados.
- **M / L**: spec + plan + tasks aprobados antes de tocar código. Sin verde (`lint` + `build`, + e2e si aplica) no se cierra el spec.
- Comandos: `/spec`, `/plan`, `/implement` (ver `.opencode/commands/`).
- Leer `AGENTS.md` + `ARCHITECTURE.md` antes de redactar cualquier spec (son la constitución).

## Comandos
- `npm run desktop` — build + ejecutar app desktop.
- `npm run dev` — servidor de desarrollo Vite.
- `npm run build` — build producción del renderer.
- `npm run lint` — `tsc --noEmit` (no hay ESLint/Prettier).
- `npx playwright test` — tests e2e.
- `node scripts/generar-licencia.mjs --codigo ABC123 --meses 1` — generar clave de activación (vendedor).
- `node scripts/crear-entrega.mjs --cliente "Nombre" [--zip]` — carpeta de entrega por cliente en `entregas/` (instalador + PDFs + LEEME; `--zip` añade ZIP).
