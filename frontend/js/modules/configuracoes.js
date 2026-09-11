pageRenderers.configuracoes = async function () {
  const cfg = await API.get('/settings');
  const currentUser=JSON.parse(localStorage.getItem('g3d_user')||'{}');
  const backupBlock=currentUser.role==='ADMIN'?'<div class="table-wrap" style="padding:1.5rem;margin-top:1rem"><h3 style="margin-bottom:.5rem;font-size:.95rem">💾 Backup do sistema</h3><p style="color:var(--text2);font-size:.85rem;margin-bottom:1rem">Baixe uma cópia lógica do banco para guardar seus dados fora do Railway. A restauração substitui os dados atuais e deve ser usada somente com um arquivo confiável.</p><button class="btn btn-secondary" onclick="downloadBackup()">⬇️ Baixar backup</button><label class="btn btn-secondary" style="margin-left:.5rem;cursor:pointer">♻️ Restaurar backup<input id="backup-file" type="file" accept="application/json,.json" style="display:none" onchange="restoreBackup(this.files[0])"></label></div>':'<'+'div></div>';
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
    ${backupBlock}</div>`;
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
      <td><button class="btn btn-secondary btn-sm" onclick="editUser(${u.id})">✏️</button> <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">🗑️</button></td>
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

async function editUser(id){const users=await API.get('/auth/users'),u=users.find(x=>Number(x.id)===Number(id));if(!u)return toast('Usuário não encontrado','err');openModal('✏️ Editar usuário',`<div class="form-grid"><div class="form-group span2"><label>Nome</label><input id="eu-name" value="${u.name||''}"></div><div class="form-group span2"><label>E-mail</label><input id="eu-email" type="email" value="${u.email||''}"></div><div class="form-group"><label>Perfil</label><select id="eu-role"><option value="OPERADOR" ${u.role==='OPERADOR'?'selected':''}>Operador</option><option value="ADMIN" ${u.role==='ADMIN'?'selected':''}>Admin</option><option value="CLIENTE" ${u.role==='CLIENTE'?'selected':''}>Cliente</option></select></div><div class="form-group"><label>Ativo</label><select id="eu-active"><option value="1" ${u.active?'selected':''}>Sim</option><option value="0" ${!u.active?'selected':''}>Não</option></select></div></div>`,`<button class="btn btn-secondary" onclick="openUsuariosModal()">Cancelar</button><button class="btn btn-primary" onclick="updateUser(${id})">Salvar</button>`)}
async function updateUser(id){const body={name:R('eu-name').value,email:R('eu-email').value,role:R('eu-role').value,active:R('eu-active').value==='1'};try{await API.put(`/auth/users/${id}`,body);toast('Usuário atualizado!');openUsuariosModal()}catch(e){toast(e.message,'err')}}
async function downloadBackup(){try{const res=await fetch('/api/backup/export',{credentials:'same-origin'});if(res.status===401){doLogout();return;}if(!res.ok){const j=await res.json().catch(()=>({}));throw new Error(j.error||'Falha ao gerar backup')}const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`gestao3d-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Backup baixado!')}catch(e){toast(e.message,'err')}}
async function restoreBackup(file){if(!file)return;if(!confirmAction('Atenção: restaurar este backup vai substituir os dados atuais. Continuar?')){R('backup-file').value='';return;}try{const fd=new FormData();fd.append('backup',file);const res=await fetch('/api/backup/restore',{method:'POST',headers:{'X-CSRF-Token':await API.ensureCsrf()},credentials:'same-origin',body:fd});if(res.status===401){doLogout();return;}const j=await res.json().catch(()=>({}));if(!res.ok)throw new Error(j.error||'Falha ao restaurar backup');toast('Backup restaurado. A página será recarregada.');setTimeout(()=>location.reload(),700)}catch(e){toast(e.message,'err');R('backup-file').value=''}}
window.downloadBackup=downloadBackup;window.restoreBackup=restoreBackup;window.editUser=editUser;window.updateUser=updateUser;