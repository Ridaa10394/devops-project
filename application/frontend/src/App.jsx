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
const stockValue = (i) => i.quantity * Number(i.unit_price);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

// Sidebar views, kept in the URL hash so the back button and refresh work.
const VIEWS = {
  dashboard: { label: 'Dashboard', crumb: 'Overview', title: 'Inventory dashboard', sub: 'Stock levels, reorder alerts and item management in one place.' },
  products: { label: 'Products', crumb: 'Products', title: 'Products', sub: 'The full catalogue - every SKU with its supplier, reorder level and stock value.' },
  suppliers: { label: 'Suppliers', crumb: 'Suppliers', title: 'Suppliers', sub: 'Who supplies what, and how much of the stock depends on each of them.' },
  reports: { label: 'Reports', crumb: 'Reports', title: 'Reports', sub: 'Stock value by category, status breakdown and what to reorder.' },
};
const viewFromHash = () => {
  const v = window.location.hash.replace('#', '');
  return VIEWS[v] ? v : 'dashboard';
};

export default function App() {
  const [view, setView] = useState(viewFromHash);
  const [items, setItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [editing, setEditing] = useState(null); // null | 'new' | item
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const load = useCallback(async () => {
    try {
      setError('');
      // Suppliers and Reports always use the whole catalogue, not the search result.
      const [list, all, s] = await Promise.all([
        api.list({ q: query }),
        query ? api.list() : null,
        api.stats(),
      ]);
      setItems(list);
      setAllItems(all ?? list);
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
  const categories = useMemo(() => [...new Set(allItems.map((i) => i.category))].sort(), [allItems]);
  const catalogue = useMemo(
    () => (category === 'ALL' ? visible : visible.filter((i) => i.category === category)),
    [visible, category],
  );

  const go = (v) => {
    window.location.hash = v === 'dashboard' ? '' : v;
    setView(v);
  };
  const showSupplier = (name) => {
    setQuery(name);
    setFilter('ALL');
    setCategory('ALL');
    go('products');
  };
  const restock = (i) => run(() => api.adjust(i.id, Math.max(i.reorder_level * 2 - i.quantity, 1)), `Restocked ${i.sku}`);

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
          {Object.entries(VIEWS).map(([key, v]) => (
            <a
              key={key}
              href={key === 'dashboard' ? '#' : `#${key}`}
              className={view === key ? 'active' : undefined}
              aria-current={view === key ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); go(key); }}
            >
              {v.label}
            </a>
          ))}
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
            <p className="eyebrow">Warehouse / {VIEWS[view].crumb}</p>
            <h1>{VIEWS[view].title}</h1>
            <p className="muted">{VIEWS[view].sub}</p>
          </div>
          {view === 'reports' ? (
            <button className="btn" onClick={() => downloadCsv(allItems)} disabled={!allItems.length}>Export CSV</button>
          ) : (
            <button className="btn primary" onClick={() => setEditing('new')}>+ Add item</button>
          )}
        </header>

        {error && (
          <div className="alert" role="alert">
            {error}. Check that the backend and PostgreSQL are running, then <button className="link" onClick={load}>retry</button>.
          </div>
        )}

        {view === 'dashboard' && (
          <>
            <section className="kpis">
              <Kpi label="Products" value={stats?.total_items ?? '-'} hint={`${stats?.categories ?? 0} categories`} />
              <Kpi label="Units on hand" value={stats?.total_units ?? '-'} hint="across all SKUs" />
              <Kpi label="Low stock" value={stats?.low_stock ?? '-'} hint="at or below reorder level" tone="warn" />
              <Kpi label="Out of stock" value={stats?.out_of_stock ?? '-'} hint="need restocking now" tone="bad" />
              <Kpi label="Inventory value" value={stats ? money(stats.inventory_value) : '-'} hint="quantity x unit price" />
            </section>

            <section className="grid">
              <div className="panel">
                <ItemsHead title="Items" count={visible.length} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} />
                <ItemsTable rows={visible} loading={loading} run={run} onEdit={setEditing} onDelete={setConfirmDelete} />
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
                    <button className="btn small" onClick={() => restock(i)}>Restock</button>
                  </div>
                ))}
                <div className="pipeline" aria-label="delivery pipeline">
                  {['Test', 'Scan', 'Build', 'Push', 'Deploy'].map((s) => <span key={s}>{s}</span>)}
                </div>
              </aside>
            </section>
          </>
        )}

        {view === 'products' && (
          <section className="panel">
            <ItemsHead title="Catalogue" count={catalogue.length} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter}>
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
                <option value="ALL">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </ItemsHead>
            <ItemsTable rows={catalogue} loading={loading} run={run} onEdit={setEditing} onDelete={setConfirmDelete} detailed />
          </section>
        )}

        {view === 'suppliers' && <Suppliers items={allItems} loading={loading} onShow={showSupplier} />}

        {view === 'reports' && <Reports items={allItems} loading={loading} onRestock={restock} />}
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

function ItemsHead({ title, count, query, setQuery, filter, setFilter, children }) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        <p className="muted">{count} shown</p>
      </div>
      <div className="tools">
        <input
          className="search"
          placeholder="Search name, SKU, supplier"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search items"
        />
        {children}
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f.key} className={filter === f.key ? 'chip on' : 'chip'} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// `detailed` adds the catalogue columns used on the Products page.
function ItemsTable({ rows, loading, run, onEdit, onDelete, detailed }) {
  if (loading) return <div className="empty">Loading inventory...</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Category</th>
            {detailed && <th>Supplier</th>}
            <th className="num">Qty</th>
            {detailed && <th className="num">Reorder at</th>}
            <th className="num">Price</th>
            {detailed && <th className="num">Stock value</th>}
            <th>Status</th>
            <th aria-label="actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id}>
              <td>
                <b>{i.name}</b>
                <small className="sku">{detailed ? i.sku : `${i.sku} - ${i.supplier}`}</small>
              </td>
              <td>{i.category}</td>
              {detailed && <td>{i.supplier}</td>}
              <td className="num">
                <div className="stepper">
                  <button title="Ship one" disabled={i.quantity === 0} onClick={() => run(() => api.adjust(i.id, -1), `Shipped 1 x ${i.sku}`)}>-</button>
                  <span>{i.quantity}</span>
                  <button title="Restock one" onClick={() => run(() => api.adjust(i.id, 1), `Restocked ${i.sku}`)}>+</button>
                </div>
              </td>
              {detailed && <td className="num">{i.reorder_level}</td>}
              <td className="num">{money(i.unit_price)}</td>
              {detailed && <td className="num">{money(stockValue(i))}</td>}
              <td><span className={`badge ${i.stock_status.toLowerCase()}`}>{STATUS_LABEL[i.stock_status]}</span></td>
              <td className="actions">
                <button className="btn ghost" onClick={() => onEdit(i)}>Edit</button>
                <button className="btn ghost danger" onClick={() => onDelete(i)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="empty">No items match this view.</div>}
    </div>
  );
}

function Suppliers({ items, loading, onShow }) {
  const suppliers = useMemo(() => {
    const by = new Map();
    for (const i of items) {
      const s = by.get(i.supplier) || { name: i.supplier, items: [], units: 0, value: 0, attention: 0 };
      s.items.push(i);
      s.units += i.quantity;
      s.value += stockValue(i);
      if (i.stock_status !== 'IN_STOCK') s.attention += 1;
      by.set(i.supplier, s);
    }
    return [...by.values()].sort((a, b) => b.value - a.value);
  }, [items]);
  const total = suppliers.reduce((n, s) => n + s.value, 0);

  if (loading) return <div className="panel"><div className="empty">Loading suppliers...</div></div>;
  if (!suppliers.length) return <div className="panel"><div className="empty">No suppliers yet - add an item first.</div></div>;
  return (
    <section className="cards">
      {suppliers.map((s) => (
        <article className="panel supplier" key={s.name}>
          <div className="supplier-head">
            <span className="logo small">{s.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <h2>{s.name}</h2>
              <small>{plural(s.items.length, 'product')} - {[...new Set(s.items.map((i) => i.category))].join(', ')}</small>
            </div>
          </div>
          <dl className="facts">
            <div><dt>Units</dt><dd>{s.units}</dd></div>
            <div><dt>Stock value</dt><dd>{money(s.value)}</dd></div>
            <div><dt>Needs attention</dt><dd className={s.attention ? 'warn-text' : undefined}>{s.attention}</dd></div>
          </dl>
          <div className="bar" title={`${pct(s.value, total)}% of inventory value`}><span style={{ width: `${pct(s.value, total)}%` }} /></div>
          <small>{pct(s.value, total)}% of total inventory value</small>
          <ul className="mini-list">
            {s.items.map((i) => (
              <li key={i.id}>
                <span>{i.name}</span>
                <span className={`badge ${i.stock_status.toLowerCase()}`}>{i.quantity}</span>
              </li>
            ))}
          </ul>
          <button className="btn small" onClick={() => onShow(s.name)}>View products</button>
        </article>
      ))}
    </section>
  );
}

function Reports({ items, loading, onRestock }) {
  const report = useMemo(() => {
    const cats = new Map();
    const status = { IN_STOCK: 0, LOW_STOCK: 0, OUT_OF_STOCK: 0 };
    let value = 0;
    for (const i of items) {
      const c = cats.get(i.category) || { name: i.category, items: 0, units: 0, value: 0 };
      c.items += 1;
      c.units += i.quantity;
      c.value += stockValue(i);
      cats.set(i.category, c);
      status[i.stock_status] += 1;
      value += stockValue(i);
    }
    const toOrder = items
      .filter((i) => i.stock_status !== 'IN_STOCK')
      .map((i) => ({ ...i, order: Math.max(i.reorder_level * 2 - i.quantity, 1) }))
      .sort((a, b) => a.quantity - a.reorder_level - (b.quantity - b.reorder_level));
    return {
      value,
      categories: [...cats.values()].sort((a, b) => b.value - a.value),
      status,
      top: [...items].sort((a, b) => stockValue(b) - stockValue(a)).slice(0, 5),
      toOrder,
      orderCost: toOrder.reduce((n, i) => n + i.order * Number(i.unit_price), 0),
    };
  }, [items]);

  if (loading) return <div className="panel"><div className="empty">Loading report...</div></div>;
  if (!items.length) return <div className="panel"><div className="empty">Nothing to report yet - add an item first.</div></div>;
  return (
    <section className="report-grid">
      <div className="panel">
        <h2>Stock value by category</h2>
        <p className="muted">Total {money(report.value)} across {report.categories.length} categories.</p>
        <div className="rows">
          {report.categories.map((c) => (
            <div className="row" key={c.name}>
              <div className="row-label"><b>{c.name}</b><small>{plural(c.items, 'item')} - {plural(c.units, 'unit')}</small></div>
              <div className="bar"><span style={{ width: `${pct(c.value, report.value)}%` }} /></div>
              <div className="row-value">{money(c.value)}<small>{pct(c.value, report.value)}%</small></div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Stock status</h2>
        <p className="muted">{items.length} products in total.</p>
        <div className="rows">
          {Object.entries(report.status).map(([k, n]) => (
            <div className="row" key={k}>
              <div className="row-label"><span className={`badge ${k.toLowerCase()}`}>{STATUS_LABEL[k]}</span></div>
              <div className={`bar ${k.toLowerCase()}`}><span style={{ width: `${pct(n, items.length)}%` }} /></div>
              <div className="row-value">{n}<small>{pct(n, items.length)}%</small></div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Top items by stock value</h2>
        <p className="muted">Where most of the money sits on the shelves.</p>
        <table>
          <tbody>
            {report.top.map((i, n) => (
              <tr key={i.id}>
                <td className="rank">{n + 1}</td>
                <td><b>{i.name}</b><small className="sku">{i.sku}</small></td>
                <td className="num">{i.quantity} x {money(i.unit_price)}</td>
                <td className="num"><b>{money(stockValue(i))}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Reorder list</h2>
        <p className="muted">
          {report.toOrder.length
            ? `${plural(report.toOrder.length, 'item')} to order - about ${money(report.orderCost)} to bring them back to twice their reorder level.`
            : 'Everything is above its reorder level.'}
        </p>
        {report.toOrder.length > 0 && (
          <table>
            <thead>
              <tr><th>Item</th><th className="num">Have</th><th className="num">Order</th><th aria-label="actions" /></tr>
            </thead>
            <tbody>
              {report.toOrder.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.name}</b><small>{i.supplier}</small></td>
                  <td className="num">{i.quantity} / {i.reorder_level}</td>
                  <td className="num"><b>+{i.order}</b></td>
                  <td className="actions"><button className="btn small" onClick={() => onRestock(i)}>Restock</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function downloadCsv(items) {
  const cols = ['sku', 'name', 'category', 'supplier', 'quantity', 'reorder_level', 'unit_price', 'stock_status'];
  const cell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [cols.join(','), ...items.map((i) => cols.map((c) => cell(i[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `stocksense-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
