# 🖨️ Gestão 3D — Sistema de Gestão para Impressão 3D

## Requisitos
- Node.js 18+ (https://nodejs.org)

## Como rodar

### 1. Instalar dependências
```bash
cd backend
npm install
```

### 2. Iniciar o servidor
```bash
node server.js
```

### 3. Acessar no navegador
```
http://localhost:3000
```

## Login inicial
- **E-mail:** admin@gestao3d.com
- **Senha:** admin123

> ⚠️ Troque a senha depois do primeiro acesso em Configurações.

## Estrutura do projeto
```
gestao3d/
├── backend/
│   ├── server.js              ← Servidor Node.js + Express
│   ├── package.json
│   ├── database/
│   │   └── init.js            ← SQLite + todas as tabelas
│   ├── middleware/
│   │   └── auth.js            ← JWT auth
│   └── routes/
│       ├── auth.js            ← Login/logout
│       └── api.js             ← Todas as rotas da API
└── frontend/
    ├── index.html             ← SPA principal
    ├── css/
    │   └── style.css
    └── js/
        ├── api.js             ← Helper de requisições
        ├── app.js             ← Roteamento, login, helpers
        └── modules/
            ├── dashboard.js
            ├── clientes.js
            ├── impressoras.js
            ├── estoque.js
            ├── projetos.js
            ├── testes.js
            ├── produtos.js
            ├── pedidos.js
            ├── producao.js
            ├── financeiro.js
            ├── relatorios.js
            └── configuracoes.js
```

## Módulos disponíveis
| Módulo | Funcionalidades |
|---|---|
| Dashboard | Resumo financeiro, alertas, ROI |
| Projetos | Cadastro, versões, histórico |
| Testes | Registro de testes, falhas, baixa de estoque automática |
| Produtos | Cadastro com calculadora de custo/preço/margem |
| Pedidos | Ciclo completo ORÇAMENTO → ENTREGUE |
| Produção | Ordens de produção, atualização de status |
| Impressoras | Cadastro, status, histórico de manutenção |
| Estoque | Rolos, movimentações auditáveis, alertas de mínimo |
| Clientes | Cadastro com histórico de pedidos |
| Financeiro | Receitas, despesas, investimentos, contas |
| Relatórios | Financeiro, produção, produtos (por período) |
| Configurações | Custos globais, ROI da impressora |

## Banco de dados
O banco SQLite é criado automaticamente em `backend/gestao3d.db` na primeira execução.
Todos os registros financeiros e de estoque usam soft-delete (nunca são apagados de verdade).

## Perfis de acesso
- **ADMIN** — acesso total
- **OPERADOR** — produção, estoque, testes
- **CLIENTE** — apenas seus pedidos

## Variáveis de ambiente (opcional)
Crie um `.env` em `backend/`:
```env
PORT=3000
JWT_SECRET=sua_chave_secreta_aqui
```

## Correções desta versão
- Os módulos JavaScript das páginas foram mantidos no pacote (`frontend/js/modules/`).
- Cadastro de conta disponível na tela de login.
- Tratamento de erro de carregamento das páginas.
- `better-sqlite3` atualizado para instalação com versões modernas do Node.
- Proteções adicionais para consumo de filamento em testes e produção.
