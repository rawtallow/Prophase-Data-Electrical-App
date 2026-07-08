'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast, confirmDialog } from '../ui-feedback';
import Modal from '../modal';
import { money, slug, toDateInputValue as dstr } from '../../../lib/format';
import { CONTRACT_FREQUENCIES, CONTRACT_STATUSES } from '../../../lib/maintenance-frequency';

// Warns once a contract's next visit is within 14 days (or already overdue).
function dueWarning(nextDueDate) {
  const days = (new Date(nextDueDate) - new Date()) / 86400000;
  if (days < 0) return 'overdue';
  if (days <= 14) return 'soon';
  return null;
}

export default function MaintenanceApp({ initialContracts, clients, canManage }) {
  const router = useRouter();
  const [contracts, setContracts] = useState(initialContracts);
  const [statusFilter, setStatusFilter] = useState('Active');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    const rows = await fetch('/api/maintenance-contracts').then((r) => r.json());
    setContracts(rows);
  }

  function emptyContract() {
    return {
      clientName: '', clientId: '', title: '', description: '',
      frequency: 'Quarterly', startDate: dstr(new Date()), amount: 0, notes: ''
    };
  }
  function openNew() { setModal(emptyContract()); }
  function openEdit(c) {
    setModal({
      id: c.id,
      clientId: c.client_id || '',
      clientName: c.client_name,
      title: c.title,
      description: c.description || '',
      frequency: c.frequency,
      nextDueDate: dstr(c.next_due_date),
      amount: c.amount,
      status: c.status,
      notes: c.notes || ''
    });
  }
  function onClientNameChange(name) {
    const match = clients.find((c) => c.name.toLowerCase() === name.toLowerCase());
    setModal({ ...modal, clientName: name, clientId: match ? match.id : '' });
  }

  async function save() {
    if (!modal.clientName.trim()) return toast.error('Customer name is required');
    if (!modal.title.trim()) return toast.error('Title is required');
    setSaving(true);
    try {
      const method = modal.id ? 'PUT' : 'POST';
      const url = modal.id ? `/api/maintenance-contracts/${modal.id}` : '/api/maintenance-contracts';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modal)
      });
      if (res.ok) {
        toast.success(modal.id ? 'Contract updated' : 'Contract created');
        setModal(null);
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save contract');
      }
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    const ok = await confirmDialog('Delete this maintenance contract? This cannot be undone.', {
      title: 'Delete contract',
      confirmLabel: 'Delete Contract',
      danger: true
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await fetch(`/api/maintenance-contracts/${id}`, { method: 'DELETE' });
      toast.success('Contract deleted');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function generateJob(c) {
    const ok = await confirmDialog(`Create a job for "${c.title}" (${c.client_name}) now, and push the next due date forward?`, {
      title: 'Generate job',
      confirmLabel: 'Generate Job'
    });
    if (!ok) return;
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/maintenance-contracts/${c.id}/generate-job`, { method: 'POST' });
      if (res.ok) {
        toast.success('Job created — next visit scheduled');
        router.push('/jobs');
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not generate job');
      }
    } finally {
      setBusyId(null);
    }
  }

  async function setStatus(c, status) {
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/maintenance-contracts/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: c.client_id, clientName: c.client_name, title: c.title, description: c.description,
          frequency: c.frequency, nextDueDate: dstr(c.next_due_date), amount: c.amount, status, notes: c.notes
        })
      });
      if (res.ok) {
        toast.success(status === 'Paused' ? 'Contract paused' : 'Contract resumed');
        await refresh();
      } else {
        toast.error('Could not update contract');
      }
    } finally {
      setBusyId(null);
    }
  }

  const list = contracts.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!c.client_name.toLowerCase().includes(s) && !c.title.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const active = contracts.filter((c) => c.status === 'Active');
  const dueSoonCount = active.filter((c) => dueWarning(c.next_due_date) === 'soon').length;
  const overdueCount = active.filter((c) => dueWarning(c.next_due_date) === 'overdue').length;

  return (
    <>
      <div className="cards">
        <div className="card"><div className="label">Active Contracts</div><div className="value">{active.length}</div></div>
        <div className={`card${dueSoonCount ? ' warn' : ''}`}><div className="label">Due Within 14 Days</div><div className="value">{dueSoonCount}</div></div>
        <div className={`card${overdueCount ? ' warn' : ''}`}><div className="label">Overdue</div><div className="value">{overdueCount}</div></div>
      </div>

      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Maintenance Contracts</h2>
        <div className="filters">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {CONTRACT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input placeholder="Search customer or title" value={search} onChange={(e) => setSearch(e.target.value)} />
          {canManage && <button className="btn amber sm" onClick={openNew}>+ New Contract</button>}
        </div>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Customer</th><th>Title</th><th>Frequency</th><th>Next Due</th>
              <th className="num">Amount</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const busy = busyId === c.id;
              const warn = c.status === 'Active' ? dueWarning(c.next_due_date) : null;
              return (
                <tr key={c.id}>
                  <td>{c.client_name}</td>
                  <td>{c.title}</td>
                  <td>{c.frequency}</td>
                  <td>
                    <span className={`badge ${warn ? 'lowstock' : 'instock'}`}>{dstr(c.next_due_date)}</span>
                  </td>
                  <td className="num">{money(c.amount)}</td>
                  <td><span className={`badge ${slug(c.status)}`}>{c.status}</span></td>
                  <td>
                    <div className="row-actions">
                      {canManage && c.status === 'Active' && (
                        <button className="btn amber sm" disabled={busy} onClick={() => generateJob(c)}>Generate Job</button>
                      )}
                      {canManage && <button className="btn ghost sm" disabled={busy} onClick={() => openEdit(c)}>Edit</button>}
                      {canManage && c.status === 'Active' && (
                        <button className="btn ghost sm" disabled={busy} onClick={() => setStatus(c, 'Paused')}>Pause</button>
                      )}
                      {canManage && c.status === 'Paused' && (
                        <button className="btn ghost sm" disabled={busy} onClick={() => setStatus(c, 'Active')}>Resume</button>
                      )}
                      {canManage && <button className="btn danger sm" disabled={busy} onClick={() => del(c.id)}>{busy ? '…' : 'Delete'}</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No maintenance contracts match your filters.</div>}
      </div>

      <Modal open={!!modal}>
        {modal && (
          <>
            <h3>{modal.id ? `Edit Contract` : 'New Maintenance Contract'}</h3>
            <div className="grid-2">
              <div className="field">
                <label>Customer Name *</label>
                <input list="client-names" value={modal.clientName} onChange={(e) => onClientNameChange(e.target.value)} />
                <datalist id="client-names">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
              </div>
              <div className="field">
                <label>Title *</label>
                <input placeholder="e.g. Quarterly RCD Testing" value={modal.title} onChange={(e) => setModal({ ...modal, title: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Description</label>
              <textarea rows={2} value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} />
            </div>
            <div className="grid-3">
              <div className="field">
                <label>Frequency</label>
                <select value={modal.frequency} onChange={(e) => setModal({ ...modal, frequency: e.target.value })}>
                  {CONTRACT_FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>
              {modal.id ? (
                <div className="field">
                  <label>Next Due Date</label>
                  <input type="date" value={modal.nextDueDate} onChange={(e) => setModal({ ...modal, nextDueDate: e.target.value })} />
                </div>
              ) : (
                <div className="field">
                  <label>Start Date</label>
                  <input type="date" value={modal.startDate} onChange={(e) => setModal({ ...modal, startDate: e.target.value })} />
                </div>
              )}
              <div className="field">
                <label>Amount per Visit ($)</label>
                <input type="number" min="0" step="0.01" value={modal.amount} onChange={(e) => setModal({ ...modal, amount: e.target.value })} />
              </div>
            </div>
            {modal.id && (
              <div className="field">
                <label>Status</label>
                <select value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value })}>
                  {CONTRACT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label>Notes</label>
              <textarea rows={2} value={modal.notes} onChange={(e) => setModal({ ...modal, notes: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn ghost" disabled={saving} onClick={() => setModal(null)}>Cancel</button>
              <button className="btn amber" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Contract'}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
