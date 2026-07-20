'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '../ui-feedback';
import Modal from '../modal';
import { slug } from '../../../lib/format';
import { LEAD_SOURCES } from '../../../lib/lead-sources';
import { getList } from '../../../lib/api';

export default function ClientsApp({ initialClients, assetCountByClient, canManage }) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [newClientModal, setNewClientModal] = useState(null); // null | {}
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      setClients(await getList('/api/clients'));
    } catch (err) {
      toast.error(err.message);
    }
  }

  // Quick-add only — full editing (and everything else) lives on the client
  // detail page now, so this deliberately stays minimal to keep "add a new
  // client" fast; company/notes get filled in from the profile afterward.
  async function saveNewClient() {
    if (!newClientModal.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClientModal)
      });
      if (res.ok) {
        const created = await res.json();
        setNewClientModal(null);
        toast.success('Client added');
        await refresh();
        router.push(`/clients/${created.id}`);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save client');
      }
    } finally {
      setSaving(false);
    }
  }

  const filteredClients = clients.filter((c) => {
    if (sourceFilter && c.lead_source !== sourceFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(s) ||
      (c.phone || '').toLowerCase().includes(s) ||
      (c.email || '').toLowerCase().includes(s) ||
      (c.address || '').toLowerCase().includes(s)
    );
  });

  return (
    <>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Clients</h2>
        <div className="filters">
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="">All Sources</option>
            {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input placeholder="Search name, phone, email, address" value={search} onChange={(e) => setSearch(e.target.value)} />
          {canManage && (
            <button className="btn amber sm" onClick={() => setNewClientModal({ name: '', phone: '', email: '', address: '', leadSource: '' })}>
              + New Client
            </button>
          )}
        </div>
      </div>
      <div className="panel card-table">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>Source</th><th className="num"># Assets</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((c) => (
              <tr key={c.id} onClick={() => router.push(`/clients/${c.id}`)} style={{ cursor: 'pointer' }}>
                <td data-label="Name" style={{ color: 'var(--amber-dark)', fontWeight: 650 }}>{c.name}</td>
                <td data-label="Phone">{c.phone || '—'}</td>
                <td data-label="Email">{c.email || '—'}</td>
                <td data-label="Address">{c.address || '—'}</td>
                <td data-label="Source">{c.lead_source ? <span className={`badge ${slug(c.lead_source)}`}>{c.lead_source}</span> : '—'}</td>
                <td className="num" data-label="Assets">{assetCountByClient[c.id] || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredClients.length === 0 && (
          <div className="empty">{clients.length === 0 ? 'No clients yet.' : 'No clients match your search.'}</div>
        )}
      </div>

      <Modal open={!!newClientModal}>
        {newClientModal && (
          <>
            <h3>New Client</h3>
            <div className="field">
              <label>Name *</label>
              <input value={newClientModal.name} onChange={(e) => setNewClientModal({ ...newClientModal, name: e.target.value })} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Phone</label>
                <input value={newClientModal.phone} onChange={(e) => setNewClientModal({ ...newClientModal, phone: e.target.value })} />
              </div>
              <div className="field">
                <label>Email</label>
                <input value={newClientModal.email} onChange={(e) => setNewClientModal({ ...newClientModal, email: e.target.value })} />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Address</label>
                <input value={newClientModal.address} onChange={(e) => setNewClientModal({ ...newClientModal, address: e.target.value })} />
              </div>
              <div className="field">
                <label>How did they find us?</label>
                <select value={newClientModal.leadSource} onChange={(e) => setNewClientModal({ ...newClientModal, leadSource: e.target.value })}>
                  <option value="">— Not set —</option>
                  {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn ghost" disabled={saving} onClick={() => setNewClientModal(null)}>Cancel</button>
              <button className="btn amber" disabled={saving} onClick={saveNewClient}>{saving ? 'Saving…' : 'Save Client'}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
