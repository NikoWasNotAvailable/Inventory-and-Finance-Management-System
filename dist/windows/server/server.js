const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const path = require('path');
const db = new Database(path.join(__dirname, 'data.db'));
// Initialize tables
db.prepare(`CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY, name TEXT, category TEXT, price INTEGER, cost INTEGER, quantity INTEGER, date TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY, customer TEXT, type TEXT, date TEXT, total INTEGER, lines TEXT
)`).run();

const SECRET = process.env.JWT_SECRET || 'devsecret';
const USER = { username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS || 'password' };

// Auth
app.post('/api/auth/login', (req,res)=>{
  const {username,password} = req.body;
  if(username===USER.username && password===USER.password){
    const token = jwt.sign({user:username}, SECRET, {expiresIn:'8h'});
    return res.json({token});
  }
  res.status(401).json({error:'invalid'});
});

function authMiddleware(req,res,next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({error:'no token'});
  const token = auth.replace(/^Bearer\s+/i,'');
  try{ jwt.verify(token, SECRET); next(); }catch(e){ res.status(401).json({error:'invalid token'}); }
}

// Items CRUD
app.get('/api/items', (req,res)=>{
  const rows = db.prepare('SELECT * FROM items').all();
  res.json(rows);
});
app.post('/api/items', authMiddleware, (req,res)=>{
  const it = req.body;
  db.prepare('INSERT INTO items (id,name,category,price,cost,quantity,date) VALUES (?,?,?,?,?,?,?)')
    .run(it.id, it.name, it.category, it.price||0, it.cost||0, it.quantity||0, it.date||new Date().toISOString());
  res.json({ok:true});
});
app.put('/api/items/:id', authMiddleware, (req,res)=>{
  const id = req.params.id; const it = req.body;
  db.prepare('UPDATE items SET name=?,category=?,price=?,cost=?,quantity=? WHERE id=?')
    .run(it.name, it.category, it.price||0, it.cost||0, it.quantity||0, id);
  res.json({ok:true});
});
app.delete('/api/items/:id', authMiddleware, (req,res)=>{
  db.prepare('DELETE FROM items WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// Sales
app.get('/api/sales', (req,res)=>{
  const rows = db.prepare('SELECT * FROM sales').all();
  res.json(rows.map(r=>({...r, lines: JSON.parse(r.lines)})));
});
app.post('/api/sales', authMiddleware, (req,res)=>{
  const s = req.body;
  db.prepare('INSERT INTO sales (id,customer,type,date,total,lines) VALUES (?,?,?,?,?,?)')
    .run(s.id, s.customer, s.type, s.date, s.total, JSON.stringify(s.lines));
  // reduce stock
  const update = db.prepare('UPDATE items SET quantity = quantity - ? WHERE id = ?');
  s.lines.forEach(l=>{ update.run(l.qty, l.id); });
  res.json({ok:true});
});

const port = process.env.PORT || 3000;
// Serve frontend static files from repo root so users can open the app via server
const staticRoot = path.join(__dirname, '..');
app.use('/', express.static(staticRoot));

app.listen(port, ()=>console.log('Server running on', port, 'serving', staticRoot));
