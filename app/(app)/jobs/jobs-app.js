'use client';
import { useState } from 'react';
import { toast, confirmDialog } from '../ui-feedback';
import Modal from '../modal';
import { money, slug, toDateInputValue as dstr } from '../../../lib/format';

const STATUSES = ['Quoted', 'Scheduled', 'In Progress', 'Complete'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const JOB_TYPES = ['Call Out', 'Scheduled / Preventative Maintenance', 'Quoted Job'];

export default function JobsApp({ initialJobs, clients, assets, laborByJob, fullAccess, canManageJobs }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    const rows = await fetch('/api/jobs').then((r) => r.json());
    setJobs(rows);
  }

  function emptyJob() {
    return { clientId: '', clientName: '', assetId: '', jobDescription: '', scheduledDate: '', status: 'Quoted', priority: 'Medium', jobType: 'Quoted Job', amountInvoiced: 0, amountPaid: 0, notes: '' };
  }

  function openNew() { setModal(emptyJob()); }
  function openEdit(j) {
    setModal({
      id: j.id,
      clientId: j.client_id || '',
      clientName: j.client_name,
      assetId: j.asset_id || '',
      jobDescription: j.job_description || '',
      scheduledDate: dstr(j.scheduled_date),
      status: j.status,
      priority: j.priority || 'Medium',
      jobType: j.job_type || 'Quoted Job',
      amountInvoiced: j.amount_invoiced,
      amountPaid: j.amount_paid,
      notes: j.notes || '',
      jobNumber: j.job_number
    });
  }

  // Keeps clientId in sync with whatever name is typed/picked from the
  // customer datalist, so jobs are actually foreign-keyed to a client
  // (previously only client_name text was saved, so a job had no reliable
  // link back to the client's asset history).
  function onClientNameChange(name) {
    const match = clients.find((c) => c.name.toLowerCase() === name.toLowerCase());
    setModal({ ...modal, clientName: name, clientId: match ? match.id : '', assetId: match ? modal.assetId : '' });
  }

  const assetsForClient = modal ? assets.filter((a) => a.client_id === modal.clientId) : [];

  async function save() {
    if (!modal.clientName.trim()) return toast.error('Client name is required');
    setSaving(true);
    try {
      const method = modal.id ? 'PUT' : 'POST';
      const url = modal.id ? `/api/jobs/${modal.id}` : '/api/jobs';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modal)
      });
      if (res.ok) {
        toast.success(modal.id ? 'Job updated' : 'Job created');
        setModal(null);
        await refresh();
      } else {
        const d = await res.json();
        toast.error(d.error || 'Could not save job');
      }
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    const ok = await confirmDialog('Delete this job? This cannot be undone.', {
      title: 'Delete job',
      confirmLabel: 'Delete Job',
      danger: true
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      toast.success('Job deleted');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  const list = jobs.filter((j) => {
    if (statusFilter && j.status !== statusFilter) return false;
    if (priorityFilter && j.priority !== priorityFilter) return false;
    if (typeFilter && j.job_type !== typeFilter) return false;
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
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">All Priorities</option>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All Job Types</option>
            {JOB_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input placeholder="Search customer or #" value={search} onChange={(e) => setSearch(e.target.value)} />
          {canManageJobs && <button className="btn amber sm" onClick={openNew}>+ New Job</button>}
        </div>
      </div>
      <div className="panel card-table">
        <table>
          <thead>
            <tr>
              <th>Job #</th><th>Priority</th><th>Type</th><th>Customer</th><th>Description</th><th>Scheduled</th><th>Status</th>
              {fullAccess && <><th className="num">Invoiced</th><th className="num">Paid</th><th className="num">Balance</th><th className="num">Labor Cost</th><th className="num">Margin</th></>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((j) => {
              const balance = Number(j.amount_invoiced) - Number(j.amount_paid);
              const labor = laborByJob[j.id] || 0;
              const margin = Number(j.amount_invoiced) - labor;
              const busy = busyId === j.id;
              return (
                <tr key={j.id}>
                  <td data-label="Job #">{j.job_number}</td>
                  <td data-label="Priority"><span className={`badge ${slug(j.priority)}`}>{j.priority}</span></td>
                  <td data-label="Type"><span className={`badge ${slug(j.job_type)}`}>{j.job_type}</span></td>
                  <td data-label="Customer">{j.client_name}</td>
                  <td data-label="Description">{j.job_description || '—'}</td>
                  <td data-label="Scheduled">{dstr(j.scheduled_date) || '—'}</td>
                  <td data-label="Status"><span className={`badge ${slug(j.status)}`}>{j.status}</span></td>
                  {fullAccess && (
                    <>
                      <td className="num" data-label="Invoiced">{money(j.amount_invoiced)}</td>
                      <td className="num" data-label="Paid">{money(j.amount_paid)}</td>
                      <td className="num" data-label="Balance" style={{ fontWeight: 700, color: balance > 0 ? 'var(--red)' : 'var(--green)' }}>{money(balance)}</td>
                      <td className="num" data-label="Labor Cost">{money(labor)}</td>
                      <td className="num" data-label="Margin" style={{ color: margin >= 0 ? 'var(--green)' : 'var(--red)' }}>{money(margin)}</td>
                    </>
                  )}
                  <td className="cell-actions" data-label="">
                    <div className="row-actions">
                      <button className="btn ghost sm" disabled={busy} onClick={() => openEdit(j)}>Edit</button>
                      {fullAccess && j.status === 'Complete' && (
                        <a className="btn ghost sm" href={`/api/jobs/${j.id}/warranty`}>Warranty</a>
                      )}
                      {canManageJobs && <button className="btn danger sm" disabled={busy} onClick={() => del(j.id)}>{busy ? 'Deleting…' : 'Delete'}</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No jobs match your filters.</div>}
      </div>

      <Modal open={!!modal}>
        {modal && (
          <>
            <h3>{modal.id ? `Edit Job ${modal.jobNumber}` : 'New Job'}</h3>
            <div className="grid-2">
              <div className="field">
                <label>Customer Name *</label>
                <input list="client-names" disabled={!!modal.id && !canManageJobs} value={modal.clientName} onChange={(e) => onClientNameChange(e.target.value)} />
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
            <div className="field">
              <label>Asset / Equipment (optional)</label>
              <select
                disabled={(!!modal.id && !canManageJobs) || !modal.clientId}
                value={modal.assetId}
                onChange={(e) => setModal({ ...modal, assetId: e.target.value })}
              >
                <option value="">
                  {modal.clientId ? '— Not tied to a specific asset —' : 'Pick a customer with saved assets first'}
                </option>
                {assetsForClient.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Job Type</label>
                <select disabled={!!modal.id && !canManageJobs} value={modal.jobType} onChange={(e) => setModal({ ...modal, jobType: e.target.value })}>
                  {JOB_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                <select value={modal.priority} onChange={(e) => setModal({ ...modal, priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
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
              <button className="btn ghost" disabled={saving} onClick={() => setModal(null)}>Cancel</button>
              <button className="btn amber" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Job'}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
