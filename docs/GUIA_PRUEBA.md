# GUÍA DE PRUEBA — InventarioY (7 días)

Prueba manual completa de la aplicación **desktop** usando una base de datos **aislada** (no toca la BD real del negocio configurado).

> Escenario: **"Restaurante El Prueba"** — negocio mixto restaurante + tienda.
> Duración: **7 días** (lunes → domingo). El domingo es día de descanso (no se cierra caja) para verificar la lógica de fechas.

---

## 1. Objetivo y alcance

Verificar en la UI, en un escenario real e intenso:

- Alta de productos (ingredientes + tienda) y recetas con consumo de ingredientes.
- Movimientos: `ENTRADA`, `SALIDA` (hacia tránsito/cocina) y `MERMA`.
- Modelo de stock: **Disponible** (almacén) vs **Tránsito** (cocina/venta). Las ventas y recetas consumen **solo de tránsito**.
- Ventas de los 4 tipos: `SALON`, `DOMICILIO`, `BAR`, `VENTA_RAPIDA`, con pagos mixtos (efectivo / transferencia / USD / EUR).
- Cuentas pendientes (crédito), cobros y **cuenta de la casa**.
- Cierres de caja diarios y bloqueo de ventas retroactivas.
- Fix `is_active`: editar precio/ROP y **eliminar** un producto verificando que no reaparezca.
- Totales de cierre por tipo de venta y por moneda, y Análisis (ingresos/gastos/ganancia).

---

## 2. Preparación del entorno aislado (Paso 0)

La app **solo permite un negocio por base de datos** (`setup` se rechaza si ya existe `owner`). Para no contaminar la BD real, la app se lanza apuntando `APPDATA` a una carpeta temporal: la BD nueva se crea ahí.

1. **Cerrar la app real** (hay bloqueo de instancia única; si queda abierta la instancia real, la de prueba no arranca).
2. Localizar la BD real (para copiar la licencia y para no tocarla):
   - `%APPDATA%\InventarioY\inventarioy.db`
   - `%APPDATA%\InventarioY\license-private.pem`
3. Crear carpeta de prueba:
   - `C:\Users\<usuario>\AppData\Local\Temp\inventarioy-prueba`
4. **Copiar la licencia** a la carpeta de prueba:
   - Copiar `license-private.pem` desde la carpeta real → `C:\Users\<usuario>\AppData\Local\Temp\inventarioy-prueba\InventarioY\`
   - (Sin este archivo también funciona: el setup nuevo inicia un **trial de 7 días** automático; la copia es solo una seguridad adicional.)
5. **Lanzar la app con APPDATA sobreescrito**. Dos opciones:

   **A) App instalada (recomendada):**
   ```
   cmd
   set APPDATA=C:\Users\<usuario>\AppData\Local\Temp\inventarioy-prueba
   "C:\Program Files\InventarioY\InventarioY.exe"
   ```
   > Si no recuerdas la ruta exacta del ejecutable instalado: acceso directo del menú Inicio → "Abrir ubicación del archivo".

   **B) Desarrollo (si tienes el repo):**
   ```
   cmd
   set APPDATA=C:\Users\<usuario>\AppData\Local\Temp\inventarioy-prueba
   npm run desktop
   ```
   (workdir: raíz del repo)

6. Verificar que se muestra la pantalla de **Registro** (setup nuevo). Si aparece el login con el negocio real, el `APPDATA` no se aplicó: cierra todo y revisa el paso 5.

> Al terminar la prueba (paso 8) se borra `inventarioy-prueba` y la BD real queda intacta.

---

## 3. Configuración inicial (Paso 1)

En la pantalla **Registrar negocio**:

| Campo | Valor |
|---|---|
| Nombre del negocio | `Restaurante El Prueba` |
| PIN de Dueño/a | `1234` |
| Teléfono | `(opcional)` |
| Dirección | `(opcional)` |
| Horario | `(opcional)` |
| Mensaje del ticket | `¡Gracias por su visita!` |

**Configuración → Monedas** (Configuración):
- Activar **USD** → tasa `320`
- Activar **EUR** → tasa `350`
- Activar **Transferencia (cup)**

**Recursos Humanos → Empleados**:

| Empleado | Rol | PIN |
|---|---|---|
| Juan | Dependiente | `2345` |
| María | Supervisora | `3456` |

**Configuración → Control de Acceso por PIN** (componente AccessPinsConfig):
- Crear PIN **Supervisor/a** → nombre `María` → PIN `3456`
- Crear PIN **Dependiente** → nombre `Juan` → PIN `2345`
- (El PIN de Dueño/a `1234` se creó en el setup.)

**Categorías** (Inventario → Categorías): crear `Cocina`, `Bebidas`, `Carnes`, `Granos`, `Vegetales`, `Abarrotes` (el setup ya crea `General`; queda libre).

> Nota: el setup ya crea el almacén **"Almacén"** (`is_main`). No crear otro.

---

## 4. Catálogo (Paso 2)

> `Costo` = costo_unitario · `Precio` = precio_venta · `ROP` = punto de reorden.
> La **cantidad inicial** al crear el producto genera una `ENTRADA` automática al almacén (stock disponible).

### 4.1 Ingredientes (NO individuales — no van al carrito de ventas)

| Producto | Categoría | Unidad | Costo | Precio | ROP | Stock inicial |
|---|---|---|---|---|---|---|
| Arroz | Granos | kg | 60 | 90 | 5 | 50 |
| Frijoles negros | Granos | kg | 50 | 80 | 4 | 30 |
| Carne de cerdo | Carnes | kg | 130 | 200 | 4 | 20 |
| Pollo | Carnes | kg | 110 | 170 | 4 | 15 |
| Aceite | Cocina | L | 90 | 140 | 3 | 10 |
| Cebolla | Vegetales | kg | 25 | 45 | 2 | 8 |
| Ajo | Vegetales | kg | 60 | 100 | 1 | 4 |
| Sal | Cocina | kg | 8 | 15 | 1 | 5 |
| Papa | Vegetales | kg | 30 | 55 | 3 | 12 |
| Tomate | Vegetales | kg | 35 | 60 | 2 | 6 |
| Plátano | Vegetales | kg | 15 | 30 | 2 | 10 |

### 4.2 Tienda (individuales `u` — sí van al carrito)

| Producto | Categoría | Unidad | Costo | Precio | ROP | Stock inicial |
|---|---|---|---|---|---|---|
| Refresco | Bebidas | u | 40 | 100 | 6 | 24 |
| Agua | Bebidas | u | 15 | 50 | 12 | 36 |
| Cerveza | Bebidas | u | 70 | 150 | 6 | 24 |
| Café | Bebidas | u | 30 | 80 | 6 | 18 |
| Pan | Abarrotes | u | 5 | 25 | 12 | 40 |
| Detergente | Abarrotes | u | 60 | 110 | 3 | 6 |
| Jabón | Abarrotes | u | 40 | 80 | 3 | 6 |

> Detergente y Jabón se crean pero **no reciben movimientos** en toda la prueba: verifican que los productos con stock en almacén y sin tránsito se muestran bien.

### 4.3 Recetas (Inventario → Recetas)

| Plato | Precio | Ingredientes (cantidad) |
|---|---|---|
| Arroz con pollo | 450 | Arroz 0.25, Pollo 0.30, Aceite 0.02, Cebolla 0.02, Ajo 0.01, Sal 0.01 |
| Congrí | 380 | Arroz 0.25, Frijoles 0.20, Aceite 0.02, Cebolla 0.02, Sal 0.01 |
| Cerdo asado | 500 | Carne 0.35, Ajo 0.01, Cebolla 0.03, Aceite 0.03, Sal 0.01 |
| Masas de cerdo | 450 | Carne 0.30, Ajo 0.01, Cebolla 0.02, Aceite 0.04, Sal 0.01 |
| Tostones | 120 | Plátano 0.25, Aceite 0.03, Sal 0.005 |
| Papas fritas | 150 | Papa 0.30, Aceite 0.05, Sal 0.01 |

---

## 5. Calendario de prueba (días 1–7)

### Convenciones
- **SALIDA → Cocina**: movimiento `SALIDA` con destino "Hacia Tránsito/Cocina". Descuenta almacén y suma tránsito.
- **Venta**: en `SALON`/`DOMICILIO`/`BAR`/`VENTA_RAPIDA`, el carrito solo muestra **individuales y recetas**.
- Los valores esperados de **Tránsito** están al final de cada día (después de las ventas).

---

### DÍA 1 — Lunes (apertura)

**1. SALIDAS a cocina/tránsito** (Inventario → Movimientos):

| Producto | Tipo | Cantidad |
|---|---|---|
| Arroz | SALIDA | 5 kg |
| Pollo | SALIDA | 3 kg |
| Carne de cerdo | SALIDA | 3 kg |
| Aceite | SALIDA | 2 L |
| Cebolla | SALIDA | 2 kg |
| Ajo | SALIDA | 0.3 kg |
| Sal | SALIDA | 0.3 kg |
| Papa | SALIDA | 3 kg |
| Plátano | SALIDA | 2 kg |
| Frijoles negros | SALIDA | 2 kg |

**2. SALIDAS a tienda/tránsito:**

| Producto | Tipo | Cantidad |
|---|---|---|
| Refresco | SALIDA | 6 u |
| Agua | SALIDA | 6 u |
| Cerveza | SALIDA | 6 u |
| Café | SALIDA | 6 u |
| Pan | SALIDA | 10 u |

**3. Ventas** (Ventas → Nueva venta; fecha = lunes):

| # | Tipo | Items | Total | Pago |
|---|---|---|---|---|
| V1 | SALON | 2× Arroz con pollo + 2× Refresco | 1100 | Efectivo 1100 |
| V2 | SALON | 1× Congrí + 1× Café | 460 | Efectivo 460 |
| V3 | VENTA_RAPIDA | 2× Pan + 1× Agua | 100 | Efectivo 100 |

**4. Cuenta pendiente** (Ventas → Ventas a Crédito):
- Cliente nuevo: **Ana**
- Agregar a la cuenta: `1× Cerdo asado (500) + 1× Cerveza (150) = 650`
- ⚠️ **No cobrar hoy**. Nota: al agregar a la cuenta **solo se valida** el tránsito; **no se descuenta** hasta el cobro.

**5. Cerrar caja del lunes** (Cierres de Caja → Nuevo cierre, fecha lunes).

**Valores esperados del cierre lunes:**
- SALON: `1560` · DOMICILIO: `0` · BAR: `0` · VENTA_RAPIDA: `100`
- Efectivo: `1660`
- Cuenta pendiente Ana: `650` (sin pagar)

**Tránsito esperado (fin de lunes):**

| Producto | Tránsito | | Producto | Tránsito |
|---|---|---|---|---|
| Arroz | 4.25 | | Refresco | 4 |
| Pollo | 2.4 | | Agua | 5 |
| Carne | 3 | | Cerveza | 6 |
| Aceite | 1.94 | | Café | 5 |
| Cebolla | 1.94 | | Pan | 8 |
| Ajo | 0.28 | | Papa | 3 |
| Sal | 0.27 | | Plátano | 2 |
| Frijoles | 1.8 | | | |

---

### DÍA 2 — Martes

**1. ENTRADA (reposición):**

| Producto | Cantidad |
|---|---|
| Arroz | 10 kg |
| Pollo | 5 kg |
| Carne de cerdo | 5 kg |
| Aceite | 2 L |
| Cebolla | 1 kg |
| Refresco | 6 u |
| Cerveza | 12 u |
| Café | 12 u |
| Pan | 10 u |

**2. MERMA (desde almacén):** Tomate `1 kg` (descompuesto).

**3. SALIDAS a tránsito:** Arroz 4 kg · Pollo 2 kg · Carne 2 kg · Aceite 1 L · Cebolla 1 kg · Papa 2 kg · Plátano 1 kg · Frijoles 1 kg · Refresco 6 u · Agua 6 u · Cerveza 6 u · Café 6 u · Pan 10 u.

**4. Cobro de cuenta pendiente de Ana (650):** Ventas a Crédito → Ana → **Cobrar** (Efectivo 650).
> Este cobro registra una venta `SALON` **de hoy** y consume el tránsito del Cerdo asado y la Cerveza.

**5. Ventas:**

| # | Tipo | Items | Total | Pago |
|---|---|---|---|---|
| V4 | DOMICILIO | 1× Cerdo asado + 2× Refresco | 700 | Efectivo 600 + Transferencia 100 |
| V5 | BAR | 2× Cerveza + 1× Café | 380 | Efectivo 60 + USD 1 |
| V6 | SALON | 2× Tostones + 1× Papas fritas | 390 | Efectivo 390 |

**6. Test bloqueo retroactivo:** intentar una venta con **fecha = lunes** (ya cerrado) → **debe bloquearse** (`isDateClosed`).

**7. Cerrar caja del martes.**

**Valores esperados del cierre martes:**
- SALON: `1040` (cobro Ana 650 + venta 390) · DOMICILIO: `700` · BAR: `380`
- Efectivo: `1700` · Transferencia: `100` · USD: `1`

**Tránsito esperado (fin de martes):** Arroz 8.25 · Pollo 4.4 · Carne 4.3 · Aceite 2.77 · Cebolla 2.88 · Ajo 0.26 · Sal 0.23 · Papa 4.7 · Plátano 2.5 · Frijoles 2.8 · Refresco 8 · Agua 11 · Cerveza 9 · Café 10 · Pan 18.

---

### DÍA 3 — Miércoles

**1. SALIDAS a tránsito:** Arroz 3 kg · Pollo 2 kg · Carne 2 kg · Aceite 1 L · Cebolla 1 kg · Papa 2 kg · Plátano 2 kg · Frijoles 1 kg · Refresco 6 u · Agua 6 u · Cerveza 6 u · Café 6 u · Pan 10 u.

**2. Ventas:**

| # | Tipo | Items | Total | Pago |
|---|---|---|---|---|
| V7 | SALON | 1× Arroz con pollo + 1× Congrí | 830 | Efectivo 830 |
| V8 | DOMICILIO | 1× Cerdo asado + 2× Café | 660 | USD 2 (640) + Efectivo 20 |
| V9 | BAR | 2× Cerveza + 1× Café + 1× Agua | 430 | EUR 1 (350) + Efectivo 80 |
| V10 | VENTA_RAPIDA | 3× Pan + 1× Refresco | 175 | Efectivo 175 |

**3. Cuenta de la casa:** Ventas a Crédito → cliente nuevo **"Cuenta Casa"** activando **"Es cuenta de la casa"** → agregar `1× Arroz con pollo (450)`.
- Verificar que el total de la cuenta es **0** (no se cobra). Tampoco consume tránsito.

**4. Cerrar caja del miércoles.**

**Valores esperados del cierre miércoles:**
- SALON: `830` · DOMICILIO: `660` · BAR: `430` · VENTA_RAPIDA: `175`
- Efectivo: `1105` · USD: `2` · EUR: `1`
- (Cuenta Casa 450: pendiente, total 0.)

**Tránsito esperado (fin de miércoles):** Arroz 10.5 · Pollo 5.8 · Carne 5.95 · Aceite 3.7 · Cebolla 3.81 · Ajo 0.24 · Sal 0.20 · Papa 6.7 · Plátano 4.5 · Frijoles 3.6 · Refresco 13 · Agua 16 · Cerveza 13 · Café 13 · Pan 25.

---

### DÍA 4 — Jueves (test del fix `is_active`)

**1. Test editar producto:** Inventario → Stock → **Tomate** → Editar → cambiar **precio** a `65` y guardar. Verificar que el nuevo precio se refleja.

**2. Test eliminar producto:** Inventario → Stock → **Tomate** → Eliminar.
- Verificar que **no aparece** en: Stock, Inventario, Carrito de ventas, Recetas, Consumo, Análisis.
- Si reinicias la app, sigue sin aparecer (borrado lógico `is_active=0`).

**3. SALIDAS a tránsito:** Arroz 3 kg · Pollo 2 kg · Carne 2 kg · Aceite 1 L · Cebolla 1 kg · Papa 1 kg · Plátano 1 kg · Refresco 6 u · Agua 6 u · Cerveza 6 u · Café 6 u · Pan 10 u.

**4. Ventas:**

| # | Tipo | Items | Total | Pago |
|---|---|---|---|---|
| V11 | SALON | 2× Congrí + 1× Café | 840 | Efectivo 840 |
| V12 | DOMICILIO | 1× Arroz con pollo + 1× Papas fritas | 600 | Efectivo 600 |
| V13 | BAR | 3× Cerveza | 450 | Efectivo 450 |
| V14 | VENTA_RAPIDA | 2× Pan + 1× Refresco | 150 | Efectivo 150 |

**5. Cerrar caja del jueves.**

**Valores esperados del cierre jueves:**
- SALON: `840` · DOMICILIO: `600` · BAR: `450` · VENTA_RAPIDA: `150`
- Efectivo: `2040`

**Tránsito esperado (fin de jueves):** Arroz 12.75 · Pollo 7.5 · Carne 7.95 · Aceite 4.59 · Cebolla 4.75 · Ajo 0.23 · Sal 0.16 · Papa 7.4 · Plátano 5.5 · Frijoles 3.2 · Refresco 18 · Agua 22 · Cerveza 16 · Café 18 · Pan 33.

---

### DÍA 5 — Viernes (semana fuerte)

**1. ENTRADA (reposición):** Arroz 15 kg · Pollo 5 kg · Carne 5 kg · Aceite 3 L · Frijoles 5 kg · Refresco 12 u · Agua 12 u · Cerveza 12 u · Café 12 u · Pan 20 u.

**2. MERMA (desde almacén):** Sal `0.5 kg`.

**3. SALIDAS a tránsito:** Arroz 8 kg · Pollo 4 kg · Carne 4 kg · Aceite 2 L · Cebolla 2 kg · Ajo 0.5 kg · Sal 0.5 kg · Papa 3 kg · Plátano 3 kg · Frijoles 3 kg · Refresco 12 u · Agua 12 u · Cerveza 12 u · Café 12 u · Pan 20 u.

**4. Ventas (los 4 tipos + pago mixto):**

| # | Tipo | Items | Total | Pago |
|---|---|---|---|---|
| V15 | SALON | 3× Arroz con pollo + 3× Refresco | 1650 | Efectivo 1000 + Transferencia 650 |
| V16 | DOMICILIO | 2× Cerdo asado + 2× Café | 1160 | USD 2 (640) + Efectivo 520 |
| V17 | BAR | 4× Cerveza + 2× Tostones | 840 | Efectivo 490 + EUR 1 (350) |
| V18 | VENTA_RAPIDA | 4× Pan + 2× Agua | 200 | Efectivo 200 |

**5. Cerrar caja del viernes.**

**Valores esperados del cierre viernes:**
- SALON: `1650` · DOMICILIO: `1160` · BAR: `840` · VENTA_RAPIDA: `200`
- Efectivo: `2210` · Transferencia: `650` · USD: `2` · EUR: `1`

**Tránsito esperado (fin de viernes):** Arroz 20 · Pollo 10.6 · Carne 11.25 · Aceite 6.41 · Cebolla 6.63 · Ajo 0.68 · Sal 0.60 · Papa 10.4 · Plátano 8 · Frijoles 6.2 · Refresco 27 · Agua 32 · Cerveza 24 · Café 28 · Pan 49.

---

### DÍA 6 — Sábado

**1. SALIDAS a tránsito:** Arroz 2 kg · Pollo 1 kg · Carne 1 kg · Refresco 6 u · Agua 6 u · Cerveza 6 u · Café 6 u · Pan 10 u.

**2. MERMA en tránsito** (Transito/Cocina → Merma en tránsito): Papa `0.5 kg`.

**3. Ventas:**

| # | Tipo | Items | Total | Pago |
|---|---|---|---|---|
| V19 | SALON | 1× Arroz con pollo + 1× Café | 530 | Efectivo 530 |
| V20 | BAR | 3× Cerveza + 1× Tostones | 570 | Efectivo 250 + USD 1 |
| V21 | VENTA_RAPIDA | 3× Pan + 1× Refresco | 175 | Efectivo 175 |

**4. Cerrar caja del sábado.**

**Valores esperados del cierre sábado:**
- SALON: `530` · BAR: `570` · VENTA_RAPIDA: `175`
- Efectivo: `955` · USD: `1`

**Tránsito esperado (fin de sábado):** Arroz 21.75 · Pollo 11.3 · Carne 12.25 · Aceite 6.36 · Cebolla 6.61 · Ajo 0.67 · Sal 0.585 · Papa 9.9 · Plátano 7.75 · Frijoles 6.2 · Refresco 32 · Agua 38 · Cerveza 27 · Café 33 · Pan 56.

---

### DÍA 7 — Domingo (descanso, SIN cierre)

**1. SALIDAS a tránsito:** Refresco 3 u · Agua 3 u · Café 3 u · Pan 5 u.

**2. Venta (operación mínima):**

| # | Tipo | Items | Total | Pago |
|---|---|---|---|---|
| V22 | VENTA_RAPIDA | 2× Pan + 1× Café | 130 | Efectivo 130 |

**3. NO cerrar caja del domingo.** Verificar:
- El domingo **no aparece** en Cierres de Caja.
- La app sigue operando (ventas registradas con fecha domingo).
- Los cierres de lunes→sábado permanecen intactos.
- Análisis muestra las ventas del domingo sin cierre.

**Tránsito esperado (fin de domingo):** Arroz 21.75 · Pollo 11.3 · Carne 12.25 · Aceite 6.36 · Cebolla 6.61 · Ajo 0.67 · Sal 0.585 · Papa 9.9 · Plátano 7.75 · Frijoles 6.2 · Refresco 35 · Agua 41 · Cerveza 27 · Café 35 · Pan 59.

---

## 6. Resumen de totales esperados (lunes → sábado)

| Día | SALON | DOMICILIO | BAR | VENTA_RAPIDA | Total | Efectivo | Transferencia | USD | EUR |
|---|---|---|---|---|---|---|---|---|---|
| Lunes | 1560 | 0 | 0 | 100 | 1660 | 1660 | 0 | 0 | 0 |
| Martes | 1040 | 700 | 380 | 0 | 2120 | 1700 | 100 | 1 | 0 |
| Miércoles | 830 | 660 | 430 | 175 | 2095 | 1105 | 0 | 2 | 1 |
| Jueves | 840 | 600 | 450 | 150 | 2040 | 2040 | 0 | 0 | 0 |
| Viernes | 1650 | 1160 | 840 | 200 | 3850 | 2210 | 650 | 2 | 1 |
| Sábado | 530 | 0 | 570 | 175 | 1275 | 955 | 0 | 1 | 0 |
| **Total** | **6450** | **3120** | **2670** | **800** | **13040** | **9670** | **750** | **6** | **2** |

USD = 6 × 320 = 1920 · EUR = 2 × 350 = 700 → **9670 + 750 + 1920 + 700 = 13040** ✓

**Stock disponible (almacén) esperado al final de la semana:**

| Producto | Disponible | | Producto | Disponible |
|---|---|---|---|---|
| Arroz | 50 | | Refresco | 0 |
| Frijoles | 28 | | Agua | 6 |
| Carne | 16 | | Cerveza | 6 |
| Pollo | 11 | | Café | 0 |
| Aceite | 8 | | Pan | 0 |
| Cebolla | 2 | | Detergente | 6 |
| Ajo | 3.2 | | Jabón | 6 |
| Sal | 3.7 | | Tomate | (oculto, eliminado) |
| Papa | 1 | | | |
| Plátano | 2 | | | |

> Refresco, Café y Pan en `0` disparan el **punto de reorden** (ROP): deben aparecer alertas/avisos de bajo stock.

---

## 7. Checklist final

- [ ] Todos los cierres (lunes→sábado) cuadran por **tipo de venta** y por **moneda** según la tabla del punto 6.
- [ ] Stock disponible y tránsito coinciden con los valores esperados (los puntos de chequeo diarios).
- [ ] Análisis (rango lunes→domingo): ingresos totales `13170` (13040 + domingo 130) con gastos y ganancia consistentes; ventas de domingo incluidas.
- [ ] Recetas consumen solo de **tránsito**; las ventas de la semana no descontaron el almacén.
- [ ] Cuenta pendiente de **Ana** cobrada (650) aparece como venta SALON del martes.
- [ ] Cuenta de la casa aparece con **total 0** y sin consumo de inventario.
- [ ] Venta retroactiva a un día cerrado **bloqueada**.
- [ ] **Tomate eliminado no reaparece** en ningún módulo ni tras reiniciar la app.
- [ ] Tickets: mensaje, totales y monedas correctos; impresión/visualización por rol según PIN.
- [ ] Roles por PIN: Dueño (1234) ve todo · Supervisora (2345) y Dependiente (3456) ven solo sus módulos.
- [ ] DOMINGO sin cierre: la app sigue operando y los cierres anteriores siguen intactos.

---

## 8. Limpieza

1. Cerrar la app de prueba.
2. Borrar la carpeta `C:\Users\<usuario>\AppData\Local\Temp\inventarioy-prueba`.
3. Verificar que la BD real `%APPDATA%\InventarioY\inventarioy.db` **no fue modificada** (sin ventas de prueba).
4. La app real sigue funcionando con su negocio y licencia de siempre.