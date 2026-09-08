require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve frontend (agora está em ./frontend relativamente à raiz)
app.use(express.static(path.join(__dirname, 'frontend')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/api'));

// Erro de API → sempre JSON
app.use('/api', (err, req, res, next) => {
  console.error('API error:', err);
  res.status(err.status || 500).json({ error: 'Erro interno do servidor.' });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota da API não encontrada.' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Init DB e start
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🖨️  Gestão 3D rodando na porta ${PORT}`);
    console.log(`📧  Login: admin@gestao3d.com`);
    console.log(`🔑  Senha: admin123\n`);
  });
}).catch(err => {
  console.error('Erro ao inicializar banco:', err);
  process.exit(1);
});
