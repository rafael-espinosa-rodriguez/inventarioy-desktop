// Script de reconciliación de stock (InventarioY Desktop)
//
// Recalcula products.quantity y product_warehouse.quantity a partir de los
// movimientos registrados, aplicando la misma semántica que la app:
//   - Solo se cuentan los movimientos CON warehouse_id (entradas, salidas, mermas
//     y ajustes del almacén). Las ventas y consumos desde tránsito (movimientos
//     SIN warehouse_id) NO descontaron el almacén y no se cuentan.
//
// Uso:
//   node scripts/reconciliar-stock.mjs [--dry-run]
//
// --dry-run: muestra qué cambiaría sin escribir en la base de datos.

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DRY_RUN = process.argv.includes('--dry-run');

function getDbPath() {
  const fromEnv = process.env.INVENTARIOY_DB;
  if (fromEnv) return fromEnv;
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
  // La app usa app.getPath('userData') = %APPDATA%\<nombre> (inventarioy) + inventarioy.db
  return path.join(appData, 'inventarioy', 'inventarioy.db');
}

const dbPath = getDbPath();
console.log(`Base de datos: ${dbPath}`);
if (!fs.existsSync(dbPath)) {
  console.error('ERROR: No se encontró la base de datos en la ruta indicada.');
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

// 1) Recalcular quantity por producto
// Regla: ENTRADA/AJUSTE siempre suman (el stock inicial legacy puede no tener
// warehouse_id). SALIDA/MERMA restan solo si tienen warehouse_id: las ventas y
// consumos desde tránsito (sin warehouse_id) no descontaron el almacén.
const qtyFromMovements = new Map();
const rows = db.prepare('SELECT product_id, type, quantity, warehouse_id FROM movements').all();
for (const m of rows) {
  const current = qtyFromMovements.get(m.product_id) || 0;
  if (m.type === 'ENTRADA') qtyFromMovements.set(m.product_id, current + Number(m.quantity));
  else if (m.type === 'AJUSTE') qtyFromMovements.set(m.product_id, current + Number(m.quantity));
  else if ((m.type === 'SALIDA' || m.type === 'MERMA') && m.warehouse_id) {
    qtyFromMovements.set(m.product_id, current - Number(m.quantity));
  }
}

// 2) Recalcular quantity por product_warehouse
const qtyPerWarehouse = new Map();
for (const m of rows) {
  if (!m.warehouse_id) continue;
  const key = `${m.product_id}::${m.warehouse_id}`;
  const current = qtyPerWarehouse.get(key) || 0;
  if (m.type === 'ENTRADA') qtyPerWarehouse.set(key, current + Number(m.quantity));
  else if (m.type === 'SALIDA' || m.type === 'MERMA') qtyPerWarehouse.set(key, current - Number(m.quantity));
  else if (m.type === 'AJUSTE') qtyPerWarehouse.set(key, current + Number(m.quantity));
}

let changes = 0;
const report = [];

// 3) Actualizar products.quantity
const products = db.prepare('SELECT id, name, quantity FROM products').all();
for (const p of products) {
  if (!qtyFromMovements.has(p.id)) continue;
  const computed = Math.max(0, qtyFromMovements.get(p.id));
  if (Number(p.quantity) !== computed) {
    report.push(`Producto "${p.name}" (${p.id.slice(0, 8)}): quantity ${p.quantity} → ${computed}`);
    if (!DRY_RUN) {
      db.prepare('UPDATE products SET quantity = ? WHERE id = ?').run(computed, p.id);
    }
    changes++;
  }
}

// 4) Actualizar product_warehouse.quantity
const pwRows = db.prepare('SELECT product_id, warehouse_id, quantity FROM product_warehouse').all();
for (const pw of pwRows) {
  const key = `${pw.product_id}::${pw.warehouse_id}`;
  if (!qtyPerWarehouse.has(key)) continue;
  const computed = Math.max(0, qtyPerWarehouse.get(key));
  if (Number(pw.quantity) !== computed) {
    const p = products.find(x => x.id === pw.product_id);
    report.push(`Almacén "${pw.warehouse_id.slice(0, 8)}" / producto "${p?.name || pw.product_id.slice(0, 8)}": quantity ${pw.quantity} → ${computed}`);
    if (!DRY_RUN) {
      db.prepare('UPDATE product_warehouse SET quantity = ? WHERE product_id = ? AND warehouse_id = ?').run(computed, pw.product_id, pw.warehouse_id);
    }
    changes++;
  }
}

db.close();

console.log(report.length ? report.join('\n') : 'No hay diferencias que corregir.');
console.log(`${DRY_RUN ? 'DRY-RUN' : 'Aplicados'}: ${changes} cambios.`);
