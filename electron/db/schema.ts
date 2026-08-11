// Esquema SQLite local (InventarioY Desktop)
// Uso: node:sqlite (DatabaseSync) incluido en Node 24+ / Electron 43.
// Todas las tablas replican las tablas Supabase usadas por dbStore.ts.
// Migraciones versionadas: aplicar en orden ascendente, registrar en schema_versions.

const TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_versions (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL,
    description TEXT
  )`,
];

const MIGRATIONS: { version: number; description: string; sql: string }[] = [
  {
    version: 1,
    description: 'Esquema base InventarioY (20 tablas)',
    sql: `
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      quantity REAL DEFAULT 0,
      unit TEXT DEFAULT 'unidad',
      price REAL DEFAULT 0,
      cost REAL DEFAULT 0,
      rop REAL DEFAULT 0,
      eoq REAL DEFAULT 0,
      lead_time INTEGER,
      order_cost REAL,
      holding_cost REAL,
      expiration_date TEXT,
      description TEXT,
      is_individual INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      in_transit REAL DEFAULT 0,
      is_gasto_variable INTEGER DEFAULT 0,
      is_consumo_directo INTEGER DEFAULT 0,
      is_recipe INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_products_user ON products (user_id);

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_categories_user ON categories (user_id);

    CREATE TABLE IF NOT EXISTS movements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      date TEXT NOT NULL,
      cost REAL DEFAULT 0,
      reason TEXT,
      status TEXT,
      justification TEXT,
      justification_date TEXT,
      is_gasto_variable INTEGER DEFAULT 0,
      is_consumo_directo INTEGER DEFAULT 0,
      note TEXT,
      warehouse_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_movements_user ON movements (user_id);
    CREATE INDEX IF NOT EXISTS idx_movements_product ON movements (product_id);
    CREATE INDEX IF NOT EXISTS idx_movements_date ON movements (date);

    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_main INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_warehouses_user ON warehouses (user_id);

    CREATE TABLE IF NOT EXISTS product_warehouse (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      quantity REAL DEFAULT 0,
      in_transit REAL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE (product_id, warehouse_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pw_warehouse ON product_warehouse (warehouse_id);

    CREATE TABLE IF NOT EXISTS transit_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      consumed REAL DEFAULT 0,
      remaining REAL NOT NULL,
      reason TEXT,
      sent_date TEXT NOT NULL,
      warehouse_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transit_user ON transit_items (user_id);

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      employee_id TEXT,
      total_amount REAL NOT NULL,
      date TEXT NOT NULL,
      sale_type TEXT DEFAULT 'SALON',
      is_account_house INTEGER DEFAULT 0,
      notes TEXT,
      discount REAL DEFAULT 0,
      payment_method TEXT,
      efectivo REAL DEFAULT 0,
      transferencia REAL DEFAULT 0,
      usd REAL DEFAULT 0,
      eur REAL DEFAULT 0,
      subtotal REAL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sales_user ON sales (user_id);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (date);

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL DEFAULT 0,
      selling_price REAL DEFAULT 0,
      subtotal REAL DEFAULT 0,
      is_recipe INTEGER DEFAULT 0,
      recipe_snapshot TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items (sale_id);

    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      selling_price REAL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recipes_user ON recipes (user_id);

    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ri_recipe ON recipe_ingredients (recipe_id);

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      salary REAL DEFAULT 0,
      phone TEXT,
      email TEXT,
      nit_id TEXT,
      category TEXT,
      photo_url TEXT,
      hire_date TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_employees_user ON employees (user_id);

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_departments_user ON departments (user_id);

    CREATE TABLE IF NOT EXISTS daily_closings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      closing_date TEXT NOT NULL,
      total_sales REAL DEFAULT 0,
      total_discounts REAL DEFAULT 0,
      total_refunds REAL DEFAULT 0,
      closing_amount REAL DEFAULT 0,
      notes TEXT,
      created_by TEXT,
      created_by_name TEXT,
      cup_efectivo REAL,
      cup_transfer REAL,
      usd REAL,
      eur REAL,
      salon REAL,
      domicilio REAL,
      bar REAL,
      venta_rapida REAL,
      sales_count INTEGER,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, closing_date)
    );
    CREATE INDEX IF NOT EXISTS idx_closings_user ON daily_closings (user_id);

    CREATE TABLE IF NOT EXISTS pending_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      client_name TEXT NOT NULL,
      items TEXT DEFAULT '[]',
      total_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      is_account_house INTEGER DEFAULT 0,
      sale_type TEXT DEFAULT 'SALON',
      created_at TEXT NOT NULL,
      created_at_local TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pending_user ON pending_accounts (user_id);

    CREATE TABLE IF NOT EXISTS access_pins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      pin_name TEXT,
      is_active INTEGER DEFAULT 1,
      failed_attempts INTEGER DEFAULT 0,
      blocked_until TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pins_user ON access_pins (user_id);

    CREATE TABLE IF NOT EXISTS action_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT,
      pin_role_label TEXT,
      module TEXT,
      action TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_user ON action_logs (user_id);
    CREATE INDEX IF NOT EXISTS idx_logs_date ON action_logs (created_at);

    CREATE TABLE IF NOT EXISTS hr_documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hr_user ON hr_documents (user_id);

    CREATE TABLE IF NOT EXISTS employee_documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      name TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_empdoc_employee ON employee_documents (employee_id);

    CREATE TABLE IF NOT EXISTS payroll_config (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tax_exemption_base REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      special_contribution_rate REAL DEFAULT 0,
      last_calculated_month TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payrollcfg_user ON payroll_config (user_id);

    CREATE TABLE IF NOT EXISTS payroll_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      employee_category TEXT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      base_salary REAL DEFAULT 0,
      earned_salary REAL DEFAULT 0,
      exemption_base REAL DEFAULT 0,
      taxable_base REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      special_contribution REAL DEFAULT 0,
      net_salary REAL DEFAULT 0,
      vacation_days INTEGER DEFAULT 0,
      vacation_base REAL DEFAULT 0,
      employer_contribution REAL DEFAULT 0,
      is_custom INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_user ON payroll_entries (user_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_session (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      businessName TEXT,
      role TEXT,
      phone TEXT,
      address TEXT,
      businessHours TEXT,
      subscriptionActive INTEGER DEFAULT 0,
      subscriptionPlan TEXT,
      ticketMessage TEXT,
      usdEnabled INTEGER DEFAULT 0,
      usdRate REAL DEFAULT 0,
      eurEnabled INTEGER DEFAULT 0,
      eurRate REAL DEFAULT 0,
      cupTransferEnabled INTEGER DEFAULT 0,
      business_code TEXT,
      created_at TEXT NOT NULL
    );
    `,
  },
  {
    version: 2,
    description: 'Campos ZELLE (moneda con tasa configurable)',
    sql: `
    ALTER TABLE user_session ADD COLUMN zelleEnabled INTEGER DEFAULT 0;
    ALTER TABLE user_session ADD COLUMN zelleRate REAL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN zelle REAL DEFAULT 0;
    ALTER TABLE daily_closings ADD COLUMN zelle REAL;
    `,
  },
  {
    version: 3,
    description: 'Tablas admin locales vacías (compatibilidad con vistas web)',
    sql: `
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT,
      name TEXT,
      business_name TEXT,
      role TEXT,
      subscription_status TEXT,
      trial_ends_at TEXT,
      valid_until TEXT,
      created_at TEXT,
      phone TEXT,
      last_contacted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      admin_id TEXT,
      amount REAL,
      payment_method TEXT,
      reference TEXT,
      notes TEXT,
      payment_date TEXT,
      created_at TEXT
    );
    `,
  },
  {
    version: 4,
    description: 'Licencia desktop: trial 7 días + clave de activación (ed25519)',
    sql: `
    ALTER TABLE user_session ADD COLUMN trial_started_at TEXT;
    ALTER TABLE user_session ADD COLUMN license_key TEXT;
    ALTER TABLE user_session ADD COLUMN license_valid_until TEXT;
    ALTER TABLE user_session ADD COLUMN license_activated_at TEXT;

    DROP TABLE IF EXISTS profiles;
    DROP TABLE IF EXISTS payments;
    `,
  },
  {
    version: 5,
    description: 'Backfill trial_started_at para negocios creados antes de la migración v4',
    sql: `
    UPDATE user_session
    SET trial_started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = 'owner' AND trial_started_at IS NULL AND license_key IS NULL;
    `,
  },
];

export function applyMigrations(db: any): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, description TEXT)');
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_versions').get();
  const current = row?.v ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      db.exec('BEGIN');
      try {
        db.exec(m.sql);
        db.prepare('INSERT INTO schema_versions (version, applied_at, description) VALUES (?, ?, ?)').run(
          m.version,
          new Date().toISOString(),
          m.description
        );
        db.exec('COMMIT');
        console.log(`[schema] Migración ${m.version} aplicada: ${m.description}`);
      } catch (e: any) {
        db.exec('ROLLBACK');
        console.error(`[schema] Migración ${m.version} falló:`, e?.message);
        throw e;
      }
    }
  }
  console.log(`[schema] Esquema listo (versión actual: ${MIGRATIONS.length ? current : 0})`);
}
