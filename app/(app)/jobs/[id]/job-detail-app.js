'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast, confirmDialog } from '../../ui-feedback';
import { money, slug, toDateInputValue as dstr, toDisplayDate as fmtDate } from '../../../../lib/format';
import { getJson, PENDING_APPROVAL_MESSAGE } from '../../../../lib/api';

const TABS = ['Overview', 'Details', 'Schedule', 'Assets', 'Materials', 'Documents', 'Notes', 'History', 'Financials'];
const STATUSES = ['Quoted', 'Scheduled', 'In Progress', 'On Hold', 'Awaiting Parts', 'Complete', 'Cancelled'];
const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];
const JOB_TYPES = ['Call Out', 'Scheduled / Preventative Maintenance', 'Quoted Job'];
const DOC_CATEGORIES = ['Photo', 'Document', 'Permit', 'Other'];
const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'];

function today() { return dstr(new Date()); }
function emptyPaymentForm() { return { amount: '', date: today(), method: 'Bank Transfer', note: '' }; }
function emptyHourForm() { return { employeeId: '', date: today(), hours: '', notes: '' }; }

export default function JobDetailApp({
  initialJob, initialLineItems, initialPayments, initialAssignees, initialDocuments, initialActivity, initialHourLogs,
  clients, employees, assets, linkedQuote, laborCost, actualHours, materialsCost, fullAccess, canManageJobs
}) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [lineItems, setLineItems] = useState(initialLineItems.map((li) => ({ description: li.description, qty: li.qty, price: li.price })));
  const [assigneeIds, setAssigneeIds] = useState(initialAssignees.map((a) => a.employee_id));
  const [payments, setPayments] = useState(initialPayments);
  const [documents, setDocuments] = useState(initialDocuments);
  const [activity, setActivity] = useState(initialActivity);
  const [hourLogs, setHourLogs] = useState(initialHourLogs);
  const [tab, setTab] = useState('Overview');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const [hourForm, setHourForm] = useState(emptyHourForm());
  const [loggingHours, setLoggingHours] = useState(false);
  const [deletingHourId, setDeletingHourId] = useState(null);
  const loggedHours = hourLogs.reduce((s, h) => s + Number(h.hours), 0);

  const [noteDraft, setNoteDraft] = useState('');
  const [postingNote, setPostingNote] = useState(false);
  const [uploadForm, setUploadForm] = useState({ label: '', category: 'Photo' });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [deletingDocId, setDeletingDocId] = useState(null);

  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm());
  const [savingPayment, setSavingPayment] = useState(false);
  const [voidingId, setVoidingId] = useState(null);

  function set(field, value) { setJob({ ...job, [field]: value }); }

  function toggleAssignee(id) {
    setAssigneeIds(assigneeIds.includes(id) ? assigneeIds.filter((x) => x !== id) : [...assigneeIds, id]);
  }

  // Keeps client_id in sync with whatever name is typed/picked from the
  // datalist, same pattern as quote-detail-app.js.
  function onClientNameChange(name) {
    const match = clients.find((c) => c.name.toLowerCase() === name.toLowerCase());
    setJob({ ...job, client_name: name, client_id: match ? match.id : null });
  }

  function updateItem(i, field, value) {
    const next = [...lineItems];
    next[i] = { ...next[i], [field]: value };
    setLineItems(next);
  }
  function addItem() { setLineItems([...lineItems, { description: '', qty: 1, price: 0 }]); }
  function removeItem(i) { setLineItems(lineItems.filter((_, idx) => idx !== i)); }
  const itemsSubtotal = lineItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.price) || 0), 0);
  const itemsTotal = itemsSubtotal + itemsSubtotal * 0.1;

  const currentClient = clients.find((c) => c.id === job.client_id) || null;
  const assetsForClient = assets.filter((a) => a.client_id === job.client_id);

  // Every tab shares this one Save — the PUT always replaces the whole
  // record, so whichever tab's Save button was clicked, the payload carries
  // the CURRENT shared draft state for every field, not just the ones that
  // tab visually owns. See quote-detail-app.js for the same convention.
  async function saveJob(successMsg) {
    if (!job.client_name.trim()) return toast.error('Client name is required');
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: job.client_id,
          assetId: job.asset_id,
          clientName: job.client_name,
          jobTitle: job.job_title,
          jobDescription: job.job_description,
          siteAddress: job.site_address,
          // job.scheduled_date/start_date can still be the raw Date object
          // handed down from the Server Component on first load (RSC props
          // bypass the API's serializeDates entirely) — JSON.stringify-ing a
          // Date calls its UTC toJSON(), which can land on the wrong
          // calendar day once the server reads it back. Always send plain
          // date strings.
          scheduledDate: dstr(job.scheduled_date),
          startDate: dstr(job.start_date),
          estimatedHours: job.estimated_hours,
          status: job.status,
          priority: job.priority,
          jobType: job.job_type,
          amountInvoiced: job.amount_invoiced,
          notes: job.notes,
          customerNotes: job.customer_notes,
          assigneeIds,
          lineItems
        })
      });
      if (res.ok) {
        // The PUT response is just the updated job row — re-fetch the full
        // nested object so any server-side side effect (auto-logged status/
        // priority activity rows, the recomputed assignee list) shows up
        // immediately without a manual page reload.
        const full = await getJson(`/api/jobs/${job.id}`);
        applyFull(full);
        toast.success(successMsg || 'Job updated');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save job');
      }
    } finally {
      setSaving(false);
    }
  }

  function applyFull(full) {
    setJob(full);
    setLineItems((full.lineItems || []).map((li) => ({ description: li.description, qty: li.qty, price: li.price })));
    setAssigneeIds((full.assignees || []).map((a) => a.employee_id));
    setPayments(full.payments || []);
    setDocuments(full.documents || []);
    setActivity(full.activity || []);
    setHourLogs(full.hourLogs || []);
  }

  async function logHours() {
    if (!(Number(hourForm.hours) > 0)) return toast.error('Enter hours greater than 0');
    setLoggingHours(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/hours`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hourForm)
      });
      if (res.ok) {
        const created = await res.json();
        setHourLogs([created, ...hourLogs]);
        setHourForm(emptyHourForm());
        toast.success('Hours logged');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not log hours');
      }
    } finally {
      setLoggingHours(false);
    }
  }
  async function deleteHourLog(logId) {
    const ok = await confirmDialog('Delete this hour log entry? This cannot be undone.', {
      title: 'Delete hour log',
      confirmLabel: 'Delete Entry',
      danger: true
    });
    if (!ok) return;
    setDeletingHourId(logId);
    try {
      const res = await fetch(`/api/jobs/${job.id}/hours/${logId}`, { method: 'DELETE' });
      if (res.ok) {
        setHourLogs(hourLogs.filter((h) => h.id !== logId));
        toast.success('Entry deleted');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete entry');
      }
    } finally {
      setDeletingHourId(null);
    }
  }

  async function postNote() {
    if (!noteDraft.trim()) return toast.error('Enter a progress update first');
    setPostingNote(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: noteDraft.trim() })
      });
      if (res.ok) {
        const created = await res.json();
        setActivity([created, ...activity]);
        setNoteDraft('');
        toast.success('Progress update added');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not add update');
      }
    } finally {
      setPostingNote(false);
    }
  }

  async function uploadDocument() {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error('Choose a file first');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('label', uploadForm.label || file.name);
      fd.append('category', uploadForm.category);
      const res = await fetch(`/api/jobs/${job.id}/documents`, { method: 'POST', body: fd });
      if (res.ok) {
        const created = await res.json();
        setDocuments([created, ...documents]);
        setUploadForm({ label: '', category: 'Photo' });
        if (fileRef.current) fileRef.current.value = '';
        toast.success('File uploaded');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not upload file');
      }
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(docId) {
    const ok = await confirmDialog('Delete this file? This cannot be undone.', {
      title: 'Delete file',
      confirmLabel: 'Delete File',
      danger: true
    });
    if (!ok) return;
    setDeletingDocId(docId);
    try {
      const res = await fetch(`/api/jobs/${job.id}/documents/${docId}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments(documents.filter((d) => d.id !== docId));
        toast.success('File deleted');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete file');
      }
    } finally {
      setDeletingDocId(null);
    }
  }

  async function submitPayment() {
    if (!(Number(paymentForm.amount) > 0)) return toast.error('Enter an amount greater than 0');
    setSavingPayment(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentForm)
      });
      if (res.ok) {
        const updated = await res.json();
        setJob(updated);
        setPaymentForm(emptyPaymentForm());
        const full = await getJson(`/api/jobs/${job.id}`);
        applyFull(full);
        toast.success('Payment logged');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not log payment');
      }
    } finally {
      setSavingPayment(false);
    }
  }
  async function voidPayment(paymentId) {
    const ok = await confirmDialog('Void this payment? This cannot be undone.', {
      title: 'Void payment',
      confirmLabel: 'Void Payment',
      danger: true
    });
    if (!ok) return;
    setVoidingId(paymentId);
    try {
      const res = await fetch(`/api/jobs/${job.id}/payments/${paymentId}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        if (d.pending) {
          toast.success(PENDING_APPROVAL_MESSAGE);
        } else {
          const full = await getJson(`/api/jobs/${job.id}`);
          applyFull(full);
          toast.success('Payment voided');
        }
      } else {
        toast.error(d.error || 'Could not void payment');
      }
    } finally {
      setVoidingId(null);
    }
  }

  async function duplicateJob() {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const created = await res.json();
        toast.success('Job duplicated');
        router.push(`/jobs/${created.id}`);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not duplicate job');
        setDuplicating(false);
      }
    } catch {
      toast.error('Could not duplicate job');
      setDuplicating(false);
    }
  }

  async function deleteJob() {
    const ok = await confirmDialog('Delete this job? This cannot be undone.', {
      title: 'Delete job',
      confirmLabel: 'Delete Job',
      danger: true
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        if (d.pending) {
          toast.success(PENDING_APPROVAL_MESSAGE);
          setDeleting(false);
        } else {
          toast.success('Job deleted');
          router.push('/jobs');
        }
      } else {
        toast.error(d.error || 'Could not delete job');
        setDeleting(false);
      }
    } catch {
      toast.error('Could not delete job');
      setDeleting(false);
    }
  }

  const balance = Number(job.amount_invoiced) - Number(job.amount_paid);
  const margin = Number(job.amount_invoiced) - laborCost - materialsCost;
  const canPrintInvoice = fullAccess && Number(job.amount_invoiced) > 0;
  const canWarranty = fullAccess && job.status === 'Complete' && job.completed_date;
  const assignedNames = employees.filter((e) => assigneeIds.includes(e.id)).map((e) => e.name);

  return (
    <>
      <div className="toolbar">
        <div>
          <Link href="/jobs" className="small-note" style={{ display: 'inline-block', marginBottom: 6 }}>&larr; All Jobs</Link>
          <h2 className="section-title" style={{ margin: 0 }}>{job.job_number}{job.job_title ? ` — ${job.job_title}` : ''}</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span className={`badge ${slug(job.priority)}`}>{job.priority}</span>
          <span className={`badge ${slug(job.status)}`}>{job.status}</span>
        </div>
      </div>

      <div className="subtabs">
        {TABS.filter((t) => t !== 'Financials' || fullAccess).map((t) => (
          <a key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)} style={{ cursor: 'pointer' }}>{t}</a>
        ))}
      </div>

      {tab === 'Overview' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <div className="grid-3">
              <div>
                <div className="small-note">Client</div>
                {job.client_id ? <Link href={`/clients/${job.client_id}`}>{job.client_name}</Link> : job.client_name}
              </div>
              <div><div className="small-note">Site Address</div>{job.site_address || '—'}</div>
              <div><div className="small-note">Scheduled</div>{fmtDate(job.scheduled_date)}</div>
            </div>
            <div className="grid-3" style={{ marginTop: 14 }}>
              <div><div className="small-note">Assigned</div>{assignedNames.length ? assignedNames.join(', ') : '—'}</div>
              <div><div className="small-note">Job Type</div>{job.job_type}</div>
              <div><div className="small-note">Last Updated</div>{job.updated_at ? fmtDate(job.updated_at) : '—'}</div>
            </div>
            {job.job_description && (
              <div style={{ marginTop: 14 }}>
                <div className="small-note">Description</div>
                <p style={{ margin: '4px 0 0' }}>{job.job_description}</p>
              </div>
            )}
          </div>

          <div className="panel">
            <h2 className="section-title">Status &amp; Priority</h2>
            <p className="small-note" style={{ marginTop: -8, marginBottom: 12 }}>Any team member can update these at any time.</p>
            <div className="grid-2">
              <div className="field">
                <label>Status</label>
                <select value={job.status} onChange={(e) => set('status', e.target.value)}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                <select value={job.priority} onChange={(e) => set('priority', e.target.value)}>
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="footer-actions">
              <button className="btn amber" disabled={saving} onClick={() => saveJob()}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>

          {linkedQuote && (
            <div className="panel">
              <h2 className="section-title">Linked Quote</h2>
              <p>Converted from <Link href={`/quotes/${linkedQuote.id}`}><strong>{linkedQuote.quote_number}</strong></Link> — <span className={`badge ${slug(linkedQuote.status)}`}>{linkedQuote.status}</span></p>
            </div>
          )}
        </div>
      )}

      {tab === 'Details' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Job</h2>
            <div className="field">
              <label>Job Title</label>
              <input disabled={!fullAccess} value={job.job_title || ''} onChange={(e) => set('job_title', e.target.value)} />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea rows={3} disabled={!fullAccess} value={job.job_description || ''} onChange={(e) => set('job_description', e.target.value)} />
            </div>
            <div className="field">
              <label>Job Type</label>
              <select disabled={!fullAccess} value={job.job_type} onChange={(e) => set('job_type', e.target.value)}>
                {JOB_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="panel">
            <h2 className="section-title">Client &amp; Site</h2>
            <div className="grid-2">
              <div className="field">
                <label>Customer Name *</label>
                <input list="client-names" disabled={!fullAccess} value={job.client_name} onChange={(e) => onClientNameChange(e.target.value)} />
                <datalist id="client-names">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
              </div>
              <div className="field">
                <label>Site / Job Address</label>
                <input value={job.site_address || ''} onChange={(e) => set('site_address', e.target.value)} placeholder={currentClient?.address || 'e.g. different from the client\'s on-file address'} />
              </div>
            </div>
            {currentClient && (
              <p className="small-note">
                On file for {currentClient.name}: {currentClient.phone || '—'} · {currentClient.email || '—'} · {currentClient.address || '—'}
                {job.client_id && <> — <Link href={`/clients/${job.client_id}`}>edit in Client Details</Link></>}
              </p>
            )}
          </div>

          <div className="panel">
            <h2 className="section-title">Assigned Technicians</h2>
            {employees.length === 0 ? (
              <div className="empty">No active employees to assign.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px' }}>
                {employees.map((e) => (
                  <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, cursor: fullAccess ? 'pointer' : 'default' }}>
                    <input type="checkbox" disabled={!fullAccess} checked={assigneeIds.includes(e.id)} onChange={() => toggleAssignee(e.id)} />
                    {e.name}
                  </label>
                ))}
              </div>
            )}
            <div className="footer-actions">
              <button className="btn amber" disabled={saving} onClick={() => saveJob()}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'Schedule' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Dates</h2>
            <div className="grid-3">
              <div className="field">
                <label>Scheduled Date</label>
                <input type="date" value={dstr(job.scheduled_date)} onChange={(e) => set('scheduled_date', e.target.value)} />
              </div>
              <div className="field">
                <label>Start Date</label>
                <input type="date" disabled={!fullAccess} value={dstr(job.start_date)} onChange={(e) => set('start_date', e.target.value)} />
              </div>
              <div className="field">
                <label>Completed Date</label>
                <input type="text" disabled value={job.completed_date ? fmtDate(job.completed_date) : 'Not completed yet'} />
              </div>
            </div>
            <p className="small-note" style={{ marginTop: -6 }}>Completed Date is stamped automatically the first time Status is set to Complete, on the Overview tab.</p>
          </div>

          <div className="panel">
            <h2 className="section-title">Labour Hours</h2>
            <div className="grid-3">
              <div className="field">
                <label>Estimated Hours</label>
                <input type="number" min="0" step="0.25" disabled={!fullAccess} value={job.estimated_hours ?? ''} onChange={(e) => set('estimated_hours', e.target.value)} />
              </div>
              <div className="field">
                <label>Logged Hours</label>
                <input type="text" disabled value={loggedHours.toFixed(2)} />
              </div>
              <div className="field">
                <label>Payroll Hours</label>
                <input type="text" disabled value={fullAccess ? actualHours.toFixed(2) : 'Admin/manager only'} />
              </div>
            </div>
            <p className="small-note" style={{ marginTop: -6 }}>
              Logged Hours is what's entered below — a running field log, separate from Payroll Hours (the sum of this job's actual Payroll pay-run allocations, which is what drives labour cost).
            </p>
            {fullAccess && (
              <div className="footer-actions">
                <button className="btn amber" disabled={saving} onClick={() => saveJob()}>{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            )}
          </div>

          <div className="panel">
            <h2 className="section-title">Hour Log</h2>
            {hourLogs.length === 0 ? (
              <div className="empty">No hours logged yet.</div>
            ) : (
              <table>
                <thead><tr><th>Date</th><th>Technician</th><th className="num">Hours</th><th>Notes</th><th></th></tr></thead>
                <tbody>
                  {hourLogs.map((h) => (
                    <tr key={h.id}>
                      <td data-label="Date">{dstr(h.date)}</td>
                      <td data-label="Technician">{h.employee_name}</td>
                      <td className="num" data-label="Hours">{Number(h.hours).toFixed(2)}</td>
                      <td data-label="Notes">{h.notes || '—'}</td>
                      <td>{fullAccess && <button className="btn danger sm" disabled={deletingHourId === h.id} onClick={() => deleteHourLog(h.id)}>{deletingHourId === h.id ? '…' : 'Delete'}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2 className="section-title" style={{ marginTop: 18 }}>Log Hours</h2>
            <div className="grid-3">
              {fullAccess ? (
                <div className="field">
                  <label>Technician</label>
                  <select value={hourForm.employeeId} onChange={(e) => setHourForm({ ...hourForm, employeeId: e.target.value })}>
                    <option value="">— You —</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              ) : (
                <div className="field"><label>Technician</label><input type="text" disabled value="You" /></div>
              )}
              <div className="field"><label>Date</label><input type="date" value={hourForm.date} onChange={(e) => setHourForm({ ...hourForm, date: e.target.value })} /></div>
              <div className="field"><label>Hours</label><input type="number" min="0" step="0.25" value={hourForm.hours} onChange={(e) => setHourForm({ ...hourForm, hours: e.target.value })} /></div>
            </div>
            <div className="field"><label>Notes</label><input value={hourForm.notes} onChange={(e) => setHourForm({ ...hourForm, notes: e.target.value })} placeholder="What was done, optional" /></div>
            <div className="footer-actions">
              <button className="btn amber" disabled={loggingHours} onClick={logHours}>{loggingHours ? 'Logging…' : 'Log Hours'}</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'Assets' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Linked Asset</h2>
            <div className="field">
              <label>Asset / Equipment (optional)</label>
              <select disabled={!fullAccess || !job.client_id} value={job.asset_id || ''} onChange={(e) => set('asset_id', e.target.value)}>
                <option value="">{job.client_id ? '— Not tied to a specific asset —' : 'Pick a customer on the Details tab first'}</option>
                {assetsForClient.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="footer-actions">
              <button className="btn amber" disabled={saving} onClick={() => saveJob()}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'Materials' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Materials &amp; Parts Used</h2>
            <p className="small-note" style={{ marginTop: -8, marginBottom: 10 }}>
              Optional — add line items for an itemized invoice, or leave this empty and set a flat total on the Financials tab.
            </p>
            {!fullAccess ? (
              <div className="empty">Admin/manager only.</div>
            ) : (
              <>
                {lineItems.length > 0 && (
                  <table>
                    <thead><tr><th style={{ width: '50%' }}>Description</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Line Total</th><th></th></tr></thead>
                    <tbody>
                      {lineItems.map((li, i) => (
                        <tr key={i}>
                          <td><input value={li.description} placeholder="Materials, labor..." onChange={(e) => updateItem(i, 'description', e.target.value)} /></td>
                          <td className="num"><input type="number" min="0" step="0.01" value={li.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} /></td>
                          <td className="num"><input type="number" min="0" step="0.01" value={li.price} onChange={(e) => updateItem(i, 'price', e.target.value)} /></td>
                          <td className="num" style={{ fontWeight: 600 }}>{money((Number(li.qty) || 0) * (Number(li.price) || 0))}</td>
                          <td><button className="btn danger sm" onClick={() => removeItem(i)}>&times;</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={addItem}>+ Add Line Item</button>
                {lineItems.length > 0 && (
                  <div className="totals-box" style={{ marginTop: 14 }}>
                    <div className="line"><span>Subtotal</span><span>{money(itemsSubtotal)}</span></div>
                    <div className="line"><span>GST (10%)</span><span>{money(itemsSubtotal * 0.1)}</span></div>
                    <div className="line total"><span>Total</span><span>{money(itemsTotal)}</span></div>
                  </div>
                )}
                <div className="footer-actions">
                  <button className="btn amber" disabled={saving} onClick={() => saveJob()}>{saving ? 'Saving…' : 'Save Changes'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'Documents' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Photos, Documents &amp; Permits</h2>
            {documents.length === 0 ? (
              <div className="empty">No files uploaded yet.</div>
            ) : (
              <table>
                <thead><tr><th>Label</th><th>Category</th><th>Uploaded By</th><th>Date</th><th></th></tr></thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id}>
                      <td data-label="Label"><a href={d.file_url} target="_blank" rel="noreferrer">{d.label || 'File'}</a></td>
                      <td data-label="Category"><span className={`badge ${slug(d.category)}`}>{d.category}</span></td>
                      <td data-label="Uploaded By">{d.uploaded_by}</td>
                      <td data-label="Date">{fmtDate(d.created_at)}</td>
                      <td>
                        {canManageJobs && (
                          <button className="btn danger sm" disabled={deletingDocId === d.id} onClick={() => deleteDocument(d.id)}>
                            {deletingDocId === d.id ? '…' : 'Delete'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2 className="section-title" style={{ marginTop: 18 }}>Upload a File</h2>
            <div className="grid-2">
              <div className="field">
                <label>Label</label>
                <input value={uploadForm.label} onChange={(e) => setUploadForm({ ...uploadForm, label: e.target.value })} placeholder="e.g. Switchboard photo" />
              </div>
              <div className="field">
                <label>Category</label>
                <select value={uploadForm.category} onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })}>
                  {DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>File (JPEG, PNG, WebP, or PDF — max 8MB)</label>
              <input type="file" ref={fileRef} accept="image/jpeg,image/png,image/webp,application/pdf" />
            </div>
            <div className="footer-actions">
              <button className="btn amber" disabled={uploading} onClick={uploadDocument}>{uploading ? 'Uploading…' : 'Upload'}</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'Notes' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Customer-Facing Notes</h2>
            <p className="small-note" style={{ marginTop: -8 }}>Safe to share with the client.</p>
            <textarea rows={5} value={job.customer_notes || ''} onChange={(e) => set('customer_notes', e.target.value)} />
          </div>
          <div className="panel">
            <h2 className="section-title">Internal Notes</h2>
            <p className="small-note" style={{ marginTop: -8 }}>Only visible inside the portal — never shown to the customer.</p>
            <textarea rows={5} value={job.notes || ''} onChange={(e) => set('notes', e.target.value)} />
          </div>
          <div className="footer-actions">
            <button className="btn amber" disabled={saving} onClick={() => saveJob('Notes saved')}>{saving ? 'Saving…' : 'Save Notes'}</button>
          </div>
        </div>
      )}

      {tab === 'History' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Post a Progress Update</h2>
            <textarea rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="What happened on-site, what's next, etc." />
            <div className="footer-actions">
              <button className="btn amber" disabled={postingNote} onClick={postNote}>{postingNote ? 'Posting…' : 'Post Update'}</button>
            </div>
          </div>
          <div className="panel">
            <h2 className="section-title">Activity</h2>
            {activity.length === 0 ? (
              <div className="empty">No activity logged yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activity.map((a) => (
                  <div key={a.id} style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>
                    <div className="small-note">{fmtDate(a.created_at)} — {a.created_by}{a.type !== 'note' ? ` · ${a.type.replace('_', ' ')}` : ''}</div>
                    <div>{a.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="panel">
            <h2 className="section-title">Record</h2>
            <div className="grid-2">
              <div><div className="small-note">Created</div>{fmtDate(job.created_date)}</div>
              <div><div className="small-note">Last Updated</div>{job.updated_at ? fmtDate(job.updated_at) : '—'}</div>
            </div>
          </div>
        </div>
      )}

      {tab === 'Financials' && fullAccess && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Invoicing</h2>
            <div className="field">
              <label>Amount Invoiced ($)</label>
              {lineItems.length > 0 ? (
                <input type="text" disabled value={money(itemsTotal)} />
              ) : (
                <input type="number" min="0" step="0.01" value={job.amount_invoiced} onChange={(e) => set('amount_invoiced', e.target.value)} />
              )}
            </div>
            <div className="totals-box">
              <div className="line"><span>Amount Invoiced</span><span>{money(job.amount_invoiced)}</span></div>
              <div className="line"><span>Amount Paid</span><span>{money(job.amount_paid)}</span></div>
              <div className="line total"><span>Balance Due</span><span style={{ color: balance > 0 ? 'var(--red)' : 'var(--green)' }}>{money(balance)}</span></div>
            </div>
            <div className="footer-actions">
              <button className="btn amber" disabled={saving} onClick={() => saveJob()}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>

          <div className="panel">
            <h2 className="section-title">Costs &amp; Margin</h2>
            <div className="grid-3">
              <div><div className="small-note">Labor Cost</div>{money(laborCost)}</div>
              <div><div className="small-note">Materials Cost</div>{money(materialsCost)}</div>
              <div><div className="small-note">Margin</div><span style={{ color: margin >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{money(margin)}</span></div>
            </div>
          </div>

          <div className="panel">
            <h2 className="section-title">Payment History</h2>
            {payments.length === 0 ? (
              <div className="empty">No payments logged yet.</div>
            ) : (
              <table>
                <thead><tr><th>Date</th><th>Method</th><th className="num">Amount</th><th></th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Date">{dstr(p.date)}</td>
                      <td data-label="Method">{p.method || '—'}</td>
                      <td className="num" data-label="Amount">{money(p.amount)}</td>
                      <td>
                        <button className="btn danger sm" disabled={voidingId === p.id} onClick={() => voidPayment(p.id)}>
                          {voidingId === p.id ? 'Voiding…' : 'Void'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <h2 className="section-title" style={{ marginTop: 18 }}>Log a Payment</h2>
            <div className="grid-2">
              <div className="field">
                <label>Amount ($)</label>
                <input type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
              </div>
              <div className="field">
                <label>Date</label>
                <input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Method</label>
                <select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Note</label>
                <input value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} />
              </div>
            </div>
            <div className="footer-actions">
              <button className="btn amber" disabled={savingPayment} onClick={submitPayment}>{savingPayment ? 'Saving…' : 'Log Payment'}</button>
            </div>
          </div>

          <div className="panel">
            <h2 className="section-title">Documents</h2>
            <div className="row-actions">
              {canPrintInvoice && <a className="btn ghost sm" href={`/jobs/${job.id}/invoice`} target="_blank" rel="noreferrer">View Invoice</a>}
              {canWarranty && <a className="btn ghost sm" href={`/api/jobs/${job.id}/warranty`}>Warranty</a>}
              {linkedQuote && <Link className="btn ghost sm" href={`/quotes/${linkedQuote.id}`}>View Source Quote</Link>}
            </div>
          </div>

          <div className="panel" style={{ borderColor: 'var(--red)' }}>
            <h2 className="section-title">Danger Zone</h2>
            <div className="row-actions">
              {canManageJobs && <button className="btn ghost sm" disabled={duplicating} onClick={duplicateJob}>{duplicating ? 'Duplicating…' : 'Duplicate Job'}</button>}
              {canManageJobs && <button className="btn danger sm" disabled={deleting} onClick={deleteJob}>{deleting ? 'Deleting…' : 'Delete Job'}</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
