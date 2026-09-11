const express=require('express');const multer=require('multer');const cloudinary=require('cloudinary').v2;
const {dbRun,dbGet,dbAll,withTransaction,getPool}=require('../database/init');const{auth,adminOnly,csrfProtection}=require('../middleware/auth');const{auditMutations}=require('../middleware/audit');
const router=express.Router();router.use(auth,csrfProtection,auditMutations);const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024}});const backupUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024}});
const today=()=>new Date().toISOString().slice(0,10);const n=v=>Number(v)||0;const bool=v=>v===true||v===1||v==='1'||v==='true';
function cloudReady(){return !!(process.env.CLOUDINARY_CLOUD_NAME&&process.env.CLOUDINARY_API_KEY&&process.env.CLOUDINARY_API_SECRET)}
if(cloudReady()) cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET});
function uploadBuffer(buffer,folder){return new Promise((resolve,reject)=>{const s=cloudinary.uploader.upload_stream({folder,resource_type:'image'},(e,r)=>e?reject(e):resolve(r));s.end(buffer)})}
async function consumeItem(tx,{table,id,qty,quantityField='current_qty',movementTable,type,reason,referenceId,notes,userId}){
 const item=await tx.get(`SELECT * FROM ${table} WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,[id]);if(!item)throw Object.assign(new Error('Item não encontrado'),{status:404});const q=n(qty);if(q<=0)throw Object.assign(new Error('Quantidade inválida'),{status:400});if(n(item[quantityField])<q)throw Object.assign(new Error('Estoque insuficiente'),{status:400});const nw=n(item[quantityField])-q;await tx.run(`UPDATE ${table} SET ${quantityField}=$1 WHERE id=$2`,[nw,id]);await tx.run(`INSERT INTO ${movementTable} (${table==='small_parts'?'part_id':'consumable_id'},type,quantity,reason,reference_id,reference_type,notes,created_by) VALUES($1,'CONSUMO',$2,$3,$4,$5,$6,$7)`,[id,q,reason,referenceId,type,notes||null,userId]);return{item,newQty:nw}}

// Customers
router.get('/customers',async(req,res,next)=>{try{res.json(await dbAll(`SELECT c.*,COUNT(o.id)::int total_orders,COALESCE(SUM(o.total),0) total_spent FROM customers c LEFT JOIN orders o ON o.customer_id=c.id AND o.deleted_at IS NULL WHERE c.deleted_at IS NULL GROUP BY c.id ORDER BY c.name`))}catch(e){next(e)}});
router.post('/customers',adminOnly,async(req,res,next)=>{try{const{name,phone,email,city,notes}=req.body;if(!name)return res.status(400).json({error:'Nome obrigatório'});const r=await dbGet('INSERT INTO customers(name,phone,email,city,notes) VALUES($1,$2,$3,$4,$5) RETURNING id',[name,phone||null,email||null,city||null,notes||null]);res.json({id:Number(r.id)})}catch(e){next(e)}});
router.put('/customers/:id',adminOnly,async(req,res,next)=>{try{const{name,phone,email,city,notes}=req.body;await dbRun('UPDATE customers SET name=$1,phone=$2,email=$3,city=$4,notes=$5 WHERE id=$6',[name,phone||null,email||null,city||null,notes||null,req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.delete('/customers/:id',adminOnly,async(req,res,next)=>{try{await dbRun('UPDATE customers SET deleted_at=NOW() WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});

// Printers + maintenance
async function refreshProjectProductCosts(tx, projectId){
 const products=await tx.all('SELECT * FROM products WHERE project_id=$1 AND deleted_at IS NULL',[projectId]);
 const pc=await tx.get('SELECT COALESCE(SUM(total_cost),0) total FROM project_parts WHERE project_id=$1 AND deleted_at IS NULL',[projectId]);
 const partsCost=n(pc?.total);
 for(const p of products){
   const base=n(p.cost_total)-n(p.cost_parts); const total=base+partsCost; const price=n(p.price); const margin=price>0?(price-total)/price*100:0; const markup=total>0?(price-total)/total*100:0;
   await tx.run('UPDATE products SET cost_parts=$1,cost_total=$2,margin=$3,markup=$4 WHERE id=$5',[partsCost,total,margin,markup,p.id]);
 }
}
router.get('/printers',async(req,res,next)=>{try{res.json(await dbAll(`SELECT p.*,COALESCE(t.test_prints,0)::int test_prints,COALESCE(t.test_failures,0)::int test_failures,COALESCE(t.test_hours,0) test_hours,COALESCE(t.test_filament,0) test_filament FROM printers p LEFT JOIN (SELECT printer_id,COUNT(*) FILTER (WHERE real_time_min > 0 AND result <> 'CANCELADO') test_prints,COUNT(*) FILTER (WHERE result = 'REPROVADO') test_failures,COALESCE(SUM(CASE WHEN real_time_min > 0 AND result <> 'CANCELADO' THEN real_time_min ELSE 0 END),0)/60 test_hours,COALESCE(SUM(CASE WHEN real_time_min > 0 AND result <> 'CANCELADO' THEN COALESCE(real_weight_g,0)+COALESCE(waste_g,0) ELSE 0 END),0) test_filament FROM tests GROUP BY printer_id) t ON t.printer_id=p.id WHERE p.deleted_at IS NULL ORDER BY p.name`))}catch(e){next(e)}});
router.post('/printers',adminOnly,async(req,res,next)=>{try{const b=req.body;if(!b.name)return res.status(400).json({error:'Nome obrigatório'});const r=await dbGet('INSERT INTO printers(name,brand,model,serial,purchase_date,purchase_price,location,power_watts,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[b.name,b.brand||null,b.model||null,b.serial||null,b.purchase_date||null,n(b.purchase_price),b.location||null,n(b.power_watts),b.notes||null]);res.json({id:Number(r.id)})}catch(e){next(e)}});
router.put('/printers/:id',adminOnly,async(req,res,next)=>{try{const b=req.body;await dbRun('UPDATE printers SET name=$1,brand=$2,model=$3,serial=$4,purchase_date=$5,purchase_price=$6,location=$7,power_watts=$8,status=$9,notes=$10 WHERE id=$11',[b.name,b.brand||null,b.model||null,b.serial||null,b.purchase_date||null,n(b.purchase_price),b.location||null,n(b.power_watts),b.status||'DISPONIVEL',b.notes||null,req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.delete('/printers/:id',adminOnly,async(req,res,next)=>{try{await dbRun('UPDATE printers SET deleted_at=NOW() WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.get('/printers/:id/maintenance',async(req,res,next)=>{try{res.json(await dbAll(`SELECT pm.*,mp.task as plan_task FROM printer_maintenance pm LEFT JOIN maintenance_plans mp ON mp.id=pm.plan_id WHERE pm.printer_id=$1 ORDER BY pm.created_at DESC`,[req.params.id]))}catch(e){next(e)}});
router.post('/printers/:id/maintenance',async(req,res,next)=>{try{const b=req.body;const result=await withTransaction(async tx=>{
 const printer=await tx.get(`SELECT p.total_hours + COALESCE(t.test_hours,0) AS current_hours
   FROM printers p LEFT JOIN (SELECT printer_id,COALESCE(SUM(CASE WHEN real_time_min>0 AND result<>'CANCELADO' THEN real_time_min ELSE 0 END),0)/60 AS test_hours FROM tests GROUP BY printer_id) t ON t.printer_id=p.id
   WHERE p.id=$1 AND p.deleted_at IS NULL`,[req.params.id]);
 if(!printer) throw Object.assign(new Error('Impressora não encontrada'),{status:404});
 const plan=b.plan_id?await tx.get('SELECT * FROM maintenance_plans WHERE id=$1 AND printer_id=$2',[b.plan_id,req.params.id]):null;
 if(b.plan_id&&!plan) throw Object.assign(new Error('Plano de manutenção não encontrado'),{status:404});
 const completedHours=b.hours_at!==undefined&&b.hours_at!==''?n(b.hours_at):n(printer.current_hours);
 const task=(b.task||plan?.task||'').trim();
 if(!task) throw Object.assign(new Error('Tarefa é obrigatória'),{status:400});
 const r=await tx.get('INSERT INTO printer_maintenance(printer_id,plan_id,task,scheduled_at,done_at,hours_at,cost,parts_used,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
   [req.params.id,b.plan_id||null,task,b.scheduled_at||null,b.done_at||null,completedHours,n(b.cost),b.parts_used||null,b.notes||null]);
 const maintenanceId=r.id;
 if(b.done_at&&plan){
   await tx.run(`UPDATE maintenance_plans
     SET last_completed_at=$1,last_completed_hours=$2,
         next_due_date=CASE WHEN interval_days IS NOT NULL THEN ($1::date + interval_days * INTERVAL '1 day') ELSE NULL END,
         next_due_hours=CASE WHEN interval_hours IS NOT NULL THEN $2 + interval_hours ELSE NULL END
     WHERE id=$3`,[b.done_at,completedHours,b.plan_id]);
 }
 for(const item of (Array.isArray(b.consumables)?b.consumables:[])){await consumeItem(tx,{table:'tool_consumables',id:item.id,qty:item.quantity,movementTable:'consumable_movements',type:'maintenance',reason:'MANUTENCAO',referenceId:maintenanceId,notes:b.notes,userId:req.user.id});}
 for(const item of (Array.isArray(b.parts)?b.parts:[])){await consumeItem(tx,{table:'small_parts',id:item.id,qty:item.quantity,movementTable:'part_movements',type:'maintenance',reason:'MANUTENCAO',referenceId:maintenanceId,notes:b.notes,userId:req.user.id});}
 return r;});res.json({id:Number(result.id)})}catch(e){next(e)}});

const MAINT_WARNING_HOURS=20;
router.get('/maintenance/plans',async(req,res,next)=>{try{res.json(await dbAll(`SELECT mp.*,p.name printer_name,
  p.total_hours + COALESCE(t.test_hours,0) AS current_hours,
  CASE
    WHEN mp.next_due_hours IS NOT NULL AND p.total_hours + COALESCE(t.test_hours,0) >= mp.next_due_hours THEN 'ATRASADA'
    WHEN mp.next_due_date IS NOT NULL AND CURRENT_DATE >= mp.next_due_date THEN 'ATRASADA'
    WHEN mp.next_due_hours IS NOT NULL AND mp.next_due_hours-(p.total_hours + COALESCE(t.test_hours,0)) <= ${MAINT_WARNING_HOURS} THEN 'PROXIMA'
    WHEN mp.next_due_date IS NOT NULL AND mp.next_due_date-CURRENT_DATE <= 7 THEN 'PROXIMA'
    ELSE 'EM_DIA'
  END AS status,
  CASE WHEN mp.next_due_hours IS NOT NULL THEN GREATEST(mp.next_due_hours-(p.total_hours + COALESCE(t.test_hours,0)),0) END AS hours_remaining
  FROM maintenance_plans mp JOIN printers p ON p.id=mp.printer_id
  LEFT JOIN (SELECT printer_id,COALESCE(SUM(CASE WHEN real_time_min>0 AND result<>'CANCELADO' THEN real_time_min ELSE 0 END),0)/60 AS test_hours FROM tests GROUP BY printer_id) t ON t.printer_id=p.id
  WHERE p.deleted_at IS NULL AND mp.active=true ORDER BY CASE WHEN mp.next_due_hours IS NOT NULL AND p.total_hours+COALESCE(t.test_hours,0)>=mp.next_due_hours THEN 0 WHEN mp.next_due_date IS NOT NULL AND CURRENT_DATE>=mp.next_due_date THEN 0 ELSE 1 END,p.name,mp.task`))}catch(e){next(e)}});
router.post('/maintenance/plans',async(req,res,next)=>{try{const b=req.body;const printer=await dbGet(`SELECT p.total_hours + COALESCE(t.test_hours,0) AS current_hours FROM printers p LEFT JOIN (SELECT printer_id,COALESCE(SUM(CASE WHEN real_time_min>0 AND result<>'CANCELADO' THEN real_time_min ELSE 0 END),0)/60 AS test_hours FROM tests GROUP BY printer_id) t ON t.printer_id=p.id WHERE p.id=$1 AND p.deleted_at IS NULL`,[b.printer_id]);if(!printer)return res.status(404).json({error:'Impressora não encontrada'});const ih=b.interval_hours!==''&&b.interval_hours!=null?n(b.interval_hours):null,id=b.interval_days!==''&&b.interval_days!=null?parseInt(b.interval_days):null;const dueHours=b.next_due_hours!==''&&b.next_due_hours!=null?n(b.next_due_hours):(ih!=null?n(printer.current_hours)+ih:null);const dueDate=b.next_due_date||null;if(ih==null&&id==null)return res.status(400).json({error:'Informe intervalo em horas ou dias'});const r=await dbGet(`INSERT INTO maintenance_plans(printer_id,task,interval_hours,interval_days,active,next_due_date,next_due_hours,notes) VALUES($1,$2,$3,$4,$5,CASE WHEN $6 IS NOT NULL THEN $6::date WHEN $4 IS NOT NULL THEN CURRENT_DATE + $4 * INTERVAL '1 day' ELSE NULL END,$7,$8) RETURNING id`,[b.printer_id,b.task,ih,id,b.active!==false,dueDate,dueHours,b.notes||null]);res.json({id:Number(r.id),next_due_hours:dueHours,next_due_date:dueDate})}catch(e){next(e)}});
router.put('/maintenance/plans/:id',async(req,res,next)=>{try{const b=req.body;const plan=await dbGet('SELECT * FROM maintenance_plans WHERE id=$1',[req.params.id]);if(!plan)return res.status(404).json({error:'Plano não encontrado'});const ih=b.interval_hours!==''&&b.interval_hours!=null?n(b.interval_hours):null,id=b.interval_days!==''&&b.interval_days!=null?parseInt(b.interval_days):null;await dbRun('UPDATE maintenance_plans SET task=$1,interval_hours=$2,interval_days=$3,active=$4,next_due_date=$5,next_due_hours=$6,notes=$7 WHERE id=$8',[b.task,ih,id,b.active!==false,b.next_due_date||null,b.next_due_hours!==''&&b.next_due_hours!=null?n(b.next_due_hours):null,b.notes||null,req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.delete('/maintenance/plans/:id',async(req,res,next)=>{try{await dbRun('UPDATE maintenance_plans SET active=false WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});

// Materials/filament
router.get('/materials',async(req,res,next)=>{try{res.json(await dbAll('SELECT * FROM materials ORDER BY type,brand'))}catch(e){next(e)}});
router.post('/materials',adminOnly,async(req,res,next)=>{try{const b=req.body;const r=await dbGet('INSERT INTO materials(type,brand,color,color_code,diameter,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[b.type,b.brand||null,b.color||null,b.color_code||null,n(b.diameter)||1.75,b.notes||null]);res.json({id:Number(r.id)})}catch(e){next(e)}});
router.get('/rolls',async(req,res,next)=>{try{res.json(await dbAll('SELECT r.*,m.type,m.brand,m.color FROM material_rolls r JOIN materials m ON m.id=r.material_id WHERE r.deleted_at IS NULL ORDER BY r.status,m.type'))}catch(e){next(e)}});
router.post('/rolls',adminOnly,async(req,res,next)=>{try{const b=req.body;if(!b.material_id||!b.initial_weight_g)return res.status(400).json({error:'Material e peso obrigatórios'});const w=n(b.initial_weight_g),price=n(b.purchase_price),r=await dbGet('INSERT INTO material_rolls(material_id,code,initial_weight_g,current_weight_g,purchase_price,cost_per_gram,supplier,purchase_date,min_stock_g) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8) RETURNING id',[b.material_id,b.code||null,w,price,w?price/w:0,b.supplier||null,b.purchase_date||null,b.min_stock_g!=null?n(b.min_stock_g):50]);await dbRun(`INSERT INTO stock_movements(roll_id,type,reason,quantity_g,notes,created_by) VALUES($1,'ENTRADA','COMPRA',$2,$3,$4)`,[r.id,w,'Entrada inicial',req.user.id]);res.json({id:Number(r.id)})}catch(e){next(e)}});
router.post('/rolls/:id/movement',adminOnly,async(req,res,next)=>{try{const b=req.body,q=n(b.quantity_g);if(q<=0)return res.status(400).json({error:'Quantidade inválida'});const result=await withTransaction(async tx=>{const roll=await tx.get('SELECT * FROM material_rolls WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[req.params.id]);if(!roll)throw Object.assign(new Error('Rolo não encontrado'),{status:404});const delta=['ENTRADA','DEVOLUCAO','AJUSTE'].includes(b.type)?q:-q,nw=n(roll.current_weight_g)+delta;if(nw<0)throw Object.assign(new Error('Estoque insuficiente'),{status:400});await tx.run('UPDATE material_rolls SET current_weight_g=$1,status=$2 WHERE id=$3',[nw,nw<=0?'ESGOTADO':nw<=n(roll.min_stock_g)?'EM_USO':'DISPONIVEL',req.params.id]);await tx.run('INSERT INTO stock_movements(roll_id,type,reason,quantity_g,notes,created_by) VALUES($1,$2,$3,$4,$5,$6)',[req.params.id,b.type,b.reason||'AJUSTE',q,b.notes||null,req.user.id]);return nw});res.json({ok:true,new_weight:result});}catch(e){next(e)}});
router.get('/stock/movements',async(req,res,next)=>{try{res.json(await dbAll(`SELECT sm.*,r.code roll_code,m.type material_type,m.color FROM stock_movements sm LEFT JOIN material_rolls r ON r.id=sm.roll_id LEFT JOIN materials m ON m.id=r.material_id ORDER BY sm.created_at DESC LIMIT 200`))}catch(e){next(e)}});

// Consumables/tools
router.get('/consumables',async(req,res,next)=>{try{res.json(await dbAll('SELECT * FROM tool_consumables WHERE deleted_at IS NULL ORDER BY name'))}catch(e){next(e)}});
router.post('/consumables',adminOnly,async(req,res,next)=>{try{const b=req.body;const r=await dbGet('INSERT INTO tool_consumables(name,category,unit,current_qty,min_qty,unit_cost,supplier,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[b.name,b.category||null,b.unit||'un',n(b.current_qty),n(b.min_qty),n(b.unit_cost),b.supplier||null,b.notes||null]);res.json({id:Number(r.id)})}catch(e){next(e)}});
router.put('/consumables/:id',adminOnly,async(req,res,next)=>{try{const b=req.body;await dbRun('UPDATE tool_consumables SET name=$1,category=$2,unit=$3,current_qty=$4,min_qty=$5,unit_cost=$6,supplier=$7,notes=$8 WHERE id=$9',[b.name,b.category||null,b.unit||'un',n(b.current_qty),n(b.min_qty),n(b.unit_cost),b.supplier||null,b.notes||null,req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.delete('/consumables/:id',adminOnly,async(req,res,next)=>{try{await dbRun('UPDATE tool_consumables SET deleted_at=NOW() WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.post('/consumables/:id/movement',adminOnly,async(req,res,next)=>{try{const b=req.body,q=n(b.quantity);if(q<=0)return res.status(400).json({error:'Quantidade inválida'});const result=await withTransaction(async tx=>{const c=await tx.get('SELECT * FROM tool_consumables WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[req.params.id]);if(!c)throw Object.assign(new Error('Consumível não encontrado'),{status:404});let nw=n(c.current_qty);if(['ENTRADA','DEVOLUCAO'].includes(b.type))nw+=q;else nw-=q;if(nw<0)throw Object.assign(new Error('Estoque insuficiente'),{status:400});await tx.run('UPDATE tool_consumables SET current_qty=$1 WHERE id=$2',[nw,req.params.id]);await tx.run('INSERT INTO consumable_movements(consumable_id,type,quantity,reason,notes,created_by) VALUES($1,$2,$3,$4,$5,$6)',[req.params.id,b.type,q,b.reason||'AJUSTE',b.notes||null,req.user.id]);return nw});res.json({ok:true,current_qty:result});}catch(e){next(e)}});
router.get('/consumables/movements',async(req,res,next)=>{try{res.json(await dbAll(`SELECT cm.*,tc.name,tc.unit FROM consumable_movements cm JOIN tool_consumables tc ON tc.id=cm.consumable_id ORDER BY cm.created_at DESC LIMIT 200`))}catch(e){next(e)}});

// Small parts
router.get('/parts',async(req,res,next)=>{try{res.json(await dbAll('SELECT * FROM small_parts WHERE deleted_at IS NULL ORDER BY category,name,type,size'))}catch(e){next(e)}});
router.post('/parts',adminOnly,async(req,res,next)=>{try{const b=req.body;const r=await dbGet('INSERT INTO small_parts(category,name,type,size,material,current_qty,min_qty,unit_cost,supplier,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[b.category||null,b.name,b.type||null,b.size||null,b.material||null,n(b.current_qty),n(b.min_qty),n(b.unit_cost),b.supplier||null,b.notes||null]);res.json({id:Number(r.id)})}catch(e){next(e)}});
router.put('/parts/:id',adminOnly,async(req,res,next)=>{try{const b=req.body;await dbRun('UPDATE small_parts SET category=$1,name=$2,type=$3,size=$4,material=$5,current_qty=$6,min_qty=$7,unit_cost=$8,supplier=$9,notes=$10 WHERE id=$11',[b.category||null,b.name,b.type||null,b.size||null,b.material||null,n(b.current_qty),n(b.min_qty),n(b.unit_cost),b.supplier||null,b.notes||null,req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.delete('/parts/:id',adminOnly,async(req,res,next)=>{try{await dbRun('UPDATE small_parts SET deleted_at=NOW() WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.post('/parts/:id/movement',adminOnly,async(req,res,next)=>{try{const b=req.body,q=n(b.quantity);if(q<=0)return res.status(400).json({error:'Quantidade inválida'});const result=await withTransaction(async tx=>{const part=await tx.get('SELECT * FROM small_parts WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[req.params.id]);if(!part)throw Object.assign(new Error('Peça não encontrada'),{status:404});let nw=n(part.current_qty);if(['ENTRADA','DEVOLUCAO'].includes(b.type))nw+=q;else nw-=q;if(nw<0)throw Object.assign(new Error('Estoque insuficiente'),{status:400});await tx.run('UPDATE small_parts SET current_qty=$1 WHERE id=$2',[nw,req.params.id]);await tx.run('INSERT INTO part_movements(part_id,type,quantity,reason,notes,created_by) VALUES($1,$2,$3,$4,$5,$6)',[req.params.id,b.type,q,b.reason||'AJUSTE',b.notes||null,req.user.id]);return nw});res.json({ok:true,current_qty:result});}catch(e){next(e)}});
router.get('/parts/movements',async(req,res,next)=>{try{res.json(await dbAll(`SELECT pm.*,sp.name,sp.size,sp.type part_type FROM part_movements pm JOIN small_parts sp ON sp.id=pm.part_id ORDER BY pm.created_at DESC LIMIT 200`))}catch(e){next(e)}});

// Projects + parts
router.get('/projects',async(req,res,next)=>{try{res.json(await dbAll(`SELECT p.*,c.name customer_name,(SELECT COUNT(*) FROM project_versions WHERE project_id=p.id)::int versions_count,(SELECT COUNT(*) FROM tests WHERE project_id=p.id)::int tests_count,(SELECT COALESCE(SUM(pp.total_cost),0) FROM project_parts pp WHERE pp.project_id=p.id) parts_cost FROM projects p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC`))}catch(e){next(e)}});
router.post('/projects',adminOnly,async(req,res,next)=>{try{const b=req.body;if(!b.name)return res.status(400).json({error:'Nome obrigatório'});const r=await dbGet('INSERT INTO projects(name,description,type,responsible,customer_id,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[b.name,b.description||null,b.type||'COMERCIAL',b.responsible||null,b.customer_id||null,b.notes||null]);res.json({id:Number(r.id)})}catch(e){next(e)}});
router.put('/projects/:id',adminOnly,async(req,res,next)=>{try{const b=req.body;await dbRun('UPDATE projects SET name=$1,description=$2,type=$3,status=$4,responsible=$5,customer_id=$6,notes=$7 WHERE id=$8',[b.name,b.description||null,b.type,b.status||'EM_DESENVOLVIMENTO',b.responsible||null,b.customer_id||null,b.notes||null,req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.delete('/projects/:id',adminOnly,async(req,res,next)=>{try{await dbRun('UPDATE projects SET deleted_at=NOW() WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.get('/projects/:id/versions',async(req,res,next)=>{try{res.json(await dbAll('SELECT * FROM project_versions WHERE project_id=$1 ORDER BY created_at DESC',[req.params.id]))}catch(e){next(e)}});
router.post('/projects/:id/versions',adminOnly,async(req,res,next)=>{try{const b=req.body;const r=await dbGet('INSERT INTO project_versions(project_id,version,filename,changes,reason,result,author) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[req.params.id,b.version,b.filename||null,b.changes||null,b.reason||null,b.result||null,b.author||null]);res.json({id:Number(r.id)})}catch(e){next(e)}});
router.get('/projects/:id/parts',async(req,res,next)=>{try{res.json(await dbAll(`SELECT pp.*,sp.name,sp.type,sp.size,sp.material,sp.current_qty FROM project_parts pp JOIN small_parts sp ON sp.id=pp.part_id WHERE pp.project_id=$1 AND pp.deleted_at IS NULL ORDER BY pp.created_at DESC`,[req.params.id]))}catch(e){next(e)}});
router.post('/projects/:id/parts',async(req,res,next)=>{try{const b=req.body,q=n(b.quantity);if(!b.part_id||q<=0)return res.status(400).json({error:'Peça e quantidade são obrigatórias'});const result=await withTransaction(async tx=>{const part=await tx.get('SELECT * FROM small_parts WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[b.part_id]);if(!part)return Object.assign(new Error('Peça não encontrada'),{status:404});if(n(part.current_qty)<q)throw Object.assign(new Error('Estoque insuficiente'),{status:400});const total=n(part.unit_cost)*q;await tx.run('UPDATE small_parts SET current_qty=current_qty-$1 WHERE id=$2',[q,b.part_id]);const pp=await tx.get('INSERT INTO project_parts(project_id,part_id,quantity,unit_cost,total_cost) VALUES($1,$2,$3,$4,$5) RETURNING id',[req.params.id,b.part_id,q,n(part.unit_cost),total]);await tx.run(`INSERT INTO part_movements(part_id,type,quantity,reason,reference_id,reference_type,created_by) VALUES($1,'CONSUMO',$2,'PROJETO',$3,'project',$4)`,[b.part_id,q,pp.id,req.user.id]);await refreshProjectProductCosts(tx,req.params.id);return pp});res.json({id:Number(result.id)})}catch(e){next(e)}});
router.delete('/projects/:projectId/parts/:id',async(req,res,next)=>{try{await withTransaction(async tx=>{const pp=await tx.get('SELECT * FROM project_parts WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL FOR UPDATE',[req.params.id,req.params.projectId]);if(!pp)throw Object.assign(new Error('Vinculo não encontrado'),{status:404});await tx.run('UPDATE small_parts SET current_qty=current_qty+$1 WHERE id=$2',[n(pp.quantity),pp.part_id]);await tx.run("INSERT INTO part_movements(part_id,type,quantity,reason,reference_id,reference_type,created_by) VALUES($1,'DEVOLUCAO',$2,'REMOCAO_PROJETO',$3,'project',$4)",[pp.part_id,n(pp.quantity),pp.id,req.user.id]);await tx.run('UPDATE project_parts SET deleted_at=NOW() WHERE id=$1',[pp.id]);await refreshProjectProductCosts(tx,req.params.projectId)});res.json({ok:true})}catch(e){next(e)}});

// Tests
router.get('/tests',async(req,res,next)=>{try{res.json(await dbAll(`SELECT t.*,p.name project_name,pr.name printer_name,pv.version FROM tests t JOIN projects p ON p.id=t.project_id LEFT JOIN printers pr ON pr.id=t.printer_id LEFT JOIN project_versions pv ON pv.id=t.version_id ORDER BY t.created_at DESC`))}catch(e){next(e)}});
router.post('/tests',async(req,res,next)=>{try{const b=req.body;if(!b.project_id)return res.status(400).json({error:'Projeto obrigatório'});const result=await withTransaction(async tx=>{const r=await tx.get(`INSERT INTO tests(project_id,version_id,printer_id,roll_id,est_time_min,real_time_min,est_weight_g,real_weight_g,waste_g,temp_nozzle,temp_bed,layer_height,infill,walls,speed,supports,result,failure_type,failure_cause,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,[b.project_id,b.version_id||null,b.printer_id||null,b.roll_id||null,n(b.est_time_min),n(b.real_time_min),n(b.est_weight_g),n(b.real_weight_g),n(b.waste_g),b.temp_nozzle||null,b.temp_bed||null,b.layer_height||null,b.infill||null,b.walls||null,b.speed||null,bool(b.supports),b.result||null,b.failure_type||null,b.failure_cause||null,b.notes||null]);if(b.roll_id&&n(b.real_weight_g)+n(b.waste_g)>0&&b.result!=='CANCELADO'){const roll=await tx.get('SELECT * FROM material_rolls WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[b.roll_id]);const consume=n(b.real_weight_g)+n(b.waste_g);if(!roll)throw Object.assign(new Error('Rolo não encontrado'),{status:404});if(n(roll.current_weight_g)<consume)throw Object.assign(new Error('Estoque de filamento insuficiente'),{status:400});const nw=n(roll.current_weight_g)-consume;await tx.run('UPDATE material_rolls SET current_weight_g=$1,status=$2 WHERE id=$3',[nw,nw<=0?'ESGOTADO':nw<=n(roll.min_stock_g)?'EM_USO':'DISPONIVEL',b.roll_id]);await tx.run(`INSERT INTO stock_movements(roll_id,type,reason,quantity_g,reference_id,reference_type,created_by) VALUES($1,'CONSUMO','TESTE',$2,$3,'test',$4)`,[b.roll_id,consume,r.id,req.user.id])}return r});res.json({id:Number(result.id)})}catch(e){next(e)}});
router.put('/tests/:id', async (req, res, next) => {
  try {
    const b = req.body;
    const result = await withTransaction(async tx => {
      const old = await tx.get('SELECT * FROM tests WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!old) throw Object.assign(new Error('Teste não encontrado'), { status: 404 });
      const oldMoves = await tx.all("SELECT * FROM stock_movements WHERE reference_type='test' AND reference_id=$1 AND type='CONSUMO' ORDER BY id DESC", [req.params.id]);
      for (const mv of oldMoves) {
        await tx.run("UPDATE material_rolls SET current_weight_g=current_weight_g+$1,status=CASE WHEN current_weight_g+$1<=0 THEN 'ESGOTADO' WHEN current_weight_g+$1<=min_stock_g THEN 'EM_USO' ELSE 'DISPONIVEL' END WHERE id=$2", [n(mv.quantity_g), mv.roll_id]);
        await tx.run("INSERT INTO stock_movements(roll_id,type,reason,quantity_g,reference_id,reference_type,created_by) VALUES($1,'DEVOLUCAO','CORRECAO_TESTE',$2,$3,'test',$4)", [mv.roll_id, n(mv.quantity_g), req.params.id, req.user.id]);
      }
      await tx.run(`UPDATE tests SET project_id=$1,version_id=$2,printer_id=$3,roll_id=$4,est_time_min=$5,real_time_min=$6,est_weight_g=$7,real_weight_g=$8,waste_g=$9,temp_nozzle=$10,temp_bed=$11,layer_height=$12,infill=$13,walls=$14,speed=$15,supports=$16,result=$17,failure_type=$18,failure_cause=$19,notes=$20 WHERE id=$21`, [
        b.project_id, b.version_id || null, b.printer_id || null, b.roll_id || null,
        n(b.est_time_min), n(b.real_time_min), n(b.est_weight_g), n(b.real_weight_g), n(b.waste_g),
        b.temp_nozzle ?? null, b.temp_bed ?? null, b.layer_height ?? null, b.infill ?? null, b.walls ?? null,
        b.speed ?? null, bool(b.supports), b.result || null, b.failure_type || null, b.failure_cause || null,
        b.notes || null, req.params.id
      ]);
      const consume = Math.max(0, n(b.real_weight_g) + n(b.waste_g));
      if (b.roll_id && consume > 0 && b.result !== 'CANCELADO') {
        const roll = await tx.get('SELECT * FROM material_rolls WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [b.roll_id]);
        if (!roll) throw Object.assign(new Error('Rolo não encontrado'), { status: 404 });
        if (n(roll.current_weight_g) < consume) throw Object.assign(new Error('Estoque de filamento insuficiente'), { status: 400 });
        const nw = n(roll.current_weight_g) - consume;
        await tx.run('UPDATE material_rolls SET current_weight_g=$1,status=$2 WHERE id=$3', [nw, nw <= 0 ? 'ESGOTADO' : nw <= n(roll.min_stock_g) ? 'EM_USO' : 'DISPONIVEL', b.roll_id]);
        await tx.run("INSERT INTO stock_movements(roll_id,type,reason,quantity_g,reference_id,reference_type,created_by) VALUES($1,'CONSUMO','TESTE',$2,$3,'test',$4)", [b.roll_id, consume, req.params.id, req.user.id]);
      }
      return true;
    });
    res.json({ ok: result });
  } catch (e) { next(e); }
});

// Quotes

router.get('/quotes',async(req,res,next)=>{try{res.json(await dbAll(`SELECT q.*,c.name customer_name,pj.name project_name,p.name product_name,pr.name printer_name,r.code roll_code,m.type material_type,m.color material_color FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id LEFT JOIN projects pj ON pj.id=q.project_id LEFT JOIN products p ON p.id=q.product_id LEFT JOIN printers pr ON pr.id=q.printer_id LEFT JOIN material_rolls r ON r.id=q.roll_id LEFT JOIN materials m ON m.id=r.material_id WHERE q.deleted_at IS NULL ORDER BY q.created_at DESC`))}catch(e){next(e)}});
router.get('/quotes/:id',async(req,res,next)=>{try{const q=await dbGet(`SELECT q.*,c.name customer_name,pj.name project_name,p.name product_name,pr.name printer_name,r.code roll_code,m.type material_type,m.color material_color FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id LEFT JOIN projects pj ON pj.id=q.project_id LEFT JOIN products p ON p.id=q.product_id LEFT JOIN printers pr ON pr.id=q.printer_id LEFT JOIN material_rolls r ON r.id=q.roll_id LEFT JOIN materials m ON m.id=r.material_id WHERE q.id=$1 AND q.deleted_at IS NULL`,[req.params.id]);if(!q)return res.status(404).json({error:'Orçamento não encontrado'});res.json(q)}catch(e){next(e)}});
router.post('/quotes',adminOnly,async(req,res,next)=>{try{const b=req.body;const qty=Math.max(1,parseInt(b.quantity)||1),weight=Math.max(0,n(b.weight_g)),time=Math.max(0,n(b.print_time_min)),projectTime=Math.max(0,n(b.project_time_min)),other=Math.max(0,n(b.other_costs)),extraLabor=Math.max(0,n(b.labor_cost));if(b.project_id){const pj=await dbGet('SELECT id FROM projects WHERE id=$1 AND deleted_at IS NULL',[b.project_id]);if(!pj)return res.status(404).json({error:'Projeto não encontrado'})}if(b.customer_id){const c=await dbGet('SELECT id FROM customers WHERE id=$1 AND deleted_at IS NULL',[b.customer_id]);if(!c)return res.status(404).json({error:'Cliente não encontrado'})}if(b.product_id){const p=await dbGet('SELECT id FROM products WHERE id=$1 AND deleted_at IS NULL',[b.product_id]);if(!p)return res.status(404).json({error:'Produto não encontrado'})}if(b.printer_id){const pr=await dbGet('SELECT id FROM printers WHERE id=$1 AND deleted_at IS NULL',[b.printer_id]);if(!pr)return res.status(404).json({error:'Impressora não encontrada'})}let material=0;if(b.roll_id){const roll=await dbGet('SELECT cost_per_gram FROM material_rolls WHERE id=$1 AND deleted_at IS NULL',[b.roll_id]);if(!roll)return res.status(404).json({error:'Rolo não encontrado'});material=weight*qty*n(roll.cost_per_gram)}const printer=b.printer_id?await dbGet('SELECT power_watts FROM printers WHERE id=$1 AND deleted_at IS NULL',[b.printer_id]):null;const hours=time*qty/60;const settings={};for(const x of await dbAll('SELECT key,value FROM settings'))settings[x.key]=x.value;const energyTariff=n(settings.energy_cost_kwh),machineRate=n(settings.machine_cost_hour),maintenanceRate=n(settings.maintenance_cost_hour),laborRate=n(settings.labor_cost_hour);const energy=n(printer?.power_watts)>0?n(printer.power_watts)/1000*hours*energyTariff:0,machine=hours*machineRate,maintenance=hours*maintenanceRate,labor=extraLabor+(projectTime/60)*laborRate,total=material+energy+machine+maintenance+labor+other,markup=Math.max(0,n(b.markup_percent));let price=Math.max(0,n(b.price_total));if(b.price_mode!=='direct')price=total*(1+markup/100);const profit=price-total,realMargin=price>0?profit/price*100:0;const r=await dbGet(`INSERT INTO quotes(customer_id,project_id,product_id,printer_id,roll_id,product_description,quantity,project_time_min,weight_g,print_time_min,labor_cost,other_costs,cost_material,cost_energy,cost_machine,cost_maintenance,cost_total,markup_percent,profit,price_total,real_margin_percent,status,notes,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW()) RETURNING id`,[b.customer_id||null,b.project_id||null,b.product_id||null,b.printer_id||null,b.roll_id||null,(b.product_description||'Orçamento personalizado').trim(),qty,projectTime,weight,time,labor,other,material,energy,machine,maintenance,total,markup,profit,price,realMargin,b.status||'ORCAMENTO',b.notes||null]);res.json({id:Number(r.id)})}catch(e){next(e)}});
router.put('/quotes/:id',adminOnly,async(req,res,next)=>{try{const b=req.body;const exists=await dbGet('SELECT id FROM quotes WHERE id=$1 AND deleted_at IS NULL',[req.params.id]);if(!exists)return res.status(404).json({error:'Orçamento não encontrado'});const qty=Math.max(1,parseInt(b.quantity)||1),weight=Math.max(0,n(b.weight_g)),time=Math.max(0,n(b.print_time_min)),projectTime=Math.max(0,n(b.project_time_min)),labor=Math.max(0,n(b.labor_cost)),other=Math.max(0,n(b.other_costs));if(b.project_id){const pj=await dbGet('SELECT id FROM projects WHERE id=$1 AND deleted_at IS NULL',[b.project_id]);if(!pj)return res.status(404).json({error:'Projeto não encontrado'})}const desc=(b.product_description||'Orçamento personalizado').trim();await dbRun(`UPDATE quotes SET customer_id=$1,project_id=$2,product_id=$3,printer_id=$4,roll_id=$5,product_description=$6,quantity=$7,project_time_min=$8,weight_g=$9,print_time_min=$10,labor_cost=$11,other_costs=$12,cost_material=$13,cost_energy=$14,cost_machine=$15,cost_maintenance=$16,cost_total=$17,markup_percent=$18,profit=$19,price_total=$20,real_margin_percent=$21,status=$22,notes=$23,updated_at=NOW() WHERE id=$24`,[b.customer_id||null,b.project_id||null,b.product_id||null,b.printer_id||null,b.roll_id||null,desc,qty,projectTime,weight,time,labor,other,Math.max(0,n(b.cost_material)),Math.max(0,n(b.cost_energy)),Math.max(0,n(b.cost_machine)),Math.max(0,n(b.cost_maintenance)),Math.max(0,n(b.cost_total)),Math.max(0,n(b.markup_percent)),n(b.profit),Math.max(0,n(b.price_total)),Math.max(0,n(b.real_margin_percent)),b.status||'ORCAMENTO',b.notes||null,req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.delete('/quotes/:id',adminOnly,async(req,res,next)=>{try{await dbRun('UPDATE quotes SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});

// Products/orders/production
async function productTotal(projectId,baseCosts){const x=await dbGet('SELECT COALESCE(SUM(total_cost),0) total FROM project_parts WHERE project_id=$1 AND deleted_at IS NULL',[projectId]);return n(baseCosts)+n(x?.total)}
router.get('/products',async(req,res,next)=>{try{res.json(await dbAll(`SELECT pr.*,p.name project_name,COALESCE((SELECT SUM(total_cost) FROM project_parts pp WHERE pp.project_id=pr.project_id AND pp.deleted_at IS NULL),0) project_parts_cost FROM products pr LEFT JOIN projects p ON p.id=pr.project_id WHERE pr.deleted_at IS NULL ORDER BY pr.name`))}catch(e){next(e)}});
router.post('/products',adminOnly,async(req,res,next)=>{try{const b=req.body;if(!b.name)return res.status(400).json({error:'Nome obrigatório'});const base=[b.cost_material,b.cost_energy,b.cost_machine,b.cost_labor,b.cost_packaging,b.cost_finishing].reduce((a,v)=>a+n(v),0);const total=await productTotal(b.project_id,base),price=n(b.price),margin=price>0?(price-total)/price*100:0,markup=total>0?(price-total)/total*100:0;const r=await dbGet('INSERT INTO products(code,name,project_id,version_id,material_type,weight_g,print_time_min,cost_material,cost_energy,cost_machine,cost_labor,cost_packaging,cost_finishing,cost_parts,cost_total,price,markup,margin,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id',[b.code||null,b.name,b.project_id||null,b.version_id||null,b.material_type||null,n(b.weight_g),n(b.print_time_min),n(b.cost_material),n(b.cost_energy),n(b.cost_machine),n(b.cost_labor),n(b.cost_packaging),n(b.cost_finishing),total-base,total,price,markup,margin,b.notes||null]);res.json({id:Number(r.id)})}catch(e){next(e)}});
router.put('/products/:id',adminOnly,async(req,res,next)=>{try{const b=req.body;const base=[b.cost_material,b.cost_energy,b.cost_machine,b.cost_labor,b.cost_packaging,b.cost_finishing].reduce((a,v)=>a+n(v),0);const total=await productTotal(b.project_id,base),price=n(b.price),margin=price>0?(price-total)/price*100:0,markup=total>0?(price-total)/total*100:0;await dbRun('UPDATE products SET code=$1,name=$2,project_id=$3,version_id=$4,material_type=$5,weight_g=$6,print_time_min=$7,cost_material=$8,cost_energy=$9,cost_machine=$10,cost_labor=$11,cost_packaging=$12,cost_finishing=$13,cost_parts=$14,cost_total=$15,price=$16,markup=$17,margin=$18,notes=$19,active=$20 WHERE id=$21',[b.code||null,b.name,b.project_id||null,b.version_id||null,b.material_type||null,n(b.weight_g),n(b.print_time_min),n(b.cost_material),n(b.cost_energy),n(b.cost_machine),n(b.cost_labor),n(b.cost_packaging),n(b.cost_finishing),total-base,total,price,markup,margin,b.notes||null,b.active!==false,req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.delete('/products/:id',adminOnly,async(req,res,next)=>{try{await dbRun('UPDATE products SET deleted_at=NOW() WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.get('/orders',async(req,res,next)=>{try{res.json(await dbAll(`SELECT o.*,c.name customer_name,p.name product_name FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN products p ON p.id=o.product_id WHERE o.deleted_at IS NULL ORDER BY o.created_at DESC`))}catch(e){next(e)}});
router.post('/orders',adminOnly,async(req,res,next)=>{try{const b=req.body;if(!b.customer_id||!b.product_id)return res.status(400).json({error:'Cliente e produto obrigatórios'});const qty=parseInt(b.quantity)||1,up=n(b.unit_price),disc=n(b.discount),total=up*qty-disc,r=await dbGet('INSERT INTO orders(customer_id,product_id,quantity,material,unit_price,discount,total,payment_method,due_date,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[b.customer_id,b.product_id,qty,b.material||null,up,disc,total,b.payment_method||null,b.due_date||null,b.notes||null]);res.json({id:Number(r.id)})}catch(e){next(e)}});
router.put('/orders/:id', async (req, res, next) => {
  try {
    const b=req.body;
    const qty=Math.max(1,parseInt(b.quantity)||1);
    const up=Math.max(0,n(b.unit_price));
    const disc=Math.max(0,n(b.discount));
    const total=Math.max(0,up*qty-disc);
    const result=await withTransaction(async tx=>{
      const old=await tx.get('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[req.params.id]);
      if(!old)throw Object.assign(new Error('Pedido não encontrado'),{status:404});
      const nextStatus=b.status||old.status||'ORCAMENTO';
      await tx.run('UPDATE orders SET customer_id=$1,product_id=$2,quantity=$3,material=$4,unit_price=$5,discount=$6,total=$7,payment_method=$8,due_date=$9,notes=$10,status=$11 WHERE id=$12',[b.customer_id,b.product_id,qty,b.material||null,up,disc,total,b.payment_method||null,b.due_date||null,b.notes||null,nextStatus,req.params.id]);
      if(nextStatus==='CONFIRMADO'&&old.status!=='CONFIRMADO'){
        const txExists=await tx.get("SELECT id FROM transactions WHERE reference_type='order' AND reference_id=$1 AND type='RECEITA' AND deleted_at IS NULL LIMIT 1",[req.params.id]);
        if(!txExists)await tx.run(`INSERT INTO transactions(type,category,description,amount,date,reference_id,reference_type,paid) VALUES('RECEITA','Venda',$1,$2,$3,$4,'order',false)`,[`Pedido #${req.params.id}`,total,today(),req.params.id]);
        const prodExists=await tx.get("SELECT id FROM production_jobs WHERE order_id=$1 AND status<>'CANCELADO' LIMIT 1",[req.params.id]);
        if(!prodExists){
          const prod=await tx.get('SELECT * FROM products WHERE id=$1 AND deleted_at IS NULL',[b.product_id]);
          if(!prod)throw Object.assign(new Error('Produto não encontrado'),{status:404});
          await tx.run('INSERT INTO production_jobs(order_id,project_id,version_id,product_id,status,est_weight_g,est_time_min) VALUES($1,$2,$3,$4,$5,$6,$7)',[req.params.id,prod.project_id||null,prod.version_id||null,b.product_id,'AGUARDANDO',n(prod.weight_g)*qty,n(prod.print_time_min)*qty]);
        }
      }
      return true;
    });
    res.json({ok:result});
  }catch(e){next(e);}
});
router.delete('/orders/:id',adminOnly,async(req,res,next)=>{try{await dbRun("UPDATE orders SET deleted_at=NOW(),status='CANCELADO' WHERE id=$1",[req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.get('/production',async(req,res,next)=>{try{res.json(await dbAll(`SELECT pj.*,o.customer_id,c.name customer_name,pr.name product_name,prn.name printer_name FROM production_jobs pj LEFT JOIN orders o ON o.id=pj.order_id LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN products pr ON pr.id=pj.product_id LEFT JOIN printers prn ON prn.id=pj.printer_id ORDER BY pj.created_at DESC`))}catch(e){next(e)}});
router.put('/production/:id', async (req, res, next) => {
  try {
    const b = req.body;
    const result = await withTransaction(async tx => {
      const old = await tx.get('SELECT * FROM production_jobs WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!old) throw Object.assign(new Error('Produção não encontrada'), { status: 404 });
      const nextPrinter = b.printer_id || null;
      const nextRoll = b.roll_id || null;
      const consume = Math.max(0, n(b.real_weight_g) + n(b.waste_g));
      const isCounted = Boolean(b.result && b.result !== 'CANCELADO');

      const oldMoves = await tx.all("SELECT * FROM stock_movements WHERE reference_type='production' AND reference_id=$1 AND type='CONSUMO' ORDER BY id DESC", [req.params.id]);
      for (const mv of oldMoves) {
        await tx.run("UPDATE material_rolls SET current_weight_g=current_weight_g+$1,status=CASE WHEN current_weight_g+$1<=0 THEN 'ESGOTADO' WHEN current_weight_g+$1<=min_stock_g THEN 'EM_USO' ELSE 'DISPONIVEL' END WHERE id=$2", [n(mv.quantity_g), mv.roll_id]);
        await tx.run("INSERT INTO stock_movements(roll_id,type,reason,quantity_g,reference_id,reference_type,created_by) VALUES($1,'DEVOLUCAO','CORRECAO_PRODUCAO',$2,$3,'production',$4)", [mv.roll_id, n(mv.quantity_g), req.params.id, req.user.id]);
      }

      await tx.run('UPDATE production_jobs SET printer_id=$1,roll_id=$2,est_weight_g=$3,real_weight_g=$4,est_time_min=$5,real_time_min=$6,waste_g=$7,started_at=$8,finished_at=$9,result=$10,failure_type=$11,failure_cause=$12,status=$13,notes=$14 WHERE id=$15', [
        nextPrinter, nextRoll, n(b.est_weight_g), n(b.real_weight_g), n(b.est_time_min), n(b.real_time_min), n(b.waste_g),
        b.started_at || null, b.finished_at || null, b.result || null, b.failure_type || null, b.failure_cause || null,
        b.status || old.status, b.notes || null, req.params.id
      ]);

      if (old.order_id) {
        const os = { AGUARDANDO:'CONFIRMADO', PREPARANDO:'EM_PRODUCAO', IMPRIMINDO:'EM_PRODUCAO', ACABAMENTO:'ACABAMENTO', PRONTO:'PRONTO', ENTREGUE:'ENTREGUE', CANCELADO:'CANCELADO' }[b.status || old.status];
        if (os) await tx.run('UPDATE orders SET status=$1 WHERE id=$2', [os, old.order_id]);
      }

      if (nextRoll && consume > 0 && isCounted) {
        const roll = await tx.get('SELECT * FROM material_rolls WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [nextRoll]);
        if (!roll) throw Object.assign(new Error('Rolo não encontrado'), { status: 404 });
        if (n(roll.current_weight_g) < consume) throw Object.assign(new Error('Estoque de filamento insuficiente'), { status: 400 });
        const nw = n(roll.current_weight_g) - consume;
        await tx.run('UPDATE material_rolls SET current_weight_g=$1,status=$2 WHERE id=$3', [nw, nw <= 0 ? 'ESGOTADO' : nw <= n(roll.min_stock_g) ? 'EM_USO' : 'DISPONIVEL', nextRoll]);
        await tx.run("INSERT INTO stock_movements(roll_id,type,reason,quantity_g,reference_id,reference_type,created_by) VALUES($1,'CONSUMO','PRODUCAO',$2,$3,'production',$4)", [nextRoll, consume, req.params.id, req.user.id]);
      }

      const affected = new Set([old.printer_id, nextPrinter].filter(Boolean).map(Number));
      for (const pid of affected) {
        const agg = await tx.get(`SELECT COALESCE(SUM(CASE WHEN status<>'CANCELADO' THEN COALESCE(real_time_min,0) ELSE 0 END),0)/60 hours,COALESCE(COUNT(*) FILTER (WHERE status<>'CANCELADO'),0)::int prints,COALESCE(COUNT(*) FILTER (WHERE result='FALHA'),0)::int failures,COALESCE(SUM(CASE WHEN status<>'CANCELADO' THEN COALESCE(real_weight_g,0)+COALESCE(waste_g,0) ELSE 0 END),0) filament FROM production_jobs WHERE printer_id=$1`, [pid]);
        await tx.run('UPDATE printers SET total_hours=$1,total_prints=$2,filament_used_g=$3,total_failures=$4 WHERE id=$5', [n(agg.hours), Number(agg.prints), n(agg.filament), Number(agg.failures), pid]);
      }
      return true;
    });
    res.json({ ok: result });
  } catch (e) { next(e); }
});

// Finance/settings

router.get('/finance',async(req,res,next)=>{try{let sql='SELECT * FROM transactions WHERE deleted_at IS NULL',p=[];if(req.query.start){p.push(req.query.start);sql+=` AND date >= $${p.length}`}if(req.query.end){p.push(req.query.end);sql+=` AND date <= $${p.length}`}sql+=' ORDER BY date DESC';res.json(await dbAll(sql,p))}catch(e){next(e)}});
router.post('/finance',adminOnly,async(req,res,next)=>{try{const b=req.body;if(!b.type||!b.description||!n(b.amount))return res.status(400).json({error:'Tipo, descrição e valor obrigatórios'});const r=await dbGet('INSERT INTO transactions(type,category,description,amount,date,notes,due_date) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[b.type,b.category||null,b.description,n(b.amount),b.date||today(),b.notes||null,b.due_date||null]);res.json({id:Number(r.id)})}catch(e){next(e)}});
router.put('/finance/:id',adminOnly,async(req,res,next)=>{try{const b=req.body;await dbRun('UPDATE transactions SET type=$1,category=$2,description=$3,amount=$4,date=$5,notes=$6,due_date=$7,paid=$8,paid_at=$9 WHERE id=$10',[b.type,b.category||null,b.description,n(b.amount),b.date,b.notes||null,b.due_date||null,bool(b.paid),b.paid_at||null,req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.delete('/finance/:id',adminOnly,async(req,res,next)=>{try{await dbRun('UPDATE transactions SET deleted_at=NOW() WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});
router.get('/settings',async(req,res,next)=>{try{const o={};(await dbAll('SELECT * FROM settings')).forEach(r=>o[r.key]=r.value);res.json(o)}catch(e){next(e)}});
router.post('/settings',adminOnly,async(req,res,next)=>{try{for(const[k,v]of Object.entries(req.body))await dbRun('INSERT INTO settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()',[k,String(v)]);res.json({ok:true})}catch(e){next(e)}});

// Image upload
router.post('/uploads/:entity/:id',upload.single('image'),async(req,res,next)=>{try{if(!req.file)return res.status(400).json({error:'Imagem não enviada'});if(!/^image\/(png|jpe?g|webp|gif)$/.test(req.file.mimetype||''))return res.status(400).json({error:'Tipo de imagem não permitido'});if(!cloudReady())return res.status(503).json({error:'Cloudinary não configurado'});const entity=req.params.entity,id=req.params.id,folder=`gestao3d/${entity}`;const r=await uploadBuffer(req.file.buffer,folder);const tables={printers:'printers',parts:'small_parts',consumables:'tool_consumables'};const table=tables[entity];if(!table)return res.status(400).json({error:'Tipo de imagem inválido'});const old=await dbGet(`SELECT cloudinary_public_id FROM ${table} WHERE id=$1`,[id]);await dbRun(`UPDATE ${table} SET photo_url=$1,cloudinary_public_id=$2 WHERE id=$3`,[r.secure_url,r.public_id,id]);if(old?.cloudinary_public_id){try{await cloudinary.uploader.destroy(old.cloudinary_public_id)}catch{}}res.json({url:r.secure_url,public_id:r.public_id})}catch(e){next(e)}});

// Backup administrativo (exportação lógica em JSON e restauração transacional)
const BACKUP_TABLES=['users','settings','customers','printers','maintenance_plans','printer_maintenance','materials','material_rolls','stock_movements','tool_consumables','small_parts','consumable_movements','part_movements','projects','project_versions','project_parts','tests','products','orders','production_jobs','transactions','quotes','audit_logs'];
router.get('/backup/export',adminOnly,async(req,res,next)=>{try{const data={version:2,generated_at:new Date().toISOString(),tables:{}};for(const table of BACKUP_TABLES){data.tables[table]=await dbAll(`SELECT * FROM ${table}`);}delete data.tables.settings?.dummy;const payload=Buffer.from(JSON.stringify(data));res.setHeader('Content-Type','application/json');res.setHeader('Content-Disposition',`attachment; filename=gestao3d-backup-${today()}.json`);res.send(payload)}catch(e){next(e)}});
router.post('/backup/restore',adminOnly,backupUpload.single('backup'),async(req,res,next)=>{try{if(!req.file)return res.status(400).json({error:'Arquivo de backup não enviado'});const data=JSON.parse(req.file.buffer.toString('utf8'));if(!data?.tables||typeof data.tables!=='object')return res.status(400).json({error:'Backup inválido'});const required=BACKUP_TABLES.filter(t=>t!=='audit_logs');const missing=required.filter(t=>!Array.isArray(data.tables[t]));if(missing.length)return res.status(400).json({error:`Backup incompleto: ${missing.join(', ')}`});const client=await getPool().connect();try{await client.query('BEGIN');for(const table of [...BACKUP_TABLES,'sessions'].reverse())await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);for(const table of BACKUP_TABLES){const rows=Array.isArray(data.tables[table])?data.tables[table]:[];for(const row of rows){if(!row||typeof row!=='object')continue;const keys=Object.keys(row);if(!keys.length)continue;const cols=keys.map(k=>`"${k.replaceAll('"','""')}"`).join(',');const vals=keys.map((_,i)=>`$${i+1}`).join(',');await client.query(`INSERT INTO "${table}" (${cols}) VALUES (${vals})`,keys.map(k=>row[k]));}}for(const table of BACKUP_TABLES){const hasId=await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='id' LIMIT 1",[table]);if(hasId.rowCount){await client.query(`SELECT setval(pg_get_serial_sequence('public.${table}','id'),COALESCE(MAX(id),0)+1,false) FROM "${table}"`);}}await client.query('COMMIT');res.json({ok:true,message:'Backup restaurado com sucesso. Sessões foram encerradas.'})}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}catch(e){next(e)}});

// Dashboard/reports
router.get('/dashboard',async(req,res,next)=>{try{
 const from=req.query.start||new Date(Date.now()-30*864e5).toISOString().slice(0,10),to=req.query.end||today();
 const revenue=await dbGet(`SELECT COALESCE(SUM(amount),0) total FROM transactions WHERE type='RECEITA' AND date BETWEEN $1 AND $2 AND deleted_at IS NULL`,[from,to]);
 const expenses=await dbGet(`SELECT COALESCE(SUM(amount),0) total FROM transactions WHERE type='DESPESA' AND date BETWEEN $1 AND $2 AND deleted_at IS NULL`,[from,to]);
 const ao=await dbGet("SELECT COUNT(*) c FROM orders WHERE status NOT IN ('ENTREGUE','CANCELADO') AND deleted_at IS NULL");
 const lo=await dbGet("SELECT COUNT(*) c FROM orders WHERE status NOT IN ('ENTREGUE','CANCELADO') AND due_date < $1 AND deleted_at IS NULL",[today()]);
 const ip=await dbGet("SELECT COUNT(*) c FROM production_jobs WHERE status IN ('IMPRIMINDO','PREPARANDO')");
 const ls=await dbGet('SELECT COUNT(*) c FROM material_rolls WHERE current_weight_g<=min_stock_g AND deleted_at IS NULL');
 const ts=await dbGet('SELECT COUNT(*) c FROM tool_consumables WHERE current_qty<=min_qty AND deleted_at IS NULL');
 const ps=await dbGet('SELECT COUNT(*) c FROM small_parts WHERE current_qty<=min_qty AND deleted_at IS NULL');
 const lp=await dbGet('SELECT COUNT(*) c FROM transactions WHERE paid=false AND due_date<$1 AND deleted_at IS NULL',[today()]);
 const printerTotals=await dbGet(`SELECT COALESCE(SUM(p.total_hours+COALESCE(t.test_hours,0)),0) hours,
   COALESCE(SUM(p.filament_used_g+COALESCE(t.test_filament,0)),0) filament
   FROM printers p
   LEFT JOIN (SELECT printer_id,
     COALESCE(SUM(CASE WHEN real_time_min>0 AND result<>'CANCELADO' THEN real_time_min ELSE 0 END),0)/60 test_hours,
     COALESCE(SUM(CASE WHEN real_time_min>0 AND result<>'CANCELADO' THEN COALESCE(real_weight_g,0)+COALESCE(waste_g,0) ELSE 0 END),0) test_filament
     FROM tests GROUP BY printer_id) t ON t.printer_id=p.id
   WHERE p.deleted_at IS NULL`);
 const mn=await dbAll(`SELECT mp.id,mp.task,mp.printer_id,p.name printer_name,
   p.total_hours+COALESCE(t.test_hours,0) current_hours,mp.next_due_hours,mp.next_due_date,
   CASE WHEN mp.next_due_hours IS NOT NULL AND p.total_hours+COALESCE(t.test_hours,0)>=mp.next_due_hours THEN 'ATRASADA'
        WHEN mp.next_due_date IS NOT NULL AND CURRENT_DATE>=mp.next_due_date THEN 'ATRASADA'
        WHEN mp.next_due_hours IS NOT NULL AND mp.next_due_hours-(p.total_hours+COALESCE(t.test_hours,0))<=${MAINT_WARNING_HOURS} THEN 'PROXIMA'
        WHEN mp.next_due_date IS NOT NULL AND mp.next_due_date-CURRENT_DATE<=7 THEN 'PROXIMA'
        ELSE 'EM_DIA' END status,
   CASE WHEN mp.next_due_hours IS NOT NULL THEN GREATEST(mp.next_due_hours-(p.total_hours+COALESCE(t.test_hours,0)),0) END hours_remaining
   FROM maintenance_plans mp JOIN printers p ON p.id=mp.printer_id
   LEFT JOIN (SELECT printer_id,COALESCE(SUM(CASE WHEN real_time_min>0 AND result<>'CANCELADO' THEN real_time_min ELSE 0 END),0)/60 test_hours FROM tests GROUP BY printer_id) t ON t.printer_id=p.id
   WHERE mp.active=true AND p.deleted_at IS NULL
   AND ((mp.next_due_hours IS NOT NULL AND p.total_hours+COALESCE(t.test_hours,0)>=mp.next_due_hours-${MAINT_WARNING_HOURS})
     OR (mp.next_due_date IS NOT NULL AND CURRENT_DATE>=mp.next_due_date-INTERVAL '7 days'))
   ORDER BY CASE WHEN status='ATRASADA' THEN 0 ELSE 1 END,p.name,mp.task`);
 const ti=n((await dbGet("SELECT value FROM settings WHERE key='printer_investment'"))?.value);
 const commercialProfit=await dbGet(`SELECT COALESCE(SUM(o.total-(COALESCE(p.cost_total,0)*o.quantity)),0) total FROM orders o JOIN products p ON p.id=o.product_id WHERE o.status NOT IN ('ORCAMENTO','CANCELADO') AND o.deleted_at IS NULL`);
 const recovered=Math.max(0,n(commercialProfit.total)), roi=ti>0?Math.min(100,recovered/ti*100).toFixed(1):0, investmentRemaining=Math.max(0,ti-recovered);
 const sj=await dbAll('SELECT result,COUNT(*) count,SUM(real_time_min) time_min,SUM(real_weight_g) weight FROM production_jobs GROUP BY result');
 const totalP=sj.reduce((a,b)=>a+n(b.count),0),succ=sj.find(x=>x.result==='SUCESSO');
 res.json({revenue:n(revenue.total),expenses:n(expenses.total),profit:n(revenue.total)-n(expenses.total),commercial_profit:recovered,investment:ti,investment_remaining:investmentRemaining,active_orders:Number(ao.c),late_orders:Number(lo.c),in_production:Number(ip.c),low_stock:Number(ls.c)+Number(ts.c)+Number(ps.c),late_payments:Number(lp.c),maint_needed:mn.length,maintenance:mn,roi,print_hours:n(printerTotals.hours).toFixed(1),filament_used:n(printerTotals.filament).toFixed(0),success_rate:totalP>0?(n(succ?.count)/totalP*100).toFixed(1):0})
 }catch(e){next(e)}});
router.get('/reports/finance',async(req,res,next)=>{try{const from=req.query.start||new Date(Date.now()-30*864e5).toISOString().slice(0,10),to=req.query.end||today();res.json({by_category:await dbAll(`SELECT category,type,SUM(amount) total FROM transactions WHERE date BETWEEN $1 AND $2 AND deleted_at IS NULL GROUP BY category,type ORDER BY total DESC`,[from,to])})}catch(e){next(e)}});
router.get('/reports/production',async(req,res,next)=>{try{res.json({summary:await dbAll('SELECT result,COUNT(*) count,SUM(real_time_min) time_min,SUM(real_weight_g) weight FROM production_jobs GROUP BY result'),by_printer:await dbAll('SELECT prn.name,COUNT(*) jobs,SUM(pj.real_time_min)/60 hours,SUM(pj.real_weight_g) filament FROM production_jobs pj JOIN printers prn ON prn.id=pj.printer_id GROUP BY prn.id,prn.name')})}catch(e){next(e)}});
router.get('/reports/products',async(req,res,next)=>{try{res.json(await dbAll(`SELECT p.name,COUNT(o.id)::int orders,SUM(o.quantity)::int qty,SUM(o.total) revenue,p.cost_total,SUM(o.total-(p.cost_total*o.quantity)) profit FROM orders o JOIN products p ON p.id=o.product_id WHERE o.status NOT IN ('CANCELADO','ORCAMENTO') AND o.deleted_at IS NULL GROUP BY p.id,p.name,p.cost_total ORDER BY revenue DESC`))}catch(e){next(e)}});
module.exports=router;
