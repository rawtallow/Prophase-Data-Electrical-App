'use client';
import { useState } from 'react';
import { toast, confirmDialog } from '../ui-feedback';

export default function ClientsApp({ initialClients, initialAssets, canManage }) {
  const [clients, setClients] = useState(initialClients);
  const [assets, setAssets] = useState(initialAssets);

  const [clientModal, setClientModal] = useState(null); // null | {} | {id,...}
  const [assetModal, setAssetModal] = useState(null); // null | { client, editingAsset }
  const [assetForm, setAssetForm] = useState(emptyAsset());
  const [savingClient, setSavingClient] = useState(false);
  const [savingAsset, setSavingAsset] = useState(false);
  const [busyId, setBusyId] = useState(null);

  function emptyAsset() {
    return { name: '', model: '', serial: '', installDate: '', warrantyExpiry: '', notes: '' };
  }

  async function refresh() {
    const [c, a] = await Promise.all([
      fetch('/api/clients').then((r) => r.json()),
      fetch('/api/assets').then((r) => r.json())
    ]);
    setClients(c);
    setAssets(a);
  }

  async function saveClient(form) {
    setSavingClient(true);
    try {
      const method = form.id ? 'PUT' : 'POST';
      const url = form.id ? `/api/clients/${form.id}` : '/api/clients';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        setClientModal(null);
        toast.success(form.id ? 'Client updated' : 'Client added');
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save client');
      }
    } finally {
      setSavingClient(false);
    }
  }

  async function deleteClient(id) {
    const ok = await confirmDialog('Delete this client? Existing quotes and jobs will keep their saved info.', {
      title: 'Delete client',
      confirmLabel: 'Delete Client',
      danger: true
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      toast.success('Client deleted');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  function openAssets(client) {
    setAssetModal({ client });
    setAssetForm(emptyAsset());
  }

  async function saveAsset() {
    if (!assetForm.name.trim()) return toast.error('Asset name / type is required');
    setSavingAsset(true);
    try {
      const method = assetForm.id ? 'PUT' : 'POST';
      const url = assetForm.id ? `/api/assets/${assetForm.id}` : '/api/assets';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...assetForm, clientId: assetModal.client.id })
      });
      if (res.ok) {
        setAssetForm(emptyAsset());
        toast.success('Asset saved');
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save asset');
      }
    } finally {
      setSavingAsset(false);
    }
  }

  async function deleteAsset(id) {
    const ok = await confirmDialog('Delete this asset record?', { title: 'Delete asset', confirmLabel: 'Delete Asset', danger: true });
    if (!ok) return;
    setBusyId(id);
    try {
      await fetch(`/api/assets/${id}`, { method: 'DELETE' });
      toast.success('Asset deleted');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  function editAsset(a) {
    setAssetForm({
      id: a.id,
      name: a.name,
      model: a.model || '',
      serial: a.serial || '',
      installDate: a.install_date ? String(a.install_date).slice(0, 10) : '',
      warrantyExpiry: a.warranty_expiry ? String(a.warranty_expiry).slice(0, 10) : '',
      notes: a.notes || ''
    });
  }

  const clientAssets = assetModal ? assets.filter((a) => a.client_id === assetModal.client.id) : [];

  return (
    <>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Clients</h2>
        {canManage && (
          <button className="btn amber sm" onClick={() => setClientModal({ name: '', phone: '', email: '', address: '' })}>
            + New Client
          </button>
        )}
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Phone</th><th>Email</th><th>Address</th>
              <th className="num"># Assets</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.phone || '—'}</td>
                <td>{c.email || '—'}</td>
                <td>{c.address || '—'}</td>
                <td className="num">{assets.filter((a) => a.client_id === c.id).length}</td>
                <td>
                  <div className="row-actions">
                    {canManage && (
                      <button className="btn ghost sm" disabled={busyId === c.id} onClick={() => setClientModal({ id: c.id, name: c.name, phone: c.phone, email: c.email, address: c.address })}>
                        Edit
                      </button>
                    )}
                    <button className="btn ghost sm" disabled={busyId === c.id} onClick={() => openAssets(c)}>Assets</button>
                    {canManage && (
                      <button className="btn danger sm" disabled={busyId === c.id} onClick={() => deleteClient(c.id)}>
                        {busyId === c.id ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {clients.length === 0 && <div className="empty">No clients yet.</div>}
      </div>

      {clientModal && (
        <div className="modal-overlay active">
          <div className="modal">
            <h3>{clientModal.id ? 'Edit Client' : 'New Client'}</h3>
            <div className="field">
              <label>Name *</label>
              <input value={clientModal.name} onChange={(e) => setClientModal({ ...clientModal, name: e.target.value })} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Phone</label>
                <input value={clientModal.phone || ''} onChange={(e) => setClientModal({ ...clientModal, phone: e.target.value })} />
              </div>
              <div className="field">
                <label>Email</label>
                <input value={clientModal.email || ''} onChange={(e) => setClientModal({ ...clientModal, email: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Address</label>
              <input value={clientModal.address || ''} onChange={(e) => setClientModal({ ...clientModal, address: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn ghost" disabled={savingClient} onClick={() => setClientModal(null)}>Cancel</button>
              <button className="btn amber" disabled={savingClient} onClick={() => saveClient(clientModal)}>
                {savingClient ? 'Saving…' : 'Save Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {assetModal && (
        <div className="modal-overlay active">
          <div className="modal" style={{ maxWidth: 760 }}>
            <h3>Assets — {assetModal.client.name}</h3>
            {canManage && (
              <>
                <div className="grid-3">
                  <div className="field">
                    <label>Name / Type *</label>
                    <input placeholder="e.g. Switchboard, EV Charger" value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Model</label>
                    <input value={assetForm.model} onChange={(e) => setAssetForm({ ...assetForm, model: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Serial Number</label>
                    <input value={assetForm.serial} onChange={(e) => setAssetForm({ ...assetForm, serial: e.target.value })} />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>Install Date</label>
                    <input type="date" value={assetForm.installDate} onChange={(e) => setAssetForm({ ...assetForm, installDate: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Warranty Expiry</label>
                    <input type="date" value={assetForm.warrantyExpiry} onChange={(e) => setAssetForm({ ...assetForm, warrantyExpiry: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Notes</label>
                  <textarea rows={2} value={assetForm.notes} onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })} />
                </div>
                <div className="footer-actions">
                  <button className="btn ghost sm" disabled={savingAsset} onClick={() => setAssetForm(emptyAsset())}>Clear / New Asset</button>
                  <button className="btn amber sm" disabled={savingAsset} onClick={saveAsset}>{savingAsset ? 'Saving…' : 'Save Asset'}</button>
                </div>
              </>
            )}

            <h2 className="section-title" style={{ marginTop: 20 }}>Existing Assets</h2>
            <table>
              <thead><tr><th>Name / Type</th><th>Model</th><th>Serial</th><th>Installed</th><th>Warranty Exp.</th>{canManage && <th>Actions</th>}</tr></thead>
              <tbody>
                {clientAssets.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.model || '—'}</td>
                    <td>{a.serial || '—'}</td>
                    <td>{a.install_date ? String(a.install_date).slice(0, 10) : '—'}</td>
                    <td>{a.warranty_expiry ? String(a.warranty_expiry).slice(0, 10) : '—'}</td>
                    {canManage && (
                      <td>
                        <div className="row-actions">
                          <button className="btn ghost sm" disabled={busyId === a.id} onClick={() => editAsset(a)}>Edit</button>
                          <button className="btn danger sm" disabled={busyId === a.id} onClick={() => deleteAsset(a.id)}>
                            {busyId === a.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {clientAssets.length === 0 && <div className="empty">No assets logged for this client yet.</div>}

            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setAssetModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
