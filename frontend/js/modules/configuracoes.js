pageRenderers.configuracoes = async function () {
  const cfg = await API.get('/settings');
  R('content').innerHTML = `
    <div style="max-width:700px">
      <div class="table-wrap" style="padding:1.5rem;margin-bottom:1rem">
        <h3 style="margin-bottom:1rem;font-size:.95rem">🏢 Empresa</h3>
        <div class="form-grid">
          <div class="form-group span2"><label>Nome da Empresa</label><input id="cfg-company_name" value="${cfg.company_name||''}"></div>
        </div>
      </div>
      <div class="table-wrap" style="padding:1.5rem;margin-bottom:1rem">
        <h3 style="margin-bottom:1rem;font-size:.95rem">💰 Custos Globais</h3>
        <div class="form-grid">
          <div class="form-group"><label>Mão de Obra (R$/h)</label><input type="number" id="cfg-labor_cost_hour" value="${cfg.labor_cost_hour||15}" step="0.01"></div>
          <div class="form-group"><label>Energia Elétrica (R$/kWh)</label><input type="number" id="cfg-energy_cost_kwh" value="${cfg.energy_cost_kwh||0.75}" step="0.01"></div>
          <div class="form-group"><label>Custo da Máquina (R$/h)</label><input type="number" id="cfg-machine_cost_hour" value="${cfg.machine_cost_hour||2.50}" step="0.01"></div>
          <div class="form-group"><label>Manutenção (R$/h)</label><input type="number" id="cfg-maintenance_cost_hour" value="${cfg.maintenance_cost_hour||0.50}" step="0.01"></div>
        </div>
      </div>
      <div class="table-wrap" style="padding:1.5rem;margin-bottom:1rem">
        <h3 style="margin-bottom:1rem;font-size:.95rem">🖨️ Impressora — ROI</h3>
        <div class="form-grid">
          <div class="form-group"><label>Investimento Total na Impressora (R$)</label><input type="number" id="cfg-printer_investment" value="${cfg.printer_investment||0}" step="0.01"></div>
          <div class="form-group"><label>Estoque Mínimo Padrão (g)</label><input type="number" id="cfg-default_min_stock_g" value="${cfg.default_min_stock_g||50}"></div>
        </div>
      </div>
      <button class="btn btn-primary" onclick="saveConfigs()">💾 Salvar Configurações</button>
      <button class="btn btn-secondary" style="margin-left:.5rem" onclick="openUsuariosModal()">👥 Gerenciar Usuários</button>
    </div>`;
};

async function saveConfigs() {
  const keys = ['company_name','labor_cost_hour','energy_cost_kwh','machine_cost_hour','maintenance_cost_hour','printer_investment','default_min_stock_g'];
  const body = {};
  keys.forEach(k => { const el = R(`cfg-${k}`); if (el) body[k] = el.value; });
  try { await API.post('/settings', body); toast('Configurações salvas!'); } catch (e) { toast(e.message, 'err'); }
}

// ─── USUÁRIOS ─────────────────────────────────────────
async function openUsuariosModal() {
  const users = await API.get('/auth/users');
  openModal('👥 Gerenciar Usuários', `
    <div class="form-grid" style="margin-bottom:1.5rem">
      <div class="form-group span2"><label>Nome *</label><input id="uf-name"></div>
      <div class="form-group"><label>E-mail *</label><input id="uf-email" type="email"></div>
      <div class="form-group"><label>Senha *</label><input id="uf-pass" type="password"></div>
      <div class="form-group"><label>Perfil</label>
        <select id="uf-role">
          <option value="OPERADOR">Operador</option>
          <option value="ADMIN">Admin</option>
          <option value="CLIENTE">Cliente</option>
        </select>
      </div>
    </div>
    <table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th></th></tr></thead>
    <tbody>${users.map(u => `<tr>
      <td>${u.name}</td><td>${u.email}</td>
      <td>${badge(u.role)}</td>
      <td>${u.active ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">🗑️</button></td>
    </tr>`).join('')}</tbody></table>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
     <button class="btn btn-primary" onclick="createUser()">+ Criar Usuário</button>`, true);
}

async function createUser() {
  const body = { name: R('uf-name').value, email: R('uf-email').value, password: R('uf-pass').value, role: R('uf-role').value };
  if (!body.name || !body.email || !body.password) return toast('Preencha todos os campos', 'err');
  try { await API.post('/auth/users', body); toast('Usuário criado!'); openUsuariosModal(); } catch(e) { toast(e.message, 'err'); }
}

async function deleteUser(id) {
  if (!confirmAction('Desativar este usuário?')) return;
  try { await API.del(`/auth/users/${id}`); toast('Usuário removido!'); openUsuariosModal(); } catch(e) { toast(e.message, 'err'); }
}
