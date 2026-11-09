const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const db = new Database(process.env.DB_PATH || 'stockflow.db');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS orgs(id INTEGER PRIMARY KEY, name TEXT NOT NULL, default_threshold INTEGER NOT NULL DEFAULT 5);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id), email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL, sku TEXT NOT NULL, description TEXT,
  quantity INTEGER NOT NULL DEFAULT 0, cost_price REAL, selling_price REAL,
  low_stock_threshold INTEGER, last_updated_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, sku));`);

const app = express();
app.use(express.json());
const dist = path.join(__dirname, 'client', 'dist');
app.use(express.static(dist));

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const token = u => jwt.sign({ uid: u.id, org: u.org_id, email: u.email }, SECRET, { expiresIn: '7d' });

function auth(req, res, next) {
  try { req.u = jwt.verify((req.headers.authorization || '').slice(7), SECRET); next(); }
  catch { bad(res, 'Please log in.', 401); }
}

app.post('/api/signup', (req, res) => {
  const { email, password, org } = req.body;
  if (!/^\S+@\S+\.\S+$/.test(email || '')) return bad(res, 'Enter a valid email.');
  if (!password || password.length < 6) return bad(res, 'Password must be at least 6 characters.');
  if (!org || !org.trim()) return bad(res, 'Organization name is required.');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase())) return bad(res, 'That email is already registered.');
  const o = db.prepare('INSERT INTO orgs(name) VALUES(?)').run(org.trim());
  const u = { id: db.prepare('INSERT INTO users(org_id,email,hash) VALUES(?,?,?)').run(o.lastInsertRowid, email.toLowerCase(), bcrypt.hashSync(password, 10)).lastInsertRowid, org_id: o.lastInsertRowid, email: email.toLowerCase() };
  res.json({ token: token(u) });
});

app.post('/api/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get((req.body.email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(req.body.password || '', u.hash)) return bad(res, 'Wrong email or password.', 401);
  res.json({ token: token(u) });
});

const threshold = org => db.prepare('SELECT default_threshold d FROM orgs WHERE id=?').get(org).d;
const withLow = (rows, d) => rows.map(p => {
  const t = p.low_stock_threshold ?? d;
  return { ...p, effective_threshold: t, low: p.quantity <= t };
});

function validProduct(b) {
  const int = v => v === '' || v == null ? null : Number(v);
  const p = { name: (b.name || '').trim(), sku: (b.sku || '').trim(), description: b.description || null,
    quantity: int(b.quantity) ?? 0, cost_price: int(b.cost_price), selling_price: int(b.selling_price), low_stock_threshold: int(b.low_stock_threshold) };
  if (!p.name) return { error: 'Name is required.' };
  if (!p.sku) return { error: 'SKU is required.' };
  if (!Number.isInteger(p.quantity) || p.quantity < 0) return { error: 'Quantity must be a whole number, 0 or more.' };
  for (const k of ['cost_price', 'selling_price']) if (p[k] !== null && !(p[k] >= 0)) return { error: 'Prices must be 0 or more.' };
  if (p.low_stock_threshold !== null && (!Number.isInteger(p.low_stock_threshold) || p.low_stock_threshold < 0)) return { error: 'Low stock threshold must be a whole number, 0 or more.' };
  return { p };
}

app.get('/api/products', auth, (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const rows = db.prepare('SELECT * FROM products WHERE org_id=? AND (name LIKE ? OR sku LIKE ?) ORDER BY name').all(req.u.org, q, q);
  res.json(withLow(rows, threshold(req.u.org)));
});

app.get('/api/products/:id', auth, (req, res) => {
  const r = db.prepare('SELECT * FROM products WHERE id=? AND org_id=?').get(req.params.id, req.u.org);
  r ? res.json(r) : bad(res, 'Product not found.', 404);
});

function save(req, res, id) {
  const { p, error } = validProduct(req.body);
  if (error) return bad(res, error);
  try {
    if (id) {
      const r = db.prepare(`UPDATE products SET name=?,sku=?,description=?,quantity=?,cost_price=?,selling_price=?,low_stock_threshold=?,last_updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND org_id=?`)
        .run(p.name, p.sku, p.description, p.quantity, p.cost_price, p.selling_price, p.low_stock_threshold, req.u.email, id, req.u.org);
      if (!r.changes) return bad(res, 'Product not found.', 404);
    } else {
      db.prepare(`INSERT INTO products(org_id,name,sku,description,quantity,cost_price,selling_price,low_stock_threshold,last_updated_by) VALUES(?,?,?,?,?,?,?,?,?)`)
        .run(req.u.org, p.name, p.sku, p.description, p.quantity, p.cost_price, p.selling_price, p.low_stock_threshold, req.u.email);
    }
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return bad(res, 'That SKU already exists in your store.');
    throw e;
  }
}
app.post('/api/products', auth, (req, res) => save(req, res));
app.put('/api/products/:id', auth, (req, res) => save(req, res, req.params.id));

app.post('/api/products/:id/adjust', auth, (req, res) => {
  const delta = Number(req.body.delta);
  const p = db.prepare('SELECT quantity FROM products WHERE id=? AND org_id=?').get(req.params.id, req.u.org);
  if (!p) return bad(res, 'Product not found.', 404);
  if (!Number.isInteger(delta) || delta === 0) return bad(res, 'Enter a whole number, not zero.');
  if (p.quantity + delta < 0) return bad(res, 'Stock cannot go below 0.');
  db.prepare('UPDATE products SET quantity=quantity+?,last_updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(delta, req.u.email, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/products/:id', auth, (req, res) => {
  db.prepare('DELETE FROM products WHERE id=? AND org_id=?').run(req.params.id, req.u.org);
  res.json({ ok: true });
});

app.get('/api/dashboard', auth, (req, res) => {
  const rows = withLow(db.prepare('SELECT * FROM products WHERE org_id=?').all(req.u.org), threshold(req.u.org));
  const org = db.prepare('SELECT name FROM orgs WHERE id=?').get(req.u.org);
  res.json({ org: org.name, total_products: rows.length, total_units: rows.reduce((s, r) => s + r.quantity, 0), low: rows.filter(r => r.low) });
});

app.get('/api/settings', auth, (req, res) => res.json({ default_threshold: threshold(req.u.org) }));
app.put('/api/settings', auth, (req, res) => {
  const n = Number(req.body.default_threshold);
  if (!Number.isInteger(n) || n < 0) return bad(res, 'Enter a whole number, 0 or more.');
  db.prepare('UPDATE orgs SET default_threshold=? WHERE id=?').run(n, req.u.org);
  res.json({ ok: true });
});

app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
app.use((err, req, res, next) => { console.error(err); bad(res, 'Something went wrong.', 500); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`StockFlow running on http://localhost:${PORT}`));
