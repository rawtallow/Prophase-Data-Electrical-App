'use client';
import { useState, useRef } from 'react';

export default function BackupPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);

  async function exportBackup() {
    setBusy(true);
    const res = await fetch('/api/backup/export');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prophase-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBusy(false);
  }

  function pickFile() { fileRef.current.click(); }

  async function importBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('This will replace ALL current clients, quotes, jobs, payroll, and parts data with the backup file. User accounts are not affected. Continue?')) {
      e.target.value = '';
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      setMsg(res.ok ? 'Backup restored successfully.' : result.error || 'Restore failed.');
    } catch {
      setMsg('Could not read that file.');
    }
    setBusy(false);
    e.target.value = '';
  }

  return (
    <>
      <h2 className="section-title">Backup &amp; Restore</h2>
      <div className="panel">
        <p className="small-note" style={{ marginBottom: 16 }}>
          Export downloads everything — clients, assets, quotes, jobs, payroll, owner draws, and spare parts —
          as a JSON file. Import replaces all of that data with the contents of a backup file. User accounts
          and logins are never touched by either action.
        </p>
        {msg && <div className="error-box" style={{ background: '#e4f6ec', color: 'var(--green)', borderColor: '#bfe6cf' }}>{msg}</div>}
        <div className="footer-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn ghost" disabled={busy} onClick={exportBackup}>Export Backup</button>
          <button className="btn ghost" disabled={busy} onClick={pickFile}>Import Backup</button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={importBackup} />
        </div>
      </div>
    </>
  );
}
