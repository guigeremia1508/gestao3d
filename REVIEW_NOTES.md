# Revisão técnica 3.1

## Fechado nesta rodada
- Corrigidos os fluxos de edição baseados em BIGINT do PostgreSQL.
- Sessão segura por cookie HttpOnly/Secure/SameSite + CSRF.
- Argon2id para novas senhas e migração de bcrypt legado.
- Rate limiting, headers, erros sem stack trace e autorização backend.
- Estoque e produção com transactions/locks e reversão de consumo ao editar.
- Backup lógico v2 sem sessões.
- Auditoria persistente e tela administrativa.
- Busca global.
- Notificações derivadas de estoque/pedidos/financeiro/manutenção/falhas.
- Calculadora de custos independente.
- Arquivos 3D por versão com hash, tamanho, MIME, storage key e Cloudinary raw/authenticated.
- PWA shell e service worker.
- Sessões do usuário podem ser consultadas/revogadas.
- CLIENTE pode ser associado a um cliente e recebe apenas seus pedidos/produção.
- Corrigido frontend do perfil CLIENTE para não solicitar `/customers`, `/products`, `/printers` ou `/rolls`.
- Corrigido total de pedidos para nunca ficar negativo.
- Cache PWA versionado e pré-cache dos módulos.
- Adicionada documentação de conformidade com a master.

## Limites restantes
A master pede React + TypeScript + Vite + Prisma como arquitetura futura, Print Agent local ESC/POS, MFA/2FA, recuperação de senha com fluxo de e-mail, paginação server-side completa em todas as telas, suíte automatizada de segurança e observabilidade mais profunda. Esses itens são evoluções estruturais, não pequenos patches.
