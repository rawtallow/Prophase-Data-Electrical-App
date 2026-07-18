'use client';
import { useState } from 'react';
import { toast, confirmDialog } from '../ui-feedback';
import Modal from '../modal';
import { getList } from '../../../lib/api';

function emptySupplier() {
  return { name: '', accountNumber: '', contactName: '', phone: '', email: '', address: '', paymentTerms: '', portalUrl: '', notes: '' };
}

export default function SuppliersApp({ initialSuppliers, canManage }) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    try {
      setSuppliers(await getList('/api/suppliers'));
    } catch (err) {
      toast.error(err.message);
    }
  }

  function openNew() { setModal(emptySupplier()); }
  function openEdit(s) {
    setModal({
      id: s.id, name: s.name, accountNumber: s.account_number || '', contactName: s.contact_name || '',
      phone: s.phone || '', email: s.email || '', address: s.address || '',
      paymentTerms: s.payment_terms || '', portalUrl: s.portal_url || '', notes: s.notes || ''
    });
  }

  async function save() {
    if (!modal.name.trim()) return toast.error('Supplier name is required');
    setSaving(true);
    try {
      const method = modal.id ? 'PUT' : 'POST';
      const url = modal.id ? `/api/suppliers/${modal.id}` : '/api/suppliers';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modal) });
      if (res.ok) {
        toast.success(modal.id ? 'Supplier updated' : 'Supplier added');
        setModal(null);
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save supplier');
      }
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    const ok = await confirmDialog('Delete this supplier? Existing purchase orders will keep their saved info.', {
      title: 'Delete supplier',
      confirmLabel: 'Delete Supplier',
      danger: true
    });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Supplier deleted');
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete supplier — it may still have purchase orders attached');
      }
    } finally {
      setBusyId(null);
    }
  }

  const filtered = suppliers.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.contact_name || '').toLowerCase().includes(q) ||
      (s.account_number || '').toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Suppliers</h2>
        <div className="filters">
          <input placeholder="Search name, contact, account #" value={search} onChange={(e) => setSearch(e.target.value)} />
          {canManage && <button className="btn amber sm" onClick={openNew}>+ New Supplier</button>}
        </div>
      </div>
      <div className="panel card-table">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Account #</th><th>Contact</th><th>Phone</th><th>Email</th><th>Payment Terms</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td data-label="Name">{s.name}</td>
                <td data-label="Account #">{s.account_number || '—'}</td>
                <td data-label="Contact">{s.contact_name || '—'}</td>
                <td data-label="Phone">{s.phone || '—'}</td>
                <td data-label="Email">{s.email || '—'}</td>
                <td data-label="Payment Terms">{s.payment_terms || '—'}</td>
                <td className="cell-actions" data-label="">
                  <div className="row-actions">
                    {canManage && <button className="btn ghost sm" disabled={busyId === s.id} onClick={() => openEdit(s)}>Edit</button>}
                    {canManage && (
                      <button className="btn danger sm" disabled={busyId === s.id} onClick={() => del(s.id)}>
                        {busyId === s.id ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="empty">{suppliers.length === 0 ? 'No suppliers yet.' : 'No suppliers match your search.'}</div>
        )}
      </div>

      <Modal open={!!modal}>
        {modal && (
          <>
            <h3>{modal.id ? 'Edit Supplier' : 'New Supplier'}</h3>
            <div className="grid-2">
              <div className="field"><label>Supplier Name *</label><input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} /></div>
              <div className="field"><label>Account Number</label><input value={modal.accountNumber} onChange={(e) => setModal({ ...modal, accountNumber: e.target.value })} /></div>
            </div>
            <div className="grid-2">
              <div className="field"><label>Contact Name</label><input value={modal.contactName} onChange={(e) => setModal({ ...modal, contactName: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input value={modal.phone} onChange={(e) => setModal({ ...modal, phone: e.target.value })} /></div>
            </div>
            <div className="grid-2">
              <div className="field"><label>Email</label><input value={modal.email} onChange={(e) => setModal({ ...modal, email: e.target.value })} /></div>
              <div className="field"><label>Payment Terms</label><input placeholder="e.g. Net 30" value={modal.paymentTerms} onChange={(e) => setModal({ ...modal, paymentTerms: e.target.value })} /></div>
            </div>
            <div className="field"><label>Address</label><input value={modal.address} onChange={(e) => setModal({ ...modal, address: e.target.value })} /></div>
            <div className="field"><label>Ordering Portal URL</label><input placeholder="https://" value={modal.portalUrl} onChange={(e) => setModal({ ...modal, portalUrl: e.target.value })} /></div>
            <div className="field"><label>Notes</label><textarea rows={2} value={modal.notes} onChange={(e) => setModal({ ...modal, notes: e.target.value })} /></div>
            <div className="modal-actions">
              <button className="btn ghost" disabled={saving} onClick={() => setModal(null)}>Cancel</button>
              <button className="btn amber" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Supplier'}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
