# Revisão técnica final - Gestão 3D

## Correções aplicadas
- Corrigido o bug dos botões de editar causado por IDs BIGINT retornados pelo PostgreSQL como string. Os módulos normalizam os IDs antes do `find`.
- Autenticação nova migrada para sessão em cookie HttpOnly/Secure/SameSite + CSRF em memória/cookie separado.
- Senhas novas usam Argon2id; usuários existentes em bcrypt são migrados automaticamente após login válido.
- Removido preenchimento de credenciais padrão do HTML e removido fallback de código de convite hardcoded.
- Adicionado rate limiting global da API e limites específicos para login/cadastro/alteração de senha.
- Adicionados headers de segurança e tratamento de erro sem stack trace em produção.
- Adicionada tabela `audit_logs` e registro de ações de mutação.
- Descontinuado o uso de token de autenticação em `localStorage`.
- Backup lógico passou a usar versão 2 e não inclui a tabela `sessions`; restauração limpa as sessões.
- Movimentações manuais de filamento/peças/consumíveis agora usam transações e lock do item.
- Produção foi tornada transacional, com reversão do consumo anterior para evitar consumo duplicado ao editar.
- Totais das impressoras são recalculados a partir da produção, evitando a contagem dupla de falhas.
- Confirmação de pedido usa transação e evita criar venda/produção duplicadas; também vincula projeto/versão do produto à produção quando existentes.
- Testes ganharam edição e correção transacional do consumo de filamento.
- Peças vinculadas a projeto usam soft delete, preservando histórico.
- ROI do dashboard passou a usar lucro comercial acumulado, sem tratar receita bruta como lucro.
- Upload de imagens aceita somente MIME de imagem permitido e mantém limite de 8 MB.
- Backup/restauração do painel foi ajustado para autenticação por cookie/CSRF.
- `.gitignore`, `.env.example` e README foram atualizados para produção.

## O que continua como evolução futura
A especificação master possui itens que são arquitetura/fase futura, como migração completa para React/TypeScript, Prisma, object storage de arquivos 3D privados, Print Agent local ESC/POS, MFA, paginação server-side avançada e suíte de testes de segurança automatizados completa. Esta revisão prioriza a versão atual funcional sem destruir o sistema existente.

## Banco existente no Railway
O startup executa upgrades compatíveis com banco existente usando `IF NOT EXISTS` e preserva dados. Não é necessário apagar o PostgreSQL para aplicar esta versão.
