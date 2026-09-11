let _testes = [], _projetosT = [], _impressorasT = [], _rollsT = [];

pageRenderers.testes = async function () {
  [_testes, _projetosT, _impressorasT, _rollsT] = await Promise.all([
    API.get('/tests'), API.get('/projects'), API.get('/printers'), API.get('/rolls')
  ]);
  renderTestes();
};

function renderTestes() {
  R('content').innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <span style="font-size:.85rem;color:var(--text2)">${_testes.length} teste(s)</span>
        <button class="btn btn-primary" onclick="openTesteModal()">+ Novo Teste</button>
      </div>
      <table>
        <thead><tr><th>Projeto</th><th>Versão</th><th>Impressora</th><th>Tempo Est./Real</th><th>Peso Est./Real</th><th>Desperdício</th><th>Resultado</th><th>Data</th><th></th></tr></thead>
        <tbody>
          ${_testes.length ? _testes.map(t => `
            <tr>
              <td><strong>${t.project_name}</strong></td>
              <td>${t.version || '—'}</td>
              <td>${t.printer_name || '—'}</td>
              <td>${num(t.est_time_min,0)}min / ${num(t.real_time_min,0)}min</td>
              <td>${num(t.est_weight_g,1)}g / ${num(t.real_weight_g,1)}g</td>
              <td>${num(t.waste_g,1)}g</td>
              <td>${badge(t.result || 'CANCELADO')}</td>
              <td>${dateStr(t.created_at)}</td>
              <td><button class="btn btn-secondary btn-sm" onclick="openTesteModal(${t.id})">✏️</button></td>
            </tr>`).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--text2);padding:2rem">Nenhum teste registrado</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

async function openTesteModal(id) {
  const existing = id ? _testes.find(x => Number(x.id) === Number(id)) : {};
  const tiposFalha = ['Stringing','Warping','Layer shift','Falha de adesão','Entupimento','Erro de máquina','Falta de filamento','Erro humano','Outro'];
  openModal('Novo Teste de Impressão', `
    <div class="form-grid">
      <div class="form-group span2"><label>Projeto *</label>
        <select id="tf-project_id" onchange="loadVersionsForTest(this.value)">
          <option value="">Selecione...</option>
          ${_projetosT.map(p => `<option value="${p.id}" ${existing.project_id==p.id?'selected':''}>${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Versão</label><select id="tf-version_id"><option value="">—</option></select></div>
      <div class="form-group"><label>Impressora</label>
        <select id="tf-printer_id">
          <option value="">—</option>
          ${_impressorasT.map(p => `<option value="${p.id}" ${existing.printer_id==p.id?'selected':''}>${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group span2"><label>Rolo de Filamento</label>
        <select id="tf-roll_id">
          <option value="">—</option>
          ${_rollsT.map(r => `<option value="${r.id}" ${existing.roll_id==r.id?'selected':''}>${r.type} ${r.color||''} ${r.code||''} — ${num(r.current_weight_g,0)}g</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Tempo Estimado (min)</label><input type="number" id="tf-est_time_min" value="${existing.est_time_min||0}"></div>
      <div class="form-group"><label>Tempo Real (min)</label><input type="number" id="tf-real_time_min" value="${existing.real_time_min||0}"></div>
      <div class="form-group"><label>Peso Estimado (g)</label><input type="number" id="tf-est_weight_g" value="${existing.est_weight_g||0}" step="0.1"></div>
      <div class="form-group"><label>Peso Real (g)</label><input type="number" id="tf-real_weight_g" value="${existing.real_weight_g||0}" step="0.1"></div>
      <div class="form-group"><label>Desperdício (g)</label><input type="number" id="tf-waste_g" value="${existing.waste_g||0}" step="0.1"></div>
      <div class="form-group"><label>Temp. Bico (°C)</label><input type="number" id="tf-temp_nozzle" value="${existing.temp_nozzle||200}"></div>
      <div class="form-group"><label>Temp. Mesa (°C)</label><input type="number" id="tf-temp_bed" value="${existing.temp_bed||60}"></div>
      <div class="form-group"><label>Altura Camada (mm)</label><input type="number" id="tf-layer_height" value="${existing.layer_height||0.2}" step="0.01"></div>
      <div class="form-group"><label>Infill (%)</label><input type="number" id="tf-infill" value="${existing.infill??20}"></div>
      <div class="form-group"><label>Paredes</label><input type="number" id="tf-walls" value="${existing.walls??3}"></div>
      <div class="form-group"><label>Velocidade (mm/s)</label><input type="number" id="tf-speed" value="${existing.speed||60}"></div>
      <div class="form-group"><label>Suportes</label><select id="tf-supports"><option value="0" ${!existing.supports?'selected':''}>Não</option><option value="1" ${existing.supports?'selected':''}>Sim</option></select></div>
      <div class="form-group"><label>Resultado *</label>
        <select id="tf-result" onchange="toggleFailureFields(this.value)">
          <option value="APROVADO" ${existing.result==='APROVADO'?'selected':''}>Aprovado</option>
          <option value="REPROVADO" ${existing.result==='REPROVADO'?'selected':''}>Reprovado</option>
          <option value="CANCELADO" ${existing.result==='CANCELADO'?'selected':''}>Cancelado</option>
        </select>
      </div>
      <div class="form-group" id="ff-type-grp" style="display:none"><label>Tipo de Falha</label>
        <select id="tf-failure_type"><option value="">—</option>${tiposFalha.map(t=>`<option value="${t}">${t}</option>`).join('')}</select>
      </div>
      <div class="form-group span2" id="ff-cause-grp" style="display:none"><label>Causa da Falha</label><textarea id="tf-failure_cause"></textarea></div>
      <div class="form-group span2"><label>Observações</label><textarea id="tf-notes">${existing.notes||''}</textarea></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveTeste(${id||0})">Salvar Teste</button>`, true);
  if(id && existing.project_id){ setTimeout(()=>loadVersionsForTest(existing.project_id,existing.version_id).then(()=>toggleFailureFields(existing.result||'')),0); }
}

function toggleFailureFields(val) {
  const show = val === 'REPROVADO';
  R('ff-type-grp').style.display = show ? '' : 'none';
  R('ff-cause-grp').style.display = show ? '' : 'none';
}

async function loadVersionsForTest(pid,selectedId) {
  if (!pid) return;
  const vers = await API.get(`/projects/${pid}/versions`);
  R('tf-version_id').innerHTML = `<option value="">—</option>` + vers.map(v => `<option value="${v.id}" ${Number(selectedId)===Number(v.id)?'selected':''}>${v.version}</option>`).join('');
}

async function saveTeste(id) {
  const body = {
    project_id: R('tf-project_id').value, version_id: R('tf-version_id').value||null,
    printer_id: R('tf-printer_id').value||null, roll_id: R('tf-roll_id').value||null,
    est_time_min: R('tf-est_time_min').value, real_time_min: R('tf-real_time_min').value,
    est_weight_g: R('tf-est_weight_g').value, real_weight_g: R('tf-real_weight_g').value,
    waste_g: R('tf-waste_g').value, temp_nozzle: R('tf-temp_nozzle').value,
    temp_bed: R('tf-temp_bed').value, layer_height: R('tf-layer_height').value,
    infill: R('tf-infill').value, walls: R('tf-walls').value, speed: R('tf-speed').value, supports: R('tf-supports').value,
    result: R('tf-result').value, failure_type: R('tf-failure_type')?.value,
    failure_cause: R('tf-failure_cause')?.value, notes: R('tf-notes').value
  };
  if (!body.project_id) return toast('Projeto é obrigatório', 'err');
  try {
    if(id) await API.put(`/tests/${id}`,body); else await API.post('/tests', body);
    closeModal(); toast('Teste salvo! Estoque atualizado.'); pageRenderers.testes();
  } catch (e) { toast(e.message, 'err'); }
}

window.openTesteModal=openTesteModal;window.toggleFailureFields=toggleFailureFields;window.loadVersionsForTest=loadVersionsForTest;window.saveTeste=saveTeste;
