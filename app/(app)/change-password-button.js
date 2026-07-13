'use client';
import { useState } from 'react';
import { toast } from './ui-feedback';
import Modal from './modal';

export default function ChangePasswordButton() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  async function save() {
    if (newPassword.length < 8) return toast.error('New password must be at least 8 characters');
    if (newPassword !== confirmPassword) return toast.error('New passwords do not match');
    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (res.ok) {
        toast.success('Password updated');
        setOpen(false);
        reset();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not update password');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn ghost sm">
        Change Password
      </button>
      <Modal open={open} onBackdropClick={() => setOpen(false)}>
        <h3>Change Password</h3>
        <div className="field">
          <label>Current Password</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className="field">
          <label>New Password</label>
          <input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className="field">
          <label>Confirm New Password</label>
          <input type="password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn ghost" disabled={saving} onClick={() => { setOpen(false); reset(); }}>Cancel</button>
          <button className="btn amber" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Password'}</button>
        </div>
      </Modal>
    </>
  );
}
