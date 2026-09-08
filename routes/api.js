const express = require('express');
const { dbRun, dbGet, dbAll } = require('../database/init');
const { auth } = require('../middleware/auth');
const router = express.Router();
router.use(auth);

const dt = () => new Date().toISOString().replace('T',' ').slice(0,19);
const today = () => new Date().toISOString().split('T')[0];

// CUSTOMERS
router.get('/customers', (req, res) => {
  res.json(dbAll(`SELECT c.*, COUNT(o.id) as total_orders, COALESCE(SUM(o.total),0) as total_spent FROM customers c LEFT JOIN orders o ON o.customer_id=c.id AND o.deleted_at IS NULL WHERE c.deleted_at IS NULL GROUP BY c.id ORDER BY c.name`));
});
router.post('/customers', (req, res) => {
  const { name, phone, email, city, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const r = dbRun('INSERT INTO customers (name,phone,email,city,notes) VALUES (?,?,?,?,?)', [name,phone||null,email||null,city||null,notes||null]);
  res.json({ id: r.lastInsertRowid });
});
router.put('/customers/:id', (req, res) => {
  const { name, phone, email, city, notes } = req.body;
  dbRun('UPDATE customers SET name=?,phone=?,email=?,city=?,notes=? WHERE id=?', [name,phone||null,email||null,city||null,notes||null,req.params.id]);
  res.json({ ok: true });
});
router.delete('/customers/:id', (req, res) => {
  dbRun('UPDATE customers SET deleted_at=? WHERE id=?', [dt(),req.params.id]);
  res.json({ ok: true });
});

// PRINTERS
router.get('/printers', (req, res) => res.json(dbAll('SELECT * FROM printers WHERE deleted_at IS NULL ORDER BY name')));
router.post('/printers', (req, res) => {
  const { name, brand, model, serial, purchase_date, purchase_price, location, power_watts, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const r = dbRun('INSERT INTO printers (name,brand,model,serial,purchase_date,purchase_price,location,power_watts,notes) VALUES (?,?,?,?,?,?,?,?,?)', [name,brand||null,model||null,serial||null,purchase_date||null,purchase_price||0,location||null,power_watts||0,notes||null]);
  res.json({ id: r.lastInsertRowid });
});
router.put('/printers/:id', (req, res) => {
  const { name, brand, model, serial, purchase_date, purchase_price, location, power_watts, status, notes } = req.body;
  dbRun('UPDATE printers SET name=?,brand=?,model=?,serial=?,purchase_date=?,purchase_price=?,location=?,power_watts=?,status=?,notes=? WHERE id=?', [name,brand||null,model||null,serial||null,purchase_date||null,purchase_price||0,location||null,power_watts||0,status||'DISPONIVEL',notes||null,req.params.id]);
  res.json({ ok: true });
});
router.delete('/printers/:id', (req, res) => {
  dbRun('UPDATE printers SET deleted_at=? WHERE id=?', [dt(),req.params.id]);
  res.json({ ok: true });
});
router.get('/printers/:id/maintenance', (req, res) => res.json(dbAll('SELECT * FROM printer_maintenance WHERE printer_id=? ORDER BY created_at DESC', [req.params.id])));
router.post('/printers/:id/maintenance', (req, res) => {
  const { task, scheduled_at, done_at, cost, parts_used, notes } = req.body;
  const r = dbRun('INSERT INTO printer_maintenance (printer_id,task,scheduled_at,done_at,cost,parts_used,notes) VALUES (?,?,?,?,?,?,?)', [req.params.id,task,scheduled_at||null,done_at||null,cost||0,parts_used||null,notes||null]);
  res.json({ id: r.lastInsertRowid });
});

// MATERIALS & ROLLS
router.get('/materials', (req, res) => res.json(dbAll('SELECT * FROM materials ORDER BY type,brand')));
router.post('/materials', (req, res) => {
  const { type, brand, color, color_code, diameter, notes } = req.body;
  const r = dbRun('INSERT INTO materials (type,brand,color,color_code,diameter,notes) VALUES (?,?,?,?,?,?)', [type,brand||null,color||null,color_code||null,diameter||1.75,notes||null]);
  res.json({ id: r.lastInsertRowid });
});
router.get('/rolls', (req, res) => {
  res.json(dbAll('SELECT r.*,m.type,m.brand,m.color FROM material_rolls r JOIN materials m ON m.id=r.material_id WHERE r.deleted_at IS NULL ORDER BY r.status,m.type'));
});
router.post('/rolls', (req, res) => {
  const { material_id, code, initial_weight_g, purchase_price, supplier, purchase_date, min_stock_g } = req.body;
  if (!material_id || !initial_weight_g) return res.status(400).json({ error: 'Material e peso obrigatórios' });
  const cpg = purchase_price ? purchase_price/initial_weight_g : 0;
  const r = dbRun('INSERT INTO material_rolls (material_id,code,initial_weight_g,current_weight_g,purchase_price,cost_per_gram,supplier,purchase_date,min_stock_g) VALUES (?,?,?,?,?,?,?,?,?)', [material_id,code||null,initial_weight_g,initial_weight_g,purchase_price||0,cpg,supplier||null,purchase_date||null,min_stock_g||50]);
  dbRun('INSERT INTO stock_movements (roll_id,type,reason,quantity_g,notes,created_by) VALUES (?,?,?,?,?,?)', [r.lastInsertRowid,'ENTRADA','COMPRA',initial_weight_g,'Entrada inicial',req.user.id]);
  res.json({ id: r.lastInsertRowid });
});
router.post('/rolls/:id/movement', (req, res) => {
  const { type, reason, quantity_g, notes } = req.body;
  const roll = dbGet('SELECT * FROM material_rolls WHERE id=?', [req.params.id]);
  if (!roll) return res.status(404).json({ error: 'Rolo não encontrado' });
  const delta = ['ENTRADA','DEVOLUCAO','AJUSTE'].includes(type) ? +quantity_g : -quantity_g;
  const nw = roll.current_weight_g + delta;
  if (nw < 0) return res.status(400).json({ error: 'Estoque insuficiente' });
  dbRun('UPDATE material_rolls SET current_weight_g=?,status=? WHERE id=?', [nw, nw<=0?'ESGOTADO':nw<50?'EM_USO':'DISPONIVEL', req.params.id]);
  dbRun('INSERT INTO stock_movements (roll_id,type,reason,quantity_g,notes,created_by) VALUES (?,?,?,?,?,?)', [req.params.id,type,reason,quantity_g,notes||null,req.user.id]);
  res.json({ ok: true, new_weight: nw });
});
router.get('/stock/movements', (req, res) => {
  res.json(dbAll('SELECT sm.*,r.code as roll_code,m.type as material_type,m.color FROM stock_movements sm LEFT JOIN material_rolls r ON r.id=sm.roll_id LEFT JOIN materials m ON m.id=r.material_id ORDER BY sm.created_at DESC LIMIT 200'));
});

// PROJECTS
router.get('/projects', (req, res) => {
  res.json(dbAll(`SELECT p.*,c.name as customer_name,(SELECT COUNT(*) FROM project_versions WHERE project_id=p.id) as versions_count,(SELECT COUNT(*) FROM tests WHERE project_id=p.id) as tests_count FROM projects p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC`));
});
router.post('/projects', (req, res) => {
  const { name, description, type, responsible, customer_id, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const r = dbRun('INSERT INTO projects (name,description,type,responsible,customer_id,notes) VALUES (?,?,?,?,?,?)', [name,description||null,type||'COMERCIAL',responsible||null,customer_id||null,notes||null]);
  res.json({ id: r.lastInsertRowid });
});
router.put('/projects/:id', (req, res) => {
  const { name, description, type, status, responsible, customer_id, notes } = req.body;
  dbRun('UPDATE projects SET name=?,description=?,type=?,status=?,responsible=?,customer_id=?,notes=? WHERE id=?', [name,description||null,type,status,responsible||null,customer_id||null,notes||null,req.params.id]);
  res.json({ ok: true });
});
router.delete('/projects/:id', (req, res) => {
  dbRun('UPDATE projects SET deleted_at=? WHERE id=?', [dt(),req.params.id]);
  res.json({ ok: true });
});
router.get('/projects/:id/versions', (req, res) => res.json(dbAll('SELECT * FROM project_versions WHERE project_id=? ORDER BY created_at DESC', [req.params.id])));
router.post('/projects/:id/versions', (req, res) => {
  const { version, filename, changes, reason, result, author } = req.body;
  const r = dbRun('INSERT INTO project_versions (project_id,version,filename,changes,reason,result,author) VALUES (?,?,?,?,?,?,?)', [req.params.id,version,filename||null,changes||null,reason||null,result||null,author||null]);
  res.json({ id: r.lastInsertRowid });
});

// TESTS
router.get('/tests', (req, res) => {
  res.json(dbAll(`SELECT t.*,p.name as project_name,pr.name as printer_name,pv.version FROM tests t JOIN projects p ON p.id=t.project_id LEFT JOIN printers pr ON pr.id=t.printer_id LEFT JOIN project_versions pv ON pv.id=t.version_id ORDER BY t.created_at DESC`));
});
router.post('/tests', (req, res) => {
  const { project_id,version_id,printer_id,roll_id,est_time_min,real_time_min,est_weight_g,real_weight_g,waste_g,temp_nozzle,temp_bed,layer_height,infill,walls,speed,supports,result,failure_type,failure_cause,notes } = req.body;
  if (!project_id) return res.status(400).json({ error: 'Projeto obrigatório' });
  const r = dbRun('INSERT INTO tests (project_id,version_id,printer_id,roll_id,est_time_min,real_time_min,est_weight_g,real_weight_g,waste_g,temp_nozzle,temp_bed,layer_height,infill,walls,speed,supports,result,failure_type,failure_cause,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [project_id,version_id||null,printer_id||null,roll_id||null,est_time_min||0,real_time_min||0,est_weight_g||0,real_weight_g||0,waste_g||0,temp_nozzle||null,temp_bed||null,layer_height||null,infill||null,walls||null,speed||null,supports?1:0,result||null,failure_type||null,failure_cause||null,notes||null]);
  if (roll_id && (real_weight_g||0)>0) {
    const roll = dbGet('SELECT * FROM material_rolls WHERE id=?',[roll_id]);
    if (roll) { dbRun('UPDATE material_rolls SET current_weight_g=? WHERE id=?',[Math.max(0,roll.current_weight_g-(+real_weight_g)+(+waste_g||0)),roll_id]); dbRun('INSERT INTO stock_movements (roll_id,type,reason,quantity_g,reference_id,reference_type,created_by) VALUES (?,?,?,?,?,?,?)',[roll_id,'CONSUMO','TESTE',real_weight_g,r.lastInsertRowid,'test',req.user.id]); }
  }
  res.json({ id: r.lastInsertRowid });
});

// PRODUCTS
router.get('/products', (req, res) => {
  res.json(dbAll('SELECT pr.*,p.name as project_name FROM products pr LEFT JOIN projects p ON p.id=pr.project_id WHERE pr.deleted_at IS NULL ORDER BY pr.name'));
});
router.post('/products', (req, res) => {
  const { code,name,project_id,version_id,material_type,weight_g,print_time_min,cost_material,cost_energy,cost_machine,cost_labor,cost_packaging,cost_finishing,price,notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const total=[cost_material,cost_energy,cost_machine,cost_labor,cost_packaging,cost_finishing].reduce((a,b)=>a+(+b||0),0);
  const margin=price>0?(price-total)/price*100:0; const markup=total>0?(price-total)/total*100:0;
  const r=dbRun('INSERT INTO products (code,name,project_id,version_id,material_type,weight_g,print_time_min,cost_material,cost_energy,cost_machine,cost_labor,cost_packaging,cost_finishing,cost_total,price,markup,margin,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[code||null,name,project_id||null,version_id||null,material_type||null,weight_g||0,print_time_min||0,cost_material||0,cost_energy||0,cost_machine||0,cost_labor||0,cost_packaging||0,cost_finishing||0,total,price||0,markup,margin,notes||null]);
  res.json({ id: r.lastInsertRowid });
});
router.put('/products/:id', (req, res) => {
  const { code,name,project_id,version_id,material_type,weight_g,print_time_min,cost_material,cost_energy,cost_machine,cost_labor,cost_packaging,cost_finishing,price,notes,active } = req.body;
  const total=[cost_material,cost_energy,cost_machine,cost_labor,cost_packaging,cost_finishing].reduce((a,b)=>a+(+b||0),0);
  const margin=price>0?(price-total)/price*100:0; const markup=total>0?(price-total)/total*100:0;
  dbRun('UPDATE products SET code=?,name=?,project_id=?,version_id=?,material_type=?,weight_g=?,print_time_min=?,cost_material=?,cost_energy=?,cost_machine=?,cost_labor=?,cost_packaging=?,cost_finishing=?,cost_total=?,price=?,markup=?,margin=?,notes=?,active=? WHERE id=?',[code||null,name,project_id||null,version_id||null,material_type||null,weight_g||0,print_time_min||0,cost_material||0,cost_energy||0,cost_machine||0,cost_labor||0,cost_packaging||0,cost_finishing||0,total,price||0,markup,margin,notes||null,active!==undefined?active:1,req.params.id]);
  res.json({ ok: true });
});
router.delete('/products/:id', (req, res) => {
  dbRun('UPDATE products SET deleted_at=? WHERE id=?',[dt(),req.params.id]);
  res.json({ ok: true });
});

// ORDERS
router.get('/orders', (req, res) => {
  res.json(dbAll('SELECT o.*,c.name as customer_name,p.name as product_name FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN products p ON p.id=o.product_id WHERE o.deleted_at IS NULL ORDER BY o.created_at DESC'));
});
router.post('/orders', (req, res) => {
  const { customer_id,product_id,quantity,material,unit_price,discount,payment_method,due_date,notes } = req.body;
  if (!customer_id||!product_id) return res.status(400).json({ error: 'Cliente e produto obrigatórios' });
  const qty=parseInt(quantity)||1; const up=+unit_price||0; const disc=+discount||0; const total=(up*qty)-disc;
  const r=dbRun('INSERT INTO orders (customer_id,product_id,quantity,material,unit_price,discount,total,payment_method,due_date,notes) VALUES (?,?,?,?,?,?,?,?,?,?)',[customer_id,product_id,qty,material||null,up,disc,total,payment_method||null,due_date||null,notes||null]);
  res.json({ id: r.lastInsertRowid });
});
router.put('/orders/:id', (req, res) => {
  const { customer_id,product_id,quantity,material,unit_price,discount,payment_method,due_date,notes,status } = req.body;
  const qty=parseInt(quantity)||1; const up=+unit_price||0; const disc=+discount||0; const total=(up*qty)-disc;
  const old=dbGet('SELECT * FROM orders WHERE id=?',[req.params.id]);
  dbRun('UPDATE orders SET customer_id=?,product_id=?,quantity=?,material=?,unit_price=?,discount=?,total=?,payment_method=?,due_date=?,notes=?,status=? WHERE id=?',[customer_id,product_id,qty,material||null,up,disc,total,payment_method||null,due_date||null,notes||null,status||old.status,req.params.id]);
  if (status==='CONFIRMADO'&&old.status!=='CONFIRMADO') {
    dbRun('INSERT INTO transactions (type,category,description,amount,date,reference_id,reference_type,paid) VALUES (?,?,?,?,?,?,?,?)',['RECEITA','Venda',`Pedido #${req.params.id}`,total,today(),req.params.id,'order',0]);
    dbRun('INSERT INTO production_jobs (order_id,product_id,status) VALUES (?,?,?)',[req.params.id,product_id,'AGUARDANDO']);
  }
  res.json({ ok: true });
});
router.delete('/orders/:id', (req, res) => {
  dbRun(`UPDATE orders SET deleted_at=?,status='CANCELADO' WHERE id=?`,[dt(),req.params.id]);
  res.json({ ok: true });
});

// PRODUCTION
router.get('/production', (req, res) => {
  res.json(dbAll(`SELECT pj.*,o.customer_id,c.name as customer_name,pr.name as product_name,prn.name as printer_name FROM production_jobs pj LEFT JOIN orders o ON o.id=pj.order_id LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN products pr ON pr.id=pj.product_id LEFT JOIN printers prn ON prn.id=pj.printer_id ORDER BY pj.created_at DESC`));
});
router.put('/production/:id', (req, res) => {
  const { printer_id,roll_id,est_weight_g,real_weight_g,est_time_min,real_time_min,waste_g,started_at,finished_at,result,failure_type,failure_cause,status,notes } = req.body;
  dbRun('UPDATE production_jobs SET printer_id=?,roll_id=?,est_weight_g=?,real_weight_g=?,est_time_min=?,real_time_min=?,waste_g=?,started_at=?,finished_at=?,result=?,failure_type=?,failure_cause=?,status=?,notes=? WHERE id=?',[printer_id||null,roll_id||null,est_weight_g||0,real_weight_g||0,est_time_min||0,real_time_min||0,waste_g||0,started_at||null,finished_at||null,result||null,failure_type||null,failure_cause||null,status,notes||null,req.params.id]);
  const job=dbGet('SELECT * FROM production_jobs WHERE id=?',[req.params.id]);
  if (job?.order_id&&status) { const os={'AGUARDANDO':'CONFIRMADO','PREPARANDO':'EM_PRODUCAO','IMPRIMINDO':'EM_PRODUCAO','ACABAMENTO':'ACABAMENTO','PRONTO':'PRONTO','ENTREGUE':'ENTREGUE'}[status]; if(os) dbRun('UPDATE orders SET status=? WHERE id=?',[os,job.order_id]); }
  if (result==='SUCESSO'&&(real_time_min||0)>0&&printer_id) dbRun('UPDATE printers SET total_hours=total_hours+?,total_prints=total_prints+1,filament_used_g=filament_used_g+? WHERE id=?',[(real_time_min||0)/60,real_weight_g||0,printer_id]);
  if (roll_id&&(real_weight_g||0)>0&&result) { const roll=dbGet('SELECT * FROM material_rolls WHERE id=?',[roll_id]); if(roll){dbRun('UPDATE material_rolls SET current_weight_g=? WHERE id=?',[Math.max(0,roll.current_weight_g-(+real_weight_g)-(+waste_g||0)),roll_id]); dbRun('INSERT INTO stock_movements (roll_id,type,reason,quantity_g,reference_id,reference_type,created_by) VALUES (?,?,?,?,?,?,?)',[roll_id,'CONSUMO','PRODUCAO',real_weight_g,req.params.id,'production',req.user.id]);} }
  res.json({ ok: true });
});

// FINANCE
router.get('/finance', (req, res) => {
  const { start, end } = req.query;
  let sql='WHERE deleted_at IS NULL'; const params=[];
  if(start){sql+=' AND date >= ?';params.push(start);} if(end){sql+=' AND date <= ?';params.push(end);}
  res.json(dbAll(`SELECT * FROM transactions ${sql} ORDER BY date DESC`,params));
});
router.post('/finance', (req, res) => {
  const { type,category,description,amount,date,notes,due_date } = req.body;
  if(!type||!description||!amount) return res.status(400).json({ error:'Tipo, descrição e valor obrigatórios' });
  const r=dbRun('INSERT INTO transactions (type,category,description,amount,date,notes,due_date) VALUES (?,?,?,?,?,?,?)',[type,category||null,description,+amount,date||today(),notes||null,due_date||null]);
  res.json({ id: r.lastInsertRowid });
});
router.put('/finance/:id', (req, res) => {
  const { type,category,description,amount,date,notes,due_date,paid,paid_at } = req.body;
  dbRun('UPDATE transactions SET type=?,category=?,description=?,amount=?,date=?,notes=?,due_date=?,paid=?,paid_at=? WHERE id=?',[type,category||null,description,+amount,date,notes||null,due_date||null,paid?1:0,paid_at||null,req.params.id]);
  res.json({ ok: true });
});
router.delete('/finance/:id', (req, res) => {
  dbRun('UPDATE transactions SET deleted_at=? WHERE id=?',[dt(),req.params.id]);
  res.json({ ok: true });
});

// SETTINGS
router.get('/settings', (req, res) => {
  const obj={}; dbAll('SELECT * FROM settings').forEach(r=>obj[r.key]=r.value); res.json(obj);
});
router.post('/settings', (req, res) => {
  for(const [k,v] of Object.entries(req.body)) dbRun('INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,?)',[k,String(v),dt()]);
  res.json({ ok: true });
});

// DASHBOARD
router.get('/dashboard', (req, res) => {
  const from=req.query.start||new Date(Date.now()-30*864e5).toISOString().split('T')[0];
  const to=req.query.end||today();
  const revenue=dbGet(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='RECEITA' AND date BETWEEN ? AND ? AND deleted_at IS NULL`,[from,to]);
  const expenses=dbGet(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='DESPESA' AND date BETWEEN ? AND ? AND deleted_at IS NULL`,[from,to]);
  const profit=revenue.total-expenses.total;
  const ao=dbGet(`SELECT COUNT(*) as c FROM orders WHERE status NOT IN ('ENTREGUE','CANCELADO') AND deleted_at IS NULL`);
  const lo=dbGet(`SELECT COUNT(*) as c FROM orders WHERE status NOT IN ('ENTREGUE','CANCELADO') AND due_date < ? AND deleted_at IS NULL`,[today()]);
  const ip=dbGet(`SELECT COUNT(*) as c FROM production_jobs WHERE status IN ('IMPRIMINDO','PREPARANDO')`);
  const ls=dbGet(`SELECT COUNT(*) as c FROM material_rolls WHERE current_weight_g <= min_stock_g AND deleted_at IS NULL`);
  const lp=dbGet(`SELECT COUNT(*) as c FROM transactions WHERE paid=0 AND due_date < ? AND deleted_at IS NULL`,[today()]);
  const mn=dbGet(`SELECT COUNT(*) as c FROM printer_maintenance WHERE done_at IS NULL`);
  const ti=+(dbGet(`SELECT value FROM settings WHERE key='printer_investment'`)?.value||0);
  const tr=dbGet(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type='RECEITA' AND deleted_at IS NULL`);
  const roi=ti>0?Math.min(100,tr.total/ti*100).toFixed(1):0;
  const ps=dbAll(`SELECT result,COUNT(*) as count,SUM(real_time_min) as time_min,SUM(real_weight_g) as weight FROM production_jobs GROUP BY result`);
  const totalP=ps.reduce((a,b)=>a+b.count,0); const succP=ps.find(s=>s.result==='SUCESSO');
  res.json({ revenue:revenue.total,expenses:expenses.total,profit,active_orders:ao.c,late_orders:lo.c,in_production:ip.c,low_stock:ls.c,late_payments:lp.c,maint_needed:mn.c,roi,print_hours:(ps.reduce((a,b)=>a+(b.time_min||0),0)/60).toFixed(1),filament_used:ps.reduce((a,b)=>a+(b.weight||0),0).toFixed(0),success_rate:totalP>0?((succP?.count||0)/totalP*100).toFixed(1):0 });
});

// REPORTS
router.get('/reports/finance', (req, res) => {
  const from=req.query.start||new Date(Date.now()-30*864e5).toISOString().split('T')[0]; const to=req.query.end||today();
  res.json({ by_category: dbAll(`SELECT category,type,SUM(amount) as total FROM transactions WHERE date BETWEEN ? AND ? AND deleted_at IS NULL GROUP BY category,type ORDER BY total DESC`,[from,to]) });
});
router.get('/reports/production', (req, res) => {
  res.json({ summary:dbAll(`SELECT result,COUNT(*) as count,SUM(real_time_min) as time_min,SUM(real_weight_g) as weight FROM production_jobs GROUP BY result`), by_printer:dbAll(`SELECT prn.name,COUNT(*) as jobs,SUM(pj.real_time_min)/60 as hours,SUM(pj.real_weight_g) as filament FROM production_jobs pj JOIN printers prn ON prn.id=pj.printer_id GROUP BY prn.id`) });
});
router.get('/reports/products', (req, res) => {
  res.json(dbAll(`SELECT p.name,COUNT(o.id) as orders,SUM(o.quantity) as qty,SUM(o.total) as revenue,p.cost_total FROM orders o JOIN products p ON p.id=o.product_id WHERE o.status NOT IN ('CANCELADO','ORCAMENTO') AND o.deleted_at IS NULL GROUP BY p.id ORDER BY revenue DESC`));
});

module.exports = router;
