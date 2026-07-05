'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function QuoteForm({ existing, clients }) {
  const router = useRouter();
  const [form, setForm] = useState(
    existing
      ? {
          id: existing.id,
          quoteNumber: existing.quote_number,
          clientName: existing.client_name,
          clientPhone: existing.client_phone || '',
          clientEmail: existing.client_email || '',
          clientAddress: existing.client_address || '',
          jobDescription: existing.job_description || '',
          taxRate: existing.tax_rate,
          discount: existing.discount,
          status: existing.status,
          notes: existing.notes || ''
        }
      : {
          clientName: '', clientPhone: '', clientEmail: '', clientAddress: '',
          jobDescription: '', taxRate: 0, discount: 0, status: 'Draft', notes: ''
        }
  );
  const [lineItems, setLineItems] = useState(
    existing && existing.lineItems.length
      ? existing.lineItems.map((li) => ({ description: li.description, qty: li.qty, price: li.price }))
      : [{ description: '', qty: 1, price: 0 }]
  );
  const [saving, setSaving] = useState(false);

  function updateItem(i, field, value) {
    const next = [...lineItems];
    next[i] = { ...next[i], [field]: value };
    setLineItems(next);
  }
  function addItem() { setLineItems([...lineItems, { description: '', qty: 1, price: 0 }]); }
  function removeItem(i) { setLineItems(lineItems.filter((_, idx) => idx !== i)); }

  const subtotal = lineItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.price) || 0), 0);
  const taxable = Math.max(subtotal - (Number(form.discount) || 0), 0);
  const tax = taxable * ((Number(form.taxRate) || 0) / 100);
  const total = taxable + tax;

  async function save() {
    if (!form.clientName.trim()) return alert('Customer name is required');
    setSaving(true);
    const method = form.id ? 'PUT' : 'POST';
    const url = form.id ? `/api/quotes/${form.id}` : '/api/quotes';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, lineItems })
    });
    setSaving(false);
    if (res.ok) {
      router.push('/quotes');
      router.refresh();
    } else {
      const d = await res.json();
      alert(d.error || 'Could not save quote');
    }
  }

  return (
    <>
      <h2 className="section-title">{existing ? `Edit Quote ${existing.quote_number}` : 'New Quote'}</h2>
      <div className="panel">
        <div className="grid-2">
          <div className="field">
            <label>Customer Name *</label>
            <input list="client-names" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
            <datalist id="client-names">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </div>
          <div className="field"><label>Phone</label><input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} /></div>
          <div className="field"><label>Email</label><input value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} /></div>
          <div className="field"><label>Job Address</label><input value={form.clientAddress} onChange={(e) => setForm({ ...form, clientAddress: e.target.value })} /></div>
        </div>
        <div className="field">
          <label>Job Description</label>
          <textarea rows={2} value={form.jobDescription} onChange={(e) => setForm({ ...form, jobDescription: e.target.value })} />
        </div>

        <h2 className="section-title" style={{ marginTop: 18 }}>Line Items</h2>
        <table>
          <thead><tr><th style={{ width: '50%' }}>Description</th><th className="num">Qty</th><th className="num">Unit Price</th><th className="num">Line Total</th><th></th></tr></thead>
          <tbody>
            {lineItems.map((li, i) => (
              <tr key={i}>
                <td><input value={li.description} placeholder="Materials, labor, service..." onChange={(e) => updateItem(i, 'description', e.target.value)} /></td>
                <td className="num"><input type="number" min="0" step="0.01" value={li.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} /></td>
                <td className="num"><input type="number" min="0" step="0.01" value={li.price} onChange={(e) => updateItem(i, 'price', e.target.value)} /></td>
                <td className="num" style={{ fontWeight: 600 }}>{money((Number(li.qty) || 0) * (Number(li.price) || 0))}</td>
                <td><button className="btn danger sm" disabled={lineItems.length <= 1} onClick={() => removeItem(i)}>&times;</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={addItem}>+ Add Line Item</button>

        <div className="grid-3" style={{ marginTop: 20 }}>
          <div className="field"><label>Tax Rate (%)</label><input type="number" min="0" step="0.01" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} /></div>
          <div className="field"><label>Discount ($)</label><input type="number" min="0" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></div>
          <div className="field">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {['Draft', 'Sent', 'Accepted', 'Declined'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Notes / Terms</label>
          <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="totals-box">
          <div className="line"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="line"><span>Discount</span><span>-{money(form.discount)}</span></div>
          <div className="line"><span>Tax ({Number(form.taxRate) || 0}%)</span><span>{money(tax)}</span></div>
          <div className="line total"><span>Total</span><span>{money(total)}</span></div>
        </div>

        <div className="footer-actions">
          <button className="btn ghost" onClick={() => router.push('/quotes')}>Cancel</button>
          <button className="btn amber" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Quote'}</button>
        </div>
      </div>
    </>
  );
}
