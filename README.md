# Inventarioy Desktop

**Gestor de inventario offline-first para negocios pequeños y medianos en Cuba**

Una aplicación de escritorio construida con TypeScript que funciona **100% local y sin conexión a internet**. Ideal para entornos con conectividad limitada o inestable.

## Características

- 🔌 **Completamente Offline** - Toda la lógica y datos se ejecutan localmente sin requerir conexión
- 💾 **SQLite integrado** - Base de datos local con persistencia confiable
- ⚡ **Rendimiento rápido** - Sin latencia de red
- 🎯 **Diseñado para Cuba** - Pensado para negocios cubanos con conectividad limitada o inestable
- 📱 **Compatible con dispositivos con recursos limitados** - Funciona bien incluso en hardware antiguo

### Funcionalidades de Gestión

- **Stock Actual**: Control de inventario en tiempo real
- **Inventario**: Gestión de productos y movimientos
- **Movimientos (Kárdex)**: Historial completo de entradas y salidas
- **Tránsito**: Seguimiento de productos en tránsito
- **Ventas**: Punto de venta con soporte para recetas
- **Cierres de Caja**: Control diario de ventas
- **Recetas**: Gestión de recetas con ingredientes
- **Análisis**: Reportes y estadísticas
- **RRHH**: Control de empleados, nómina y documentos (PNO, Reglamento)

## Comparación con Inventarioy Web

| Característica | Desktop | Web |
|---|---|---|
| **Conexión requerida** | ❌ No | ✅ Sí (con PWA offline) |
| **Base de datos** | SQLite | Supabase |
| **Tecnología offline** | Nativa | PWA + IndexedDB (Dexie.js) |
| **Instalación** | Desktop app | Navegador |
| **Sincronización en la nube** | ❌ No | ✅ Sí |
| **Acceso remoto** | ❌ No | ✅ Sí (en línea) |

## Stack Tecnológico

- **Desktop Framework**: Electron (proceso principal + servidor Fastify local)
- **Frontend**: React 19 + TypeScript + Vite
- **Database**: SQLite (better-sqlite3) — base de datos local
- **Styling**: Tailwind CSS v4 + Zustand
- **Licencia**: Offline con trial 7 días + clave de activación (ed25519)

## Requisitos

- Node.js 18+
- npm

## Instalación

```bash
npm install
```

La aplicación no requiere API keys ni servicios remotos. Todo funciona localmente.

## Ejecución

```bash
npm run desktop
```

Compila el renderer, compila `electron/` y abre la ventana de la aplicación. El servidor Fastify local se levanta automáticamente en `http://127.0.0.1:<puerto>` y sirve la interfaz desde `dist/`.

## Licencia

- **Prueba**: 7 días gratis con todas las funciones al configurar el negocio
- **Plan Profesional**: 5,000 CUP/mes. Pago manual (efectivo o transferencia) y activación con clave de licencia generada por el vendedor
- Al vencer la licencia, la aplicación pasa a modo solo-lectura
- Contacto: WhatsApp **+53 54523884**

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run desktop` | Build del renderer + Electron y abre la app |
| `npm run dev` | Servidor de desarrollo Vite |
| `npm run build` | Build de producción del renderer |
| `npm run lint` | `tsc --noEmit` |
| `node scripts/generar-licencia.mjs --codigo ABC123 --meses 1` | Generar clave de activación (solo vendedor) |

## Variables de Entorno

No se requieren variables de entorno. La aplicación funciona íntegramente en local sin dependencias externas.

---

**¿Necesitas acceso remoto o sincronización en la nube?** Consulta [inventarioy-web](https://github.com/Rafael6357/inventarioy-web) — nuestra versión web con PWA y Supabase.
