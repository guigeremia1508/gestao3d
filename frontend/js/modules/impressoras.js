let _impressoras = [];

pageRenderers.impressoras = async function () {
  [_impressoras] = await Promise.all([API.get('/printers')]);
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
          ${p.photo_url ? `<img src="${p.photo_url}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;float:right;margin-left:.5rem">` : ''}<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">
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
      <div class="form-group span2"><label>Foto da impressora</label><input type="file" id="pf-photo" accept="image/*"><small style="color:var(--text2)">PNG/JPG/WebP até 8 MB.</small></div><div class="form-group span2"><label>Observações</label><textarea id="pf-notes">${p.notes||''}</textarea></div>${p.photo_url?`<div class="form-group span2"><img src="${p.photo_url}" style="width:100%;max-height:180px;object-fit:contain;border-radius:8px"></div>`:''}
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
    let result; if (id) result = await API.put(`/printers/${id}`, body); else result = await API.post('/printers', body);
    const photo = R('pf-photo')?.files?.[0]; if(photo) await API.upload(`/uploads/printers/${id || result.id}`, photo);
    closeModal(); toast('Salvo!'); pageRenderers.impressoras();
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteImpressora(id) {
  if (!confirm('Excluir esta impressora?')) return;
  try { await API.del(`/printers/${id}`); toast('Excluída!'); pageRenderers.impressoras(); } catch (e) { toast(e.message, 'err'); }
}

async function openManutencaoModal(pid,pname) {
  const [list,tools,parts] = await Promise.all([API.get(`/printers/${pid}/maintenance`),API.get('/consumables'),API.get('/parts')]);
  openModal(`🔧 Manutenção — ${pname}`, `
    <div style="display:flex;justify-content:flex-end;margin-bottom:1rem"><button class="btn btn-secondary btn-sm" onclick="openPlanModal(${pid},'${pname.replaceAll("'","\\'")}')">📅 Plano preventivo</button></div>
    <div class="form-grid">
      <div class="form-group span2"><label>Tarefa *</label><input id="mf-task"></div>
      <div class="form-group"><label>Agendado para</label><input type="date" id="mf-scheduled_at"></div>
      <div class="form-group"><label>Realizado em</label><input type="date" id="mf-done_at"></div>
      <div class="form-group"><label>Horas da impressora</label><input type="number" id="mf-hours_at" step="0.1" placeholder="Ex.: 347"></div>
      <div class="form-group"><label>Custo direto (R$)</label><input type="number" id="mf-cost" value="0" step="0.01"></div>
      <div class="form-group span2"><label>Consumível usado</label><select id="mf-tool"><option value="">Nenhum</option>${tools.map(x=>`<option value="${x.id}">${x.name} — estoque ${num(x.current_qty,2)} ${x.unit}</option>`).join('')}</select></div>
      <div class="form-group"><label>Qtd. consumível</label><input type="number" id="mf-tool-qty" value="1" step="0.01"></div>
      <div class="form-group span2"><label>Peça usada</label><select id="mf-part"><option value="">Nenhuma</option>${parts.map(x=>`<option value="${x.id}">${x.name}${x.type?' — '+x.type:''}${x.size?' — '+x.size:''} — estoque ${num(x.current_qty,2)}</option>`).join('')}</select></div>
      <div class="form-group"><label>Qtd. peça</label><input type="number" id="mf-part-qty" value="1" step="0.01"></div>
      <div class="form-group span2"><label>Texto livre / peças adicionais</label><input id="mf-parts_used" placeholder="Ex.: 2 parafusos M3 que não estão no cadastro"></div>
      <div class="form-group span2"><label>Observações</label><textarea id="mf-notes"></textarea></div>
    </div>
    <div class="alert warn" style="margin-top:1rem">Os itens selecionados acima serão baixados do estoque junto com esta manutenção.</div>
    <h4 style="margin:1.25rem 0 .75rem;font-size:.9rem">Histórico</h4>
    <table><thead><tr><th>Tarefa</th><th>Data</th><th>Horas</th><th>Custo</th></tr></thead>
    <tbody>${list.length ? list.map(m=>`<tr><td>${m.task}</td><td>${dateStr(m.done_at||m.scheduled_at)}</td><td>${m.hours_at!=null?num(m.hours_at,1)+'h':'—'}</td><td>${money(m.cost)}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text2)">Sem registros</td></tr>'}</tbody></table>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Fechar</button><button class="btn btn-primary" onclick="saveManutencao(${pid})">Registrar manutenção</button>`, true);
}
async function saveManutencao(pid){
 const toolId=R('mf-tool').value,partId=R('mf-part').value;
 const body={task:R('mf-task').value,scheduled_at:R('mf-scheduled_at').value,done_at:R('mf-done_at').value,hours_at:R('mf-hours_at').value,cost:R('mf-cost').value,parts_used:R('mf-parts_used').value,notes:R('mf-notes').value,consumables:toolId?[{id:Number(toolId),quantity:Number(R('mf-tool-qty').value||0)}]:[],parts:partId?[{id:Number(partId),quantity:Number(R('mf-part-qty').value||0)}]:[]};
 if(!body.task)return toast('Tarefa é obrigatória','err');
 try{await API.post(`/printers/${pid}/maintenance`,body);closeModal();toast('Manutenção registrada e estoque atualizado!');pageRenderers.impressoras()}catch(e){toast(e.message,'err')}
}
async function openPlanModal(pid,pname){
  const plans=await API.get('/maintenance/plans');
  const mine=plans.filter(p=>Number(p.printer_id)===Number(pid));
  openModal(`📅 Plano Preventivo — ${pname}`,`
    <div class="form-grid" style="margin-bottom:1rem">
      <div class="form-group span2"><label>Tarefa *</label><input id="mp-task" placeholder="Ex.: Lubrificar eixos"></div>
      <div class="form-group"><label>A cada horas</label><input type="number" id="mp-hours" placeholder="200"></div>
      <div class="form-group"><label>A cada dias</label><input type="number" id="mp-days" placeholder=""></div>
      <div class="form-group"><label>Próxima data</label><input type="date" id="mp-nextdate"></div>
      <div class="form-group"><label>Próximas horas</label><input type="number" id="mp-nexthours" placeholder="347"></div>
      <div class="form-group span2"><label>Observações</label><textarea id="mp-notes"></textarea></div>
    </div>
    <h4 style="margin:.5rem 0 .75rem">Planos cadastrados</h4>
    <table><thead><tr><th>Tarefa</th><th>Intervalo</th><th>Próximo</th><th>Status</th></tr></thead><tbody>${mine.length?mine.map(p=>`<tr><td>${p.task}</td><td>${p.interval_hours?num(p.interval_hours,0)+'h':''}${p.interval_hours&&p.interval_days?' / ':''}${p.interval_days?num(p.interval_days,0)+' dias':''}</td><td>${p.next_due_hours?num(p.next_due_hours,0)+'h':''}${p.next_due_hours&&p.next_due_date?' / ':''}${p.next_due_date?dateStr(p.next_due_date):''}</td><td>${p.due?badge('ATRASADO') : badge(p.active?'ATIVO':'INATIVO')}</td></tr>`).join(''):'<tr><td colspan="4" style="color:var(--text2);text-align:center">Nenhum plano.</td></tr>'}</tbody></table>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Fechar</button><button class="btn btn-primary" onclick="savePlan(${pid})">+ Criar plano</button>`,true);
}
async function savePlan(pid){const b={printer_id:pid,task:R('mp-task').value,interval_hours:R('mp-hours').value,interval_days:R('mp-days').value,next_due_date:R('mp-nextdate').value,next_due_hours:R('mp-nexthours').value,notes:R('mp-notes').value};if(!b.task)return toast('Informe a tarefa','err');try{await API.post('/maintenance/plans',b);closeModal();toast('Plano criado!')}catch(e){toast(e.message,'err')}}
