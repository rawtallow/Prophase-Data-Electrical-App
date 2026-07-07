'use client';
import { useState } from 'react';
import { toast, confirmDialog } from '../ui-feedback';
import Modal from '../modal';
import { toDisplayDate as fmtDate } from '../../../lib/format';

export default function UsersApp({ initialUsers, myId }) {
  const [users, setUsers] = useState(initialUsers);
  const [modal, setModal] = useState(null); // {id?, name, email, role, active, password?, newPassword?}
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    const rows = await fetch('/api/users').then((r) => r.json());
    setUsers(rows);
  }

  function openNew() { setModal({ name: '', email: '', role: 'employee', active: true, password: '' }); setError(''); }
  function openEdit(u) { setModal({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, newPassword: '' }); setError(''); }

  async function save() {
    setError('');
    setSaving(true);
    try {
      const method = modal.id ? 'PUT' : 'POST';
      const url = modal.id ? `/api/users/${modal.id}` : '/api/users';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modal) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not save user'); return; }
      toast.success(modal.id ? 'Account updated' : 'Account created');
      setModal(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    const ok = await confirmDialog('Delete this account? They will no longer be able to log in.', {
      title: 'Delete account',
      confirmLabel: 'Delete Account',
      danger: true
    });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Account deleted');
        await refresh();
      } else {
        const d = await res.json();
        toast.error(d.error || 'Could not delete account');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Users</h2>
        <button className="btn amber sm" onClick={openNew}>+ New Account</button>
      </div>
      <div className="panel small-note" style={{ marginBottom: 14 }}>
        Admin and Manager have full access to every feature, including payroll, owner draws, and backups.
        Employee accounts can view/update the Job Log, use Spare Parts, and view client asset info — no pricing, payroll, or client financials.
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}{u.id === myId ? ' (you)' : ''}</td>
                <td>{u.email}</td>
                <td><span className={`badge ${u.role}`}>{u.role}</span></td>
                <td><span className={`badge ${u.active ? 'activestatus' : 'inactive'}`}>{u.active ? 'Active' : 'Disabled'}</span></td>
                <td>{fmtDate(u.created_at)}</td>
                <td>
                  <div className="row-actions">
                    <button className="btn ghost sm" disabled={busyId === u.id} onClick={() => openEdit(u)}>Edit</button>
                    {u.id !== myId && (
                      <button className="btn danger sm" disabled={busyId === u.id} onClick={() => del(u.id)}>
                        {busyId === u.id ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!modal}>
        {modal && (
          <>
            <h3>{modal.id ? 'Edit Account' : 'New Account'}</h3>
            {error && <div className="error-box">{error}</div>}
            <div className="field"><label>Name *</label><input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} /></div>
            <div className="field"><label>Email *</label><input type="email" value={modal.email} onChange={(e) => setModal({ ...modal, email: e.target.value })} /></div>
            <div className="grid-2">
              <div className="field">
                <label>Role</label>
                <select value={modal.role} disabled={modal.id === myId} onChange={(e) => setModal({ ...modal, role: e.target.value })}>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select value={modal.active ? '1' : '0'} disabled={modal.id === myId} onChange={(e) => setModal({ ...modal, active: e.target.value === '1' })}>
                  <option value="1">Active</option>
                  <option value="0">Disabled</option>
                </select>
              </div>
            </div>
            {modal.id ? (
              <div className="field">
                <label>Reset Password (leave blank to keep current)</label>
                <input type="password" minLength={8} value={modal.newPassword || ''} onChange={(e) => setModal({ ...modal, newPassword: e.target.value })} />
              </div>
            ) : (
              <div className="field">
                <label>Temporary Password (min. 8 characters) *</label>
                <input type="password" minLength={8} value={modal.password} onChange={(e) => setModal({ ...modal, password: e.target.value })} />
                <div className="small-note">Share this with them directly — have them change it after their first login isn't built in yet, so pick something they can update to later if needed.</div>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn ghost" disabled={saving} onClick={() => setModal(null)}>Cancel</button>
              <button className="btn amber" disabled={saving} onClick={save}>
                {saving ? 'Saving…' : modal.id ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
