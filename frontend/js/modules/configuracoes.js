pageRenderers.configuracoes = async function () {
  const cfg = await API.get('/settings');
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
    </div>`;
};

async function saveConfigs() {
  const keys = ['company_name','labor_cost_hour','energy_cost_kwh','machine_cost_hour','maintenance_cost_hour','printer_investment','default_min_stock_g'];
  const body = {};
  keys.forEach(k => { const el = R(`cfg-${k}`); if (el) body[k] = el.value; });
  try { await API.post('/settings', body); toast('Configurações salvas!'); } catch (e) { toast(e.message, 'err'); }
}
