import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const STATUS_LABEL = { IN_STOCK: 'In stock', LOW_STOCK: 'Low stock', OUT_OF_STOCK: 'Out of stock' };
const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'IN_STOCK', label: 'In stock' },
  { key: 'LOW_STOCK', label: 'Low' },
  { key: 'OUT_OF_STOCK', label: 'Out' },
];
const EMPTY_FORM = {
  sku: '', name: '', category: 'General', quantity: 0, reorder_level: 10, unit_price: '0.00', supplier: '', description: '',
};
const money = (v) => Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function App() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [editing, setEditing] = useState(null); // null | 'new' | item
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const [list, s] = await Promise.all([api.list({ q: query }), api.stats()]);
      setItems(list);
      setStats(s);
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? 'Backend unavailable' : e.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(load, 250); // small debounce for the search box
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = useMemo(
    () => (filter === 'ALL' ? items : items.filter((i) => i.stock_status === filter)),
    [items, filter],
  );
  const reorder = useMemo(() => items.filter((i) => i.stock_status !== 'IN_STOCK').slice(0, 5), [items]);

  const run = async (fn, message) => {
    try {
      await fn();
      setToast(message);
      await load();
    } catch (e) {
      setToast(`Error: ${e.message}`);
    }
  };

  const save = async (form) => {
    const body = {
      ...form,
      quantity: Number(form.quantity),
      reorder_level: Number(form.reorder_level),
      unit_price: String(form.unit_price),
      supplier: form.supplier || 'Unknown',
    };
    if (editing === 'new') {
      await api.create(body);
      setToast(`Added ${body.sku.toUpperCase()}`);
    } else {
      const { sku, ...rest } = body;
      await api.update(editing.id, rest);
      setToast(`Updated ${sku}`);
    }
    setEditing(null);
    load();
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">S</span>
          <div>
            <b>StockSense</b>
            <small>Inventory control</small>
          </div>
        </div>
        <nav>
          <a className="active">Dashboard</a>
          <a>Products</a>
          <a>Suppliers</a>
          <a>Reports</a>
        </nav>
        <div className="sidebar-foot">
          <div className="env">
            <span className="pulse" /> {error ? 'API offline' : 'API connected'}
          </div>
          <div className="me">
            <div className="avatar">RM</div>
            <div>
              <b>Ridaa Mirza</b>
              <small>Warehouse admin</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Warehouse / Overview</p>
            <h1>Inventory dashboard</h1>
            <p className="muted">Stock levels, reorder alerts and item management in one place.</p>
          </div>
          <button className="btn primary" onClick={() => setEditing('new')}>+ Add item</button>
        </header>

        {error && (
          <div className="alert" role="alert">
            {error}. Check that the backend and PostgreSQL are running, then <button className="link" onClick={load}>retry</button>.
          </div>
        )}

        <section className="kpis">
          <Kpi label="Products" value={stats?.total_items ?? '-'} hint={`${stats?.categories ?? 0} categories`} />
          <Kpi label="Units on hand" value={stats?.total_units ?? '-'} hint="across all SKUs" />
          <Kpi label="Low stock" value={stats?.low_stock ?? '-'} hint="at or below reorder level" tone="warn" />
          <Kpi label="Out of stock" value={stats?.out_of_stock ?? '-'} hint="need restocking now" tone="bad" />
          <Kpi label="Inventory value" value={stats ? money(stats.inventory_value) : '-'} hint="quantity x unit price" />
        </section>

        <section className="grid">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Items</h2>
                <p className="muted">{visible.length} shown</p>
              </div>
              <div className="tools">
                <input
                  className="search"
                  placeholder="Search name, SKU, supplier"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search items"
                />
                <div className="chips">
                  {FILTERS.map((f) => (
                    <button key={f.key} className={filter === f.key ? 'chip on' : 'chip'} onClick={() => setFilter(f.key)}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="empty">Loading inventory...</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Category</th>
                      <th className="num">Qty</th>
                      <th className="num">Price</th>
                      <th>Status</th>
                      <th aria-label="actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <b>{i.name}</b>
                          <small className="sku">{i.sku} - {i.supplier}</small>
                        </td>
                        <td>{i.category}</td>
                        <td className="num">
                          <div className="stepper">
                            <button title="Ship one" disabled={i.quantity === 0} onClick={() => run(() => api.adjust(i.id, -1), `Shipped 1 x ${i.sku}`)}>-</button>
                            <span>{i.quantity}</span>
                            <button title="Restock one" onClick={() => run(() => api.adjust(i.id, 1), `Restocked ${i.sku}`)}>+</button>
                          </div>
                        </td>
                        <td className="num">{money(i.unit_price)}</td>
                        <td><span className={`badge ${i.stock_status.toLowerCase()}`}>{STATUS_LABEL[i.stock_status]}</span></td>
                        <td className="actions">
                          <button className="btn ghost" onClick={() => setEditing(i)}>Edit</button>
                          <button className="btn ghost danger" onClick={() => setConfirmDelete(i)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visible.length && <div className="empty">No items match this view.</div>}
              </div>
            )}
          </div>

          <aside className="panel side">
            <h2>Reorder soon</h2>
            <p className="muted">Lowest stock relative to reorder level.</p>
            {reorder.length === 0 && <div className="empty small">Everything is well stocked.</div>}
            {reorder.map((i) => (
              <div className="reorder" key={i.id}>
                <div>
                  <b>{i.name}</b>
                  <small>{i.quantity} left - reorder at {i.reorder_level}</small>
                </div>
                <button className="btn small" onClick={() => run(() => api.adjust(i.id, Math.max(i.reorder_level * 2 - i.quantity, 1)), `Restocked ${i.sku}`)}>
                  Restock
                </button>
              </div>
            ))}
            <div className="pipeline" aria-label="delivery pipeline">
              {['Test', 'Scan', 'Build', 'Push', 'Deploy'].map((s) => <span key={s}>{s}</span>)}
            </div>
          </aside>
        </section>
      </main>

      {editing && <ItemForm initial={editing === 'new' ? EMPTY_FORM : editing} isNew={editing === 'new'} onSave={save} onClose={() => setEditing(null)} />}

      {confirmDelete && (
        <div className="backdrop" role="alertdialog" aria-modal="true">
          <div className="modal narrow">
            <h2>Delete {confirmDelete.name}?</h2>
            <p className="muted">This removes SKU {confirmDelete.sku} permanently.</p>
            <div className="row-end">
              <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className="btn danger-solid"
                onClick={() => {
                  const target = confirmDelete;
                  setConfirmDelete(null);
                  run(() => api.remove(target.id), `Deleted ${target.sku}`);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Kpi({ label, value, hint, tone }) {
  return (
    <div className={`kpi ${tone || ''}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{hint}</span>
    </div>
  );
}

function ItemForm({ initial, isNew, onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await onSave(form);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="backdrop" role="dialog" aria-modal="true">
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">{isNew ? 'New item' : `Edit ${form.sku}`}</p>
            <h2>{isNew ? 'Add an item to inventory' : form.name}</h2>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="close">x</button>
        </div>
        {err && <div className="alert">{err}</div>}
        <div className="form-grid">
          <label>SKU<input required disabled={!isNew} value={form.sku} onChange={set('sku')} placeholder="ELEC-1003" /></label>
          <label>Name<input required value={form.name} onChange={set('name')} placeholder="Bluetooth keyboard" /></label>
          <label>Category<input required value={form.category} onChange={set('category')} /></label>
          <label>Supplier<input value={form.supplier} onChange={set('supplier')} placeholder="Unknown" /></label>
          <label>Quantity<input type="number" min="0" required value={form.quantity} onChange={set('quantity')} /></label>
          <label>Reorder level<input type="number" min="0" required value={form.reorder_level} onChange={set('reorder_level')} /></label>
          <label>Unit price<input type="number" min="0" step="0.01" required value={form.unit_price} onChange={set('unit_price')} /></label>
        </div>
        <label>Description<textarea rows="2" value={form.description} onChange={set('description')} /></label>
        <button className="btn primary full" disabled={busy}>{busy ? 'Saving...' : isNew ? 'Add item' : 'Save changes'}</button>
      </form>
    </div>
  );
}
