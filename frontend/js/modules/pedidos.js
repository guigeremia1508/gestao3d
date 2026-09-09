let _pedidos = [], _clientesPed = [], _produtosPed = [];

pageRenderers.pedidos = async function () {
  [_pedidos, _clientesPed, _produtosPed] = await Promise.all([API.get('/orders'), API.get('/customers'), API.get('/products')]);
  renderPedidos();
};

const orderStatuses = ['ORCAMENTO','AGUARDANDO_PAGAMENTO','CONFIRMADO','EM_PRODUCAO','ACABAMENTO','PRONTO','ENTREGUE','CANCELADO'];

function renderPedidos(filter = '') {
  const list = filter ? _pedidos.filter(p => (p.customer_name||'').toLowerCase().includes(filter) || (p.product_name||'').toLowerCase().includes(filter)) : _pedidos;
  R('content').innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <input class="search-input" placeholder="🔍 Buscar..." oninput="renderPedidos(this.value.toLowerCase())">
        <button class="btn btn-primary" onclick="openPedidoModal()">+ Novo Pedido</button>
      </div>
      <table>
        <thead><tr><th>#</th><th>Cliente</th><th>Produto</th><th>Qtd</th><th>Total</th><th>Pagamento</th><th>Prazo</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${list.length ? list.map(o => `
            <tr>
              <td>#${o.id}</td>
              <td><strong>${o.customer_name || '—'}</strong></td>
              <td>${o.product_name || '—'}</td>
              <td>${o.quantity}</td>
              <td>${money(o.total)}</td>
              <td>${o.payment_method || '—'}</td>
              <td>${dateStr(o.due_date)}</td>
              <td>${badge(o.status)}</td>
              <td><div class="actions">
                <button class="btn btn-secondary btn-sm" onclick="openPedidoModal(${o.id})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deletePedido(${o.id})">🗑️</button>
              </div></td>
            </tr>`).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--text2);padding:2rem">Nenhum pedido cadastrado</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function openPedidoModal(id) {
  const o = id ? _pedidos.find(x => x.id === id) : {};
  openModal(id ? 'Editar Pedido' : 'Novo Pedido', `
    <div class="form-grid">
      <div class="form-group"><label>Cliente *</label>
        <select id="ped-customer_id">
          <option value="">Selecione...</option>
          ${_clientesPed.map(c => `<option value="${c.id}" ${o.customer_id==c.id?'selected':''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Produto *</label>
        <select id="ped-product_id" onchange="autofillPrice()">
          <option value="">Selecione...</option>
          ${_produtosPed.map(p => `<option value="${p.id}" data-price="${p.price}" ${o.product_id==p.id?'selected':''}>${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Quantidade</label><input type="number" id="ped-quantity" value="${o.quantity||1}" min="1" oninput="calcPedidoTotal()"></div>
      <div class="form-group"><label>Material</label><input id="ped-material" value="${o.material||''}"></div>
      <div class="form-group"><label>Preço Unitário (R$)</label><input type="number" id="ped-unit_price" value="${o.unit_price||0}" step="0.01" oninput="calcPedidoTotal()"></div>
      <div class="form-group"><label>Desconto (R$)</label><input type="number" id="ped-discount" value="${o.discount||0}" step="0.01" oninput="calcPedidoTotal()"></div>
      <div class="form-group"><label>Forma de Pagamento</label>
        <select id="ped-payment_method">
          <option value="">—</option>
          <option value="PIX" ${o.payment_method==='PIX'?'selected':''}>PIX</option>
          <option value="DINHEIRO" ${o.payment_method==='DINHEIRO'?'selected':''}>Dinheiro</option>
          <option value="CARTAO" ${o.payment_method==='CARTAO'?'selected':''}>Cartão</option>
          <option value="TRANSFERENCIA" ${o.payment_method==='TRANSFERENCIA'?'selected':''}>Transferência</option>
          <option value="A_PRAZO" ${o.payment_method==='A_PRAZO'?'selected':''}>A Prazo</option>
        </select>
      </div>
      <div class="form-group"><label>Prazo de Entrega</label><input type="date" id="ped-due_date" value="${o.due_date||''}"></div>
      ${id ? `<div class="form-group"><label>Status</label>
        <select id="ped-status">${orderStatuses.map(s => `<option value="${s}" ${o.status===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      </div>` : ''}
      <div class="form-group span2"><label>Observações</label><textarea id="ped-notes">${o.notes||''}</textarea></div>
    </div>
    <div class="calc-box" style="margin-top:.5rem">
      <div class="calc-row total"><span>Total do Pedido</span><strong id="ped-total-display">${money(o.total||0)}</strong></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="savePedido(${id||0})">Salvar</button>`);
}

function autofillPrice() {
  const sel = R('ped-product_id');
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.price) {
    R('ped-unit_price').value = opt.dataset.price;
    calcPedidoTotal();
  }
}

function calcPedidoTotal() {
  const qty = parseFloat(R('ped-quantity')?.value)||1;
  const price = parseFloat(R('ped-unit_price')?.value)||0;
  const disc = parseFloat(R('ped-discount')?.value)||0;
  if (R('ped-total-display')) R('ped-total-display').textContent = money((qty*price)-disc);
}

async function savePedido(id) {
  const body = {
    customer_id: R('ped-customer_id').value, product_id: R('ped-product_id').value,
    quantity: R('ped-quantity').value, material: R('ped-material').value,
    unit_price: R('ped-unit_price').value, discount: R('ped-discount').value,
    payment_method: R('ped-payment_method').value, due_date: R('ped-due_date').value,
    notes: R('ped-notes').value
  };
  if (id) body.status = R('ped-status').value;
  if (!body.customer_id || !body.product_id) return toast('Cliente e produto são obrigatórios', 'err');
  try {
    if (id) await API.put(`/orders/${id}`, body); else await API.post('/orders', body);
    closeModal(); toast('Pedido salvo!'); pageRenderers.pedidos();
  } catch (e) { toast(e.message, 'err'); }
}

async function deletePedido(id) {
  if (!confirmAction('Cancelar este pedido?')) return;
  try { await API.del(`/orders/${id}`); toast('Cancelado!'); pageRenderers.pedidos(); } catch (e) { toast(e.message, 'err'); }
}
