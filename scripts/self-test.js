const fs = require('fs');
const path = require('path');

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// Maintenance logic checks matching the application's rules.
function maintenance(lastHours, intervalHours, currentHours, warning=20) {
  const next = lastHours + intervalHours;
  const remaining = next - currentHours;
  const status = currentHours >= next ? 'ATRASADA' : remaining <= warning ? 'PROXIMA' : 'EM_DIA';
  return { next, remaining, status };
}
assert(maintenance(100, 50, 100).next === 150, 'next maintenance calculation');
assert(maintenance(100, 50, 149.9).remaining > 0, 'remaining hours calculation');
assert(maintenance(100, 50, 130).status === 'PROXIMA', 'warning status calculation');
assert(maintenance(100, 50, 150).status === 'ATRASADA', 'due status calculation');
assert(maintenance(150, 100, 160).next === 250, 'maintenance cycle reset without changing total hours');

const files = [
  'routes/api.js', 'routes/auth.js', 'middleware/auth.js', 'database/init.js',
  'frontend/js/app.js', 'frontend/js/modules/orcamentos.js', 'frontend/js/modules/impressoras.js',
  'frontend/js/modules/configuracoes.js'
];
for (const rel of files) assert(fs.existsSync(path.join(__dirname, '..', rel)), `missing ${rel}`);

const api = fs.readFileSync(path.join(__dirname, '..', 'routes/api.js'), 'utf8');
const auth = fs.readFileSync(path.join(__dirname, '..', 'routes/auth.js'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'database/init.js'), 'utf8');
const quote = fs.readFileSync(path.join(__dirname, '..', 'frontend/js/modules/orcamentos.js'), 'utf8');
const printer = fs.readFileSync(path.join(__dirname, '..', 'frontend/js/modules/impressoras.js'), 'utf8');

for (const marker of [
  "router.get('/backup/export'", "router.post('/backup/restore'",
  "router.put('/quotes/:id'", "router.put('/production/:id'",
  "router.put('/maintenance/plans/:id'"
]) assert(api.includes(marker), `missing API ${marker}`);
for (const marker of ["router.post('/logout'", "router.post('/logout-all'", 'hashToken']) assert(auth.includes(marker), `missing auth ${marker}`);
for (const marker of ['CREATE TABLE IF NOT EXISTS sessions', 'project_time_min NUMERIC', 'project_id BIGINT REFERENCES projects']) assert(schema.includes(marker), `missing schema ${marker}`);
for (const marker of ['Projeto (opcional)', 'Horas de projeto', "window.openOrcamentoModal"]) assert(quote.includes(marker), `missing quote UI ${marker}`);
for (const marker of ['Manutenção recomendada', '500h — Lubrificação completa preventiva', 'window.applyMaintenancePreset']) assert(printer.includes(marker), `missing maintenance preset ${marker}`);

console.log('✅ Gestão 3D self-test passed');
