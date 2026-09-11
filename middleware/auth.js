const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { dbGet } = require('../database/init');
const JWT_SECRET = process.env.JWT_SECRET || 'gestao3d_change_me';
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
async function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({error:'Token não fornecido'});
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const session = await dbGet(`SELECT s.id, s.expires_at, s.revoked_at FROM sessions s WHERE s.user_id=$1 AND s.token_hash=$2 LIMIT 1`, [payload.id, hashToken(token)]);
    if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) return res.status(401).json({error:'Sessão expirada ou revogada'});
    req.user = payload;
    req.sessionId = Number(session.id);
    next();
  } catch { res.status(401).json({error:'Token inválido'}); }
}
function adminOnly(req,res,next){ if(req.user.role!=='ADMIN') return res.status(403).json({error:'Acesso negado'}); next(); }
module.exports={auth,adminOnly,JWT_SECRET,hashToken};
