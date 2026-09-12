const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { calculateQuoteCosts, calculateOrderTotal } = require('../utils/business');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');


test('autenticação não usa fallback de reload e expõe startApp', () => {
  const auth = read('frontend/js/auth.js');
  const app = read('frontend/js/app.js');
  assert.doesNotMatch(auth, /window\.location\.reload\(\)/);
  assert.match(auth, /credentials:\s*['"]include['"]/);
  assert.match(auth, /\/api\/auth\/me/);
  assert.match(app, /window\.startApp\s*=\s*startApp/);
});

test('calcula orçamento por markup corretamente', () => {
  const r = calculateQuoteCosts({quantity:2,weight_g:50,print_time_min:60,project_time_min:120,labor_extra:5,cost_per_gram:.12,power_watts:200,energy_cost_kwh:.75,machine_cost_hour:2.5,maintenance_cost_hour:.5,labor_cost_hour:15,price_mode:'markup',markup_percent:50});
  assert.equal(r.qty,2);
  assert.ok(r.total > 0);
  assert.ok(Math.abs(r.price - r.total*1.5) < 1e-9);
  assert.ok(Math.abs(r.realMargin - (r.profit/r.price*100)) < 1e-9);
});

test('preço direto não é reprocessado como markup', () => {
  const r = calculateQuoteCosts({quantity:1,weight_g:10,print_time_min:30,cost_per_gram:.1,power_watts:200,energy_cost_kwh:1,machine_cost_hour:1,maintenance_cost_hour:1,labor_cost_hour:10,price_mode:'direct',markup_percent:90,price_total:25});
  assert.equal(r.priceMode, 'direct');
  assert.equal(r.price, 25);
});

test('pedido nunca aceita desconto maior que o bruto', () => {
  assert.throws(() => calculateOrderTotal(2, 10, 21), /Desconto não pode ser maior/);
  assert.equal(calculateOrderTotal(2,10,5),15);
});

test('arquitetura contém módulos essenciais', () => {
  const routes = read('routes/api.js');
  const auth = read('routes/auth.js');
  for (const route of ['/projects', '/tests', '/products', '/orders', '/production', '/printers', '/finance', '/quotes', '/backup/export', '/backup/restore']) {
    assert.match(routes, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.match(auth, /HttpOnly/i);
  assert.match(auth, /argon2/i);
});

test('segurança não inclui credencial padrão de produção', () => {
  const html = read('frontend/index.html');
  assert.equal(html.includes('admin123'), false);
  assert.equal(read('middleware/auth.js').includes("gestao3d_dev_legacy_only"), true);
});

test('backup e schema possuem tabelas críticas', () => {
  const api = read('routes/api.js');
  const schema = read('database/init.js');
  for (const table of ['users','customers','projects','project_versions','tests','products','product_components','orders','production_jobs','production_component_usages','transactions','quotes','audit_logs']) {
    assert.match(api, new RegExp(`'${table}'`));
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test('healthcheck e encerramento limpo existem', () => {
  const server = read('server.js');
  assert.match(server, /app\.get\('\/health'/);
  assert.match(server, /SIGTERM/);
  assert.match(server, /getPool\(\)\.end\(\)/);
});

test('autenticação carrega a aplicação antes dos módulos', () => {
  const html = fs.readFileSync(path.join(ROOT, 'frontend/index.html'), 'utf8');
  assert.ok(html.indexOf('/js/app.js?v=3.3.0') < html.indexOf('/js/modules/dashboard.js?v=3.3.0'));
  assert.ok(html.indexOf('/js/auth.js?v=3.3.0') < html.indexOf('/js/bootstrap.js?v=3.3.0'));
  assert.ok(html.includes('/js/bootstrap.js?v=3.3.0'));
  const app = fs.readFileSync(path.join(ROOT, 'frontend/js/app.js'), 'utf8');
  assert.ok(!app.includes("API.get('/auth/me')"));
  assert.ok(fs.existsSync(path.join(ROOT, 'frontend/js/bootstrap.js')));
});

test('frontend mantém PWA e tratamento responsivo', () => {
  const html = read('frontend/index.html');
  const css = read('frontend/css/style.css');
  const sw = read('frontend/sw.js');
  assert.match(html, /manifest\.webmanifest/);
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(sw, /gestao3d-v3-3-0-static/);
});


test('orcamentos não redeclara o helper global esc', () => {
  const quotes = read('frontend/js/modules/orcamentos.js');
  assert.equal(/function esc\s*\(/.test(quotes), false);
  assert.match(quotes, /g3dEscape\(/);
});

test('notificações usam colunas existentes do estoque', () => {
  const routes = read('routes/api.js');
  assert.match(routes, /JOIN materials m ON m\.id=r\.material_id/);
  assert.match(routes, /m\.type \|\| COALESCE/);
  assert.doesNotMatch(routes, /SELECT 'ESTOQUE' type,name title/);
});

test('dashboard calcula taxa de sucesso com testes e produção no período', () => {
  const routes = read('routes/api.js');
  assert.match(routes, /result IN \('APROVADO','REPROVADO'\).*created_at::date BETWEEN \$1 AND \$2/s);
  assert.match(routes, /result IN \('SUCESSO','FALHA'\).*created_at::date BETWEEN \$1 AND \$2/s);
  assert.match(routes, /successRate=totalP>0/);
});

test('todos os JavaScript da aplicação têm sintaxe válida', () => {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      if (['node_modules','.git'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
    }
  }
  walk(ROOT);
  for (const file of files) {
    const r = spawnSync(process.execPath, ['--check', file], {encoding:'utf8'});
    assert.equal(r.status, 0, `${path.relative(ROOT,file)}: ${r.stderr||r.stdout}`);
  }
});


test('produtos calculam com impressora, rolo, desenvolvimento e componentes', () => {
  const api=read('routes/api.js'), schema=read('database/init.js'), prod=read('frontend/js/modules/produtos.js');
  assert.match(api,/product_components/); assert.match(api,/production_component_usages/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS product_components/); assert.match(schema,/CREATE TABLE IF NOT EXISTS production_component_usages/);
  assert.match(prod,/prod-printer_id/); assert.match(prod,/prod-material_roll_id/); assert.match(prod,/prod-development_time_min/); assert.match(prod,/prod-cost_maintenance/); assert.match(prod,/addProductComponentRow/);
});

test('pedidos selecionam rolo e possuem comprovante térmico copiável',()=>{
  const api=read('routes/api.js'), orders=read('frontend/js/modules/pedidos.js'), schema=read('database/init.js');
  assert.match(api,/roll_id/); assert.match(schema,/ALTER TABLE orders ADD COLUMN IF NOT EXISTS roll_id/); assert.match(orders,/ped-roll_id/); assert.match(orders,/copyOrderReceipt/);
});

test('consumíveis possuem unidades adequadas para sólidos e líquidos',()=>{
  const tools=read('frontend/js/modules/ferramentas.js');
  assert.match(tools,/Mililitro/); assert.match(tools,/Litro/); assert.match(tools,/Quilograma/);
});

test('manutenção é defensiva e aceita manutenção manual sem estoque',()=>{
  const api=read('routes/api.js');
  const printers=read('frontend/js/modules/impressoras.js');
  assert.match(printers,/plan_id/);
  assert.match(api,/if\(q>0\)await consumeItem/);
  assert.match(api,/Data de conclusão inválida/);
});
