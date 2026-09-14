# Revisão final — Gestão 3D

## Correções desta revisão

- Adicionado pagamento explícito no pedido: `Pago` / `Não pago` e forma de pagamento.
- Ao marcar um pedido como pago, é criada/atualizada uma única `RECEITA` vinculada ao pedido; o dashboard continua usando `transactions` como fonte financeira.
- Ao desmarcar um pagamento já registrado, é criado um `Estorno` negativo, preservando o histórico.
- Alteração do valor de um pedido já pago atualiza a receita vinculada em vez de duplicá-la.
- `ENVIADO` foi adicionado aos status do pedido. Ao selecionar `ENVIADO`, o sistema cria automaticamente um envio na tabela `shipments` sem duplicar envio ativo.
- Status do envio `ENVIADO`/`EM_TRANSITO` atualiza o pedido para `ENVIADO`; `ENTREGUE` atualiza para `ENTREGUE`.
- Pedido `CANCELADO` preserva a receita e gera estorno quando o pagamento estava confirmado.
- Produção é sincronizada para `EM_PRODUCAO`, `ACABAMENTO`, `PRONTO` e `ENTREGUE`.
- A tela de Pedidos ganhou seleção direta de status por pedido.
- Migração de `orders.paid` usa `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, sem recriar/resetar o banco.
- A criação de `shipments` foi reforçada na rotina de inicialização para instalações já existentes.
- Cache-bust atualizado para os módulos de Pedidos e Envios para evitar o navegador/PWA servir a versão antiga.

## Validação

- Sintaxe Node.js dos arquivos alterados: OK.
- `npm test`: 28/28 testes passando.
- `node scripts/self-test.js`: OK.
- `node scripts/predeploy-check.js`: OK.
- ZIP validado com `unzip -t`: OK.

## Observação

Não foi conectado ao PostgreSQL real do Railway nesta sessão e nenhum reset/restore do banco de produção foi executado. A migração é idempotente e preserva os dados existentes.
