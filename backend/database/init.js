const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'gestao3d.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'OPERADOR' CHECK(role IN ('ADMIN','OPERADOR','CLIENTE')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      city TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      serial TEXT,
      purchase_date TEXT,
      purchase_price REAL DEFAULT 0,
      location TEXT,
      power_watts REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'DISPONIVEL' CHECK(status IN ('DISPONIVEL','IMPRIMINDO','MANUTENCAO','OFFLINE')),
      total_hours REAL DEFAULT 0,
      total_prints INTEGER DEFAULT 0,
      total_failures INTEGER DEFAULT 0,
      filament_used_g REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS printer_maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      printer_id INTEGER NOT NULL REFERENCES printers(id),
      task TEXT NOT NULL,
      scheduled_at TEXT,
      done_at TEXT,
      cost REAL DEFAULT 0,
      parts_used TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      brand TEXT,
      color TEXT,
      color_code TEXT,
      diameter REAL DEFAULT 1.75,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS material_rolls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      code TEXT,
      initial_weight_g REAL NOT NULL,
      current_weight_g REAL NOT NULL,
      purchase_price REAL DEFAULT 0,
      cost_per_gram REAL DEFAULT 0,
      supplier TEXT,
      purchase_date TEXT,
      status TEXT DEFAULT 'DISPONIVEL' CHECK(status IN ('DISPONIVEL','EM_USO','ESGOTADO')),
      min_stock_g REAL DEFAULT 50,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roll_id INTEGER REFERENCES material_rolls(id),
      type TEXT NOT NULL CHECK(type IN ('ENTRADA','SAIDA','CONSUMO','DESPERDICIO','AJUSTE','DEVOLUCAO')),
      reason TEXT NOT NULL CHECK(reason IN ('COMPRA','TESTE','PRODUCAO','MANUTENCAO','PERDA','AJUSTE_MANUAL')),
      quantity_g REAL NOT NULL,
      reference_id INTEGER,
      reference_type TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'COMERCIAL' CHECK(type IN ('COMERCIAL','PESSOAL','PROTOTIPO','ESCOLAR','ROBOTICA','EXPERIMENTAL')),
      status TEXT NOT NULL DEFAULT 'EM_DESENVOLVIMENTO' CHECK(status IN ('EM_DESENVOLVIMENTO','EM_TESTE','APROVADO','EM_PRODUCAO','ARQUIVADO')),
      responsible TEXT,
      customer_id INTEGER REFERENCES customers(id),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS project_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      version TEXT NOT NULL,
      filename TEXT,
      changes TEXT,
      reason TEXT,
      result TEXT,
      author TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      version_id INTEGER REFERENCES project_versions(id),
      printer_id INTEGER REFERENCES printers(id),
      roll_id INTEGER REFERENCES material_rolls(id),
      est_time_min REAL,
      real_time_min REAL,
      est_weight_g REAL,
      real_weight_g REAL,
      waste_g REAL DEFAULT 0,
      temp_nozzle REAL,
      temp_bed REAL,
      layer_height REAL,
      infill INTEGER,
      walls INTEGER,
      speed REAL,
      supports INTEGER DEFAULT 0,
      result TEXT CHECK(result IN ('APROVADO','REPROVADO','CANCELADO')),
      failure_type TEXT,
      failure_cause TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT NOT NULL,
      project_id INTEGER REFERENCES projects(id),
      version_id INTEGER REFERENCES project_versions(id),
      material_type TEXT,
      weight_g REAL DEFAULT 0,
      print_time_min REAL DEFAULT 0,
      cost_material REAL DEFAULT 0,
      cost_energy REAL DEFAULT 0,
      cost_machine REAL DEFAULT 0,
      cost_labor REAL DEFAULT 0,
      cost_packaging REAL DEFAULT 0,
      cost_finishing REAL DEFAULT 0,
      cost_total REAL DEFAULT 0,
      price REAL DEFAULT 0,
      markup REAL DEFAULT 0,
      margin REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES customers(id),
      product_id INTEGER REFERENCES products(id),
      quantity INTEGER DEFAULT 1,
      material TEXT,
      unit_price REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      payment_method TEXT,
      due_date TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'ORCAMENTO' CHECK(status IN ('ORCAMENTO','AGUARDANDO_PAGAMENTO','CONFIRMADO','EM_PRODUCAO','ACABAMENTO','PRONTO','ENTREGUE','CANCELADO')),
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS production_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER REFERENCES orders(id),
      project_id INTEGER REFERENCES projects(id),
      version_id INTEGER REFERENCES project_versions(id),
      product_id INTEGER REFERENCES products(id),
      printer_id INTEGER REFERENCES printers(id),
      roll_id INTEGER REFERENCES material_rolls(id),
      est_weight_g REAL DEFAULT 0,
      real_weight_g REAL DEFAULT 0,
      est_time_min REAL DEFAULT 0,
      real_time_min REAL DEFAULT 0,
      waste_g REAL DEFAULT 0,
      started_at TEXT,
      finished_at TEXT,
      result TEXT CHECK(result IN ('SUCESSO','FALHA','CANCELADO')),
      failure_type TEXT,
      failure_cause TEXT,
      status TEXT NOT NULL DEFAULT 'AGUARDANDO' CHECK(status IN ('AGUARDANDO','PREPARANDO','IMPRIMINDO','ACABAMENTO','PRONTO','ENTREGUE','CANCELADO')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('RECEITA','DESPESA','INVESTIMENTO')),
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      reference_id INTEGER,
      reference_type TEXT,
      paid INTEGER DEFAULT 0,
      due_date TEXT,
      paid_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);

  // Default settings
  const defaults = {
    company_name: 'Minha Impressora 3D',
    labor_cost_hour: '15.00',
    energy_cost_kwh: '0.75',
    machine_cost_hour: '2.50',
    maintenance_cost_hour: '0.50',
    default_min_stock_g: '50',
    currency: 'BRL',
    printer_investment: '0'
  };
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const [k, v] of Object.entries(defaults)) {
    insertSetting.run(k, v);
  }

  // Default admin user
  const existingAdmin = db.prepare(`SELECT id FROM users WHERE email = ?`).get('admin@gestao3d.com');
  if (!existingAdmin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`).run('Administrador', 'admin@gestao3d.com', hash, 'ADMIN');
  }

  console.log('✅ Banco de dados inicializado');
}

module.exports = { getDb, initDb };
