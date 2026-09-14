# Revisão final — pedidos, produção e envios

## Alterações desta revisão
- Corrigido o erro 500 do módulo Envios causado pela ordem das rotas `/shipments/orders-available` e `/shipments/:id`.
- Migração de banco de `shipments` reforçada com `ADD COLUMN IF NOT EXISTS` para bases já existentes.
- Corrigido o endpoint `PUT /production/:id`: havia um parâmetro SQL extra que causava erro ao editar uma ordem de produção.
- Produção: removidos do formulário de edição os campos Peso Estimado e Tempo Estimado; permanecem Peso Real e Tempo Real, além dos controles necessários.
- Pedidos: botão `💳 Marcar pago` / `✅ Pago` ficou fora do lápis.
- Pedidos: botão `🚚 Enviar` ficou fora do lápis e, ao clicar, o pedido passa para `ENVIADO` e o envio é criado automaticamente em Envios.
- Forma de pagamento continua dentro de Editar Pedido.
- Preço unitário ganhou botão `💰 Sugerido`, usando o preço cadastrado/calculado do produto para evitar digitação manual.
- Cache do PWA atualizado para carregar os módulos corrigidos.

## Validação
- `node --test tests/quality.test.js`: 29/29 aprovados.
- `node scripts/self-test.js`: aprovado.
- `node scripts/predeploy-check.js`: aprovado.
- `node scripts/security-smoke.js`: aprovado.
- Sintaxe validada de backend, banco e módulos JavaScript alterados.

## Observação
A versão não foi conectada ao PostgreSQL de produção/Railway durante esta revisão. A migração é idempotente e deve ser executada normalmente na inicialização do servidor.
