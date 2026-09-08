require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/api'));

// Erros da API devem ser sempre JSON, nunca uma página HTML com "<!DOCTYPE".
app.use('/api', (err, req, res, next) => {
  console.error('API error:', err);
  res.status(err.status || 500).json({ error: 'Erro interno do servidor.' });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota da API não encontrada.' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Init DB and start
initDb();
app.listen(PORT, () => {
  console.log(`\n🖨️  Gestão 3D rodando em http://localhost:${PORT}`);
  console.log(`📧  Login: admin@gestao3d.com`);
  console.log(`🔑  Senha: admin123\n`);
});
