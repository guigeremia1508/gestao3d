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
  for (const table of ['users','customers','projects','project_versions','tests','products','orders','production_jobs','transactions','quotes','audit_logs']) {
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
  assert.ok(html.indexOf('/js/app.js?v=3.2.4') < html.indexOf('/js/modules/dashboard.js?v=3.2.4'));
  assert.ok(html.indexOf('/js/auth.js?v=3.2.4') < html.indexOf('/js/bootstrap.js?v=3.2.4'));
  assert.ok(html.includes('/js/bootstrap.js?v=3.2.4'));
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
  assert.match(sw, /gestao3d-v3-2-2-static/);
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
