const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/init');
const { auth, JWT_SECRET } = require('../middleware/auth');
const router = express.Router();

function makeToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
  const db = getDb();
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db.prepare(`SELECT * FROM users WHERE email = ? AND active = 1 AND deleted_at IS NULL`).get(normalizedEmail);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  const token = makeToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// Cadastro público de usuário operador.
router.post('/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
  }
  if (name.length < 2) return res.status(400).json({ error: 'Informe um nome válido' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Informe um e-mail válido' });
  if (password.length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });

  const db = getDb();
  const exists = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (exists) return res.status(409).json({ error: 'Este e-mail já está cadastrado' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'OPERADOR')`).run(name, email, hash);
  const user = { id: Number(result.lastInsertRowid), name, email, role: 'OPERADOR' };
  const token = makeToken(user);
  res.status(201).json({ token, user });
});

router.get('/me', auth, (req, res) => res.json(req.user));

router.put('/password', auth, (req, res) => {
  const { current, newPass } = req.body;
  if (!current || !newPass || String(newPass).length < 6) {
    return res.status(400).json({ error: 'Informe a senha atual e uma nova senha com pelo menos 6 caracteres' });
  }
  const db = getDb();
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!user || !bcrypt.compareSync(current, user.password)) return res.status(400).json({ error: 'Senha atual incorreta' });
  const hash = bcrypt.hashSync(newPass, 10);
  db.prepare(`UPDATE users SET password = ? WHERE id = ?`).run(hash, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
