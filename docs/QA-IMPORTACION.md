# QA manual — Importar inventario (app instalada)

Checklist para ejecutar sobre el instalador real antes de entregar a un cliente.
Marcar cada punto con fecha e iniciales. Usar una PC/instalación de prueba, nunca
la base de datos real de un cliente.

## 0. Preparación
- [ ] Instalar `InventarioY Setup 1.0.0.exe` en una PC limpia.
- [ ] Crear negocio de prueba (nombre + PIN). Anotar el **Código de Negocio**.
- [ ] Hacer un respaldo inicial: **Ajustes → Respaldos → Crear respaldo ahora**.

## 1. Landing y precios
- [ ] La landing muestra **Mensual 5,000 CUP**, **Anual 54,000 CUP** y **Vitalicio 250 USD**.
- [ ] El menú dice **“Planes”** (no “Plan CUP”).
- [ ] La FAQ de pago menciona CUP (mensual/anual) y USD (vitalicio).
- [ ] La FAQ de tablets/celulares aparece y describe los requisitos.

## 2. Plantilla y Excel
- [ ] Inventario → **Importar inventario** → **Descargar plantilla**.
- [ ] Abrir `plantilla-inventario.csv` en Excel: se ven las 13 columnas y 3 ejemplos.
- [ ] Guardar como **CSV UTF-8** (Archivo → Guardar como).
- [ ] Volver a guardar como **CSV (delimitado por comas)**.
- [ ] (Opcional) Guardar como **Texto Unicode**.

## 3. Importación básica
- [ ] Subir el CSV UTF-8: la vista previa muestra las filas válidas y los valores
      interpretados (cantidad, costo, precio).
- [ ] Importar y verificar en **Inventario** que aparecen los productos.
- [ ] Verificar en **Movimientos** un `ENTRADA` por producto con motivo
      **“Stock inicial (Importación)”**.
- [ ] Verificar que el stock coincide con la columna Cantidad.
- [ ] Repetir con el CSV delimitado por comas y con el de Texto Unicode.

## 4. Avisos y errores
- [ ] Fila con unidad `caja`: se importa como `u` y aparece el **aviso**.
- [ ] Fila con costo `1,600`: aparece aviso “se interpretó como 1.6”.
- [ ] Fila con fecha `31/02/2027`: aparece como **error** y no se importa.
- [ ] Producto repetido (mismo nombre, distinta mayúscula): se **omite** y se reporta.
- [ ] Botón **Descargar avisos** genera el CSV con los motivos.
- [ ] Botón **Descargar resultado** genera el CSV con importados/omitidos.

## 5. Multi-almacén y roles
- [ ] Con 2 almacenes, el stock importado queda en el principal y en 0 en el otro.
- [ ] Entrar con un PIN de **Dependiente**: no puede abrir Inventario ni importar.
- [ ] Entrar como **Dueño**: sí puede importar.

## 6. Límites y robustez
- [ ] Un archivo con más de 2 000 filas se rechaza sin escribir nada.
- [ ] Importar ~200 filas y, mientras procesa, no se puede pulsar dos veces el botón.
- [ ] Cerrar la app a mitad de una importación grande: al reabrir, la BD es consistente
      (no hay productos sin movimiento ni movimientos sin producto).

## 7. Tablets/celulares (si aplica)
- [ ] Permitir InventarioY en el Firewall (red privada).
- [ ] Abrir `http://<IP-PC>:4173` desde una tablet en la misma WiFi.
- [ ] Entrar con código de negocio + PIN de dependiente.
- [ ] Asignar **Caja activa** y registrar una venta.
- [ ] Verificar que la venta aparece en la PC y en **Cierres** con su caja.

## 8. Cierre
- [ ] Restaurar el respaldo inicial (Ajustes → Respaldos) si se usó la PC de un cliente.
- [ ] Archivar evidencias (capturas) junto a la entrega.

Resultado: ______ / ______ / ______ (fecha, ejecutó, aprobó)
