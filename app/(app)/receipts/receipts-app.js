'use client';
import { useRef, useState } from 'react';
import { toast, confirmDialog } from '../ui-feedback';
import Modal from '../modal';
import { RECEIPT_CATEGORIES } from '../../../lib/receipt-categories';
import { money, toDateInputValue as dstr, toDisplayDate as fmtDate } from '../../../lib/format';
import { getList } from '../../../lib/api';
// Australian financial year: 1 July – 30 June.
function financialYearStart() {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 6, 1);
}
function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Shrinks + compresses the photo client-side before it ever leaves the
// device — phone camera photos can be 5-10MB, which is slow to upload and
// wastes tokens on the vision call for no accuracy benefit past ~1600px.
function resizeImage(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process image'))), 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ReceiptsApp({ initialReceipts, canManage }) {
  const [receipts, setReceipts] = useState(initialReceipts);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // { mode: 'analyzing' | 'form', id?, imageUrl, vendor, date, amount, gst, category, description }
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const fileRef = useRef(null);

  async function refresh() {
    try {
      setReceipts(await getList('/api/receipts'));
    } catch (err) {
      toast.error(err.message);
    }
  }

  function pickFile() { fileRef.current.click(); }

  async function onFileSelected(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setModal({ mode: 'analyzing' });
    try {
      const resized = await resizeImage(file);
      const formData = new FormData();
      formData.append('image', resized, 'receipt.jpg');
      const res = await fetch('/api/receipts/analyze', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not process that image');
        setModal(null);
        return;
      }
      if (data.analysisError) toast.error(data.analysisError);
      else toast.success('Receipt read — check the details below');
      setModal({
        mode: 'form',
        imageUrl: data.imageUrl,
        vendor: data.vendor || '',
        date: data.date || '',
        amount: data.amount || 0,
        gst: data.gst || 0,
        category: data.category || 'Other',
        description: data.description || ''
      });
    } catch {
      toast.error('Could not process that image');
      setModal(null);
    }
  }

  function openEdit(r) {
    setModal({
      mode: 'form',
      id: r.id,
      imageUrl: r.image_url,
      vendor: r.vendor,
      date: dstr(r.purchase_date),
      amount: r.amount,
      gst: r.gst_amount,
      category: r.category,
      description: r.description || ''
    });
  }

  async function save() {
    if (!modal.vendor.trim()) return toast.error('Vendor / store name is required');
    setSaving(true);
    try {
      const body = {
        vendor: modal.vendor.trim(),
        date: modal.date,
        amount: modal.amount,
        gst: modal.gst,
        category: modal.category,
        description: modal.description,
        imageUrl: modal.imageUrl
      };
      const method = modal.id ? 'PUT' : 'POST';
      const url = modal.id ? `/api/receipts/${modal.id}` : '/api/receipts';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        toast.success(modal.id ? 'Receipt updated' : 'Receipt saved');
        setModal(null);
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save receipt');
      }
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    const ok = await confirmDialog('Delete this receipt? This cannot be undone.', {
      title: 'Delete receipt',
      confirmLabel: 'Delete Receipt',
      danger: true
    });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/receipts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Receipt deleted');
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete receipt');
      }
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    const header = ['Date', 'Vendor', 'Category', 'Amount', 'GST', 'Description', 'Uploaded By'];
    const rows = list.map((r) => [
      dstr(r.purchase_date),
      r.vendor,
      r.category,
      Number(r.amount).toFixed(2),
      Number(r.gst_amount).toFixed(2),
      r.description || '',
      r.uploaded_by
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  }

  const list = receipts.filter((r) => {
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.vendor.toLowerCase().includes(s) && !(r.description || '').toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const fyStart = financialYearStart();
  const inThisFY = (r) => r.purchase_date && new Date(r.purchase_date) >= fyStart;
  const totalAllTime = receipts.reduce((s, r) => s + Number(r.amount), 0);
  const totalThisFY = receipts.filter(inThisFY).reduce((s, r) => s + Number(r.amount), 0);
  const gstThisFY = receipts.filter(inThisFY).reduce((s, r) => s + Number(r.gst_amount), 0);

  return (
    <>
      <div className="cards">
        <div className="card"><div className="label">Receipts Logged</div><div className="value">{receipts.length}</div></div>
        <div className="card good"><div className="label">This Financial Year</div><div className="value">{money(totalThisFY)}</div></div>
        <div className="card"><div className="label">GST This Financial Year</div><div className="value">{money(gstThisFY)}</div></div>
        <div className="card"><div className="label">All-Time Total</div><div className="value">{money(totalAllTime)}</div></div>
      </div>

      <div className="panel small-note" style={{ marginBottom: 14 }}>
        Snap or upload a photo of a purchase receipt for anything tax-deductible — tools, materials, fuel, PPE, software, insurance,
        training. The app reads the photo and fills in the details for you to check before saving. Financial year runs 1 July – 30 June.
      </div>

      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Receipts</h2>
        <div className="filters">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All Categories</option>
            {RECEIPT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input placeholder="Search vendor or description" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn ghost sm" onClick={exportCsv}>Export CSV</button>
          <button className="btn amber sm" onClick={pickFile}>+ Add Receipt</button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={onFileSelected}
          />
        </div>
      </div>

      <div className="panel card-table">
        <table>
          <thead>
            <tr>
              <th></th><th>Date</th><th>Vendor</th><th>Category</th><th className="num">Amount</th>
              <th className="num">GST</th><th>Description</th><th>Uploaded By</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const busy = busyId === r.id;
              return (
                <tr key={r.id}>
                  <td data-label="Receipt">
                    <a href={r.image_url} target="_blank" rel="noreferrer">
                      <img src={r.image_url} alt="Receipt" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', display: 'block' }} />
                    </a>
                  </td>
                  <td data-label="Date">{fmtDate(r.purchase_date)}</td>
                  <td data-label="Vendor">{r.vendor}</td>
                  <td data-label="Category"><span className="badge inactive">{r.category}</span></td>
                  <td className="num" data-label="Amount">{money(r.amount)}</td>
                  <td className="num" data-label="GST">{money(r.gst_amount)}</td>
                  <td data-label="Description">{r.description || '—'}</td>
                  <td data-label="Uploaded By">{r.uploaded_by}</td>
                  <td className="cell-actions" data-label="">
                    <div className="row-actions">
                      {canManage && <button className="btn ghost sm" disabled={busy} onClick={() => openEdit(r)}>Edit</button>}
                      {canManage && <button className="btn danger sm" disabled={busy} onClick={() => del(r.id)}>{busy ? 'Deleting…' : 'Delete'}</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No receipts match your filters.</div>}
      </div>

      <Modal open={!!modal}>
        {modal?.mode === 'analyzing' && (
          <>
            <h3>Reading receipt…</h3>
            <p className="small-note">Uploading the photo and pulling out the vendor, date, and amount. This takes a few seconds.</p>
          </>
        )}
        {modal?.mode === 'form' && (
          <>
            <h3>{modal.id ? 'Edit Receipt' : 'Review Receipt Details'}</h3>
            <div className="grid-2">
              <div>
                <img src={modal.imageUrl} alt="Receipt" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }} />
              </div>
              <div>
                <div className="field">
                  <label>Vendor / Store *</label>
                  <input value={modal.vendor} onChange={(e) => setModal({ ...modal, vendor: e.target.value })} />
                </div>
                <div className="field">
                  <label>Purchase Date</label>
                  <input type="date" value={modal.date} onChange={(e) => setModal({ ...modal, date: e.target.value })} />
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>Total Amount ($)</label>
                    <input type="number" min="0" step="0.01" value={modal.amount} onChange={(e) => setModal({ ...modal, amount: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>GST ($)</label>
                    <input type="number" min="0" step="0.01" value={modal.gst} onChange={(e) => setModal({ ...modal, gst: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Category</label>
                  <select value={modal.category} onChange={(e) => setModal({ ...modal, category: e.target.value })}>
                    {RECEIPT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Description</label>
                  <input value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} placeholder="What was purchased" />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn ghost" disabled={saving} onClick={() => setModal(null)}>Cancel</button>
              <button className="btn amber" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Receipt'}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
