let _financeiro = [];

pageRenderers.financeiro = async function () {
  _financeiro = await API.get('/finance');
  renderFinanceiro();
};

function renderFinanceiro(filter = '') {
  const list = filter ? _financeiro.filter(t => t.description.toLowerCase().includes(filter) || t.category?.toLowerCase().includes(filter)) : _financeiro;
  const receita = list.filter(t => t.type === 'RECEITA').reduce((a, b) => a + b.amount, 0);
  const despesa = list.filter(t => t.type === 'DESPESA').reduce((a, b) => a + b.amount, 0);
  const invest = list.filter(t => t.type === 'INVESTIMENTO').reduce((a, b) => a + b.amount, 0);

  R('content').innerHTML = `
    <div class="cards-grid" style="margin-bottom:1rem">
      <div class="stat-card green"><div class="label">Receitas</div><div class="value">${money(receita)}</div></div>
      <div class="stat-card red"><div class="label">Despesas</div><div class="value">${money(despesa)}</div></div>
      <div class="stat-card blue"><div class="label">Investimentos</div><div class="value">${money(invest)}</div></div>
      <div class="stat-card ${receita-despesa >= 0 ? 'green' : 'red'}"><div class="label">Lucro Operacional</div><div class="value">${money(receita-despesa)}</div></div>
    </div>
    <div class="table-wrap">
      <div class="table-header">
        <input class="search-input" placeholder="🔍 Buscar..." oninput="renderFinanceiro(this.value.toLowerCase())">
        <button class="btn btn-primary" onclick="openTransacaoModal()">+ Nova Transação</button>
      </div>
      <table>
        <thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Pago</th><th></th></tr></thead>
        <tbody>
          ${list.length ? list.map(t => `
            <tr>
              <td>${dateStr(t.date)}</td>
              <td>${badge(t.type)}</td>
              <td>${t.category || '—'}</td>
              <td>${t.description}</td>
              <td style="color:${t.type==='RECEITA'?'var(--green)':t.type==='DESPESA'?'var(--red)':'var(--blue)'}">${money(t.amount)}</td>
              <td>${dateStr(t.due_date)}</td>
              <td>${t.paid ? '<span class="badge badge-green">Pago</span>' : '<span class="badge badge-yellow">Pendente</span>'}</td>
              <td><div class="actions">
                <button class="btn btn-secondary btn-sm" onclick="openTransacaoModal(${t.id})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteTransacao(${t.id})">🗑️</button>
              </div></td>
            </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text2);padding:2rem">Nenhuma transação</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function openTransacaoModal(id) {
  const t = id ? _financeiro.find(x => Number(x.id) === Number(id)) : {};
  const cats = { RECEITA: ['Venda','Serviço','Outro'], DESPESA: ['Filamento','Energia','Manutenção','Ferramentas','Embalagens','Frete','Outro'], INVESTIMENTO: ['Impressora','Equipamento','Estrutura','Outro'] };
  openModal(id ? 'Editar Transação' : 'Nova Transação', `
    <div class="form-grid">
      <div class="form-group"><label>Tipo *</label>
        <select id="tf2-type" onchange="updateCats()">
          <option value="RECEITA" ${t.type==='RECEITA'?'selected':''}>Receita</option>
          <option value="DESPESA" ${t.type==='DESPESA'?'selected':''}>Despesa</option>
          <option value="INVESTIMENTO" ${t.type==='INVESTIMENTO'?'selected':''}>Investimento</option>
        </select>
      </div>
      <div class="form-group"><label>Categoria</label>
        <select id="tf2-category">
          ${(cats[t.type||'RECEITA']||cats.RECEITA).map(c => `<option value="${c}" ${t.category===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group span2"><label>Descrição *</label><input id="tf2-description" value="${t.description||''}"></div>
      <div class="form-group"><label>Valor (R$) *</label><input type="number" id="tf2-amount" value="${t.amount||0}" step="0.01"></div>
      <div class="form-group"><label>Data *</label><input type="date" id="tf2-date" value="${t.date||new Date().toISOString().split('T')[0]}"></div>
      <div class="form-group"><label>Vencimento</label><input type="date" id="tf2-due_date" value="${t.due_date||''}"></div>
      <div class="form-group"><label>Pago?</label>
        <select id="tf2-paid">
          <option value="0" ${!t.paid?'selected':''}>Pendente</option>
          <option value="1" ${t.paid?'selected':''}>Pago</option>
        </select>
      </div>
      <div class="form-group span2"><label>Observações</label><textarea id="tf2-notes">${t.notes||''}</textarea></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveTransacao(${id||0})">Salvar</button>`);
  window._finCats = { RECEITA: ['Venda','Serviço','Outro'], DESPESA: ['Filamento','Energia','Manutenção','Ferramentas','Embalagens','Frete','Outro'], INVESTIMENTO: ['Impressora','Equipamento','Estrutura','Outro'] };
}

function updateCats() {
  const type = R('tf2-type').value;
  const cats = (window._finCats||{})[type] || ['Outro'];
  R('tf2-category').innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

async function saveTransacao(id) {
  const body = { type: R('tf2-type').value, category: R('tf2-category').value, description: R('tf2-description').value, amount: R('tf2-amount').value, date: R('tf2-date').value, due_date: R('tf2-due_date').value, paid: R('tf2-paid').value, notes: R('tf2-notes').value };
  if (!body.description || !body.amount) return toast('Descrição e valor são obrigatórios', 'err');
  try {
    if (id) await API.put(`/finance/${id}`, body); else await API.post('/finance', body);
    closeModal(); toast('Salvo!'); pageRenderers.financeiro();
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteTransacao(id) {
  if (!confirmAction('Excluir esta transação?')) return;
  try { await API.del(`/finance/${id}`); toast('Excluído!'); pageRenderers.financeiro(); } catch (e) { toast(e.message, 'err'); }
}

window.openTransacaoModal=openTransacaoModal;window.saveTransacao=saveTransacao;window.deleteTransacao=deleteTransacao;window.updateCats=updateCats;
