# Plan 001 — Porte de la landing al Diseño B + correcciones + tier vitalicio

Referencia `spec.md` (R1-R7, CA1-CA5).

## 1. Decisiones
- D1: Base Diseño B; marca existente (`#FFC107`, Inter). Tokens B (`#ffb800`,
  terminal-green/red, surfaces) se mapean a `@theme` actual; solo se añade
  `--font-mono` local + 3 utilidades (hardware-border, glow, grid-bg).
- D2: Iconos Material Symbols → `lucide-react` (ya instalado). Sin Google Fonts:
  mono = stack local `ui-monospace`.
- D3: Todo `<script>` DOM → `useState` (tabs, presets, calculadora, pricing).
- D4: Pricing = selector de 3 estados (mensual/anual/vitalicio), no toggle binario.
- D5: Se conserva el efecto GSAP (`hero-fade`/`fade-up`) del Landing actual.
- D6: Correcciones de contenido aplicadas según auditoría (ver spec R2); lista de
  16 features honestas rescatada del Diseño A.

## 2. Archivos
| Acción | Ruta | Detalle |
|---|---|---|
| modificar | `src/pages/Landing.tsx` | Reescritura completa (~1100 líneas). Incluye fix Instagram (R7). |
| modificar | `src/index.css` | Añadir `--font-mono` a `@theme` + utilidades `.hardware-border`, `.amber-glow`, `.grid-bg-pattern` en `@layer utilities`. |
| reutilizar | `Button`, `InventarioYLogo`, `TutorialPromptModal`, `useAuthStore` | Sin cambios. |

## 3. Datos
N/A (landing estática; sin migraciones ni endpoints).

## 4. Estrategia UI
- Secciones con `id`: features(pasos), infraestructura, calculadora, pricing, faq, contact.
- Rutas: `/register`, `/acceso`, `/login` vía `Link`; externas: `wa.me/5354523884`,
  `youtu.be/DWl2cgeqcRA`, `instagram.com/inventario_y`.
- Mapeo de iconos clave: point_of_sale→`ShoppingCart`, currency/calculate→`Calculator`,
  wifi_off→`WifiOff`, dialpad→`Dialpad`, visibility_off→`EyeOff`, receipt→`ReceiptText`,
  payments→`Banknote`, print→`Printer`, bolt/download→`Zap`/`Download`,
  play_circle→`Play`, chat→`MessageCircle`, pin→`Pin`, tune→`SlidersHorizontal`,
  desktop_windows/terminal/laptop_mac→`Monitor`/`Terminal`/`Laptop`,
  sync_alt→`ArrowLeftRight`, verified/shield→`ShieldCheck`, key→`KeyRound`,
  save→`Save`, electric_bolt→`Zap`, menu_book→`BookOpen`, storefront→`Store`,
  broken_image→`PackageX`, photo_camera→`Camera`, smart_display→`MonitorPlay`,
  open_in_new→`ExternalLink`, check_circle→`CheckCircle2`, star→`Star` (fill),
  warning→`TriangleAlert`, trending_up→`TrendingUp`, delete_sweep→`Trash2`,
  inventory_2/filter_alt→`Package`/`Filter`, payments/account→`Wallet`,
  rocket_launch→`Rocket`, person→`User`, bolt→`Zap`.
- Precios: mensual `5,000 CUP/mes` · anual `54,000 CUP/año` (equiv. 4,500/mes,
  ahorras 6,000) · vitalicio `130,000 CUP pago único` (+ "Actualizaciones del
  producto incluidas de por vida").
- Matriz 16 features honestas (R3): productos ilimitados, alertas stock mínimo,
  movimientos (entradas/salidas/mermas/ajustes), Tránsito interno, cierres por
  turno con validación, POS (Salón/Domicilio/Bar/Rápida), cobro mixto CUP-transf-
  USD-EUR-Zelle, recetas con descuento automático, personal+roles PIN+nómina,
  biblioteca PNO, gráficos/análisis, menú QR, tickets 58/80mm, export Excel,
  multi-caja LAN, 100% offline + soporte WhatsApp.
- FAQ (7): apagón/WAL · respaldo honesto (autos internos + copia manual del
  archivo a USB) · impresoras 58/80 (sin gaveta) · renovación licencia ·
  cómo empiezo · múltiples usuarios · pago único vitalicio.
- Testimonios: estructura B, sin cifras inventadas.
- Pasos (4): descarga (~100MB, solo Windows 10/11 64-bit) · registra productos
  (teclado rápido, sin Excel) · asigna PINs y roles · abre caja y cobra.
- Footer: año dinámico, sin versión hardcodeada, Instagram `@inventario_y`.

## 5. Verificación
- `npm run lint` + `npm run build` en verde (CA1).
- Grep CA2 sobre `src/pages/Landing.tsx` (cero coincidencias prohibidas).
- Click-through manual en `npm run desktop`: tabs, presets, sliders, selector
  3 estados, anclas, CTAs (CA3-CA4); sin red (CA5).

## 6. Rollback
`git checkout -- src/pages/Landing.tsx src/index.css` (cambios aislados en 2 archivos).
