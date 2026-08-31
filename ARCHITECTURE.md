# Arquitectura y Reglas del Sistema - InventarioY Desktop

Este documento establece las directrices arquitectónicas, de diseño y de desarrollo de **InventarioY Desktop**.

## 1. Stack Tecnológico y Herramientas

*   **Framework Principal:** React 19 con TypeScript.
*   **Build Tool:** Vite 6.
*   **Estilos:** Tailwind CSS v4 con tema oscuro personalizado vía `@theme` en `index.css`.
*   **Enrutamiento:** React Router v7 para navegación tipo SPA.
*   **Gestión de Estado:** Zustand 5 (estado global en `authStore` y `dbStore`).
*   **Backend local:** Fastify embebido en el proceso Electron (`electron/server/`).
*   **Base de Datos:** SQLite local vía `node:sqlite` (`DatabaseSync`, API nativa de Node 22+ — `electron/db/`).
*   **Iconografía:** Lucide React.
*   **Animaciones:** GSAP.
*   **Gráficos:** Recharts.
*   **Notificaciones:** Sonner (toasts).
*   **Componentes UI:** Construidos desde cero con Tailwind CSS + `@radix-ui/react-slot`.

## 2. Estructura de Directorios

```text
/electron
  /db            # Migraciones SQLite + conexión (schema.ts, db.ts)
  /server        # Fastify local (index.ts, license.ts)
  main.ts        # Proceso principal Electron, sirve dist/ y abre 127.0.0.1:<port>
  preload.ts     # Expone window.desktop = { isDesktop, platform, print }
/src
  /components    # Componentes UI reutilizables
    /ui          # Primitivos: Button, Input, Switch, NumberInput, Label
  /lib           # Utilidades y helpers
    /db          # localClient.ts — shim que expone localDb (API tipo Supabase sobre Fastify local)
  /pages         # Vistas del router
    /dashboard   # Vistas protegidas del panel principal
  /store         # Estado global Zustand (authStore, dbStore)
```

## 3. Reglas de Desarrollo y Buenas Prácticas

### 3.1. TypeScript
*   Preferir tipos explícitos sobre `any`.
*   `tsc --noEmit` debe pasar antes de considerar un cambio completo.

### 3.2. Componentes y React
*   **Componentes Funcionales:** Exclusivamente funcionales y Hooks.
*   **Responsabilidad Única:** Un componente debe hacer una sola cosa.

### 3.3. Gestión de Datos
*   **Backend local:** Todo `fetch` del renderer va a rutas relativas que resuelven contra el Fastify local (`electron/server/index.ts`).
*   **Shim `localClient.ts`:** El `src/lib/db/localClient.ts` se importa como `localDb` en todo el frontend (API tipo Supabase sobre el Fastify local). NO existe tráfico a internet en runtime.
*   **Migraciones:** SQLite versionadas en `electron/db/schema.ts`. No hay staging — aplicar migraciones con cuidado.

### 3.4. Autenticación y Autorización
*   **PIN-based:** No hay registro email/password. `/register` es setup inicial (negocio + PIN) → `POST /api/auth/setup`.
*   **Roles:** PIN-based: `owner`, `economist`, `admin`, `supervisor`, `clerk` (tabla `access_pins`).
*   **Licencia:** Trial 7 días + clave de activación ed25519 offline (ver `electron/server/license.ts`).

### 3.5. Estilos y UI/UX
*   **Tema:** Claro y Oscuro (toggle en sidebar).
*   **Feedback Visual:** Botones con hover/active/disabled. Spinners en operaciones async.
*   **Manejo de Errores:** Toasts con Sonner.
*   **Responsive:** Mobile-first con Tailwind (`hidden md:table-cell`, etc.).

## 4. Licencia Offline

1.  **Trial:** 7 días gratis desde el setup. Al vencer, modo solo-lectura.
2.  **Clave de activación:** ed25519. La app embebe la clave pública (`LICENSE_PUBLIC_KEY`); el vendedor firma con la privada (`scripts/license-private.pem`, gitignored).
3.  **Precio:** 5,000 CUP/mes. Planes de 1/3/6/12 meses con descuento.
4.  **Vencido:** se bloquean las escrituras (solo `settings` queda escribible); se mantiene lectura. No se cierra la app.
5.  **Anti-manipulación:** `maxSeenTime` en settings; tolerancia de 1 día de retroceso de reloj.

## 5. Almacenamiento de Datos

1.  **SQLite local:** única fuente de verdad. Ruta en la carpeta de datos del usuario.
2.  **Sin sincronización:** la app es 100% offline. No hay Sync Engine ni cola hacia servicios remotos.

## 6. Flujo de Trabajo (Git/Desarrollo)

*   **Commits Semánticos:** `feat:`, `fix:`, `refactor:`, `style:`.
*   **Revisiones:** Antes de dar por terminado un módulo, verificar:
    *   `tsc --noEmit` sin errores
    *   `vite build` exitoso
    *   `npm run desktop` (build + electron) levanta correctamente
    *   ¿Maneja correctamente los estados de error y carga?
