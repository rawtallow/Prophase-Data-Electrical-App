'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast, confirmDialog } from '../ui-feedback';
import Modal from '../modal';
import { slug, toDateInputValue as dstr, toDisplayDate as fmtDate } from '../../../lib/format';
import { getList } from '../../../lib/api';

const STATUSES = ['Quoted', 'Scheduled', 'In Progress', 'On Hold', 'Awaiting Parts', 'Complete', 'Cancelled'];
const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];
const JOB_TYPES = ['Call Out', 'Scheduled / Preventative Maintenance', 'Quoted Job'];

function emptyQuickJob() {
  return { clientName: '', jobTitle: '', jobDescription: '', scheduledDate: '', priority: 'Medium', status: 'Quoted' };
}

// Small per-row "⋮" options menu for the less-frequent actions — everything
// else (viewing, editing) now happens by clicking into the job's own detail
// page. Same shape as quotes-app.js's RowMenu.
function RowMenu({ children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) { if (!ref.current?.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="row-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="row-menu-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="More actions">⋮</button>
      {open && <div className="row-menu-list" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

export default function JobsApp({ initialJobs, clients, employees, canManageJobs }) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    try {
      setJobs(await getList('/api/jobs'));
    } catch (err) {
      toast.error(err.message);
    }
  }

  function onClientNameChange(name) {
    const match = clients.find((c) => c.name.toLowerCase() === name.toLowerCase());
    setQuick({ ...quick, clientName: name, clientId: match ? match.id : '' });
  }

  async function createJob() {
    if (!quick.clientName.trim()) return toast.error('Client name is required');
    setSaving(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quick)
      });
      if (res.ok) {
        const created = await res.json();
        router.push(`/jobs/${created.id}`);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not create job');
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
      const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Job deleted');
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete job');
      }
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(id) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/jobs/${id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const created = await res.json();
        toast.success('Job duplicated');
        router.push(`/jobs/${created.id}`);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not duplicate job');
        setBusyId(null);
      }
    } catch {
      toast.error('Could not duplicate job');
      setBusyId(null);
    }
  }

  const list = jobs.filter((j) => {
    if (statusFilter && j.status !== statusFilter) return false;
    if (priorityFilter && j.priority !== priorityFilter) return false;
    if (typeFilter && j.job_type !== typeFilter) return false;
    if (assignedFilter && !(j.assigned_names || '').includes(assignedFilter)) return false;
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
          <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)}>
            <option value="">All Technicians</option>
            {employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
          </select>
          <input placeholder="Search customer or #" value={search} onChange={(e) => setSearch(e.target.value)} />
          <a className="btn ghost sm" href="/jobs/calendar">Calendar</a>
          {canManageJobs && <button className="btn amber sm" onClick={() => setQuick(emptyQuickJob())}>+ New Job</button>}
        </div>
      </div>
      <div className="panel card-table">
        <table>
          <thead>
            <tr>
              <th>Job #</th><th>Client</th><th>Site</th><th>Assigned</th><th>Priority</th><th>Status</th><th>Scheduled</th><th>Last Updated</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((j) => (
              <tr key={j.id} onClick={() => router.push(`/jobs/${j.id}`)} style={{ cursor: 'pointer' }}>
                <td data-label="Job #" style={{ color: 'var(--amber-dark)', fontWeight: 650 }}>{j.job_number}</td>
                <td data-label="Client">{j.client_name}</td>
                <td data-label="Site">{j.site_address || '—'}</td>
                <td data-label="Assigned">{j.assigned_names || '—'}</td>
                <td data-label="Priority"><span className={`badge ${slug(j.priority)}`}>{j.priority}</span></td>
                <td data-label="Status"><span className={`badge ${slug(j.status)}`}>{j.status}</span></td>
                <td data-label="Scheduled">{dstr(j.scheduled_date) || '—'}</td>
                <td data-label="Last Updated">{j.updated_at ? fmtDate(j.updated_at) : '—'}</td>
                <td className="cell-actions" data-label="">
                  <RowMenu>
                    {canManageJobs && <button className="btn ghost sm" disabled={busyId === j.id} onClick={() => duplicate(j.id)}>{busyId === j.id ? '…' : 'Duplicate'}</button>}
                    {canManageJobs && <button className="btn danger sm" disabled={busyId === j.id} onClick={() => del(j.id)}>{busyId === j.id ? '…' : 'Delete'}</button>}
                  </RowMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No jobs match your filters.</div>}
      </div>

      <Modal open={!!quick}>
        {quick && (
          <>
            <h3>New Job</h3>
            <div className="field">
              <label>Customer Name *</label>
              <input list="client-names" value={quick.clientName} onChange={(e) => onClientNameChange(e.target.value)} />
              <datalist id="client-names">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            </div>
            <div className="field">
              <label>Job Title</label>
              <input value={quick.jobTitle} onChange={(e) => setQuick({ ...quick, jobTitle: e.target.value })} />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea rows={2} value={quick.jobDescription} onChange={(e) => setQuick({ ...quick, jobDescription: e.target.value })} />
            </div>
            <div className="grid-3">
              <div className="field">
                <label>Scheduled Date</label>
                <input type="date" value={quick.scheduledDate} onChange={(e) => setQuick({ ...quick, scheduledDate: e.target.value })} />
              </div>
              <div className="field">
                <label>Priority</label>
                <select value={quick.priority} onChange={(e) => setQuick({ ...quick, priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select value={quick.status} onChange={(e) => setQuick({ ...quick, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <p className="small-note">Assignment, site address, materials, documents, and everything else can be filled in on the job's own page after it's created.</p>
            <div className="modal-actions">
              <button className="btn ghost" disabled={saving} onClick={() => setQuick(null)}>Cancel</button>
              <button className="btn amber" disabled={saving} onClick={createJob}>{saving ? 'Creating…' : 'Create Job'}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
