import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const money = v => (v == null ? '–' : Number(v).toFixed(2));
const Field = ({ label, ...props }) => <label>{label}<input {...props} /></label>;

function Auth({ onDone }) {
  const [signup, setSignup] = useState(false);
  const [f, setF] = useState({ email: '', password: '', confirm: '', org: '' });
  const [err, setErr] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr('');
    try {
      if (signup && f.password !== f.confirm) throw new Error('Passwords do not match.');
      const r = await api('POST', signup ? '/signup' : '/login', f);
      setToken(r.token); onDone();
    } catch (x) { setErr(x.message); }
  }
  return (
    <div className="auth">
      <h1>StockFlow</h1>
      <p>{signup ? 'Create your store to start tracking stock.' : 'Log in to manage your inventory.'}</p>
      <form className="panel" onSubmit={submit}>
        <Field label="Email" type="email" required value={f.email} onChange={set('email')} />
        <Field label="Password" type="password" required minLength={6} value={f.password} onChange={set('password')} />
        {signup && <>
          <Field label="Confirm password" type="password" required value={f.confirm} onChange={set('confirm')} />
          <Field label="Organization name" required placeholder="My Test Store" value={f.org} onChange={set('org')} />
        </>}
        <p className="err">{err}</p>
        <button className="btn" style={{ width: '100%' }}>{signup ? 'Create account' : 'Log in'}</button>
      </form>
      <p style={{ marginTop: 14 }}>{signup ? 'Have an account?' : 'New here?'}{' '}
        <button className="btn ghost" onClick={() => setSignup(!signup)}>{signup ? 'Log in' : 'Create an account'}</button></p>
    </div>
  );
}

function Dashboard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('GET', '/dashboard').then(setD).catch(e => setErr(e.message)); }, []);
  if (err) return <p className="err">{err}</p>;
  if (!d) return null;
  return (
    <>
      <h2>Dashboard</h2>
      <div className="cards">
        <div className="card"><b>{d.total_products}</b><span>Products</span></div>
        <div className="card"><b>{d.total_units}</b><span>Units in stock</span></div>
        <div className="card low"><b>{d.low.length}</b><span>Low stock items</span></div>
      </div>
      <h3>Low stock items</h3>
      {d.low.length ? (
        <div className="wrap"><table>
          <thead><tr><th>Name</th><th>SKU</th><th className="n">On hand</th><th className="n">Threshold</th></tr></thead>
          <tbody>{d.low.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.sku}</td><td className="n">{p.quantity}</td><td className="n">{p.effective_threshold}</td></tr>)}</tbody>
        </table></div>
      ) : <div className="panel empty">Nothing is running low.</div>}
    </>
  );
}

function Products({ edit }) {
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const load = () => api('GET', '/products').then(setList).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function run(fn) { try { await fn(); load(); } catch (e) { alert(e.message); } }
  const del = id => confirm('Delete this product? This cannot be undone.') && run(() => api('DELETE', '/products/' + id));
  const adjust = id => {
    const v = prompt('Adjust stock by how many units? Use a minus sign to remove (e.g. 5 or -3).');
    if (v !== null) run(() => api('POST', `/products/${id}/adjust`, { delta: parseInt(v, 10), note: prompt('Note (optional)') || '' }));
  };
  const shown = list.filter(p => (p.name + ' ' + p.sku).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <h2>Products</h2>
      <div className="bar">
        <input placeholder="Search by name or SKU" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn" style={{ whiteSpace: 'nowrap' }} onClick={() => edit('new')}>Add product</button>
      </div>
      {err && <p className="err">{err}</p>}
      {list.length ? (
        <div className="wrap"><table>
          <thead><tr><th>Name</th><th>SKU</th><th className="n">Quantity</th><th>Status</th><th className="n">Selling price</th><th></th></tr></thead>
          <tbody>{shown.map(p => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{p.sku}</td><td className="n">{p.quantity}</td>
              <td><span className={'tag' + (p.low ? ' low' : '')}>{p.low ? 'Low stock' : 'In stock'}</span></td>
              <td className="n">{money(p.selling_price)}</td>
              <td className="n" style={{ whiteSpace: 'nowrap' }}>
                <button className="btn ghost" onClick={() => adjust(p.id)}>Adjust</button>
                <button className="btn ghost" onClick={() => edit(p.id)}>Edit</button>
                <button className="btn ghost danger" onClick={() => del(p.id)}>Delete</button>
              </td>
            </tr>))}</tbody>
        </table></div>
      ) : <div className="panel empty">No products yet. Add your first one.</div>}
    </>
  );
}

const blank = { name: '', sku: '', quantity: 0, low_stock_threshold: '', cost_price: '', selling_price: '', description: '' };
function ProductForm({ id, done }) {
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const isNew = id === 'new';
  useEffect(() => {
    if (!isNew) api('GET', '/products/' + id).then(p => setF(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ''])))).catch(e => setErr(e.message));
  }, [id, isNew]);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr('');
    try { await api(isNew ? 'POST' : 'PUT', isNew ? '/products' : '/products/' + id, f); done(); }
    catch (x) { setErr(x.message); }
  }
  return (
    <>
      <h2>{isNew ? 'Add product' : 'Edit product'}</h2>
      <form className="panel" onSubmit={submit}>
        <div className="grid2">
          <Field label="Name" required value={f.name} onChange={set('name')} />
          <Field label="SKU" required value={f.sku} onChange={set('sku')} />
          <Field label="Quantity on hand" type="number" min="0" step="1" required value={f.quantity} onChange={set('quantity')} />
          <Field label="Low stock threshold (blank = store default)" type="number" min="0" step="1" value={f.low_stock_threshold} onChange={set('low_stock_threshold')} />
          <Field label="Cost price" type="number" min="0" step="0.01" value={f.cost_price} onChange={set('cost_price')} />
          <Field label="Selling price" type="number" min="0" step="0.01" value={f.selling_price} onChange={set('selling_price')} />
        </div>
        <label>Description<textarea rows="3" value={f.description} onChange={set('description')} /></label>
        <p className="err">{err}</p>
        <button className="btn">Save product</button>{' '}
        <button type="button" className="btn ghost" onClick={done}>Cancel</button>
      </form>
    </>
  );
}

function Settings() {
  const [v, setV] = useState('');
  const [msg, setMsg] = useState({ text: '', ok: false });
  useEffect(() => { api('GET', '/settings').then(s => setV(s.default_threshold)); }, []);
  async function submit(e) {
    e.preventDefault();
    try { await api('PUT', '/settings', { default_threshold: v }); setMsg({ text: 'Settings saved.', ok: true }); }
    catch (x) { setMsg({ text: x.message, ok: false }); }
  }
  return (
    <>
      <h2>Settings</h2>
      <form className="panel" style={{ maxWidth: 420 }} onSubmit={submit}>
        <Field label="Default low stock threshold" type="number" min="0" step="1" required value={v} onChange={e => setV(e.target.value)} />
        <p className={msg.ok ? 'msg' : 'err'}>{msg.text}</p>
        <button className="btn">Save settings</button>
      </form>
    </>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [view, setView] = useState('dashboard');
  const [editId, setEditId] = useState(null);
  const [org, setOrg] = useState('');

  useEffect(() => {
    const h = () => setAuthed(false);
    window.addEventListener('sf-unauth', h);
    return () => window.removeEventListener('sf-unauth', h);
  }, []);
  useEffect(() => { if (authed) api('GET', '/dashboard').then(d => setOrg(d.org)).catch(() => {}); }, [authed]);

  if (!authed) return <Auth onDone={() => { setView('dashboard'); setAuthed(true); }} />;
  const nav = (label, v) => <button className={view === v || (v === 'products' && view === 'form') ? 'on' : ''} onClick={() => setView(v)}>{label}</button>;

  return (
    <div className="layout">
      <aside>
        <h1>StockFlow</h1><small>{org}</small>
        {nav('Dashboard', 'dashboard')}{nav('Products', 'products')}{nav('Settings', 'settings')}
        <span className="sp" />
        <button onClick={() => { setToken(null); setAuthed(false); }}>Log out</button>
      </aside>
      <main>
        {view === 'dashboard' && <Dashboard />}
        {view === 'products' && <Products edit={id => { setEditId(id); setView('form'); }} />}
        {view === 'form' && <ProductForm id={editId} done={() => setView('products')} />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}
