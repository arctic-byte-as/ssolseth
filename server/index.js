const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('./db');
const { Parser } = require('json2csv');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

app.use(cors());
app.use(bodyParser.json());

function generateToken(user){
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
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
app.post('/auth/signup', async (req,res)=>{
  const { email, password, name } = req.body;
  if(!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if(existing) return res.status(409).json({ error: 'Email already registered' });
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare('INSERT INTO users (email,password,name) VALUES (?,?,?)').run(email, hash, name||null);
  const user = { id: info.lastInsertRowid, email, name };
  res.json({ token: generateToken(user), user });
});

app.post('/auth/login', async (req,res)=>{
  const { email, password } = req.body;
  if(!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if(!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if(!ok) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: generateToken(user), user: { id: user.id, email: user.email, name: user.name } });
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
