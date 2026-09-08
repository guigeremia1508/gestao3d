let _produtos = [], _projetosP = [];

pageRenderers.produtos = async function () {
  [_produtos, _projetosP] = await Promise.all([API.get('/products'), API.get('/projects')]);
  renderProdutos();
};

function renderProdutos(filter = '') {
  const list = filter ? _produtos.filter(p => p.name.toLowerCase().includes(filter)) : _produtos;
  R('content').innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <input class="search-input" placeholder="🔍 Buscar produto..." oninput="renderProdutos(this.value.toLowerCase())">
        <button class="btn btn-primary" onclick="openProdutoModal()">+ Novo Produto</button>
      </div>
      <table>
        <thead><tr><th>Código</th><th>Nome</th><th>Projeto</th><th>Peso</th><th>Tempo</th><th>Peças</th><th>Custo Total</th><th>Preço</th><th>Margem</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${list.length ? list.map(p => `
            <tr>
              <td>${p.code || '—'}</td>
              <td><strong>${p.name}</strong></td>
              <td>${p.project_name || '—'}</td>
              <td>${num(p.weight_g,1)}g</td>
              <td>${num(p.print_time_min,0)}min</td>
              <td>${money(p.cost_parts||0)}</td><td>${money(p.cost_total)}</td>
              <td>${money(p.price)}</td>
              <td>${num(p.margin,1)}%</td>
              <td>${p.active ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>'}</td>
              <td><div class="actions">
                <button class="btn btn-secondary btn-sm" onclick="openProdutoModal(${p.id})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteProduto(${p.id})">🗑️</button>
              </div></td>
            </tr>`).join('') : '<tr><td colspan="11" style="text-align:center;color:var(--text2);padding:2rem">Nenhum produto cadastrado</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function openProdutoModal(id) {
  const p = id ? _produtos.find(x => x.id === id) : {};
  openModal(id ? 'Editar Produto' : 'Novo Produto', `
    <div class="form-grid">
      <div class="form-group"><label>Código</label><input id="prod-code" value="${p.code||''}"></div>
      <div class="form-group"><label>Nome *</label><input id="prod-name" value="${p.name||''}"></div>
      <div class="form-group"><label>Projeto</label>
        <select id="prod-project_id">
          <option value="">—</option>
          ${_projetosP.map(pr => `<option value="${pr.id}" ${p.project_id==pr.id?'selected':''}>${pr.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Material</label><input id="prod-material_type" value="${p.material_type||''}"></div>
      <div class="form-group"><label>Peso (g)</label><input type="number" id="prod-weight_g" value="${p.weight_g||0}" step="0.1" oninput="calcProduto()"></div>
      <div class="form-group"><label>Tempo de Impressão (min)</label><input type="number" id="prod-print_time_min" value="${p.print_time_min||0}" oninput="calcProduto()"></div>
    </div>
    <h4 style="margin:.75rem 0 .5rem;font-size:.9rem">💰 Custos</h4>
    <div class="form-grid cols3">
      <div class="form-group"><label>Material (R$)</label><input type="number" id="prod-cost_material" value="${p.cost_material||0}" step="0.01" oninput="calcProduto()"></div>
      <div class="form-group"><label>Energia (R$)</label><input type="number" id="prod-cost_energy" value="${p.cost_energy||0}" step="0.01" oninput="calcProduto()"></div>
      <div class="form-group"><label>Máquina (R$)</label><input type="number" id="prod-cost_machine" value="${p.cost_machine||0}" step="0.01" oninput="calcProduto()"></div>
      <div class="form-group"><label>Mão de Obra (R$)</label><input type="number" id="prod-cost_labor" value="${p.cost_labor||0}" step="0.01" oninput="calcProduto()"></div>
      <div class="form-group"><label>Embalagem (R$)</label><input type="number" id="prod-cost_packaging" value="${p.cost_packaging||0}" step="0.01" oninput="calcProduto()"></div>
      <div class="form-group"><label>Acabamento (R$)</label><input type="number" id="prod-cost_finishing" value="${p.cost_finishing||0}" step="0.01" oninput="calcProduto()"></div>
    </div>
    <div class="form-grid" style="margin-top:.5rem">
      <div class="form-group"><label>Preço de Venda (R$)</label><input type="number" id="prod-price" value="${p.price||0}" step="0.01" oninput="calcProduto()"></div>
    </div>
    <div class="calc-box" id="calc-result">
      <div class="calc-row"><span>Custo Total</span><span id="cr-custo">R$ 0,00</span></div>
      <div class="calc-row profit"><span>Lucro</span><span id="cr-lucro">R$ 0,00</span></div>
      <div class="calc-row"><span>Margem</span><span id="cr-margem">0%</span></div>
      <div class="calc-row"><span>Markup</span><span id="cr-markup">0%</span></div>
    </div>
    <div class="form-group" style="margin-top:.75rem">
      <label>Observações</label><textarea id="prod-notes">${p.notes||''}</textarea>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveProduto(${id||0})">Salvar</button>`, true);
  calcProduto();
}

function calcProduto() {
  const costs = ['cost_material','cost_energy','cost_machine','cost_labor','cost_packaging','cost_finishing'];
  const total = costs.reduce((a,b) => a + (parseFloat(R(`prod-${b}`)?.value)||0), 0);
  const price = parseFloat(R('prod-price')?.value)||0;
  const lucro = price - total;
  const margem = price > 0 ? (lucro/price*100) : 0;
  const markup = total > 0 ? (lucro/total*100) : 0;
  if (R('cr-custo')) {
    R('cr-custo').textContent = money(total);
    R('cr-lucro').textContent = money(lucro);
    R('cr-lucro').style.color = lucro >= 0 ? 'var(--green)' : 'var(--red)';
    R('cr-margem').textContent = num(margem,1) + '%';
    R('cr-markup').textContent = num(markup,1) + '%';
  }
}

async function saveProduto(id) {
  const body = {
    code: R('prod-code').value, name: R('prod-name').value,
    project_id: R('prod-project_id').value||null, material_type: R('prod-material_type').value,
    weight_g: R('prod-weight_g').value, print_time_min: R('prod-print_time_min').value,
    cost_material: R('prod-cost_material').value, cost_energy: R('prod-cost_energy').value,
    cost_machine: R('prod-cost_machine').value, cost_labor: R('prod-cost_labor').value,
    cost_packaging: R('prod-cost_packaging').value, cost_finishing: R('prod-cost_finishing').value,
    price: R('prod-price').value, notes: R('prod-notes').value, active: 1
  };
  if (!body.name) return toast('Nome é obrigatório', 'err');
  try {
    if (id) await API.put(`/products/${id}`, body); else await API.post('/products', body);
    closeModal(); toast('Salvo!'); pageRenderers.produtos();
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteProduto(id) {
  if (!confirm('Excluir este produto?')) return;
  try { await API.del(`/products/${id}`); toast('Excluído!'); pageRenderers.produtos(); } catch (e) { toast(e.message, 'err'); }
}
