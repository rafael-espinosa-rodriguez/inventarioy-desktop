# InventarioY — Manual de uso

Versión 1.0 · Windows 10/11 (64 bits) · Aplicación 100% local (sin internet)

---

## 1. Requisitos del sistema

- Computadora con **Windows 10 u 11** (64 bits).
- No se necesita internet para trabajar: todos sus datos se guardan en la propia computadora.
- No requiere instalación de ninguna otra aplicación (Base de datos, servidor, etc.).

## 2. Instalación

1. Copie el archivo **`InventarioY Setup 1.0.0.exe`** a su computadora (por ejemplo, en el Escritorio).
2. Haga doble clic en el archivo para instalar.
3. Si Windows muestra el aviso **"Windows protegió su equipo"** (porque el programa no tiene certificado digital), haga clic en **"Más información"** y luego en **"Ejecutar de todos modos"**. Es normal en programas pequeños.
4. Elija la carpeta de instalación (puede dejar la que sugiere el instalador) y pulse **Instalar**.
5. Al terminar, abra **InventarioY** desde el acceso directo del Escritorio o del Menú Inicio.

## 3. Primer uso (configuración inicial)

La primera vez que abre la aplicación debe crear su negocio:

1. Escriba el **nombre del negocio**.
2. Cree un **PIN de 4 dígitos** (es la contraseña para entrar; guárdelo bien).
3. Opcionalmente complete teléfono, dirección y horario de atención.
4. Pulse el botón para terminar la configuración.

Al terminar, la aplicación genera automáticamente su **Código de Negocio** (ej.: `ABC123`). Lo verá en **Ajustes → Licencia**. Ese código es importante para activar su licencia.

Al abrir el sistema por primera vez, se le mostrará la pregunta **"¿Quiere aprender a usar la App?"**. Seleccione **"Sí, ver el tutorial"** para ver una guía paso a paso de todo el sistema.

## 4. Entrar a la aplicación

- Abra InventarioY e introduzca su **PIN de 4 dígitos**.
- Según el rol asignado (Dueño/a, Administrador, Dependiente, etc.) verá las secciones correspondientes: Panel, Productos, Ventas, Inventario, Análisis, Menú digital, entre otras.

## 5. Cargar el inventario inicial (importar desde Excel)

Si ya tiene su inventario en una hoja de cálculo, no necesita escribir los productos uno por uno:

1. Vaya a **Inventario** y pulse **"Importar inventario"**.
2. Pulse **"Descargar plantilla"**: se descarga `plantilla-inventario.csv`, que puede abrir en Excel.
3. Llene una fila por producto. Solo el **Nombre** es obligatorio; puede completar categoría, unidad, cantidad, costo, precio, stock mínimo (ROP), EOQ, vencimiento y descripción. Las columnas **Individual**, **Gasto variable** y **Consumo directo** se responden con **Sí** o **No**.
4. Guarde el archivo como **CSV** y súbalo con el selector de archivo.
5. Revise la **vista previa**: verá las filas válidas, las duplicadas (se omiten) y las que tienen error con su motivo.
6. Pulse **Importar**: los productos se crean con su **stock inicial** registrado como movimiento de entrada.

**Consejos:**

- Use **coma** para los decimales (ej.: `8,5`) y no use separador de miles. Si escribe `1,600`, la vista previa mostrará un **aviso** porque lo interpretará como `1.6`; para 1600 escríbalo sin separador.
- Las fechas se aceptan como `AAAA-MM-DD` o `DD/MM/AAAA`.
- Unidades aceptadas: g, kg, lb, oz, u (unidades), ml, L, gal, fl oz, sac (sacos) y lat (latas). Si escribe otra (por ejemplo `caja` o `bolsa`), se cargará como **unidades (u)** y aparecerá un aviso en la vista previa.
- Los productos cuyo nombre ya existe **no se modifican**: se omiten y se informan en el reporte.
- Máximo **2 000 filas** por importación. Si tiene más, impórtelas por partes.
- Haga un **respaldo** antes de una importación grande (ver punto 7).

## 6. Licencia y activación

La aplicación funciona en modo de **prueba gratis por 7 días**. Pasado ese tiempo necesita una **clave de activación**.

**Para activar:**

1. Vaya a **Ajustes → Licencia**.
2. Confirme su **Código de Negocio** (aparece en esa misma pantalla).
3. Pulse **"Activar licencia"** e introduzca la **clave** que le entregó el vendedor.
4. Pulse **Activar**. Verá el estado **"Activa"** (y **"Licencia vitalicia"** si su contrato es de por vida).

**Estados posibles de la licencia:**

- **Prueba Gratis:** los primeros 7 días.
- **Activa:** licencia vigente (suscripción mensual, anual o vitalicia).
- **Vencida:** la aplicación deja de permitir ventas y movimientos hasta que se renueve (los datos no se pierden).

**Si la activación es rechazada:**

- **"La clave no corresponde a este negocio":** verifique que el Código de Negocio en pantalla sea el suyo y que la clave sea la emitida para ese código.
- **"La clave ya está vencida":** solicite una clave nueva al vendedor; las claves con fecha pasada no se activan.

La licencia está ligada a su **Código de Negocio**, no a la computadora. Eso permite cambiarse de equipo sin perder la licencia (ver punto 8).

## 7. Respaldo de sus datos (IMPORTANTE)

Sus datos (productos, ventas, inventario) se guardan **solo en su computadora**. No existe copia en internet, por lo que **la responsabilidad de respaldarlos es del cliente**.

**Cómo respaldar:**

1. Cierre InventarioY.
2. Copie la carpeta completa **`%APPDATA%\inventarioy`** (en Windows, pegue esa ruta en la barra del Explorador de archivos) a una memoria USB o a un espacio personal en la nube (Google Drive, etc.).
3. Haga este respaldo con frecuencia (sugerido: al menos una vez por semana, o diario si vende mucho).

La carpeta contiene la base de datos **`inventarioy.db`** con toda la información del negocio.

## 8. Cambiar de computadora

1. Instale InventarioY en la nueva computadora.
2. Complete la configuración inicial (puede usar el mismo nombre de negocio).
3. En **Ajustes → Código de Acceso**, escriba el **mismo Código de Negocio** que tenía (el de su licencia).
4. Active con la **misma clave** de activación.
5. (Opcional) Restaure su respaldo: copie la carpeta `%APPDATA%\inventarioy` desde la USB/nube a la nueva máquina.

## 9. Preguntas frecuentes

- **Al abrir el menú digital, Windows pide permitir acceso a la red.** Acepte y marque "Red privada": es necesario para que los teléfonos del local se conecten al menú por el WiFi.
- **El menú digital se ve vacío.** Asegúrese de marcar los productos que desea mostrar en el menú (opción "Mostrar en menú" / individual) y de crear los precios correspondientes.
- **Olvidé mi PIN.** Comuníquese con el vendedor para restablecerlo.
- **¿Tengo que escribir todos mis productos uno por uno?** No. En **Inventario → Importar inventario** puede cargar todo su inventario desde Excel o CSV con la plantilla incluida (ver punto 5).
- **Perdí mi clave de activación.** Comuníquese con el vendedor; puede generarle otra con la misma validez.
- **Cambié la fecha/hora del sistema.** No lo haga: la aplicación detecta retrocesos de reloj y puede bloquearse temporalmente por seguridad.
- **¿Necesito internet para trabajar?** No. Todo funciona local. Solo necesita el WiFi del local para que los clientes abran el menú digital con el QR.
- **¿Puedo vender desde una tablet o un celular?** Sí, como caja adicional por el WiFi del local (ver punto 10). La PC debe estar encendida y los equipos en la misma red.

## 10. Varios puntos de venta en el mismo local (Multi-caja)

Si su negocio tiene más de una caja o punto de venta, puede instalar InventarioY en varias computadoras y conectarlas a la **misma red WiFi/LAN** del local. Todas comparten la **misma base de datos central**, por lo que el inventario y las ventas se ven en tiempo real en todas las cajas.

- Las cajas/puntos de venta se administran en **Configuración → Cajas / Puntos de Venta**.
- En el panel lateral, el selector **"Caja activa"** indica desde qué caja se está vendiendo en ese momento.
- Los **Cierres de Caja** pueden filtrarse por caja para conciliar cada punto de venta por separado.

### Tablets y celulares como cajas

También puede usar **tablets o celulares** como cajas, sin instalar nada en ellos:

1. Mantenga la PC con InventarioY **encendida** y conectada al WiFi del local.
2. Permita el acceso de InventarioY en el **Firewall de Windows** (red privada) la primera vez.
3. En la tablet o celular, abra el navegador y entre a `http://<IP-de-la-PC>:4173` (la IP se la puede indicar el vendedor).
4. Entre con el **código de negocio** y el **PIN** del empleado; elija su **Caja activa** en el menú lateral.
5. Cada dependiente debe tener un PIN con rol de **Dependiente** para que solo vea el módulo **Ventas**.

**Importante:** la tablet/celular necesita la PC encendida y en la misma red (no funciona por internet ni con la PC apagada). La impresión térmica directa está disponible en la PC; desde una tablet o celular solo se puede imprimir con el diálogo del navegador hacia una impresora compartida.

## 11. Turnos (doble cierre de caja)

Opcionalmente puede activar **dos turnos** (por ejemplo, mañana y tarde) para tener **dos cierres de caja por día**.

- Se configura en **Configuración → Turnos (Doble Turno)**: active el interruptor y defina la **hora de corte** entre el Turno 1 y el Turno 2.
- Las ventas se clasifican automáticamente en el turno que corresponda según la hora en que se realizan; no hace falta seleccionar el turno al vender.
- En **Cierres de Caja** podrá cerrar cada turno por separado y consultar el desglose de cada uno.

## 12. Soporte y actualizaciones

- **Soporte:** incluido según las condiciones de su contrato (ver hoja de entrega).
- **Actualizaciones:** la licencia **vitalicia** incluye actualizaciones de la aplicación. Las suscripciones mensuales incluyen actualizaciones mientras estén vigentes.
- Para cualquier duda o trámite: **+53 54523884** (vendedor).

---

© InventarioY. Este manual es material de acompañamiento del software; los datos del cliente son de su entera responsabilidad.
