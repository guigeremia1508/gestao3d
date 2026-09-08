# 🖨️ Gestão 3D 2.0 — Railway + PostgreSQL + Cloudinary

Esta versão troca o SQLite temporário pelo PostgreSQL e adiciona estoque de ferramentas/consumíveis, parafusos/peças, manutenção preventiva e fotos em nuvem.

## 1. Railway — banco PostgreSQL
No projeto do Railway, adicione um serviço PostgreSQL. O Railway deve disponibilizar `DATABASE_URL` para a aplicação; confira em **Variables**.

A aplicação cria as tabelas automaticamente ao iniciar. Não é necessário rodar SQL manualmente para um banco novo.

### Variáveis recomendadas
```env
DATABASE_URL=...        # fornecida pelo PostgreSQL do Railway
JWT_SECRET=uma-chave-grande-e-secreta
INVITE_CODE=seu-codigo
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

As variáveis do Cloudinary são opcionais para o restante do sistema, mas necessárias para enviar fotos.

## 2. Cloudinary
Crie uma conta Cloudinary e informe as três variáveis acima no Railway. As imagens são enviadas para pastas `gestao3d/printers`, `gestao3d/parts` e `gestao3d/consumables`.

## 3. Instalar e iniciar
```bash
npm install
npm start
```

## 4. Login inicial
- E-mail: `admin@gestao3d.com`
- Senha: `admin123`

Troque a senha depois do primeiro acesso.

## 5. O que foi adicionado
- PostgreSQL como banco principal, com criação automática do schema.
- Ferramentas & Consumíveis: quantidade, mínimo, alerta, custo, movimentações e foto.
- Parafusos & Peças: tipo/tamanho/material, estoque, custo, movimentações e foto.
- Projeto → Peças: ao adicionar uma peça, o estoque é baixado imediatamente; ao remover, a peça volta para o estoque.
- Produtos: o custo das peças do projeto entra automaticamente em `cost_parts` e no custo total/margem/markup.
- Manutenção preventiva: planos por horas e/ou dias, próxima revisão, histórico e registro das horas da impressora.
- Manutenção → consumo: pode baixar consumíveis e peças do estoque no mesmo registro da manutenção, usando transação.
- Impressoras: foto hospedada no Cloudinary.
- Dashboard: alerta conjunto para filamentos, consumíveis, peças e manutenções vencidas/próximas.

## 6. Migração do antigo SQLite
O ZIP recebido não contém um arquivo `gestao3d.db`, então não há dados SQLite antigos disponíveis para copiar automaticamente.

Se você tiver uma cópia do antigo banco SQLite, coloque o arquivo como `gestao3d.db` na raiz e rode:
```bash
npm install
npm run import:sqlite -- ./gestao3d.db
```

Para um ambiente Railway que já tenha dados antigos somente no `/tmp` do container anterior, esses dados não podem ser recuperados pelo novo deploy sem uma exportação prévia.

## 7. Railway Deploy
Depois de substituir os arquivos no VS Code:
```bash
git add .
git commit -m "feat: migrar para PostgreSQL e adicionar estoque e manutenção"
git push
```

No Railway, confirme `DATABASE_URL` e as variáveis do Cloudinary. O comando de start é `node server.js` via `npm start`.
