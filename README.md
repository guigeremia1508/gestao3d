# Gestão 3D 2.1

Sistema web para gestão de uma pequena operação de impressão 3D, com PostgreSQL, autenticação por sessão, estoque, projetos, testes, produtos, pedidos, produção, financeiro, manutenção, relatórios e backups.

## Rodar localmente
1. Instale Node.js 20+ e PostgreSQL.
2. Copie `.env.example` para `.env` e preencha `DATABASE_URL`.
3. Rode `npm install`.
4. Rode `npm run check`.
5. Rode `npm start`.
6. Abra `http://localhost:3000`.

Em um banco vazio de produção, defina `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` antes do primeiro start. O projeto não cria mais a senha `admin123` automaticamente.

## Deploy Railway
Use **um único serviço público** para a aplicação web. O PostgreSQL continua como serviço de banco. Um serviço/cron privado separado para backup pode continuar existindo, mas não é necessário criar outro site público.

Variáveis principais: `NODE_ENV=production`, `DATABASE_URL` (fornecida pelo serviço PostgreSQL), `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` somente quando ainda não existir ADMIN, `INVITE_CODE`, `CLOUDINARY_*` e um `JWT_SECRET` forte para compatibilidade legada.

## Segurança
A autenticação nova usa cookie `HttpOnly` + `Secure` em produção + `SameSite=Lax`, token CSRF separado e sessões revogáveis no PostgreSQL. Senhas novas são armazenadas com Argon2id; senhas legadas em bcrypt são migradas após login válido.

## Backup
O painel administrativo mantém exportação/restauração lógica em JSON. Sessões nunca entram no backup e são limpas durante uma restauração. O backup automático da hospedagem pode permanecer como camada adicional.

## Testes
`npm run check` executa o self-test estrutural. Em produção, faça também um login real e teste criação/edição de projeto, atualização de produção, movimento de estoque, backup e restauração em uma janela segura.
