'use client';
import { useState } from 'react';
import { toast, confirmDialog } from '../ui-feedback';
import Modal from '../modal';

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function isLow(p) {
  return Number(p.reorder_threshold) > 0 && Number(p.qty_on_hand) <= Number(p.reorder_threshold);
}

export default function PartsApp({ initialParts, canManage }) {
  const [parts, setParts] = useState(initialParts);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    const rows = await fetch('/api/parts').then((r) => r.json());
    setParts(rows);
  }

  function emptyPart() {
    return { name: '', sku: '', category: '', supplier: '', unitCost: 0, qtyOnHand: 0, reorderThreshold: 0, notes: '' };
  }
  function openNew() { setModal(emptyPart()); }
  function openEdit(p) {
    setModal({
      id: p.id, name: p.name, sku: p.sku || '', category: p.category || '', supplier: p.supplier || '',
      unitCost: p.unit_cost, qtyOnHand: p.qty_on_hand, reorderThreshold: p.reorder_threshold, notes: p.notes || ''
    });
  }

  async function save() {
    if (!modal.name.trim()) return toast.error('Part name is required');
    setSaving(true);
    try {
      const method = modal.id ? 'PUT' : 'POST';
      const url = modal.id ? `/api/parts/${modal.id}` : '/api/parts';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modal) });
      if (res.ok) {
        toast.success(modal.id ? 'Part updated' : 'Part added');
        setModal(null);
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save part');
      }
    } finally {
      setSaving(false);
    }
  }
  async function del(id) {
    const ok = await confirmDialog('Delete this part from inventory?', { title: 'Delete part', confirmLabel: 'Delete Part', danger: true });
    if (!ok) return;
    setBusyId(id);
    try {
      await fetch(`/api/parts/${id}`, { method: 'DELETE' });
      toast.success('Part deleted');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }
  async function adjust(id, delta) {
    setBusyId(id);
    try {
      await fetch(`/api/parts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta }) });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  const list = parts.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (p.name || '').toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s) || (p.category || '').toLowerCase().includes(s);
  });
  const lowCount = parts.filter(isLow).length;
  const totalValue = parts.reduce((s, p) => s + Number(p.qty_on_hand) * Number(p.unit_cost), 0);

  return (
    <>
      <div className="cards">
        <div className="card"><div className="label">Parts Tracked</div><div className="value">{parts.length}</div></div>
        <div className={`card${lowCount ? ' warn' : ''}`}><div className="label">Low Stock Items</div><div className="value">{lowCount}</div></div>
        <div className="card good"><div className="label">Inventory Value</div><div className="value">{money(totalValue)}</div></div>
      </div>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Spare Parts Inventory</h2>
        <div className="filters">
          <input placeholder="Search name, SKU or category" value={search} onChange={(e) => setSearch(e.target.value)} />
          {canManage && <button className="btn amber sm" onClick={openNew}>+ New Part</button>}
        </div>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>SKU</th><th>Category</th><th>Supplier</th>
              <th className="num">Unit Cost</th><th className="num">Qty on Hand</th><th className="num">Reorder At</th>
              <th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const low = isLow(p);
              const busy = busyId === p.id;
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.sku || '—'}</td>
                  <td>{p.category || '—'}</td>
                  <td>{p.supplier || '—'}</td>
                  <td className="num">{money(p.unit_cost)}</td>
                  <td className="num">{Number(p.qty_on_hand)}</td>
                  <td className="num">{Number(p.reorder_threshold)}</td>
                  <td><span className={`badge ${low ? 'lowstock' : 'instock'}`}>{low ? 'Low Stock' : 'OK'}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn ghost sm" disabled={busy} onClick={() => adjust(p.id, -1)}>-1</button>
                      <button className="btn ghost sm" disabled={busy} onClick={() => adjust(p.id, 1)}>+1</button>
                      {canManage && <button className="btn ghost sm" disabled={busy} onClick={() => openEdit(p)}>Edit</button>}
                      {canManage && <button className="btn danger sm" disabled={busy} onClick={() => del(p.id)}>{busy ? '…' : 'Delete'}</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No parts logged yet.</div>}
      </div>

      <Modal open={!!modal}>
        {modal && (
          <>
            <h3>{modal.id ? 'Edit Part' : 'New Part'}</h3>
            <div className="grid-2">
              <div className="field"><label>Name *</label><input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} /></div>
              <div className="field"><label>SKU</label><input value={modal.sku} onChange={(e) => setModal({ ...modal, sku: e.target.value })} /></div>
            </div>
            <div className="grid-2">
              <div className="field"><label>Category</label><input value={modal.category} onChange={(e) => setModal({ ...modal, category: e.target.value })} /></div>
              <div className="field"><label>Supplier</label><input value={modal.supplier} onChange={(e) => setModal({ ...modal, supplier: e.target.value })} /></div>
            </div>
            <div className="grid-3">
              <div className="field"><label>Unit Cost ($)</label><input type="number" min="0" step="0.01" value={modal.unitCost} onChange={(e) => setModal({ ...modal, unitCost: e.target.value })} /></div>
              <div className="field"><label>Qty on Hand</label><input type="number" min="0" step="1" value={modal.qtyOnHand} onChange={(e) => setModal({ ...modal, qtyOnHand: e.target.value })} /></div>
              <div className="field"><label>Reorder At</label><input type="number" min="0" step="1" value={modal.reorderThreshold} onChange={(e) => setModal({ ...modal, reorderThreshold: e.target.value })} /></div>
            </div>
            <div className="field"><label>Notes</label><textarea rows={2} value={modal.notes} onChange={(e) => setModal({ ...modal, notes: e.target.value })} /></div>
            <div className="modal-actions">
              <button className="btn ghost" disabled={saving} onClick={() => setModal(null)}>Cancel</button>
              <button className="btn amber" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Part'}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
