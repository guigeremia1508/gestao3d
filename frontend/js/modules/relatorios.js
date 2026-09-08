pageRenderers.relatorios = async function () {
  R('content').innerHTML = `
    <div style="display:flex;gap:.75rem;margin-bottom:1.5rem;flex-wrap:wrap;align-items:center">
      <div class="form-group" style="margin:0"><label style="margin-bottom:.2rem;display:block">De</label><input type="date" id="rel-start" value="${new Date(Date.now()-30*864e5).toISOString().split('T')[0]}"></div>
      <div class="form-group" style="margin:0"><label style="margin-bottom:.2rem;display:block">Até</label><input type="date" id="rel-end" value="${new Date().toISOString().split('T')[0]}"></div>
      <button class="btn btn-primary" style="align-self:flex-end" onclick="loadRelatorios()">📊 Gerar</button>
    </div>
    <div id="rel-content"><p style="color:var(--text2)">Clique em "Gerar" para ver os relatórios.</p></div>`;
};

async function loadRelatorios() {
  const start = R('rel-start').value;
  const end = R('rel-end').value;
  const [fin, prod, prods] = await Promise.all([
    API.get(`/reports/finance?start=${start}&end=${end}`),
    API.get(`/reports/production?start=${start}&end=${end}`),
    API.get('/reports/products')
  ]);

  const totalRec = fin.by_category.filter(c=>c.type==='RECEITA').reduce((a,b)=>a+b.total,0);
  const totalDesp = fin.by_category.filter(c=>c.type==='DESPESA').reduce((a,b)=>a+b.total,0);
  const totalProd = prod.summary.reduce((a,b)=>a+b.count,0);
  const succProd = prod.summary.find(s=>s.result==='SUCESSO');
  const failProd = prod.summary.find(s=>s.result==='FALHA');

  R('rel-content').innerHTML = `
    <div class="row">
      <div class="col">
        <div class="table-wrap" style="margin-bottom:1rem">
          <div class="table-header"><strong>💰 Financeiro — por Categoria</strong></div>
          <table>
            <thead><tr><th>Categoria</th><th>Tipo</th><th>Total</th></tr></thead>
            <tbody>
              ${fin.by_category.length ? fin.by_category.map(c => `
                <tr>
                  <td>${c.category||'—'}</td>
                  <td>${badge(c.type)}</td>
                  <td style="color:${c.type==='RECEITA'?'var(--green)':'var(--red)'}">${money(c.total)}</td>
                </tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text2)">Sem dados</td></tr>'}
              <tr style="border-top:2px solid var(--border)">
                <td colspan="2"><strong>Lucro</strong></td>
                <td style="color:${totalRec-totalDesp>=0?'var(--green)':'var(--red)'}"><strong>${money(totalRec-totalDesp)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="col">
        <div class="table-wrap" style="margin-bottom:1rem">
          <div class="table-header"><strong>⚙️ Produção — Resumo</strong></div>
          <table>
            <thead><tr><th>Resultado</th><th>Qtd</th><th>Horas</th><th>Filamento</th></tr></thead>
            <tbody>
              ${prod.summary.length ? prod.summary.map(s => `
                <tr>
                  <td>${badge(s.result||'EM_ANDAMENTO')}</td>
                  <td>${s.count}</td>
                  <td>${((s.time_min||0)/60).toFixed(1)}h</td>
                  <td>${num(s.weight,0)}g</td>
                </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text2)">Sem dados</td></tr>'}
            </tbody>
          </table>
          <div style="padding:.75rem 1rem;font-size:.85rem;color:var(--text2)">
            Total: ${totalProd} impressões | Sucesso: ${succProd?.count||0} | Falha: ${failProd?.count||0} | Taxa: ${totalProd > 0 ? ((succProd?.count||0)/totalProd*100).toFixed(1) : 0}%
          </div>
        </div>
        <div class="table-wrap">
          <div class="table-header"><strong>📦 Produtos Mais Vendidos</strong></div>
          <table>
            <thead><tr><th>Produto</th><th>Qtd</th><th>Receita</th><th>Lucro Est.</th></tr></thead>
            <tbody>
              ${prods.length ? prods.slice(0,10).map(p => `
                <tr>
                  <td>${p.name}</td>
                  <td>${p.qty||0}</td>
                  <td>${money(p.revenue)}</td>
                  <td style="color:var(--green)">${money(p.profit||0)}</td>
                </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text2)">Sem dados</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    ${prod.by_printer.length ? `
    <div class="table-wrap" style="margin-top:1rem">
      <div class="table-header"><strong>🖨️ Produção por Impressora</strong></div>
      <table>
        <thead><tr><th>Impressora</th><th>Trabalhos</th><th>Horas</th><th>Filamento</th></tr></thead>
        <tbody>
          ${prod.by_printer.map(p => `<tr><td>${p.name}</td><td>${p.jobs}</td><td>${num(p.hours,1)}h</td><td>${num(p.filament,0)}g</td></tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}`;
}
