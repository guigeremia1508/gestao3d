let _rolls = [], _materials = [];

pageRenderers.estoque = async function () {
  [_rolls, _materials] = await Promise.all([API.get('/rolls'), API.get('/materials')]);
  renderEstoque();
};

function renderEstoque(filter = '') {
  const list = filter ? _rolls.filter(r => (r.type + r.brand + r.color + (r.code||'')).toLowerCase().includes(filter)) : _rolls;
  const lowStock = _rolls.filter(r => r.current_weight_g <= r.min_stock_g);

  R('content').innerHTML = `
    ${lowStock.length ? `<div class="alerts"><div class="alert warn">⚠️ ${lowStock.length} rolo(s) com estoque abaixo do mínimo: ${lowStock.map(r=>r.code||r.type).join(', ')}</div></div>` : ''}
    <div style="display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap">
      <input class="search-input" placeholder="🔍 Buscar..." oninput="renderEstoque(this.value.toLowerCase())">
      <button class="btn btn-primary" onclick="openRollModal()">+ Novo Rolo</button>
      <button class="btn btn-secondary" onclick="openMaterialModal()">+ Material</button>
      <button class="btn btn-secondary" onclick="openMovModal()">📋 Movimentação Manual</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Código</th><th>Material</th><th>Cor</th><th>Marca</th><th>Estoque Atual</th><th>Mínimo</th><th>Custo/g</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${list.length ? list.map(r => `
            <tr style="${r.current_weight_g <= r.min_stock_g ? 'background:rgba(245,158,11,.07)' : ''}">
              <td>${r.code || '—'}</td>
              <td><strong>${r.type}</strong></td>
              <td>${r.color || '—'}</td>
              <td>${r.brand || '—'}</td>
              <td><strong>${num(r.current_weight_g, 0)}g</strong> / ${num(r.initial_weight_g, 0)}g</td>
              <td>${num(r.min_stock_g, 0)}g</td>
              <td>${money(r.cost_per_gram)}/g</td>
              <td>${badge(r.status)}</td>
              <td><div class="actions">
                <button class="btn btn-secondary btn-sm" onclick="openRollMovModal(${r.id},'${r.code||r.type}')">↕️</button>
              </div></td>
            </tr>`).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--text2);padding:2rem">Nenhum rolo cadastrado</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function openMaterialModal() {
  openModal('Novo Tipo de Material', `
    <div class="form-grid">
      <div class="form-group"><label>Tipo * (PLA, PETG, ABS...)</label><input id="mat-type"></div>
      <div class="form-group"><label>Marca</label><input id="mat-brand"></div>
      <div class="form-group"><label>Cor</label><input id="mat-color"></div>
      <div class="form-group"><label>Diâmetro (mm)</label><input type="number" id="mat-diameter" value="1.75" step="0.01"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveMaterial()">Salvar</button>`);
}
async function saveMaterial() {
  const body = { type: R('mat-type').value, brand: R('mat-brand').value, color: R('mat-color').value, diameter: R('mat-diameter').value };
  if (!body.type) return toast('Tipo é obrigatório', 'err');
  try { await API.post('/materials', body); _materials = await API.get('/materials'); closeModal(); toast('Material criado!'); } catch (e) { toast(e.message, 'err'); }
}

function openRollModal() {
  openModal('Novo Rolo', `
    <div class="form-grid">
      <div class="form-group span2"><label>Material *</label>
        <select id="rf-material_id">
          <option value="">Selecione...</option>
          ${_materials.map(m => `<option value="${m.id}">${m.type} — ${m.brand||'sem marca'} — ${m.color||'sem cor'}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Código / Lote</label><input id="rf-code"></div>
      <div class="form-group"><label>Peso Inicial (g) *</label><input type="number" id="rf-initial_weight_g" value="1000"></div>
      <div class="form-group"><label>Preço de Compra (R$)</label><input type="number" id="rf-purchase_price" value="0" step="0.01"></div>
      <div class="form-group"><label>Fornecedor</label><input id="rf-supplier"></div>
      <div class="form-group"><label>Data de Compra</label><input type="date" id="rf-purchase_date"></div>
      <div class="form-group"><label>Estoque Mínimo (g)</label><input type="number" id="rf-min_stock_g" value="50"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveRoll()">Salvar</button>`);
}
async function saveRoll() {
  const body = { material_id: R('rf-material_id').value, code: R('rf-code').value, initial_weight_g: R('rf-initial_weight_g').value, purchase_price: R('rf-purchase_price').value, supplier: R('rf-supplier').value, purchase_date: R('rf-purchase_date').value, min_stock_g: R('rf-min_stock_g').value };
  if (!body.material_id || !body.initial_weight_g) return toast('Material e peso são obrigatórios', 'err');
  try { await API.post('/rolls', body); closeModal(); toast('Rolo adicionado!'); pageRenderers.estoque(); } catch (e) { toast(e.message, 'err'); }
}

function openRollMovModal(id, name) {
  openModal(`Movimentação — ${name}`, `
    <div class="form-grid">
      <div class="form-group"><label>Tipo *</label>
        <select id="mv-type">
          <option value="SAIDA">Saída</option>
          <option value="ENTRADA">Entrada</option>
          <option value="AJUSTE">Ajuste</option>
          <option value="DEVOLUCAO">Devolução</option>
        </select>
      </div>
      <div class="form-group"><label>Motivo *</label>
        <select id="mv-reason">
          <option value="AJUSTE_MANUAL">Ajuste Manual</option>
          <option value="COMPRA">Compra</option>
          <option value="PERDA">Perda</option>
        </select>
      </div>
      <div class="form-group"><label>Quantidade (g) *</label><input type="number" id="mv-qty" value="0" step="0.1"></div>
      <div class="form-group span2"><label>Observações</label><textarea id="mv-notes"></textarea></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="saveMov(${id})">Registrar</button>`);
}
async function saveMov(id) {
  const body = { type: R('mv-type').value, reason: R('mv-reason').value, quantity_g: R('mv-qty').value, notes: R('mv-notes').value };
  if (!body.quantity_g || body.quantity_g <= 0) return toast('Quantidade inválida', 'err');
  try { await API.post(`/rolls/${id}/movement`, body); closeModal(); toast('Movimentação registrada!'); pageRenderers.estoque(); } catch (e) { toast(e.message, 'err'); }
}

async function openMovModal() {
  const movs = await API.get('/stock/movements');
  openModal('Histórico de Movimentações', `
    <table><thead><tr><th>Data</th><th>Tipo</th><th>Motivo</th><th>Material</th><th>Qtd (g)</th><th>Obs</th></tr></thead>
    <tbody>${movs.slice(0,50).map(m => `<tr><td>${dateStr(m.created_at)}</td><td>${badge(m.type)}</td><td>${m.reason}</td><td>${m.material_type||'—'} ${m.color||''}</td><td>${num(m.quantity_g,1)}</td><td>${m.notes||'—'}</td></tr>`).join('')}</tbody></table>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>`, true);
}

window.openMovModal=openMovModal;window.saveMov=saveMov;
