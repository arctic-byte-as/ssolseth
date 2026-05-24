const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('./db');
const { Parser } = require('json2csv');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const WEB_ROOT = path.join(__dirname, '..');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(WEB_ROOT));

app.get('/', (req, res) => {
  res.sendFile(path.join(WEB_ROOT, 'index.html'));
});

function generateToken(user){
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

// Rate limiters for auth endpoints
const authLimiter = rateLimit({ windowMs: 60*1000, max: 6, message: { error: 'Too many requests, try again later' } });

// Helper: simple email + password validation
function validEmail(email){ return typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email); }
function validPassword(p){ return typeof p === 'string' && p.length >= 8; }

// Optional transporter (configure SMTP env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
let mailer = null;
if(process.env.SMTP_HOST){
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT)||587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

function authMiddleware(req,res,next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({ error: 'Missing authorization header' });
  const parts = auth.split(' ');
  if(parts.length !== 2) return res.status(401).json({ error: 'Invalid auth format' });
  const token = parts[1];
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  }catch(e){
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Auth
app.post('/auth/signup', authLimiter, async (req,res)=>{
  const { email, password, name } = req.body;
  if(!validEmail(email) || !validPassword(password)) return res.status(400).json({ error: 'Invalid email or password (min 8 chars)' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if(existing) return res.status(409).json({ error: 'Email already registered' });
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare('INSERT INTO users (email,password,name) VALUES (?,?,?)').run(email, hash, name||null);
  const user = { id: info.lastInsertRowid, email, name };
  res.json({ token: generateToken(user), user });
});

app.post('/auth/login', authLimiter, async (req,res)=>{
  const { email, password } = req.body;
  if(!validEmail(email) || !validPassword(password)) return res.status(400).json({ error: 'Invalid email or password' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if(!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if(!ok) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: generateToken(user), user: { id: user.id, email: user.email, name: user.name } });
});

// Request password reset
app.post('/auth/request-reset', authLimiter, async (req,res)=>{
  const { email } = req.body;
  if(!validEmail(email)) return res.status(400).json({ error: 'Invalid email' });
  const user = db.prepare('SELECT id,email FROM users WHERE email = ?').get(email);
  if(!user) return res.json({ ok: true }); // do not reveal
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 1000*60*60).toISOString(); // 1h
  db.prepare('INSERT INTO password_resets (user_id,token_hash,expires_at) VALUES (?,?,?)').run(user.id, tokenHash, expiresAt);
  const resetUrl = (process.env.FRONTEND_RESET_URL || 'http://localhost:3000/reset') + '?token=' + token;
  if(mailer){
    try{
      await mailer.sendMail({ from: process.env.SMTP_FROM||'no-reply@example.com', to: user.email, subject: 'Password reset', text: `Reset your password: ${resetUrl}` });
    }catch(e){ console.error('mail error', e); }
    return res.json({ ok: true });
  }
  // Dev fallback: return token (only in non-production)
  if(process.env.NODE_ENV === 'production') return res.json({ ok: true });
  res.json({ ok: true, token: token, resetUrl });
});

// Perform password reset
app.post('/auth/reset', authLimiter, async (req,res)=>{
  const { token, password } = req.body;
  if(!token || !validPassword(password)) return res.status(400).json({ error: 'Invalid token or password' });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = db.prepare('SELECT id,user_id,expires_at,used FROM password_resets WHERE token_hash = ?').get(tokenHash);
  if(!row) return res.status(400).json({ error: 'Invalid or expired token' });
  if(row.used) return res.status(400).json({ error: 'Token already used' });
  if(new Date(row.expires_at) < new Date()) return res.status(400).json({ error: 'Token expired' });
  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, row.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// Sessions
app.get('/sessions', authMiddleware, (req,res)=>{
  const rows = db.prepare('SELECT id,label,time,duration FROM sessions WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(rows);
});

app.post('/sessions', authMiddleware, (req,res)=>{
  const { label, time, duration } = req.body;
  const info = db.prepare('INSERT INTO sessions (user_id,label,time,duration) VALUES (?,?,?,?)').run(req.user.id, label||'Unnamed session', time||new Date().toLocaleString(), duration||'00:00:00');
  const row = db.prepare('SELECT id,label,time,duration FROM sessions WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});

app.put('/sessions/:id', authMiddleware, (req,res)=>{
  const id = parseInt(req.params.id);
  const { label, time, duration } = req.body;
  const stmt = db.prepare('UPDATE sessions SET label = ?, time = ?, duration = ? WHERE id = ? AND user_id = ?');
  const info = stmt.run(label, time, duration, id, req.user.id);
  if(info.changes === 0) return res.status(404).json({ error: 'Not found or not owned' });
  const row = db.prepare('SELECT id,label,time,duration FROM sessions WHERE id = ?').get(id);
  res.json(row);
});

app.delete('/sessions/:id', authMiddleware, (req,res)=>{
  const id = parseInt(req.params.id);
  const info = db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(id, req.user.id);
  if(info.changes === 0) return res.status(404).json({ error: 'Not found or not owned' });
  res.json({ success: true });
});

app.get('/sessions/totals', authMiddleware, (req,res)=>{
  const rows = db.prepare('SELECT duration FROM sessions WHERE user_id = ?').all(req.user.id);
  const totalSeconds = rows.reduce((sum, s) => {
    const parts = (s.duration||'00:00:00').split(':').map(x=>parseInt(x)||0);
    return sum + parts[0]*3600 + parts[1]*60 + parts[2];
  },0);
  res.json({ total: totalSeconds, formatted: formatTime(totalSeconds) });
});

app.get('/sessions/export', authMiddleware, (req,res)=>{
  const rows = db.prepare('SELECT label,time,duration FROM sessions WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  const parser = new Parser({ fields: ['label','time','duration'] });
  const csv = parser.parse(rows);
  res.header('Content-Type', 'text/csv');
  res.attachment('sessions.csv');
  res.send(csv);
});

function formatTime(totalSeconds){ const h=Math.floor(totalSeconds/3600); const m=Math.floor((totalSeconds%3600)/60); const s=totalSeconds%60; return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }

app.listen(PORT, ()=>{
  console.log(`Time Tracker API running on http://localhost:${PORT}`);
});
