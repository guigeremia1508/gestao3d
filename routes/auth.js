const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun, dbAll } = require('../database/init');
const { auth, adminOnly, JWT_SECRET } = require('../middleware/auth');
const router = express.Router();

// LOGIN
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
  const user = dbGet('SELECT * FROM users WHERE email = ? AND active = 1 AND deleted_at IS NULL', [email]);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Credenciais inválidas' });
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// REGISTRO — só funciona se não existir nenhum admin ainda, OU com convite de admin
router.post('/register', (req, res) => {
  const { name, email, password, invite } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });

  // Verifica se já existe algum admin — se sim, exige código de convite
  const adminExists = dbGet("SELECT id FROM users WHERE role = 'ADMIN' AND deleted_at IS NULL");
  const INVITE_CODE = process.env.INVITE_CODE || 'gestao3d2024';

  if (adminExists && invite !== INVITE_CODE) {
    return res.status(403).json({ error: 'Código de convite inválido. Peça ao administrador.' });
  }

  const existing = dbGet('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(400).json({ error: 'E-mail já cadastrado' });

  const hash = bcrypt.hashSync(password, 10);
  const role = adminExists ? 'OPERADOR' : 'ADMIN'; // primeiro user vira admin
  const r = dbRun('INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)', [name, email, hash, role]);
  const token = jwt.sign({ id: r.lastInsertRowid, name, email, role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: r.lastInsertRowid, name, email, role } });
});

// ME
router.get('/me', auth, (req, res) => res.json(req.user));

// TROCAR SENHA
router.put('/password', auth, (req, res) => {
  const { current, newPass } = req.body;
  const user = dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!bcrypt.compareSync(current, user.password)) return res.status(400).json({ error: 'Senha atual incorreta' });
  const hash = bcrypt.hashSync(newPass, 10);
  dbRun('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.id]);
  res.json({ ok: true });
});

// LISTAR USUÁRIOS (admin)
router.get('/users', auth, adminOnly, (req, res) => {
  res.json(dbAll("SELECT id, name, email, role, active, created_at FROM users WHERE deleted_at IS NULL ORDER BY name"));
});

// CRIAR USUÁRIO (admin)
router.post('/users', auth, adminOnly, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
  const existing = dbGet('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(400).json({ error: 'E-mail já cadastrado' });
  const hash = bcrypt.hashSync(password, 10);
  const r = dbRun('INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)', [name, email, hash, role || 'OPERADOR']);
  res.json({ id: r.lastInsertRowid });
});

// EDITAR USUÁRIO (admin)
router.put('/users/:id', auth, adminOnly, (req, res) => {
  const { name, email, role, active } = req.body;
  dbRun('UPDATE users SET name=?, email=?, role=?, active=? WHERE id=?', [name, email, role, active ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});

// EXCLUIR USUÁRIO (admin)
router.delete('/users/:id', auth, adminOnly, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Você não pode excluir a si mesmo' });
  dbRun("UPDATE users SET deleted_at = datetime('now') WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
