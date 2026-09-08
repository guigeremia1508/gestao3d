let _impressoras = [];

pageRenderers.impressoras = async function () {
  _impressoras = await API.get('/printers');
  renderImpressoras();
};

function renderImpressoras() {
  R('content').innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:1rem">
      <button class="btn btn-primary" onclick="openImpressoraModal()">+ Nova Impressora</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem">
      ${_impressoras.length ? _impressoras.map(p => `
        <div class="table-wrap" style="padding:1.25rem">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">
            <div><strong>${p.name}</strong><br><span style="font-size:.8rem;color:var(--text2)">${p.brand||''} ${p.model||''}</span></div>
            ${badge(p.status)}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;font-size:.82rem;color:var(--text2);margin-bottom:1rem">
            <span>🕐 ${num(p.total_hours,1)}h totais</span>
            <span>🖨️ ${p.total_prints} impressões</span>
            <span>❌ ${p.total_failures} falhas</span>
            <span>🔴 ${num(p.filament_used_g,0)}g filamento</span>
          </div>
          <div style="display:flex;gap:.5rem">
            <button class="btn btn-secondary btn-sm" onclick="openImpressoraModal(${p.id})">✏️ Editar</button>
            <button class="btn btn-secondary btn-sm" onclick="openManutencaoModal(${p.id},'${p.name}')">🔧 Manutenção</button>
            <button class="btn btn-danger btn-sm" onclick="deleteImpressora(${p.id})">🗑️</button>
          </div>
        </div>`).join('') : '<p style="color:var(--text2)">Nenhuma impressora cadastrada.</p>'}
    </div>`;
}

function openImpressoraModal(id) {
  const p = id ? _impressoras.find(x => x.id === id) : {};
  openModal(id ? 'Editar Impressora' : 'Nova Impressora', `
    <div class="form-grid">
      <div class="form-group span2"><label>Nome *</label><input id="pf-name" value="${p.name||''}"></div>
      <div class="form-group"><label>Fabricante</label><input id="pf-brand" value="${p.brand||''}"></div>
      <div class="form-group"><label>Modelo</label><input id="pf-model" value="${p.model||''}"></div>
      <div class="form-group"><label>Nº de Série</label><input id="pf-serial" value="${p.serial||''}"></div>
      <div class="form-group"><label>Localização</label><input id="pf-location" value="${p.location||''}"></div>
      <div class="form-group"><label>Data de Compra</label><input type="date" id="pf-purchase_date" value="${p.purchase_date||''}"></div>
      <div class="form-group"><label>Preço de Compra (R$)</label><input type="number" id="pf-purchase_price" value="${p.purchase_price||0}"></div>
      <div class="form-group"><label>Potência (W)</label><input type="number" id="pf-power_watts" value="${p.power_watts||0}"></div>
      ${id ? `<div class="form-group"><label>Status</label><select id="pf-status"><option value="DISPONIVEL" ${p.status==='DISPONIVEL'?'selected':''}>Disponível</option><option value="IMPRIMINDO" ${p.status==='IMPRIMINDO'?'selected':''}>Imprimindo</option><option value="MANUTENCAO" ${p.status==='MANUTENCAO'?'selected':''}>Manutenção</option><option value="OFFLINE" ${p.status==='OFFLINE'?'selected':''}>Offline</option></select></div>` : ''}
      <div class="form-group span2"><label>Observações</label><textarea id="pf-notes">${p.notes||''}</textarea></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveImpressora(${id||0})">Salvar</button>`);
}

async function saveImpressora(id) {
  const body = {
    name: R('pf-name').value, brand: R('pf-brand').value, model: R('pf-model').value,
    serial: R('pf-serial').value, location: R('pf-location').value,
    purchase_date: R('pf-purchase_date').value, purchase_price: R('pf-purchase_price').value,
    power_watts: R('pf-power_watts').value, notes: R('pf-notes').value,
    status: id ? R('pf-status').value : 'DISPONIVEL'
  };
  if (!body.name) return toast('Nome é obrigatório', 'err');
  try {
    if (id) await API.put(`/printers/${id}`, body); else await API.post('/printers', body);
    closeModal(); toast('Salvo!'); pageRenderers.impressoras();
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteImpressora(id) {
  if (!confirm('Excluir esta impressora?')) return;
  try { await API.del(`/printers/${id}`); toast('Excluída!'); pageRenderers.impressoras(); } catch (e) { toast(e.message, 'err'); }
}

async function openManutencaoModal(pid, pname) {
  const list = await API.get(`/printers/${pid}/maintenance`);
  openModal(`🔧 Manutenção — ${pname}`, `
    <div class="form-grid" style="margin-bottom:1.5rem">
      <div class="form-group span2"><label>Tarefa *</label><input id="mf-task"></div>
      <div class="form-group"><label>Agendado para</label><input type="date" id="mf-scheduled_at"></div>
      <div class="form-group"><label>Realizado em</label><input type="date" id="mf-done_at"></div>
      <div class="form-group"><label>Custo (R$)</label><input type="number" id="mf-cost" value="0"></div>
      <div class="form-group"><label>Peças usadas</label><input id="mf-parts_used"></div>
      <div class="form-group span2"><label>Observações</label><textarea id="mf-notes"></textarea></div>
    </div>
    <h4 style="margin-bottom:.75rem;font-size:.9rem">Histórico</h4>
    <table><thead><tr><th>Tarefa</th><th>Agendado</th><th>Realizado</th><th>Custo</th></tr></thead>
    <tbody>${list.length ? list.map(m => `<tr><td>${m.task}</td><td>${dateStr(m.scheduled_at)}</td><td>${dateStr(m.done_at)}</td><td>${money(m.cost)}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text2)">Sem registros</td></tr>'}</tbody></table>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
     <button class="btn btn-primary" onclick="saveManutencao(${pid})">Registrar</button>`, true);
}

async function saveManutencao(pid) {
  const body = { task: R('mf-task').value, scheduled_at: R('mf-scheduled_at').value, done_at: R('mf-done_at').value, cost: R('mf-cost').value, parts_used: R('mf-parts_used').value, notes: R('mf-notes').value };
  if (!body.task) return toast('Tarefa é obrigatória', 'err');
  try { await API.post(`/printers/${pid}/maintenance`, body); toast('Registrado!'); closeModal(); } catch (e) { toast(e.message, 'err'); }
}
