'use client';
import { useState } from 'react';
import Link from 'next/link';
import { toast, confirmDialog } from '../ui-feedback';
import Modal from '../modal';
import { money, slug, toDateInputValue as dstr } from '../../../lib/format';
import { getJson, getList } from '../../../lib/api';

const STATUSES = ['Quoted', 'Scheduled', 'In Progress', 'Complete'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const JOB_TYPES = ['Call Out', 'Scheduled / Preventative Maintenance', 'Quoted Job'];
const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'];

function today() { return dstr(new Date()); }
function emptyLineItem() { return { description: '', qty: 1, price: 0 }; }
function emptyPaymentForm() { return { amount: '', date: today(), method: 'Bank Transfer', note: '' }; }

export default function JobsApp({ initialJobs, clients, assets, employees, laborByJob, materialsByJob, fullAccess, canManageJobs }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Log Payment modal — a discrete action separate from editing job
  // details, mirroring how Purchase Orders keep "Receive Items" apart from
  // the PO edit form. Holds the on-demand-fetched job (with lineItems and
  // payments) rather than just the row from the bulk list, since the bulk
  // /api/jobs list doesn't include either.
  const [paymentModal, setPaymentModal] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm());
  const [savingPayment, setSavingPayment] = useState(false);
  const [voidingId, setVoidingId] = useState(null);

  async function refresh() {
    try {
      setJobs(await getList('/api/jobs'));
    } catch (err) {
      toast.error(err.message);
    }
  }

  function emptyJob() {
    return { clientId: '', clientName: '', assetId: '', jobDescription: '', scheduledDate: '', status: 'Quoted', priority: 'Medium', jobType: 'Quoted Job', assignedToId: '', amountInvoiced: 0, notes: '' };
  }

  function openNew() {
    setModal(emptyJob());
    setLineItems([]);
  }
  // Async — the bulk job list doesn't carry line items, so a fresh copy is
  // fetched on demand before the modal opens, the same on-demand pattern
  // Purchase Orders use for their Receive Items modal.
  async function openEdit(j) {
    setBusyId(j.id);
    try {
      const full = await getJson(`/api/jobs/${j.id}`);
      setModal({
        id: full.id,
        clientId: full.client_id || '',
        clientName: full.client_name,
        assetId: full.asset_id || '',
        jobDescription: full.job_description || '',
        scheduledDate: dstr(full.scheduled_date),
        status: full.status,
        priority: full.priority || 'Medium',
        jobType: full.job_type || 'Quoted Job',
        assignedToId: full.assigned_to_id || '',
        amountInvoiced: full.amount_invoiced,
        notes: full.notes || '',
        jobNumber: full.job_number
      });
      setLineItems((full.lineItems || []).map((li) => ({ description: li.description, qty: li.qty, price: li.price })));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
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

  // Line items are optional, unlike Quotes/POs — the list starts empty and
  // only gains rows the user explicitly adds. When it has any, they become
  // the computed source of truth for the invoiced total (see the Amount
  // Invoiced field below); when it's empty, that field stays manually typed.
  function updateLineItem(i, field, value) {
    const next = [...lineItems];
    next[i] = { ...next[i], [field]: value };
    setLineItems(next);
  }
  function addLineItem() { setLineItems([...lineItems, emptyLineItem()]); }
  function removeLineItem(i) { setLineItems(lineItems.filter((_, idx) => idx !== i)); }
  const lineItemsSubtotal = lineItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.price) || 0), 0);
  const lineItemsTotal = lineItemsSubtotal + lineItemsSubtotal * 0.1;

  async function save() {
    if (!modal.clientName.trim()) return toast.error('Client name is required');
    setSaving(true);
    try {
      const method = modal.id ? 'PUT' : 'POST';
      const url = modal.id ? `/api/jobs/${modal.id}` : '/api/jobs';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...modal, lineItems })
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

  // On-demand fetch (same reasoning as openEdit) so the modal always shows
  // the current invoiced/paid figures and full payment history, not a
  // possibly-stale row from the bulk list.
  async function openPayment(j) {
    setBusyId(j.id);
    try {
      const full = await getJson(`/api/jobs/${j.id}`);
      setPaymentModal(full);
      setPaymentForm(emptyPaymentForm());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }
  async function submitPayment() {
    if (!(Number(paymentForm.amount) > 0)) return toast.error('Enter an amount greater than 0');
    setSavingPayment(true);
    try {
      const res = await fetch(`/api/jobs/${paymentModal.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentForm)
      });
      if (res.ok) {
        const updated = await res.json();
        setPaymentModal(updated);
        setPaymentForm(emptyPaymentForm());
        toast.success('Payment logged');
        await refresh();
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
      const res = await fetch(`/api/jobs/${paymentModal.id}/payments/${paymentId}`, { method: 'DELETE' });
      if (res.ok) {
        const updated = await res.json();
        setPaymentModal(updated);
        toast.success('Payment voided');
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not void payment');
      }
    } finally {
      setVoidingId(null);
    }
  }

  const list = jobs.filter((j) => {
    if (statusFilter && j.status !== statusFilter) return false;
    if (priorityFilter && j.priority !== priorityFilter) return false;
    if (typeFilter && j.job_type !== typeFilter) return false;
    if (assignedFilter && j.assigned_to_id !== assignedFilter) return false;
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
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input placeholder="Search customer or #" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Link className="btn ghost sm" href="/jobs/calendar">Calendar</Link>
          {canManageJobs && <button className="btn amber sm" onClick={openNew}>+ New Job</button>}
        </div>
      </div>
      <div className="panel card-table">
        <table>
          <thead>
            <tr>
              <th>Job #</th><th>Priority</th><th>Type</th><th>Assigned</th><th>Customer</th><th>Description</th><th>Scheduled</th><th>Status</th>
              {fullAccess && <><th className="num">Invoiced</th><th className="num">Paid</th><th className="num">Balance</th><th className="num">Labor Cost</th><th className="num">Materials</th><th className="num">Margin</th></>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((j) => {
              const balance = Number(j.amount_invoiced) - Number(j.amount_paid);
              const labor = laborByJob[j.id] || 0;
              const materials = materialsByJob[j.id] || 0;
              const margin = Number(j.amount_invoiced) - labor - materials;
              const busy = busyId === j.id;
              return (
                <tr key={j.id}>
                  <td data-label="Job #">{j.job_number}</td>
                  <td data-label="Priority"><span className={`badge ${slug(j.priority)}`}>{j.priority}</span></td>
                  <td data-label="Type"><span className={`badge ${slug(j.job_type)}`}>{j.job_type}</span></td>
                  <td data-label="Assigned">{j.assigned_to_name || '—'}</td>
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
                      <td className="num" data-label="Materials">{money(materials)}</td>
                      <td className="num" data-label="Margin" style={{ color: margin >= 0 ? 'var(--green)' : 'var(--red)' }}>{money(margin)}</td>
                    </>
                  )}
                  <td className="cell-actions" data-label="">
                    <div className="row-actions">
                      <button className="btn ghost sm" disabled={busy} onClick={() => openEdit(j)}>Edit</button>
                      {fullAccess && <button className="btn ghost sm" disabled={busy} onClick={() => openPayment(j)}>Log Payment</button>}
                      {fullAccess && Number(j.amount_invoiced) > 0 && (
                        <a className="btn ghost sm" href={`/jobs/${j.id}/invoice`} target="_blank" rel="noreferrer">Invoice</a>
                      )}
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

      <Modal open={!!modal} wide={fullAccess}>
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
            <div className="grid-3">
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
              <div className="field">
                <label>Assigned To</label>
                <select disabled={!fullAccess} value={modal.assignedToId} onChange={(e) => setModal({ ...modal, assignedToId: e.target.value })}>
                  <option value="">— Unassigned —</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Status</label>
                <select value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              {fullAccess && (
                <div className="field">
                  <label>Amount Invoiced ($)</label>
                  {lineItems.length > 0 ? (
                    <input type="text" disabled value={money(lineItemsTotal)} />
                  ) : (
                    <input type="number" min="0" step="0.01" value={modal.amountInvoiced} onChange={(e) => setModal({ ...modal, amountInvoiced: e.target.value })} />
                  )}
                </div>
              )}
            </div>
            {fullAccess && (
              <>
                <h2 className="section-title" style={{ marginTop: 18 }}>Line Items (optional)</h2>
                <p className="small-note" style={{ marginTop: -8, marginBottom: 10 }}>
                  Add line items for an itemized invoice, or leave this empty and just enter a total above.
                </p>
                {lineItems.length > 0 && (
                  <table>
                    <thead><tr><th style={{ width: '50%' }}>Description</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Line Total</th><th></th></tr></thead>
                    <tbody>
                      {lineItems.map((li, i) => (
                        <tr key={i}>
                          <td><input value={li.description} placeholder="Materials, labor..." onChange={(e) => updateLineItem(i, 'description', e.target.value)} /></td>
                          <td className="num"><input type="number" min="0" step="0.01" value={li.qty} onChange={(e) => updateLineItem(i, 'qty', e.target.value)} /></td>
                          <td className="num"><input type="number" min="0" step="0.01" value={li.price} onChange={(e) => updateLineItem(i, 'price', e.target.value)} /></td>
                          <td className="num" style={{ fontWeight: 600 }}>{money((Number(li.qty) || 0) * (Number(li.price) || 0))}</td>
                          <td><button className="btn danger sm" onClick={() => removeLineItem(i)}>&times;</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={addLineItem}>+ Add Line Item</button>
                {lineItems.length > 0 && (
                  <div className="totals-box" style={{ marginTop: 14 }}>
                    <div className="line"><span>Subtotal</span><span>{money(lineItemsSubtotal)}</span></div>
                    <div className="line"><span>GST (10%)</span><span>{money(lineItemsSubtotal * 0.1)}</span></div>
                    <div className="line total"><span>Total</span><span>{money(lineItemsTotal)}</span></div>
                  </div>
                )}
              </>
            )}
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

      <Modal open={!!paymentModal} onBackdropClick={() => setPaymentModal(null)}>
        {paymentModal && (() => {
          const invoiced = Number(paymentModal.amount_invoiced) || 0;
          const paid = Number(paymentModal.amount_paid) || 0;
          const balance = invoiced - paid;
          return (
            <>
              <h3>Payments — {paymentModal.job_number}</h3>
              <p className="small-note" style={{ marginTop: -8 }}>{paymentModal.client_name}</p>
              <div className="totals-box">
                <div className="line"><span>Amount Invoiced</span><span>{money(invoiced)}</span></div>
                <div className="line"><span>Amount Paid</span><span>{money(paid)}</span></div>
                <div className="line total"><span>Balance Due</span><span style={{ color: balance > 0 ? 'var(--red)' : 'var(--green)' }}>{money(balance)}</span></div>
              </div>

              <h2 className="section-title" style={{ marginTop: 18 }}>Payment History</h2>
              {paymentModal.payments && paymentModal.payments.length > 0 ? (
                <table>
                  <thead><tr><th>Date</th><th>Method</th><th className="num">Amount</th><th></th></tr></thead>
                  <tbody>
                    {paymentModal.payments.map((p) => (
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
              ) : (
                <div className="empty">No payments logged yet.</div>
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

              <div className="modal-actions">
                <button className="btn ghost" disabled={savingPayment} onClick={() => setPaymentModal(null)}>Close</button>
                <button className="btn amber" disabled={savingPayment} onClick={submitPayment}>{savingPayment ? 'Saving…' : 'Log Payment'}</button>
              </div>
            </>
          );
        })()}
      </Modal>
    </>
  );
}
