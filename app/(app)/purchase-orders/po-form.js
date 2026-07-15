'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '../ui-feedback';
import { money } from '../../../lib/format';

export default function PoForm({ existing, suppliers, parts, jobs, fullAccess }) {
  const router = useRouter();
  const [form, setForm] = useState(
    existing
      ? {
          id: existing.id,
          poNumber: existing.po_number,
          supplierId: existing.supplier_id || '',
          supplierName: existing.supplier_name,
          jobId: existing.job_id || '',
          jobNumber: existing.job_number || '',
          taxRate: existing.tax_rate,
          status: existing.status,
          notes: existing.notes || ''
        }
      : { supplierId: '', supplierName: '', jobId: '', jobNumber: '', taxRate: 10, status: 'Draft', notes: '' }
  );
  const [lineItems, setLineItems] = useState(
    existing && existing.lineItems.length
      ? existing.lineItems.map((li) => ({ partId: li.part_id || null, description: li.description, qty: li.qty, unitCost: li.unit_cost }))
      : [{ partId: null, description: '', qty: 1, unitCost: 0 }]
  );
  const [saving, setSaving] = useState(false);

  // Local copy of the supplier list so a newly-added supplier shows up in
  // the dropdown immediately without a full page reload.
  const [supplierList, setSupplierList] = useState(suppliers);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', accountNumber: '', phone: '' });
  const [savingSupplier, setSavingSupplier] = useState(false);

  function onSupplierSelect(value) {
    if (value === '__new__') {
      setAddingSupplier(true);
      return;
    }
    const match = supplierList.find((s) => s.id === value);
    setForm({ ...form, supplierId: value, supplierName: match ? match.name : '' });
  }
  async function saveNewSupplier() {
    if (!newSupplier.name.trim()) return toast.error('Supplier name is required');
    setSavingSupplier(true);
    const res = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSupplier)
    });
    setSavingSupplier(false);
    if (res.ok) {
      const created = await res.json();
      setSupplierList([...supplierList, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ ...form, supplierId: created.id, supplierName: created.name });
      setAddingSupplier(false);
      setNewSupplier({ name: '', accountNumber: '', phone: '' });
      toast.success('Supplier added');
    } else {
      const d = await res.json();
      toast.error(d.error || 'Could not add supplier');
    }
  }
  function onJobChange(jobId) {
    const job = jobs.find((j) => j.id === jobId);
    setForm({ ...form, jobId, jobNumber: job ? job.job_number : '' });
  }

  function updateItem(i, field, value) {
    const next = [...lineItems];
    if (field === 'description') {
      // Typing an existing Spare Parts name links this line to inventory
      // (so receiving it later bumps qty_on_hand) and pulls in its cost;
      // anything else stays a one-off item, per line.partId === null.
      const match = parts.find((p) => p.name.toLowerCase() === String(value).toLowerCase());
      next[i] = { ...next[i], description: value, partId: match ? match.id : null, unitCost: match ? Number(match.unit_cost) : next[i].unitCost };
    } else {
      next[i] = { ...next[i], [field]: value };
    }
    setLineItems(next);
  }
  function addItem() { setLineItems([...lineItems, { partId: null, description: '', qty: 1, unitCost: 0 }]); }
  function removeItem(i) { setLineItems(lineItems.filter((_, idx) => idx !== i)); }

  const subtotal = lineItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.unitCost) || 0), 0);
  const tax = subtotal * ((Number(form.taxRate) || 0) / 100);
  const total = subtotal + tax;

  async function save() {
    if (!form.supplierName.trim()) return toast.error('Supplier is required');
    setSaving(true);
    const method = form.id ? 'PUT' : 'POST';
    const url = form.id ? `/api/purchase-orders/${form.id}` : '/api/purchase-orders';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, lineItems })
    });
    setSaving(false);
    if (res.ok) {
      toast.success(fullAccess ? (form.id ? 'Purchase order updated' : 'Purchase order created') : 'Submitted for approval');
      router.push('/purchase-orders');
      router.refresh();
    } else {
      const d = await res.json();
      toast.error(d.error || 'Could not save purchase order');
    }
  }

  // A manager/admin can still open an employee's not-yet-approved PO
  // directly via its edit link — Sent/Cancelled stay off the table until
  // it's actually approved, matching the server-side rule. Received /
  // Partially Received are set only by the Receive Items action, never
  // picked manually here.
  const statusOptions = (!existing || existing.approval_status === 'Approved')
    ? ['Draft', 'Sent', 'Cancelled']
    : ['Draft'];

  return (
    <>
      <h2 className="section-title">{existing ? `Edit Purchase Order ${existing.po_number}` : 'New Purchase Order'}</h2>
      {!fullAccess && (
        <div className="panel small-note" style={{ marginBottom: 14 }}>
          {existing?.approval_status === 'Rejected'
            ? 'A manager sent this back — make your changes and save to resubmit it for approval.'
            : 'This purchase order will need manager or admin approval before it can be sent to the supplier.'}
        </div>
      )}
      {existing?.approval_status === 'Rejected' && existing?.approval_note && (
        <div className="error-box" style={{ marginBottom: 14 }}>
          <strong>Feedback from {existing.reviewed_by || 'reviewer'}:</strong> {existing.approval_note}
        </div>
      )}
      <div className="panel">
        <div className="grid-2">
          <div className="field">
            <label>Supplier *</label>
            {!addingSupplier ? (
              <select value={form.supplierId} onChange={(e) => onSupplierSelect(e.target.value)}>
                <option value="">— Select a supplier —</option>
                {supplierList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                {form.supplierId && !supplierList.some((s) => s.id === form.supplierId) && (
                  <option value={form.supplierId}>{form.supplierName} (not in supplier list)</option>
                )}
                {fullAccess && <option value="__new__">+ Add New Supplier…</option>}
              </select>
            ) : (
              <div style={{ background: 'var(--bg-soft)', border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-sm)', padding: 12 }}>
                <div className="field"><label>New Supplier Name *</label><input value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} /></div>
                <div className="grid-2">
                  <div className="field"><label>Account Number</label><input value={newSupplier.accountNumber} onChange={(e) => setNewSupplier({ ...newSupplier, accountNumber: e.target.value })} /></div>
                  <div className="field"><label>Phone</label><input value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} /></div>
                </div>
                <div className="footer-actions" style={{ marginTop: 0 }}>
                  <button type="button" className="btn ghost sm" onClick={() => { setAddingSupplier(false); setNewSupplier({ name: '', accountNumber: '', phone: '' }); }}>Cancel</button>
                  <button type="button" className="btn amber sm" disabled={savingSupplier} onClick={saveNewSupplier}>{savingSupplier ? 'Saving…' : 'Save Supplier'}</button>
                </div>
              </div>
            )}
          </div>
          <div className="field">
            <label>Job (optional)</label>
            <select value={form.jobId} onChange={(e) => onJobChange(e.target.value)}>
              <option value="">— Not tied to a job —</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.job_number} — {j.client_name}</option>)}
            </select>
          </div>
        </div>

        <h2 className="section-title" style={{ marginTop: 18 }}>Items</h2>
        <p className="small-note" style={{ marginTop: -8, marginBottom: 10 }}>
          Type an existing Spare Parts name to link this line to inventory (its cost fills in and receiving it later updates stock), or type anything else for a one-off item.
        </p>
        <table>
          <thead><tr><th style={{ width: '50%' }}>Description</th><th className="num">Qty</th><th className="num">Unit Cost</th><th className="num">Line Total</th><th></th></tr></thead>
          <tbody>
            {lineItems.map((li, i) => (
              <tr key={i}>
                <td>
                  <input list="part-names" value={li.description} placeholder="Materials, part name..." onChange={(e) => updateItem(i, 'description', e.target.value)} />
                  <datalist id="part-names">{parts.map((p) => <option key={p.id} value={p.name} />)}</datalist>
                </td>
                <td className="num"><input type="number" min="0" step="0.01" value={li.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} /></td>
                <td className="num"><input type="number" min="0" step="0.01" value={li.unitCost} onChange={(e) => updateItem(i, 'unitCost', e.target.value)} /></td>
                <td className="num" style={{ fontWeight: 600 }}>{money((Number(li.qty) || 0) * (Number(li.unitCost) || 0))}</td>
                <td><button className="btn danger sm" disabled={lineItems.length <= 1} onClick={() => removeItem(i)}>&times;</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={addItem}>+ Add Line Item</button>

        <div className={fullAccess ? 'grid-2' : ''} style={{ marginTop: 20 }}>
          <div className="field"><label>GST (%)</label><input type="number" min="0" step="0.01" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} /></div>
          {fullAccess && (
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {statusOptions.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="totals-box">
          <div className="line"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="line"><span>GST ({Number(form.taxRate) || 0}%)</span><span>{money(tax)}</span></div>
          <div className="line total"><span>Total</span><span>{money(total)}</span></div>
        </div>

        <div className="footer-actions">
          <button className="btn ghost" onClick={() => router.push('/purchase-orders')}>Cancel</button>
          <button className="btn amber" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Purchase Order'}</button>
        </div>
      </div>
    </>
  );
}
