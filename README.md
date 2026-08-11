# InventarioY Desktop

Sistema de gestión de inventario para restaurantes, cafeterías y comercios en Cuba. Aplicación de escritorio que funciona **100% local y sin conexión a internet**.

## Funcionalidades

- **Stock Actual**: Control de inventario en tiempo real
- **Inventario**: Gestión de productos y movimientos
- **Movimientos (Kárdex)**: Historial completo de entradas y salidas
- **Tránsito**: Seguimiento de productos en tránsito
- **Ventas**: Punto de venta con soporte para recetas
- **Cierres de Caja**: Control diario de ventas
- **Recetas**: Gestión de recetas con ingredientes
- **Análisis**: Reportes y estadísticas
- **RRHH**: Control de empleados, nómina y documentos (PNO, Reglamento)

## Tech Stack

- Electron (proceso principal + servidor Fastify local)
- React 19 + TypeScript + Vite
- SQLite (better-sqlite3) — base de datos local
- Tailwind CSS v4 + Zustand
- Licencia offline: trial 7 días + clave de activación (ed25519)

## Requisitos

- Node.js 18+
- npm

## Instalación

```bash
npm install
```

La aplicación no requiere API keys ni servicios remotos.

## Ejecución

```bash
npm run desktop
```

Compila el renderer, compila `electron/` y abre la ventana de la aplicación. El servidor Fastify local se levanta automáticamente en `http://127.0.0.1:<puerto>` y sirve la interfaz desde `dist/`.

## Licencia

- **Prueba**: 7 días gratis con todas las funciones al configurar el negocio.
- **Plan Profesional**: 5,000 CUP/mes. Pago manual (efectivo o transferencia) y activación con clave de licencia generada por el vendedor.
- Al vencer la licencia, la aplicación pasa a modo solo-lectura.
- Contacto: WhatsApp **+53 54523884**.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run desktop` | Build del renderer + Electron y abre la app |
| `npm run dev` | Servidor de desarrollo Vite |
| `npm run build` | Build de producción del renderer |
| `npm run lint` | `tsc --noEmit` |
| `node scripts/generar-licencia.mjs --codigo ABC123 --meses 1` | Generar clave de activación (solo vendedor) |

## Variables de Entorno

No se requieren variables de entorno. La aplicación funciona íntegramente en local.
