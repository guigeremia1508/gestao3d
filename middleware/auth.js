const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'gestao3d_change_me';
function auth(req, res, next) { const token = req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({error:'Token não fornecido'}); try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({error:'Token inválido'}); } }
function adminOnly(req,res,next){ if(req.user.role!=='ADMIN') return res.status(403).json({error:'Acesso negado'}); next(); }
module.exports={auth,adminOnly,JWT_SECRET};
