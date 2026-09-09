const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL não configurada. No Railway, adicione o PostgreSQL ao projeto e exponha DATABASE_URL.');
  }
  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' || process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
  });
  pool.on('error', err => console.error('PostgreSQL pool error:', err));
  return pool;
}

async function dbAll(sql, params = []) {
  const r = await getPool().query(sql, params);
  return r.rows;
}

async function dbGet(sql, params = []) {
  const r = await getPool().query(sql, params);
  return r.rows[0];
}

async function dbRun(sql, params = []) {
  const r = await getPool().query(sql, params);
  return { rowCount: r.rowCount, rows: r.rows, lastInsertRowid: r.rows[0]?.id ?? null };
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const tx = {
      query: (sql, params = []) => client.query(sql, params),
      all: async (sql, params = []) => (await client.query(sql, params)).rows,
      get: async (sql, params = []) => (await client.query(sql, params)).rows[0],
      run: async (sql, params = []) => {
        const r = await client.query(sql, params);
        return { rowCount: r.rowCount, rows: r.rows, lastInsertRowid: r.rows[0]?.id ?? null };
      },
    };
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'OPERADOR', active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, city TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS printers (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, brand TEXT, model TEXT, serial TEXT, purchase_date DATE,
  purchase_price NUMERIC(14,2) DEFAULT 0, location TEXT, power_watts NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DISPONIVEL', total_hours NUMERIC(14,2) DEFAULT 0, total_prints INTEGER DEFAULT 0,
  total_failures INTEGER DEFAULT 0, filament_used_g NUMERIC(14,2) DEFAULT 0, notes TEXT,
  photo_url TEXT, cloudinary_public_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS maintenance_plans (
  id BIGSERIAL PRIMARY KEY, printer_id BIGINT NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  task TEXT NOT NULL, interval_hours NUMERIC(14,2), interval_days INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE, last_completed_at DATE, last_completed_hours NUMERIC(14,2) DEFAULT 0,
  next_due_date DATE, next_due_hours NUMERIC(14,2), notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS printer_maintenance (
  id BIGSERIAL PRIMARY KEY, printer_id BIGINT NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  plan_id BIGINT REFERENCES maintenance_plans(id) ON DELETE SET NULL, task TEXT NOT NULL,
  scheduled_at DATE, done_at DATE, hours_at NUMERIC(14,2), cost NUMERIC(14,2) DEFAULT 0,
  parts_used TEXT, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS materials (
  id BIGSERIAL PRIMARY KEY, type TEXT NOT NULL, brand TEXT, color TEXT, color_code TEXT,
  diameter NUMERIC(5,2) DEFAULT 1.75, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS material_rolls (
  id BIGSERIAL PRIMARY KEY, material_id BIGINT NOT NULL REFERENCES materials(id), code TEXT,
  initial_weight_g NUMERIC(14,2) NOT NULL, current_weight_g NUMERIC(14,2) NOT NULL,
  purchase_price NUMERIC(14,2) DEFAULT 0, cost_per_gram NUMERIC(14,6) DEFAULT 0, supplier TEXT,
  purchase_date DATE, status TEXT DEFAULT 'DISPONIVEL', min_stock_g NUMERIC(14,2) DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGSERIAL PRIMARY KEY, roll_id BIGINT REFERENCES material_rolls(id) ON DELETE SET NULL,
  type TEXT NOT NULL, reason TEXT NOT NULL, quantity_g NUMERIC(14,2) NOT NULL,
  reference_id BIGINT, reference_type TEXT, notes TEXT, created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tool_consumables (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT, unit TEXT NOT NULL DEFAULT 'un',
  current_qty NUMERIC(14,3) NOT NULL DEFAULT 0, min_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0, supplier TEXT, notes TEXT,
  photo_url TEXT, cloudinary_public_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS small_parts (
  id BIGSERIAL PRIMARY KEY, category TEXT, name TEXT NOT NULL, type TEXT, size TEXT, material TEXT,
  current_qty NUMERIC(14,3) NOT NULL DEFAULT 0, min_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0, supplier TEXT, notes TEXT,
  photo_url TEXT, cloudinary_public_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS consumable_movements (
  id BIGSERIAL PRIMARY KEY, consumable_id BIGINT NOT NULL REFERENCES tool_consumables(id) ON DELETE CASCADE,
  type TEXT NOT NULL, quantity NUMERIC(14,3) NOT NULL, reason TEXT NOT NULL,
  reference_id BIGINT, reference_type TEXT, notes TEXT, created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS part_movements (
  id BIGSERIAL PRIMARY KEY, part_id BIGINT NOT NULL REFERENCES small_parts(id) ON DELETE CASCADE,
  type TEXT NOT NULL, quantity NUMERIC(14,3) NOT NULL, reason TEXT NOT NULL,
  reference_id BIGINT, reference_type TEXT, notes TEXT, created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT, type TEXT NOT NULL DEFAULT 'COMERCIAL',
  status TEXT NOT NULL DEFAULT 'EM_DESENVOLVIMENTO', responsible TEXT, customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS project_versions (
  id BIGSERIAL PRIMARY KEY, project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version TEXT NOT NULL, filename TEXT, changes TEXT, reason TEXT, result TEXT, author TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS project_parts (
  id BIGSERIAL PRIMARY KEY, project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  part_id BIGINT NOT NULL REFERENCES small_parts(id), quantity NUMERIC(14,3) NOT NULL,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0, total_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tests (
  id BIGSERIAL PRIMARY KEY, project_id BIGINT NOT NULL REFERENCES projects(id), version_id BIGINT REFERENCES project_versions(id),
  printer_id BIGINT REFERENCES printers(id), roll_id BIGINT REFERENCES material_rolls(id), est_time_min NUMERIC(14,2), real_time_min NUMERIC(14,2),
  est_weight_g NUMERIC(14,2), real_weight_g NUMERIC(14,2), waste_g NUMERIC(14,2) DEFAULT 0, temp_nozzle NUMERIC(8,2), temp_bed NUMERIC(8,2),
  layer_height NUMERIC(8,3), infill INTEGER, walls INTEGER, speed NUMERIC(8,2), supports BOOLEAN DEFAULT FALSE,
  result TEXT, failure_type TEXT, failure_cause TEXT, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL, project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  version_id BIGINT REFERENCES project_versions(id) ON DELETE SET NULL, material_type TEXT, weight_g NUMERIC(14,2) DEFAULT 0,
  print_time_min NUMERIC(14,2) DEFAULT 0, cost_material NUMERIC(14,2) DEFAULT 0, cost_energy NUMERIC(14,2) DEFAULT 0,
  cost_machine NUMERIC(14,2) DEFAULT 0, cost_labor NUMERIC(14,2) DEFAULT 0, cost_packaging NUMERIC(14,2) DEFAULT 0,
  cost_finishing NUMERIC(14,2) DEFAULT 0, cost_parts NUMERIC(14,2) DEFAULT 0, cost_total NUMERIC(14,2) DEFAULT 0,
  price NUMERIC(14,2) DEFAULT 0, markup NUMERIC(14,2) DEFAULT 0, margin NUMERIC(14,2) DEFAULT 0,
  active BOOLEAN DEFAULT TRUE, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY, customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL, product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  quantity INTEGER DEFAULT 1, material TEXT, unit_price NUMERIC(14,2) DEFAULT 0, discount NUMERIC(14,2) DEFAULT 0, total NUMERIC(14,2) DEFAULT 0,
  payment_method TEXT, due_date DATE, notes TEXT, status TEXT NOT NULL DEFAULT 'ORCAMENTO', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS production_jobs (
  id BIGSERIAL PRIMARY KEY, order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL, project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  version_id BIGINT REFERENCES project_versions(id) ON DELETE SET NULL, product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  printer_id BIGINT REFERENCES printers(id) ON DELETE SET NULL, roll_id BIGINT REFERENCES material_rolls(id) ON DELETE SET NULL,
  est_weight_g NUMERIC(14,2) DEFAULT 0, real_weight_g NUMERIC(14,2) DEFAULT 0, est_time_min NUMERIC(14,2) DEFAULT 0, real_time_min NUMERIC(14,2) DEFAULT 0,
  waste_g NUMERIC(14,2) DEFAULT 0, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, result TEXT, failure_type TEXT, failure_cause TEXT,
  status TEXT NOT NULL DEFAULT 'AGUARDANDO', notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY, type TEXT NOT NULL, category TEXT, description TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL, date DATE NOT NULL,
  reference_id BIGINT, reference_type TEXT, paid BOOLEAN DEFAULT FALSE, due_date DATE, paid_at TIMESTAMPTZ, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS quotes (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  printer_id BIGINT REFERENCES printers(id) ON DELETE SET NULL,
  roll_id BIGINT REFERENCES material_rolls(id) ON DELETE SET NULL,
  product_description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  weight_g NUMERIC(14,2) NOT NULL DEFAULT 0,
  print_time_min NUMERIC(14,2) NOT NULL DEFAULT 0,
  labor_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_costs NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_material NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_energy NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_machine NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_maintenance NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  markup_percent NUMERIC(10,2) NOT NULL DEFAULT 0,
  profit NUMERIC(14,2) NOT NULL DEFAULT 0,
  price_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  real_margin_percent NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ORCAMENTO',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);
CREATE INDEX IF NOT EXISTS idx_rolls_material ON material_rolls(material_id);
CREATE INDEX IF NOT EXISTS idx_stock_roll ON stock_movements(roll_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_plan_printer ON maintenance_plans(printer_id);
CREATE INDEX IF NOT EXISTS idx_project_parts_project ON project_parts(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
`;

async function initDb() {
  const p = getPool();
  await p.query(schema);
  // Safe schema upgrades for installations created with the first PostgreSQL release.
  await p.query(`ALTER TABLE printers ADD COLUMN IF NOT EXISTS photo_url TEXT`);
  await p.query(`ALTER TABLE printers ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT`);
  await p.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_parts NUMERIC(14,2) DEFAULT 0`);
  await p.query(`ALTER TABLE printer_maintenance ADD COLUMN IF NOT EXISTS plan_id BIGINT REFERENCES maintenance_plans(id) ON DELETE SET NULL`);
  await p.query(`ALTER TABLE printer_maintenance ADD COLUMN IF NOT EXISTS hours_at NUMERIC(14,2)`);
  const defs = {
    company_name: 'Minha Impressora 3D', labor_cost_hour: '15.00', energy_cost_kwh: '0.75',
    machine_cost_hour: '2.50', maintenance_cost_hour: '0.50', default_min_stock_g: '50', printer_investment: '0',
  };
  for (const [k, v] of Object.entries(defs)) {
    await p.query(`INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`, [k, v]);
  }
  const admin = await dbGet('SELECT id FROM users WHERE email=$1', ['admin@gestao3d.com']);
  if (!admin) {
    await dbRun('INSERT INTO users (name,email,password,role) VALUES ($1,$2,$3,$4)', ['Administrador', 'admin@gestao3d.com', bcrypt.hashSync('admin123', 10), 'ADMIN']);
  }
  console.log('✅ PostgreSQL inicializado');
}

module.exports = { getPool, dbAll, dbGet, dbRun, withTransaction, initDb };
