let _projetos = [], _clientesP = [];

pageRenderers.projetos = async function () {
  [_projetos, _clientesP] = await Promise.all([API.get('/projects'), API.get('/customers')]);
  renderProjetos();
};

function renderProjetos(filter = '') {
  const list = filter ? _projetos.filter(p => p.name.toLowerCase().includes(filter)) : _projetos;
  R('content').innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <input class="search-input" placeholder="🔍 Buscar projeto..." oninput="renderProjetos(this.value.toLowerCase())">
        <button class="btn btn-primary" onclick="openProjetoModal()">+ Novo Projeto</button>
      </div>
      <table>
        <thead><tr><th>Nome</th><th>Tipo</th><th>Status</th><th>Cliente</th><th>Versões</th><th>Testes</th><th>Responsável</th><th></th></tr></thead>
        <tbody>
          ${list.length ? list.map(p => `
            <tr>
              <td><strong>${p.name}</strong>${p.description ? `<br><span style="font-size:.78rem;color:var(--text2)">${p.description.slice(0,60)}</span>` : ''}</td>
              <td>${badge(p.type)}</td>
              <td>${badge(p.status)}</td>
              <td>${p.customer_name || '—'}</td>
              <td>${p.versions_count || 0}</td>
              <td>${p.tests_count || 0}</td>
              <td>${p.responsible || '—'}</td>
              <td><div class="actions">
                <button class="btn btn-secondary btn-sm" onclick="openVersoesModal(${p.id},'${p.name}')">📋 Versões</button>
                <button class="btn btn-secondary btn-sm" onclick="openProjetoModal(${p.id})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteProjeto(${p.id})">🗑️</button>
              </div></td>
            </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text2);padding:2rem">Nenhum projeto cadastrado</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function openProjetoModal(id) {
  const p = id ? _projetos.find(x => x.id === id) : {};
  const tipos = ['COMERCIAL','PESSOAL','PROTOTIPO','ESCOLAR','ROBOTICA','EXPERIMENTAL'];
  const statuses = ['EM_DESENVOLVIMENTO','EM_TESTE','APROVADO','EM_PRODUCAO','ARQUIVADO'];
  openModal(id ? 'Editar Projeto' : 'Novo Projeto', `
    <div class="form-grid">
      <div class="form-group span2"><label>Nome *</label><input id="pj-name" value="${p.name||''}"></div>
      <div class="form-group"><label>Tipo</label>
        <select id="pj-type">${tipos.map(t => `<option value="${t}" ${p.type===t?'selected':''}>${t.replace('_',' ')}</option>`).join('')}</select>
      </div>
      ${id ? `<div class="form-group"><label>Status</label>
        <select id="pj-status">${statuses.map(s => `<option value="${s}" ${p.status===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      </div>` : '<div></div>'}
      <div class="form-group"><label>Responsável</label><input id="pj-responsible" value="${p.responsible||''}"></div>
      <div class="form-group"><label>Cliente</label>
        <select id="pj-customer_id">
          <option value="">Sem cliente</option>
          ${_clientesP.map(c => `<option value="${c.id}" ${p.customer_id==c.id?'selected':''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group span2"><label>Descrição</label><textarea id="pj-description">${p.description||''}</textarea></div>
      <div class="form-group span2"><label>Observações</label><textarea id="pj-notes">${p.notes||''}</textarea></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveProjeto(${id||0})">Salvar</button>`);
}

async function saveProjeto(id) {
  const body = { name: R('pj-name').value, type: R('pj-type').value, responsible: R('pj-responsible').value, customer_id: R('pj-customer_id').value||null, description: R('pj-description').value, notes: R('pj-notes').value };
  if (id) body.status = R('pj-status').value;
  if (!body.name) return toast('Nome é obrigatório', 'err');
  try {
    if (id) await API.put(`/projects/${id}`, body); else await API.post('/projects', body);
    closeModal(); toast('Salvo!'); pageRenderers.projetos();
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteProjeto(id) {
  if (!confirm('Arquivar este projeto?')) return;
  try { await API.del(`/projects/${id}`); toast('Excluído!'); pageRenderers.projetos(); } catch (e) { toast(e.message, 'err'); }
}

async function openVersoesModal(pid, pname) {
  const vers = await API.get(`/projects/${pid}/versions`);
  openModal(`📋 Versões — ${pname}`, `
    <div class="form-grid" style="margin-bottom:1.5rem">
      <div class="form-group"><label>Versão * (ex: V1, V2)</label><input id="vf-version"></div>
      <div class="form-group"><label>Arquivo</label><input id="vf-filename"></div>
      <div class="form-group"><label>Autor</label><input id="vf-author"></div>
      <div class="form-group"><label>Resultado</label>
        <select id="vf-result"><option value="">—</option><option value="APROVADO">Aprovado</option><option value="REPROVADO">Reprovado</option></select>
      </div>
      <div class="form-group span2"><label>O que mudou</label><textarea id="vf-changes"></textarea></div>
      <div class="form-group span2"><label>Por que mudou</label><textarea id="vf-reason"></textarea></div>
    </div>
    <h4 style="margin-bottom:.75rem;font-size:.9rem">Histórico de Versões</h4>
    <table><thead><tr><th>Versão</th><th>Autor</th><th>Data</th><th>Resultado</th><th>O que mudou</th></tr></thead>
    <tbody>${vers.length ? vers.map(v => `<tr><td>${v.version}</td><td>${v.author||'—'}</td><td>${dateStr(v.created_at)}</td><td>${badge(v.result||'—')}</td><td>${v.changes||'—'}</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text2)">Sem versões</td></tr>'}</tbody></table>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
     <button class="btn btn-primary" onclick="saveVersao(${pid})">Adicionar Versão</button>`, true);
}

async function saveVersao(pid) {
  const body = { version: R('vf-version').value, filename: R('vf-filename').value, author: R('vf-author').value, result: R('vf-result').value, changes: R('vf-changes').value, reason: R('vf-reason').value };
  if (!body.version) return toast('Versão é obrigatória', 'err');
  try { await API.post(`/projects/${pid}/versions`, body); toast('Versão adicionada!'); openVersoesModal(pid, ''); } catch (e) { toast(e.message, 'err'); }
}
