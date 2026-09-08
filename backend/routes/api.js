const express = require('express');
const { getDb } = require('../database/init');
const { auth } = require('../middleware/auth');
const router = express.Router();
router.use(auth);

// ─── CUSTOMERS ────────────────────────────────────────
router.get('/customers', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT c.*, 
    COUNT(o.id) as total_orders, 
    COALESCE(SUM(o.total),0) as total_spent,
    MAX(o.created_at) as last_order
    FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.deleted_at IS NULL
    WHERE c.deleted_at IS NULL GROUP BY c.id ORDER BY c.name`).all();
  res.json(rows);
});
router.post('/customers', (req, res) => {
  const { name, phone, email, city, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const db = getDb();
  const r = db.prepare(`INSERT INTO customers (name, phone, email, city, notes) VALUES (?,?,?,?,?)`).run(name, phone, email, city, notes);
  res.json({ id: r.lastInsertRowid, name });
});
router.put('/customers/:id', (req, res) => {
  const { name, phone, email, city, notes } = req.body;
  const db = getDb();
  db.prepare(`UPDATE customers SET name=?, phone=?, email=?, city=?, notes=? WHERE id=?`).run(name, phone, email, city, notes, req.params.id);
  res.json({ ok: true });
});
router.delete('/customers/:id', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE customers SET deleted_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ─── PRINTERS ────────────────────────────────────────
router.get('/printers', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT * FROM printers WHERE deleted_at IS NULL ORDER BY name`).all());
});
router.post('/printers', (req, res) => {
  const { name, brand, model, serial, purchase_date, purchase_price, location, power_watts, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const db = getDb();
  const r = db.prepare(`INSERT INTO printers (name, brand, model, serial, purchase_date, purchase_price, location, power_watts, notes) VALUES (?,?,?,?,?,?,?,?,?)`).run(name, brand, model, serial, purchase_date, purchase_price||0, location, power_watts||0, notes);
  res.json({ id: r.lastInsertRowid });
});
router.put('/printers/:id', (req, res) => {
  const { name, brand, model, serial, purchase_date, purchase_price, location, power_watts, status, notes } = req.body;
  const db = getDb();
  db.prepare(`UPDATE printers SET name=?, brand=?, model=?, serial=?, purchase_date=?, purchase_price=?, location=?, power_watts=?, status=?, notes=? WHERE id=?`).run(name, brand, model, serial, purchase_date, purchase_price||0, location, power_watts||0, status, notes, req.params.id);
  res.json({ ok: true });
});
router.delete('/printers/:id', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE printers SET deleted_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});
router.get('/printers/:id/maintenance', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT * FROM printer_maintenance WHERE printer_id=? ORDER BY created_at DESC`).all(req.params.id));
});
router.post('/printers/:id/maintenance', (req, res) => {
  const { task, scheduled_at, done_at, cost, parts_used, notes } = req.body;
  const db = getDb();
  const r = db.prepare(`INSERT INTO printer_maintenance (printer_id, task, scheduled_at, done_at, cost, parts_used, notes) VALUES (?,?,?,?,?,?,?)`).run(req.params.id, task, scheduled_at, done_at, cost||0, parts_used, notes);
  res.json({ id: r.lastInsertRowid });
});

// ─── MATERIALS & ROLLS ────────────────────────────────
router.get('/materials', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT * FROM materials ORDER BY type, brand`).all());
});
router.post('/materials', (req, res) => {
  const { type, brand, color, color_code, diameter, notes } = req.body;
  const db = getDb();
  const r = db.prepare(`INSERT INTO materials (type, brand, color, color_code, diameter, notes) VALUES (?,?,?,?,?,?)`).run(type, brand, color, color_code, diameter||1.75, notes);
  res.json({ id: r.lastInsertRowid });
});
router.get('/rolls', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT r.*, m.type, m.brand, m.color FROM material_rolls r JOIN materials m ON m.id=r.material_id WHERE r.deleted_at IS NULL ORDER BY r.status, m.type`).all();
  res.json(rows);
});
router.post('/rolls', (req, res) => {
  const { material_id, code, initial_weight_g, purchase_price, supplier, purchase_date, min_stock_g } = req.body;
  if (!material_id || !initial_weight_g) return res.status(400).json({ error: 'Material e peso inicial obrigatórios' });
  const cost_per_gram = purchase_price ? (purchase_price / initial_weight_g) : 0;
  const db = getDb();
  const r = db.prepare(`INSERT INTO material_rolls (material_id, code, initial_weight_g, current_weight_g, purchase_price, cost_per_gram, supplier, purchase_date, min_stock_g) VALUES (?,?,?,?,?,?,?,?,?)`).run(material_id, code, initial_weight_g, initial_weight_g, purchase_price||0, cost_per_gram, supplier, purchase_date, min_stock_g||50);
  db.prepare(`INSERT INTO stock_movements (roll_id, type, reason, quantity_g, notes, created_by) VALUES (?,?,?,?,?,?)`).run(r.lastInsertRowid, 'ENTRADA', 'COMPRA', initial_weight_g, 'Entrada inicial do rolo', req.user.id);
  res.json({ id: r.lastInsertRowid });
});
router.post('/rolls/:id/movement', (req, res) => {
  const { type, reason, quantity_g, notes } = req.body;
  const db = getDb();
  const roll = db.prepare(`SELECT * FROM material_rolls WHERE id=?`).get(req.params.id);
  if (!roll) return res.status(404).json({ error: 'Rolo não encontrado' });
  let delta = ['ENTRADA','DEVOLUCAO','AJUSTE'].includes(type) ? quantity_g : -quantity_g;
  const new_weight = roll.current_weight_g + delta;
  if (new_weight < 0) return res.status(400).json({ error: 'Estoque insuficiente' });
  db.prepare(`UPDATE material_rolls SET current_weight_g=?, status=? WHERE id=?`).run(new_weight, new_weight <= 0 ? 'ESGOTADO' : (new_weight < 50 ? 'EM_USO' : 'DISPONIVEL'), req.params.id);
  db.prepare(`INSERT INTO stock_movements (roll_id, type, reason, quantity_g, notes, created_by) VALUES (?,?,?,?,?,?)`).run(req.params.id, type, reason, quantity_g, notes, req.user.id);
  res.json({ ok: true, new_weight });
});
router.get('/stock/movements', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT sm.*, r.code as roll_code, m.type as material_type, m.color FROM stock_movements sm LEFT JOIN material_rolls r ON r.id=sm.roll_id LEFT JOIN materials m ON m.id=r.material_id ORDER BY sm.created_at DESC LIMIT 200`).all();
  res.json(rows);
});

// ─── PROJECTS ────────────────────────────────────────
router.get('/projects', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT p.*, c.name as customer_name, 
    (SELECT COUNT(*) FROM project_versions WHERE project_id=p.id) as versions_count,
    (SELECT COUNT(*) FROM tests WHERE project_id=p.id) as tests_count
    FROM projects p LEFT JOIN customers c ON c.id=p.customer_id
    WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC`).all();
  res.json(rows);
});
router.post('/projects', (req, res) => {
  const { name, description, type, responsible, customer_id, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const db = getDb();
  const r = db.prepare(`INSERT INTO projects (name, description, type, responsible, customer_id, notes) VALUES (?,?,?,?,?,?)`).run(name, description, type||'COMERCIAL', responsible, customer_id||null, notes);
  res.json({ id: r.lastInsertRowid });
});
router.put('/projects/:id', (req, res) => {
  const { name, description, type, status, responsible, customer_id, notes } = req.body;
  const db = getDb();
  db.prepare(`UPDATE projects SET name=?, description=?, type=?, status=?, responsible=?, customer_id=?, notes=? WHERE id=?`).run(name, description, type, status, responsible, customer_id||null, notes, req.params.id);
  res.json({ ok: true });
});
router.delete('/projects/:id', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE projects SET deleted_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});
router.get('/projects/:id/versions', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT * FROM project_versions WHERE project_id=? ORDER BY created_at DESC`).all(req.params.id));
});
router.post('/projects/:id/versions', (req, res) => {
  const { version, filename, changes, reason, result, author } = req.body;
  const db = getDb();
  const r = db.prepare(`INSERT INTO project_versions (project_id, version, filename, changes, reason, result, author) VALUES (?,?,?,?,?,?,?)`).run(req.params.id, version, filename, changes, reason, result, author);
  res.json({ id: r.lastInsertRowid });
});

// ─── TESTS ────────────────────────────────────────────
router.get('/tests', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT t.*, p.name as project_name, pr.name as printer_name, pv.version
    FROM tests t 
    JOIN projects p ON p.id=t.project_id
    LEFT JOIN printers pr ON pr.id=t.printer_id
    LEFT JOIN project_versions pv ON pv.id=t.version_id
    ORDER BY t.created_at DESC`).all();
  res.json(rows);
});
router.post('/tests', (req, res) => {
  const { project_id, version_id, printer_id, roll_id, est_time_min, real_time_min, est_weight_g, real_weight_g, waste_g,
    temp_nozzle, temp_bed, layer_height, infill, walls, speed, supports, result, failure_type, failure_cause, notes } = req.body;
  if (!project_id) return res.status(400).json({ error: 'Projeto obrigatório' });
  const db = getDb();
  const realWeight = Math.max(0, parseFloat(real_weight_g) || 0);
  const waste = Math.max(0, parseFloat(waste_g) || 0);
  const totalConsumption = realWeight + waste;

  const createTest = db.transaction(() => {
    if (roll_id && totalConsumption > 0) {
      const roll = db.prepare(`SELECT * FROM material_rolls WHERE id=?`).get(roll_id);
      if (!roll) throw new Error('Rolo de filamento não encontrado');
      if (roll.current_weight_g < totalConsumption) {
        throw new Error(`Estoque insuficiente. Disponível: ${roll.current_weight_g.toFixed(1)}g; necessário: ${totalConsumption.toFixed(1)}g.`);
      }
    }

    const r = db.prepare(`INSERT INTO tests (project_id, version_id, printer_id, roll_id, est_time_min, real_time_min, est_weight_g, real_weight_g, waste_g, temp_nozzle, temp_bed, layer_height, infill, walls, speed, supports, result, failure_type, failure_cause, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(project_id, version_id||null, printer_id||null, roll_id||null, est_time_min||0, real_time_min||0, est_weight_g||0, realWeight, waste, temp_nozzle, temp_bed, layer_height, infill, walls, speed, supports?1:0, result, failure_type, failure_cause, notes);

    if (roll_id && totalConsumption > 0) {
      const roll = db.prepare(`SELECT current_weight_g FROM material_rolls WHERE id=?`).get(roll_id);
      const newWeight = roll.current_weight_g - totalConsumption;
      db.prepare(`UPDATE material_rolls SET current_weight_g=?, status=? WHERE id=?`).run(
        newWeight, newWeight <= 0 ? 'ESGOTADO' : (newWeight <= 50 ? 'EM_USO' : 'DISPONIVEL'), roll_id
      );
      if (realWeight > 0) db.prepare(`INSERT INTO stock_movements (roll_id, type, reason, quantity_g, reference_id, reference_type, notes, created_by) VALUES (?,?,?,?,?,?,?,?)`).run(roll_id, 'CONSUMO', 'TESTE', realWeight, r.lastInsertRowid, 'test', `Teste #${r.lastInsertRowid}`, req.user.id);
      if (waste > 0) db.prepare(`INSERT INTO stock_movements (roll_id, type, reason, quantity_g, reference_id, reference_type, notes, created_by) VALUES (?,?,?,?,?,?,?,?)`).run(roll_id, 'DESPERDICIO', 'TESTE', waste, r.lastInsertRowid, 'test', `Desperdício do teste #${r.lastInsertRowid}`, req.user.id);
    }
    return r.lastInsertRowid;
  });

  try {
    res.json({ id: createTest() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── PRODUCTS ────────────────────────────────────────
router.get('/products', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT pr.*, p.name as project_name FROM products pr LEFT JOIN projects p ON p.id=pr.project_id WHERE pr.deleted_at IS NULL ORDER BY pr.name`).all();
  res.json(rows);
});
router.post('/products', (req, res) => {
  const { code, name, project_id, version_id, material_type, weight_g, print_time_min,
    cost_material, cost_energy, cost_machine, cost_labor, cost_packaging, cost_finishing, price, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const total = [cost_material, cost_energy, cost_machine, cost_labor, cost_packaging, cost_finishing].reduce((a, b) => a + (parseFloat(b)||0), 0);
  const margin = price > 0 ? ((price - total) / price * 100) : 0;
  const markup = total > 0 ? ((price - total) / total * 100) : 0;
  const db = getDb();
  const r = db.prepare(`INSERT INTO products (code, name, project_id, version_id, material_type, weight_g, print_time_min, cost_material, cost_energy, cost_machine, cost_labor, cost_packaging, cost_finishing, cost_total, price, markup, margin, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code, name, project_id||null, version_id||null, material_type, weight_g||0, print_time_min||0, cost_material||0, cost_energy||0, cost_machine||0, cost_labor||0, cost_packaging||0, cost_finishing||0, total, price||0, markup, margin, notes);
  res.json({ id: r.lastInsertRowid });
});
router.put('/products/:id', (req, res) => {
  const { code, name, project_id, version_id, material_type, weight_g, print_time_min,
    cost_material, cost_energy, cost_machine, cost_labor, cost_packaging, cost_finishing, price, notes, active } = req.body;
  const total = [cost_material, cost_energy, cost_machine, cost_labor, cost_packaging, cost_finishing].reduce((a, b) => a + (parseFloat(b)||0), 0);
  const margin = price > 0 ? ((price - total) / price * 100) : 0;
  const markup = total > 0 ? ((price - total) / total * 100) : 0;
  const db = getDb();
  db.prepare(`UPDATE products SET code=?, name=?, project_id=?, version_id=?, material_type=?, weight_g=?, print_time_min=?, cost_material=?, cost_energy=?, cost_machine=?, cost_labor=?, cost_packaging=?, cost_finishing=?, cost_total=?, price=?, markup=?, margin=?, notes=?, active=? WHERE id=?`).run(code, name, project_id||null, version_id||null, material_type, weight_g||0, print_time_min||0, cost_material||0, cost_energy||0, cost_machine||0, cost_labor||0, cost_packaging||0, cost_finishing||0, total, price||0, markup, margin, notes, active!==undefined?active:1, req.params.id);
  res.json({ ok: true });
});
router.delete('/products/:id', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE products SET deleted_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ─── ORDERS ────────────────────────────────────────────
router.get('/orders', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT o.*, c.name as customer_name, p.name as product_name 
    FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN products p ON p.id=o.product_id
    WHERE o.deleted_at IS NULL ORDER BY o.created_at DESC`).all();
  res.json(rows);
});
router.post('/orders', (req, res) => {
  const { customer_id, product_id, quantity, material, unit_price, discount, payment_method, due_date, notes } = req.body;
  if (!customer_id || !product_id) return res.status(400).json({ error: 'Cliente e produto obrigatórios' });
  const qty = parseInt(quantity)||1;
  const up = parseFloat(unit_price)||0;
  const disc = parseFloat(discount)||0;
  const total = (up * qty) - disc;
  const db = getDb();
  const r = db.prepare(`INSERT INTO orders (customer_id, product_id, quantity, material, unit_price, discount, total, payment_method, due_date, notes) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(customer_id, product_id, qty, material, up, disc, total, payment_method, due_date, notes);
  res.json({ id: r.lastInsertRowid });
});
router.put('/orders/:id', (req, res) => {
  const { customer_id, product_id, quantity, material, unit_price, discount, payment_method, due_date, notes, status } = req.body;
  const qty = parseInt(quantity)||1;
  const up = parseFloat(unit_price)||0;
  const disc = parseFloat(discount)||0;
  const total = (up * qty) - disc;
  const db = getDb();
  const old = db.prepare(`SELECT * FROM orders WHERE id=?`).get(req.params.id);
  db.prepare(`UPDATE orders SET customer_id=?, product_id=?, quantity=?, material=?, unit_price=?, discount=?, total=?, payment_method=?, due_date=?, notes=?, status=? WHERE id=?`).run(customer_id, product_id, qty, material, up, disc, total, payment_method, due_date, notes, status||old.status, req.params.id);
  // If confirmed, create transaction
  if (status === 'CONFIRMADO' && old.status !== 'CONFIRMADO') {
    db.prepare(`INSERT INTO transactions (type, category, description, amount, date, reference_id, reference_type, paid) VALUES (?,?,?,?,datetime('now'),?,?,?)`).run('RECEITA', 'Venda', `Pedido #${req.params.id}`, total, req.params.id, 'order', payment_method === 'A_VISTA' ? 1 : 0);
    // Create production job
    db.prepare(`INSERT INTO production_jobs (order_id, product_id, status) VALUES (?,?,?)`).run(req.params.id, product_id, 'AGUARDANDO');
  }
  res.json({ ok: true });
});
router.delete('/orders/:id', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE orders SET deleted_at=datetime('now'), status='CANCELADO' WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ─── PRODUCTION ────────────────────────────────────────
router.get('/production', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT pj.*, o.customer_id, c.name as customer_name, pr.name as product_name, prn.name as printer_name
    FROM production_jobs pj 
    LEFT JOIN orders o ON o.id=pj.order_id
    LEFT JOIN customers c ON c.id=o.customer_id
    LEFT JOIN products pr ON pr.id=pj.product_id
    LEFT JOIN printers prn ON prn.id=pj.printer_id
    ORDER BY pj.created_at DESC`).all();
  res.json(rows);
});
router.put('/production/:id', (req, res) => {
  const { printer_id, roll_id, est_weight_g, real_weight_g, est_time_min, real_time_min, waste_g, started_at, finished_at, result, failure_type, failure_cause, status, notes } = req.body;
  const db = getDb();
  const id = Number(req.params.id);
  const oldJob = db.prepare(`SELECT * FROM production_jobs WHERE id=?`).get(id);
  if (!oldJob) return res.status(404).json({ error: 'Ordem de produção não encontrada' });

  const nextRealWeight = Math.max(0, parseFloat(real_weight_g) || 0);
  const nextWaste = Math.max(0, parseFloat(waste_g) || 0);
  const nextConsumable = ['SUCESSO', 'FALHA'].includes(result) ? nextRealWeight + nextWaste : 0;
  const oldConsumable = ['SUCESSO', 'FALHA'].includes(oldJob.result) ? (Number(oldJob.real_weight_g) || 0) + (Number(oldJob.waste_g) || 0) : 0;
  const oldMovement = db.prepare(`SELECT * FROM stock_movements WHERE reference_id=? AND reference_type='production' AND type IN ('CONSUMO','DESPERDICIO') LIMIT 1`).get(id);

  const updateProduction = db.transaction(() => {
    // Reverte o consumo anterior quando a ordem já havia sido finalizada e está sendo editada.
    if (oldMovement && oldJob.roll_id && oldConsumable > 0) {
      const oldRoll = db.prepare(`SELECT * FROM material_rolls WHERE id=?`).get(oldJob.roll_id);
      if (oldRoll) {
        const restored = oldRoll.current_weight_g + oldConsumable;
        db.prepare(`UPDATE material_rolls SET current_weight_g=?, status=? WHERE id=?`).run(
          restored, restored <= 0 ? 'ESGOTADO' : (restored <= 50 ? 'EM_USO' : 'DISPONIVEL'), oldJob.roll_id
        );
      }
      db.prepare(`DELETE FROM stock_movements WHERE reference_id=? AND reference_type='production'`).run(id);
    }

    if (roll_id && nextConsumable > 0) {
      const roll = db.prepare(`SELECT * FROM material_rolls WHERE id=?`).get(roll_id);
      if (!roll) throw new Error('Rolo de filamento não encontrado');
      if (roll.current_weight_g < nextConsumable) {
        throw new Error(`Estoque insuficiente. Disponível: ${roll.current_weight_g.toFixed(1)}g; necessário: ${nextConsumable.toFixed(1)}g.`);
      }
    }

    db.prepare(`UPDATE production_jobs SET printer_id=?, roll_id=?, est_weight_g=?, real_weight_g=?, est_time_min=?, real_time_min=?, waste_g=?, started_at=?, finished_at=?, result=?, failure_type=?, failure_cause=?, status=?, notes=? WHERE id=?`).run(
      printer_id||null, roll_id||null, est_weight_g||0, nextRealWeight, est_time_min||0, real_time_min||0, nextWaste, started_at, finished_at, result||null, failure_type, failure_cause, status, notes, id
    );

    const job = db.prepare(`SELECT * FROM production_jobs WHERE id=?`).get(id);
    if (job.order_id && status) {
      const orderStatus = { AGUARDANDO:'CONFIRMADO', PREPARANDO:'EM_PRODUCAO', IMPRIMINDO:'EM_PRODUCAO', ACABAMENTO:'ACABAMENTO', PRONTO:'PRONTO', ENTREGUE:'ENTREGUE', CANCELADO:'CANCELADO' }[status];
      if (orderStatus) db.prepare(`UPDATE orders SET status=? WHERE id=?`).run(orderStatus, job.order_id);
    }

    // Atualiza estatísticas da impressora somente para a versão final salva.
    if (oldJob.result === 'SUCESSO' && oldJob.printer_id) {
      db.prepare(`UPDATE printers SET total_hours=MAX(0,total_hours-?), total_prints=MAX(0,total_prints-1), filament_used_g=MAX(0,filament_used_g-?) WHERE id=?`).run((Number(oldJob.real_time_min)||0)/60, Number(oldJob.real_weight_g)||0, oldJob.printer_id);
    }
    if (result === 'SUCESSO' && printer_id) {
      db.prepare(`UPDATE printers SET total_hours=total_hours+?, total_prints=total_prints+1, filament_used_g=filament_used_g+? WHERE id=?`).run((Number(real_time_min)||0)/60, nextRealWeight, printer_id);
    }

    if (roll_id && nextConsumable > 0) {
      const roll = db.prepare(`SELECT current_weight_g FROM material_rolls WHERE id=?`).get(roll_id);
      const newWeight = roll.current_weight_g - nextConsumable;
      db.prepare(`UPDATE material_rolls SET current_weight_g=?, status=? WHERE id=?`).run(
        newWeight, newWeight <= 0 ? 'ESGOTADO' : (newWeight <= 50 ? 'EM_USO' : 'DISPONIVEL'), roll_id
      );
      if (nextRealWeight > 0) db.prepare(`INSERT INTO stock_movements (roll_id, type, reason, quantity_g, reference_id, reference_type, created_by) VALUES (?,?,?,?,?,?,?)`).run(roll_id, 'CONSUMO', 'PRODUCAO', nextRealWeight, id, 'production', req.user.id);
      if (nextWaste > 0) db.prepare(`INSERT INTO stock_movements (roll_id, type, reason, quantity_g, reference_id, reference_type, created_by) VALUES (?,?,?,?,?,?,?)`).run(roll_id, 'DESPERDICIO', 'PRODUCAO', nextWaste, id, 'production', req.user.id);
    }
  });

  try {
    updateProduction();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── TRANSACTIONS ────────────────────────────────────────
router.get('/finance', (req, res) => {
  const db = getDb();
  const { start, end } = req.query;
  let where = `WHERE deleted_at IS NULL`;
  const params = [];
  if (start) { where += ` AND date >= ?`; params.push(start); }
  if (end) { where += ` AND date <= ?`; params.push(end); }
  const rows = db.prepare(`SELECT * FROM transactions ${where} ORDER BY date DESC`).all(...params);
  res.json(rows);
});
router.post('/finance', (req, res) => {
  const { type, category, description, amount, date, notes, due_date } = req.body;
  if (!type || !description || !amount) return res.status(400).json({ error: 'Tipo, descrição e valor são obrigatórios' });
  const db = getDb();
  const r = db.prepare(`INSERT INTO transactions (type, category, description, amount, date, notes, due_date) VALUES (?,?,?,?,?,?,?)`).run(type, category, description, parseFloat(amount), date||new Date().toISOString().split('T')[0], notes, due_date);
  res.json({ id: r.lastInsertRowid });
});
router.put('/finance/:id', (req, res) => {
  const { type, category, description, amount, date, notes, due_date, paid, paid_at } = req.body;
  const db = getDb();
  db.prepare(`UPDATE transactions SET type=?, category=?, description=?, amount=?, date=?, notes=?, due_date=?, paid=?, paid_at=? WHERE id=?`).run(type, category, description, parseFloat(amount), date, notes, due_date, paid?1:0, paid_at, req.params.id);
  res.json({ ok: true });
});
router.delete('/finance/:id', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE transactions SET deleted_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ─── SETTINGS ────────────────────────────────────────
router.get('/settings', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM settings`).all();
  const obj = {};
  rows.forEach(r => obj[r.key] = r.value);
  res.json(obj);
});
router.post('/settings', (req, res) => {
  const db = getDb();
  const update = db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`);
  for (const [k, v] of Object.entries(req.body)) {
    update.run(k, String(v));
  }
  res.json({ ok: true });
});

// ─── DASHBOARD ────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  const db = getDb();
  const { start, end } = req.query;
  const from = start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = end || new Date().toISOString().split('T')[0];

  // O dashboard nunca deve quebrar a aplicação inteira. Cada métrica é isolada
  // para que um banco antigo/incompleto ainda consiga abrir a tela.
  const count = (sql, params = []) => {
    try { return Number(db.prepare(sql).get(...params)?.c || 0); }
    catch { return 0; }
  };
  const sum = (sql, params = []) => {
    try { return Number(db.prepare(sql).get(...params)?.total || 0); }
    catch { return 0; }
  };

  const revenue = sum(`SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE type='RECEITA' AND date BETWEEN ? AND ? AND deleted_at IS NULL`, [from, to]);
  const expenses = sum(`SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE type='DESPESA' AND date BETWEEN ? AND ? AND deleted_at IS NULL`, [from, to]);
  const profit = revenue - expenses;

  const active_orders = count(`SELECT COUNT(*) AS c FROM orders WHERE status NOT IN ('ENTREGUE','CANCELADO') AND deleted_at IS NULL`);
  const late_orders = count(`SELECT COUNT(*) AS c FROM orders WHERE status NOT IN ('ENTREGUE','CANCELADO') AND due_date IS NOT NULL AND due_date < date('now') AND deleted_at IS NULL`);
  const in_production = count(`SELECT COUNT(*) AS c FROM production_jobs WHERE status IN ('IMPRIMINDO','PREPARANDO')`);
  const low_stock = count(`SELECT COUNT(*) AS c FROM material_rolls WHERE current_weight_g <= min_stock_g AND deleted_at IS NULL`);
  const late_payments = count(`SELECT COUNT(*) AS c FROM transactions WHERE paid=0 AND due_date IS NOT NULL AND due_date < date('now') AND deleted_at IS NULL`);
  const maint_needed = count(`SELECT COUNT(*) AS c FROM printer_maintenance WHERE done_at IS NULL AND (scheduled_at IS NULL OR date(scheduled_at) <= date('now'))`);

  let total_investment = 0;
  try {
    total_investment = Number(db.prepare(`SELECT value FROM settings WHERE key='printer_investment'`).get()?.value || 0);
  } catch {}
  const total_revenue = sum(`SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE type='RECEITA' AND deleted_at IS NULL`);
  const roi = total_investment > 0 ? Number(Math.min(100, total_revenue / total_investment * 100).toFixed(1)) : 0;

  let print_hours = 0;
  let filament_used = 0;
  let success_rate = 0;
  try {
    const ps = db.prepare(`
      SELECT
        COALESCE(SUM(real_time_min),0) AS minutes,
        COALESCE(SUM(real_weight_g),0) AS filament,
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN result='SUCESSO' THEN 1 ELSE 0 END),0) AS success
      FROM production_jobs
      WHERE created_at BETWEEN ? AND ?
    `).get(from + 'T00:00:00', to + 'T23:59:59');
    print_hours = Number(ps.minutes || 0) / 60;
    filament_used = Number(ps.filament || 0);
    success_rate = Number(ps.total || 0) > 0 ? Number((Number(ps.success || 0) / Number(ps.total) * 100).toFixed(1)) : 0;
  } catch {}

  res.json({
    revenue,
    expenses,
    profit,
    active_orders,
    late_orders,
    in_production,
    low_stock,
    late_payments,
    maint_needed,
    roi,
    print_hours: print_hours.toFixed(1),
    filament_used: filament_used.toFixed(0),
    success_rate
  });
});

// ─── REPORTS ────────────────────────────────────────
router.get('/reports/finance', (req, res) => {
  const db = getDb();
  const { start, end } = req.query;
  const from = start || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
  const to = end || new Date().toISOString().split('T')[0];
  const by_month = db.prepare(`SELECT strftime('%Y-%m', date) as month, type, SUM(amount) as total FROM transactions WHERE date BETWEEN ? AND ? AND deleted_at IS NULL GROUP BY month, type ORDER BY month`).all(from, to);
  const by_category = db.prepare(`SELECT category, type, SUM(amount) as total FROM transactions WHERE date BETWEEN ? AND ? AND deleted_at IS NULL GROUP BY category, type ORDER BY total DESC`).all(from, to);
  res.json({ by_month, by_category });
});
router.get('/reports/production', (req, res) => {
  const db = getDb();
  const { start, end } = req.query;
  const from = start || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
  const to = end || new Date().toISOString().split('T')[0];
  const summary = db.prepare(`SELECT result, COUNT(*) as count, SUM(real_time_min) as time_min, SUM(real_weight_g) as weight FROM production_jobs WHERE created_at BETWEEN ? AND ? GROUP BY result`).all(from+'T00:00:00', to+'T23:59:59');
  const by_printer = db.prepare(`SELECT prn.name, COUNT(*) as jobs, SUM(pj.real_time_min)/60 as hours, SUM(pj.real_weight_g) as filament FROM production_jobs pj JOIN printers prn ON prn.id=pj.printer_id WHERE pj.created_at BETWEEN ? AND ? GROUP BY prn.id`).all(from+'T00:00:00', to+'T23:59:59');
  res.json({ summary, by_printer });
});
router.get('/reports/products', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT p.name, COUNT(o.id) as orders, SUM(o.quantity) as qty, SUM(o.total) as revenue, p.cost_total, (SUM(o.total)/NULLIF(SUM(o.quantity),0) - p.cost_total)*SUM(o.quantity) as profit FROM orders o JOIN products p ON p.id=o.product_id WHERE o.status NOT IN ('CANCELADO','ORCAMENTO') AND o.deleted_at IS NULL GROUP BY p.id ORDER BY revenue DESC`).all();
  res.json(rows);
});

module.exports = router;
