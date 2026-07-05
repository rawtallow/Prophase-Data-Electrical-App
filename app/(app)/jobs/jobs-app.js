'use client';
import { useState } from 'react';

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function slug(s) { return String(s).toLowerCase().replace(/\s+/g, ''); }
function dstr(d) { return d ? String(d).slice(0, 10) : ''; }

const STATUSES = ['Quoted', 'Scheduled', 'In Progress', 'Complete'];

export default function JobsApp({ initialJobs, clients, laborByJob, fullAccess, canManageJobs }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);

  async function refresh() {
    const rows = await fetch('/api/jobs').then((r) => r.json());
    setJobs(rows);
  }

  function emptyJob() {
    return { clientName: '', jobDescription: '', scheduledDate: '', status: 'Quoted', amountInvoiced: 0, amountPaid: 0, notes: '' };
  }

  function openNew() { setModal(emptyJob()); }
  function openEdit(j) {
    setModal({
      id: j.id,
      clientName: j.client_name,
      jobDescription: j.job_description || '',
      scheduledDate: dstr(j.scheduled_date),
      status: j.status,
      amountInvoiced: j.amount_invoiced,
      amountPaid: j.amount_paid,
      notes: j.notes || '',
      jobNumber: j.job_number
    });
  }

  async function save() {
    if (!modal.clientName.trim()) return alert('Client name is required');
    const method = modal.id ? 'PUT' : 'POST';
    const url = modal.id ? `/api/jobs/${modal.id}` : '/api/jobs';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modal)
    });
    if (res.ok) {
      setModal(null);
      await refresh();
    } else {
      const d = await res.json();
      alert(d.error || 'Could not save job');
    }
  }

  async function del(id) {
    if (!confirm('Delete this job? This cannot be undone.')) return;
    await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
    await refresh();
  }

  const list = jobs.filter((j) => {
    if (statusFilter && j.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!j.client_name.toLowerCase().includes(s) && !j.job_number.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Job Log</h2>
        <div className="filters">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input placeholder="Search customer or #" value={search} onChange={(e) => setSearch(e.target.value)} />
          {canManageJobs && <button className="btn amber sm" onClick={openNew}>+ New Job</button>}
        </div>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Job #</th><th>Customer</th><th>Description</th><th>Scheduled</th><th>Status</th>
              {fullAccess && <><th className="num">Invoiced</th><th className="num">Paid</th><th className="num">Balance</th><th className="num">Labor Cost</th><th className="num">Margin</th></>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((j) => {
              const balance = Number(j.amount_invoiced) - Number(j.amount_paid);
              const labor = laborByJob[j.id] || 0;
              const margin = Number(j.amount_invoiced) - labor;
              return (
                <tr key={j.id}>
                  <td>{j.job_number}</td>
                  <td>{j.client_name}</td>
                  <td>{j.job_description || '—'}</td>
                  <td>{dstr(j.scheduled_date) || '—'}</td>
                  <td><span className={`badge ${slug(j.status)}`}>{j.status}</span></td>
                  {fullAccess && (
                    <>
                      <td className="num">{money(j.amount_invoiced)}</td>
                      <td className="num">{money(j.amount_paid)}</td>
                      <td className="num" style={{ fontWeight: 700, color: balance > 0 ? 'var(--red)' : 'var(--green)' }}>{money(balance)}</td>
                      <td className="num">{money(labor)}</td>
                      <td className="num" style={{ color: margin >= 0 ? 'var(--green)' : 'var(--red)' }}>{money(margin)}</td>
                    </>
                  )}
                  <td>
                    <div className="row-actions">
                      <button className="btn ghost sm" onClick={() => openEdit(j)}>Edit</button>
                      {canManageJobs && <button className="btn danger sm" onClick={() => del(j.id)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No jobs match your filters.</div>}
      </div>

      {modal && (
        <div className="modal-overlay active">
          <div className="modal">
            <h3>{modal.id ? `Edit Job ${modal.jobNumber}` : 'New Job'}</h3>
            <div className="grid-2">
              <div className="field">
                <label>Customer Name *</label>
                <input list="client-names" disabled={!!modal.id && !canManageJobs} value={modal.clientName} onChange={(e) => setModal({ ...modal, clientName: e.target.value })} />
                <datalist id="client-names">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
              </div>
              <div className="field">
                <label>Scheduled Date</label>
                <input type="date" value={modal.scheduledDate} onChange={(e) => setModal({ ...modal, scheduledDate: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Job Description</label>
              <textarea rows={2} disabled={!!modal.id && !canManageJobs} value={modal.jobDescription} onChange={(e) => setModal({ ...modal, jobDescription: e.target.value })} />
            </div>
            <div className="grid-3">
              <div className="field">
                <label>Status</label>
                <select value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              {fullAccess && (
                <>
                  <div className="field">
                    <label>Amount Invoiced ($)</label>
                    <input type="number" min="0" step="0.01" value={modal.amountInvoiced} onChange={(e) => setModal({ ...modal, amountInvoiced: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Amount Paid ($)</label>
                    <input type="number" min="0" step="0.01" value={modal.amountPaid} onChange={(e) => setModal({ ...modal, amountPaid: e.target.value })} />
                  </div>
                </>
              )}
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea rows={2} value={modal.notes} onChange={(e) => setModal({ ...modal, notes: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn amber" onClick={save}>Save Job</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
