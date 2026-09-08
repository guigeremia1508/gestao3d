const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// No Railway o filesystem não persiste entre deploys.
// Usamos /tmp que existe sempre em runtime.
const DB_PATH = process.env.DB_PATH || path.join('/tmp', 'gestao3d.db');
let db = null;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  return db;
}

function saveDb() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  saveDb();
  const res = db.exec('SELECT last_insert_rowid() as id');
  return { lastInsertRowid: res[0]?.values[0]?.[0] ?? null };
}

function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : undefined;
  stmt.free();
  return row;
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbExec(sql) {
  db.exec(sql);
  saveDb();
}

async function initDb() {
  await getDb();

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'OPERADOR', active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')), deleted_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    phone TEXT, email TEXT, city TEXT, notes TEXT,
    created_at TEXT DEFAULT (datetime('now')), deleted_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS printers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    brand TEXT, model TEXT, serial TEXT, purchase_date TEXT,
    purchase_price REAL DEFAULT 0, location TEXT, power_watts REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'DISPONIVEL', total_hours REAL DEFAULT 0,
    total_prints INTEGER DEFAULT 0, total_failures INTEGER DEFAULT 0,
    filament_used_g REAL DEFAULT 0, notes TEXT,
    created_at TEXT DEFAULT (datetime('now')), deleted_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS printer_maintenance (
    id INTEGER PRIMARY KEY AUTOINCREMENT, printer_id INTEGER NOT NULL,
    task TEXT NOT NULL, scheduled_at TEXT, done_at TEXT, cost REAL DEFAULT 0,
    parts_used TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
    brand TEXT, color TEXT, color_code TEXT, diameter REAL DEFAULT 1.75,
    notes TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS material_rolls (
    id INTEGER PRIMARY KEY AUTOINCREMENT, material_id INTEGER NOT NULL,
    code TEXT, initial_weight_g REAL NOT NULL, current_weight_g REAL NOT NULL,
    purchase_price REAL DEFAULT 0, cost_per_gram REAL DEFAULT 0,
    supplier TEXT, purchase_date TEXT, status TEXT DEFAULT 'DISPONIVEL',
    min_stock_g REAL DEFAULT 50,
    created_at TEXT DEFAULT (datetime('now')), deleted_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, roll_id INTEGER,
    type TEXT NOT NULL, reason TEXT NOT NULL, quantity_g REAL NOT NULL,
    reference_id INTEGER, reference_type TEXT, notes TEXT, created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    description TEXT, type TEXT NOT NULL DEFAULT 'COMERCIAL',
    status TEXT NOT NULL DEFAULT 'EM_DESENVOLVIMENTO',
    responsible TEXT, customer_id INTEGER, notes TEXT,
    created_at TEXT DEFAULT (datetime('now')), deleted_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS project_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
    version TEXT NOT NULL, filename TEXT, changes TEXT, reason TEXT,
    result TEXT, author TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
    version_id INTEGER, printer_id INTEGER, roll_id INTEGER,
    est_time_min REAL, real_time_min REAL, est_weight_g REAL, real_weight_g REAL,
    waste_g REAL DEFAULT 0, temp_nozzle REAL, temp_bed REAL, layer_height REAL,
    infill INTEGER, walls INTEGER, speed REAL, supports INTEGER DEFAULT 0,
    result TEXT, failure_type TEXT, failure_cause TEXT, notes TEXT,
    created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, name TEXT NOT NULL,
    project_id INTEGER, version_id INTEGER, material_type TEXT,
    weight_g REAL DEFAULT 0, print_time_min REAL DEFAULT 0,
    cost_material REAL DEFAULT 0, cost_energy REAL DEFAULT 0,
    cost_machine REAL DEFAULT 0, cost_labor REAL DEFAULT 0,
    cost_packaging REAL DEFAULT 0, cost_finishing REAL DEFAULT 0,
    cost_total REAL DEFAULT 0, price REAL DEFAULT 0,
    markup REAL DEFAULT 0, margin REAL DEFAULT 0,
    active INTEGER DEFAULT 1, notes TEXT,
    created_at TEXT DEFAULT (datetime('now')), deleted_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, product_id INTEGER,
    quantity INTEGER DEFAULT 1, material TEXT, unit_price REAL DEFAULT 0,
    discount REAL DEFAULT 0, total REAL DEFAULT 0,
    payment_method TEXT, due_date TEXT, notes TEXT,
    status TEXT NOT NULL DEFAULT 'ORCAMENTO',
    created_at TEXT DEFAULT (datetime('now')), deleted_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS production_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, project_id INTEGER,
    version_id INTEGER, product_id INTEGER, printer_id INTEGER, roll_id INTEGER,
    est_weight_g REAL DEFAULT 0, real_weight_g REAL DEFAULT 0,
    est_time_min REAL DEFAULT 0, real_time_min REAL DEFAULT 0,
    waste_g REAL DEFAULT 0, started_at TEXT, finished_at TEXT,
    result TEXT, failure_type TEXT, failure_cause TEXT,
    status TEXT NOT NULL DEFAULT 'AGUARDANDO', notes TEXT,
    created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
    category TEXT NOT NULL, description TEXT NOT NULL, amount REAL NOT NULL,
    date TEXT NOT NULL, reference_id INTEGER, reference_type TEXT,
    paid INTEGER DEFAULT 0, due_date TEXT, paid_at TEXT, notes TEXT,
    created_at TEXT DEFAULT (datetime('now')), deleted_at TEXT)`);

  // Defaults
  const defs = { company_name:'Minha Impressora 3D', labor_cost_hour:'15.00', energy_cost_kwh:'0.75', machine_cost_hour:'2.50', maintenance_cost_hour:'0.50', default_min_stock_g:'50', printer_investment:'0' };
  for (const [k,v] of Object.entries(defs)) db.run('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)',[k,v]);

  const admin = dbGet('SELECT id FROM users WHERE email=?',['admin@gestao3d.com']);
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)',['Administrador','admin@gestao3d.com',hash,'ADMIN']);
  }

  const guilherme = dbGet('SELECT id FROM users WHERE email=?',['guigeremia13@gmail.com']);
  if (!guilherme) {
    const hash = bcrypt.hashSync('#Guto3gui', 10);
    db.run('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)',['Guilherme Augusto','guigeremia13@gmail.com',hash,'ADMIN']);
  }

  saveDb();
  console.log('✅ Banco de dados inicializado em', DB_PATH);
}

module.exports = { getDb, initDb, dbRun, dbGet, dbAll, dbExec, saveDb };
