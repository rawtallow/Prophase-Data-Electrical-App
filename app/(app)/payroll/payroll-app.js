'use client';
import { useState } from 'react';
import { toast, confirmDialog } from '../ui-feedback';
import Modal from '../modal';
import { money, toDateInputValue as dstr, toDisplayDate as fmtDate } from '../../../lib/format';
import { getList, PENDING_APPROVAL_MESSAGE } from '../../../lib/api';

// toISOString() is UTC-based, so "today" near midnight local time can
// resolve to the wrong calendar day (e.g. it read one day behind in
// Sydney, UTC+10) — dstr() extracts local date components instead.
function today() { return dstr(new Date()); }

export default function PayrollApp({ initialEmployees, initialEntries, initialDraws, jobs }) {
  const [sub, setSub] = useState('employees');
  const [employees, setEmployees] = useState(initialEmployees);
  const [entries, setEntries] = useState(initialEntries);
  const [draws, setDraws] = useState(initialDraws);

  const [empModal, setEmpModal] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [drawModal, setDrawModal] = useState(null);
  const [payFilter, setPayFilter] = useState('');
  const [savingEmp, setSavingEmp] = useState(false);
  const [savingPay, setSavingPay] = useState(false);
  const [savingDraw, setSavingDraw] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Pending hour logs awaiting review. Loaded on demand when the Hours tab
  // is first opened rather than server-side with the rest of the page —
  // this is a secondary workflow, and it keeps the main Payroll page from
  // depending on the job_hour_logs review columns existing.
  const [pendingHours, setPendingHours] = useState(null);
  const [loadingHours, setLoadingHours] = useState(false);
  const [reviewChoice, setReviewChoice] = useState({});
  const [reviewingId, setReviewingId] = useState(null);
  const [pullingHours, setPullingHours] = useState(false);

  async function loadPendingHours() {
    setLoadingHours(true);
    try {
      setPendingHours(await getList('/api/hour-logs?status=Pending'));
    } catch (err) {
      toast.error(err.message);
      setPendingHours([]);
    } finally {
      setLoadingHours(false);
    }
  }

  function openHoursTab() {
    setSub('hours');
    if (pendingHours === null && !loadingHours) loadPendingHours();
  }

  // A self-logged entry usually has no employee_id (the session can't be
  // resolved to an employees row — see app/api/jobs/[id]/hours/route.js), so
  // the reviewer confirms who it belongs to. Pre-select the best guess by
  // matching the logged name against the employee list, since the employee
  // record is often a longer version of the same name ("Justin Savino" the
  // login vs "Justin Savino - Director / Senior Technician" the employee).
  function guessEmployeeId(log) {
    if (log.employee_id) return log.employee_id;
    const name = (log.employee_name || '').trim().toLowerCase();
    if (!name) return '';
    const match = employees.find(
      (e) => e.name.toLowerCase() === name || e.name.toLowerCase().startsWith(name) || name.startsWith(e.name.toLowerCase())
    );
    return match ? match.id : '';
  }

  async function reviewHourLog(log, decision) {
    const employeeId = decision === 'approved' ? (reviewChoice[log.id] ?? guessEmployeeId(log)) : null;
    if (decision === 'approved' && !employeeId) {
      return toast.error('Select which employee these hours belong to');
    }
    setReviewingId(log.id);
    try {
      const res = await fetch(`/api/hour-logs/${log.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, employeeId })
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(decision === 'approved' ? 'Hours approved' : 'Hours rejected');
        setPendingHours(pendingHours.filter((h) => h.id !== log.id));
      } else {
        toast.error(d.error || 'Could not save review');
      }
    } finally {
      setReviewingId(null);
    }
  }

  async function refreshAll() {
    try {
      const [e, p, d] = await Promise.all([
        getList('/api/employees'),
        getList('/api/payroll'),
        getList('/api/draws')
      ]);
      setEmployees(e);
      setEntries(p);
      setDraws(d);
    } catch (err) {
      toast.error(err.message);
    }
  }

  // ---- summary cards ----
  const now = new Date();
  const inMonth = (d) => {
    if (!d) return false;
    const dt = new Date(d);
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  };
  const payThisMonth = entries.reduce((s, e) => (inMonth(e.date_paid) ? s + Number(e.net_pay) : s), 0);
  const drawsThisMonth = draws.reduce((s, d) => (inMonth(d.date) ? s + Number(d.amount) : s), 0);
  const activeEmployees = employees.filter((e) => e.status !== 'Inactive').length;
  const ytdTotal = entries.reduce((s, e) => s + Number(e.net_pay), 0) + draws.reduce((s, d) => s + Number(d.amount), 0);

  // ---- employees ----
  function emptyEmp() { return { name: '', phone: '', hourlyRate: 0, status: 'Active', licenseNumber: '', licenseExpiry: '' }; }
  // Warns once a license is within 60 days of expiry (or already expired), so
  // it surfaces before a job gets scheduled with an out-of-date license.
  function licenseWarning(expiry) {
    if (!expiry) return null;
    const days = (new Date(expiry) - new Date()) / 86400000;
    if (days < 0) return 'expired';
    if (days <= 60) return 'expiring';
    return null;
  }
  async function saveEmp() {
    if (!empModal.name.trim()) return toast.error('Employee name is required');
    setSavingEmp(true);
    try {
      const method = empModal.id ? 'PUT' : 'POST';
      const url = empModal.id ? `/api/employees/${empModal.id}` : '/api/employees';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(empModal) });
      if (res.ok) {
        toast.success(empModal.id ? 'Employee updated' : 'Employee added');
        setEmpModal(null);
        await refreshAll();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save employee');
      }
    } finally {
      setSavingEmp(false);
    }
  }
  async function delEmp(id) {
    const ok = await confirmDialog('Delete this employee? Past pay runs will keep their saved info.', {
      title: 'Delete employee',
      confirmLabel: 'Delete Employee',
      danger: true
    });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Employee deleted');
        await refreshAll();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete employee');
      }
    } finally {
      setBusyId(null);
    }
  }

  // ---- pay runs ----
  function emptyAllocation() { return { jobId: '', regHours: 0, otHours: 0 }; }
  function emptyPay() {
    return { employeeId: '', hourlyRate: 0, datePaid: today(), periodStart: '', periodEnd: '', notes: '', netPay: 0, netTouched: false, allocations: [emptyAllocation()], hourLogIds: [] };
  }

  // Pulls the selected employee's already-approved, not-yet-paid hours for
  // the chosen period and turns them into allocation rows — summed per job,
  // since one job typically has several days' entries. All pulled hours land
  // in Reg; splitting Reg vs OT is a judgement call about the employee's
  // whole week, not something a per-job log can answer, so the reviewer
  // adjusts afterwards. hourLogIds rides along on the save so the API can
  // mark exactly these entries Paid.
  async function pullApprovedHours() {
    if (!payModal.employeeId) return toast.error('Select an employee first');
    if (!payModal.periodStart || !payModal.periodEnd) return toast.error('Set the pay period dates first');
    setPullingHours(true);
    try {
      const params = new URLSearchParams({
        status: 'Approved',
        employeeId: payModal.employeeId,
        from: payModal.periodStart,
        to: payModal.periodEnd
      });
      const logs = await getList(`/api/hour-logs?${params}`);
      if (logs.length === 0) {
        toast('No approved hours found for that employee and period');
        return;
      }
      const byJob = new Map();
      for (const l of logs) {
        byJob.set(l.job_id, (byJob.get(l.job_id) || 0) + Number(l.hours));
      }
      const allocations = [...byJob.entries()].map(([jobId, hours]) => ({
        jobId, regHours: Number(hours.toFixed(2)), otHours: 0
      }));
      const next = { ...payModal, allocations, hourLogIds: logs.map((l) => l.id) };
      const totals = payTotals(next);
      setPayModal({ ...next, netPay: next.netTouched ? next.netPay : totals.gross.toFixed(2) });
      toast.success(`Pulled ${logs.length} approved ${logs.length === 1 ? 'entry' : 'entries'} across ${allocations.length} ${allocations.length === 1 ? 'job' : 'jobs'}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPullingHours(false);
    }
  }
  function openNewPay() { setPayModal(emptyPay()); }
  function openEditPay(e) {
    setPayModal({
      id: e.id,
      payNumber: e.pay_number,
      employeeId: e.employee_id,
      hourlyRate: e.hourly_rate,
      datePaid: dstr(e.date_paid),
      periodStart: dstr(e.period_start),
      periodEnd: dstr(e.period_end),
      notes: e.notes || '',
      netPay: e.net_pay,
      netTouched: true,
      allocations: e.allocations.length ? e.allocations.map((a) => ({ jobId: a.job_id || '', regHours: a.reg_hours, otHours: a.ot_hours })) : [emptyAllocation()],
      // Deliberately empty when editing: the hours this run was originally
      // built from are already marked Paid and linked to it. Re-sending
      // their ids would be a no-op (markHourLogsPaid only touches rows
      // still Approved), but leaving it empty keeps the intent obvious.
      hourLogIds: []
    });
  }
  function payTotals(pm) {
    const rate = Number(pm.hourlyRate) || 0;
    const totalReg = pm.allocations.reduce((s, a) => s + (Number(a.regHours) || 0), 0);
    const totalOt = pm.allocations.reduce((s, a) => s + (Number(a.otHours) || 0), 0);
    const gross = totalReg * rate + totalOt * rate * 1.5;
    return { totalReg, totalOt, gross };
  }
  function updateAlloc(i, field, value) {
    const next = [...payModal.allocations];
    next[i] = { ...next[i], [field]: value };
    const totals = payTotals({ ...payModal, allocations: next });
    setPayModal({ ...payModal, allocations: next, netPay: payModal.netTouched ? payModal.netPay : totals.gross.toFixed(2) });
  }
  function onEmployeeChange(employeeId) {
    const emp = employees.find((e) => e.id === employeeId);
    setPayModal({ ...payModal, employeeId, hourlyRate: emp ? emp.hourly_rate : 0 });
  }
  async function savePay() {
    if (!payModal.employeeId) return toast.error('Select an employee');
    setSavingPay(true);
    try {
      const method = payModal.id ? 'PUT' : 'POST';
      const url = payModal.id ? `/api/payroll/${payModal.id}` : '/api/payroll';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payModal) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        if (d.pending) {
          toast.success(PENDING_APPROVAL_MESSAGE);
        } else {
          toast.success(payModal.id ? 'Pay run updated' : 'Pay run saved');
          await refreshAll();
          // Any hours pulled into this run just flipped to Paid, so the
          // review queue's counts are stale — only worth refetching if
          // the Hours tab has actually been opened at some point.
          if (pendingHours !== null) await loadPendingHours();
        }
        setPayModal(null);
      } else {
        toast.error(d.error || 'Could not save pay run');
      }
    } finally {
      setSavingPay(false);
    }
  }
  async function delPay(id) {
    const ok = await confirmDialog('Delete this pay run? This cannot be undone.', {
      title: 'Delete pay run',
      confirmLabel: 'Delete Pay Run',
      danger: true
    });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/payroll/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Pay run deleted');
        await refreshAll();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete pay run');
      }
    } finally {
      setBusyId(null);
    }
  }

  // ---- owner draws ----
  function emptyDraw() { return { date: today(), amount: 0, note: '' }; }
  async function saveDraw() {
    if (!(Number(drawModal.amount) > 0)) return toast.error('Enter an amount greater than 0');
    setSavingDraw(true);
    try {
      const method = drawModal.id ? 'PUT' : 'POST';
      const url = drawModal.id ? `/api/draws/${drawModal.id}` : '/api/draws';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(drawModal) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        if (d.pending) {
          toast.success(PENDING_APPROVAL_MESSAGE);
        } else {
          toast.success(drawModal.id ? 'Draw updated' : 'Draw recorded');
          await refreshAll();
        }
        setDrawModal(null);
      } else {
        toast.error(d.error || 'Could not save draw');
      }
    } finally {
      setSavingDraw(false);
    }
  }
  async function delDraw(id) {
    const ok = await confirmDialog('Delete this owner draw?', { title: 'Delete draw', confirmLabel: 'Delete Draw', danger: true });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/draws/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Draw deleted');
        await refreshAll();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete draw');
      }
    } finally {
      setBusyId(null);
    }
  }

  const filteredEntries = entries.filter((e) => !payFilter || e.employee_id === payFilter);
  const pt = payModal ? payTotals(payModal) : null;

  return (
    <>
      <div className="cards">
        <div className="card"><div className="label">Active Employees</div><div className="value">{activeEmployees}</div></div>
        <div className="card"><div className="label">Employee Pay This Month</div><div className="value">{money(payThisMonth)}</div></div>
        <div className="card"><div className="label">Owner Draws This Month</div><div className="value">{money(drawsThisMonth)}</div></div>
        <div className="card good"><div className="label">Total Payroll + Draws (All Time)</div><div className="value">{money(ytdTotal)}</div></div>
      </div>

      <div className="subtabs">
        <a className={sub === 'employees' ? 'active' : ''} onClick={() => setSub('employees')} style={{ cursor: 'pointer' }}>Employees</a>
        <a className={sub === 'hours' ? 'active' : ''} onClick={openHoursTab} style={{ cursor: 'pointer' }}>
          Hours{pendingHours && pendingHours.length > 0 ? ` (${pendingHours.length})` : ''}
        </a>
        <a className={sub === 'payruns' ? 'active' : ''} onClick={() => setSub('payruns')} style={{ cursor: 'pointer' }}>Pay Runs</a>
        <a className={sub === 'draws' ? 'active' : ''} onClick={() => setSub('draws')} style={{ cursor: 'pointer' }}>Owner Draws</a>
      </div>

      {sub === 'employees' && (
        <div key={sub} className="page-transition">
          <div className="toolbar">
            <h2 className="section-title" style={{ margin: 0 }}>Employees</h2>
            <button className="btn amber sm" onClick={() => setEmpModal(emptyEmp())}>+ New Employee</button>
          </div>
          <div className="panel">
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th className="num">Hourly Rate</th><th>Status</th><th>License</th><th className="num">Total Paid</th><th>Actions</th></tr></thead>
              <tbody>
                {employees.map((e) => {
                  const ytd = entries.filter((p) => p.employee_id === e.id).reduce((s, p) => s + Number(p.net_pay), 0);
                  const busy = busyId === e.id;
                  const warn = licenseWarning(e.license_expiry);
                  return (
                    <tr key={e.id}>
                      <td>{e.name}</td>
                      <td>{e.phone || '—'}</td>
                      <td className="num">{money(e.hourly_rate)}/hr</td>
                      <td><span className={`badge ${e.status === 'Inactive' ? 'inactive' : 'activestatus'}`}>{e.status}</span></td>
                      <td>
                        {e.license_number || '—'}
                        {e.license_expiry && (
                          <div>
                            <span className={`badge ${warn ? 'lowstock' : 'instock'}`}>
                              {warn === 'expired' ? 'Expired' : warn === 'expiring' ? 'Expiring Soon' : 'Valid'} {dstr(e.license_expiry)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="num">{money(ytd)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn ghost sm" disabled={busy} onClick={() => setEmpModal({ id: e.id, name: e.name, phone: e.phone || '', hourlyRate: e.hourly_rate, status: e.status, licenseNumber: e.license_number || '', licenseExpiry: dstr(e.license_expiry) })}>Edit</button>
                          <button className="btn danger sm" disabled={busy} onClick={() => delEmp(e.id)}>{busy ? 'Deleting…' : 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {employees.length === 0 && <div className="empty">No employees yet. Add your crew here so you can log their pay runs.</div>}
          </div>
        </div>
      )}

      {sub === 'hours' && (
        <div key={sub} className="page-transition">
          <div className="toolbar">
            <h2 className="section-title" style={{ margin: 0 }}>Hours Awaiting Review</h2>
            <button className="btn ghost sm" disabled={loadingHours} onClick={loadPendingHours}>
              {loadingHours ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div className="panel small-note" style={{ marginBottom: 14 }}>
            Hours logged by the crew against a job land here first. Approving one confirms both the
            hours and which employee they belong to — approved hours can then be pulled straight into
            a pay run instead of being typed in again. Nothing here affects labour cost or margin
            figures until it&apos;s part of a saved pay run.
          </div>
          <div className="panel">
            {loadingHours && pendingHours === null ? (
              <div className="empty">Loading…</div>
            ) : (pendingHours || []).length === 0 ? (
              <div className="empty">No hours waiting for review.</div>
            ) : (
              <table>
                <thead>
                  <tr><th>Date</th><th>Job</th><th>Logged By</th><th className="num">Hours</th><th>Notes</th><th style={{ width: '20%' }}>Employee</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {pendingHours.map((h) => {
                    const busy = reviewingId === h.id;
                    const chosen = reviewChoice[h.id] ?? guessEmployeeId(h);
                    return (
                      <tr key={h.id}>
                        <td data-label="Date">{fmtDate(h.date)}</td>
                        <td data-label="Job">{h.job_number} — {h.client_name}</td>
                        <td data-label="Logged By">{h.employee_name || '—'}</td>
                        <td className="num" data-label="Hours">{Number(h.hours).toFixed(2)}</td>
                        <td data-label="Notes">{h.notes || '—'}</td>
                        <td data-label="Employee">
                          <select
                            value={chosen}
                            onChange={(e) => setReviewChoice({ ...reviewChoice, [h.id]: e.target.value })}
                          >
                            <option value="">Select employee…</option>
                            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="btn danger sm" disabled={busy} onClick={() => reviewHourLog(h, 'rejected')}>Reject</button>
                            <button className="btn amber sm" disabled={busy} onClick={() => reviewHourLog(h, 'approved')}>{busy ? '…' : 'Approve'}</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {sub === 'payruns' && (
        <div key={sub} className="page-transition">
          <div className="toolbar">
            <h2 className="section-title" style={{ margin: 0 }}>Pay Runs</h2>
            <div className="filters">
              <select value={payFilter} onChange={(e) => setPayFilter(e.target.value)}>
                <option value="">All Employees</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <button className="btn amber sm" onClick={openNewPay}>+ New Pay Run</button>
            </div>
          </div>
          <div className="panel">
            <table>
              <thead><tr><th>Pay #</th><th>Employee</th><th>Period</th><th>Date Paid</th><th className="num">Hours (Reg/OT)</th><th className="num">Gross</th><th className="num">Net Paid</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredEntries.map((e) => {
                  const totalReg = (e.allocations || []).reduce((s, a) => s + Number(a.reg_hours), 0);
                  const totalOt = (e.allocations || []).reduce((s, a) => s + Number(a.ot_hours), 0);
                  const busy = busyId === e.id;
                  return (
                    <tr key={e.id}>
                      <td>{e.pay_number}</td>
                      <td>{e.employee_name}</td>
                      <td>{fmtDate(e.period_start)} – {fmtDate(e.period_end)}</td>
                      <td>{fmtDate(e.date_paid)}</td>
                      <td className="num">{totalReg.toFixed(1)} / {totalOt.toFixed(1)}</td>
                      <td className="num">{money(e.gross_pay)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{money(e.net_pay)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn ghost sm" disabled={busy} onClick={() => openEditPay(e)}>Edit</button>
                          <button className="btn danger sm" disabled={busy} onClick={() => delPay(e.id)}>{busy ? 'Deleting…' : 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredEntries.length === 0 && <div className="empty">No pay runs logged yet.</div>}
          </div>
        </div>
      )}

      {sub === 'draws' && (
        <div key={sub} className="page-transition">
          <div className="toolbar">
            <h2 className="section-title" style={{ margin: 0 }}>Owner Draws</h2>
            <button className="btn amber sm" onClick={() => setDrawModal(emptyDraw())}>+ New Draw</button>
          </div>
          <div className="panel small-note" style={{ marginBottom: 0 }}>
            Owner draws are distributions to yourself from business profit — not a taxed payroll wage. Talk to your accountant about how draws vs. salary affect your self-employment taxes.
          </div>
          <div className="panel">
            <table>
              <thead><tr><th>Date</th><th>Note</th><th className="num">Amount</th><th>Actions</th></tr></thead>
              <tbody>
                {draws.map((d) => {
                  const busy = busyId === d.id;
                  return (
                    <tr key={d.id}>
                      <td>{fmtDate(d.date)}</td>
                      <td>{d.note || '—'}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{money(d.amount)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn ghost sm" disabled={busy} onClick={() => setDrawModal({ id: d.id, date: dstr(d.date), amount: d.amount, note: d.note || '' })}>Edit</button>
                          <button className="btn danger sm" disabled={busy} onClick={() => delDraw(d.id)}>{busy ? 'Deleting…' : 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {draws.length === 0 && <div className="empty">No owner draws logged yet.</div>}
          </div>
        </div>
      )}

      <Modal open={!!empModal}>
        {empModal && (
          <>
            <h3>{empModal.id ? 'Edit Employee' : 'New Employee'}</h3>
            <div className="field"><label>Name *</label><input value={empModal.name} onChange={(e) => setEmpModal({ ...empModal, name: e.target.value })} /></div>
            <div className="grid-2">
              <div className="field"><label>Phone</label><input value={empModal.phone} onChange={(e) => setEmpModal({ ...empModal, phone: e.target.value })} /></div>
              <div className="field"><label>Hourly Rate ($) *</label><input type="number" min="0" step="0.01" value={empModal.hourlyRate} onChange={(e) => setEmpModal({ ...empModal, hourlyRate: e.target.value })} /></div>
            </div>
            <div className="field">
              <label>Status</label>
              <select value={empModal.status} onChange={(e) => setEmpModal({ ...empModal, status: e.target.value })}>
                <option>Active</option><option>Inactive</option>
              </select>
            </div>
            <div className="grid-2">
              <div className="field"><label>Electrical License Number</label><input value={empModal.licenseNumber} onChange={(e) => setEmpModal({ ...empModal, licenseNumber: e.target.value })} /></div>
              <div className="field"><label>License Expiry</label><input type="date" value={empModal.licenseExpiry} onChange={(e) => setEmpModal({ ...empModal, licenseExpiry: e.target.value })} /></div>
            </div>
            <div className="modal-actions">
              <button className="btn ghost" disabled={savingEmp} onClick={() => setEmpModal(null)}>Cancel</button>
              <button className="btn amber" disabled={savingEmp} onClick={saveEmp}>{savingEmp ? 'Saving…' : 'Save Employee'}</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!payModal} wide>
        {payModal && (
          <>
            <h3>{payModal.id ? `Edit Pay Run ${payModal.payNumber}` : 'New Pay Run'}</h3>
            <div className="grid-3">
              <div className="field">
                <label>Employee *</label>
                <select value={payModal.employeeId} onChange={(e) => onEmployeeChange(e.target.value)}>
                  <option value="">Select employee…</option>
                  {employees.filter((e) => e.status !== 'Inactive').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Hourly Rate ($)</label><input type="number" min="0" step="0.01" value={payModal.hourlyRate} onChange={(e) => setPayModal({ ...payModal, hourlyRate: e.target.value })} /></div>
              <div className="field"><label>Date Paid</label><input type="date" value={payModal.datePaid} onChange={(e) => setPayModal({ ...payModal, datePaid: e.target.value })} /></div>
            </div>
            <div className="grid-2">
              <div className="field"><label>Pay Period Start</label><input type="date" value={payModal.periodStart} onChange={(e) => setPayModal({ ...payModal, periodStart: e.target.value })} /></div>
              <div className="field"><label>Pay Period End</label><input type="date" value={payModal.periodEnd} onChange={(e) => setPayModal({ ...payModal, periodEnd: e.target.value })} /></div>
            </div>

            <div className="toolbar" style={{ marginTop: 8, marginBottom: 8 }}>
              <h2 className="section-title" style={{ margin: 0 }}>Hours by Job</h2>
              {!payModal.id && (
                <button className="btn ghost sm" disabled={pullingHours} onClick={pullApprovedHours}>
                  {pullingHours ? 'Pulling…' : 'Pull In Approved Hours'}
                </button>
              )}
            </div>
            {!payModal.id && (
              <p className="small-note" style={{ marginTop: -4 }}>
                Set the employee and pay period above, then pull in their approved hours instead of
                re-typing them. Pulled hours land in Reg — move any across to OT as needed.
              </p>
            )}
            {payModal.hourLogIds?.length > 0 && (
              <p className="small-note">
                {payModal.hourLogIds.length} approved {payModal.hourLogIds.length === 1 ? 'entry' : 'entries'} will
                be marked as paid when you save this run.
              </p>
            )}
            <table>
              <thead><tr><th style={{ width: '44%' }}>Job</th><th className="num">Reg Hrs</th><th className="num">OT Hrs</th><th className="num">Labor Cost</th><th></th></tr></thead>
              <tbody>
                {payModal.allocations.map((a, i) => {
                  const rate = Number(payModal.hourlyRate) || 0;
                  const cost = (Number(a.regHours) || 0) * rate + (Number(a.otHours) || 0) * rate * 1.5;
                  return (
                    <tr key={i}>
                      <td>
                        <select value={a.jobId} onChange={(e) => updateAlloc(i, 'jobId', e.target.value)}>
                          <option value="">Unassigned / overhead</option>
                          {jobs.map((j) => <option key={j.id} value={j.id}>{j.job_number} — {j.client_name}</option>)}
                        </select>
                      </td>
                      <td className="num"><input type="number" min="0" step="0.25" value={a.regHours} onChange={(e) => updateAlloc(i, 'regHours', e.target.value)} /></td>
                      <td className="num"><input type="number" min="0" step="0.25" value={a.otHours} onChange={(e) => updateAlloc(i, 'otHours', e.target.value)} /></td>
                      <td className="num" style={{ fontWeight: 600 }}>{money(cost)}</td>
                      <td>
                        <button
                          className="btn danger sm"
                          disabled={payModal.allocations.length <= 1}
                          onClick={() => setPayModal({ ...payModal, allocations: payModal.allocations.filter((_, idx) => idx !== i) })}
                        >&times;</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setPayModal({ ...payModal, allocations: [...payModal.allocations, emptyAllocation()] })}>+ Add Row</button>

            <div className="totals-box" style={{ marginTop: 16 }}>
              <div className="line"><span>Total Reg Hours</span><span>{pt.totalReg.toFixed(2)}</span></div>
              <div className="line"><span>Total OT Hours</span><span>{pt.totalOt.toFixed(2)}</span></div>
              <div className="line total"><span>Gross Pay</span><span>{money(pt.gross)}</span></div>
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <label>Net Pay ($) — amount actually paid out</label>
              <input type="number" min="0" step="0.01" value={payModal.netPay} onChange={(e) => setPayModal({ ...payModal, netPay: e.target.value, netTouched: true })} />
              <div className="small-note">Defaults to gross pay. Adjust down if withholding taxes/benefits before paying out.</div>
            </div>
            <div className="field"><label>Notes</label><textarea rows={2} value={payModal.notes} onChange={(e) => setPayModal({ ...payModal, notes: e.target.value })} /></div>

            <div className="modal-actions">
              <button className="btn ghost" disabled={savingPay} onClick={() => setPayModal(null)}>Cancel</button>
              <button className="btn amber" disabled={savingPay} onClick={savePay}>{savingPay ? 'Saving…' : 'Save Pay Run'}</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!drawModal}>
        {drawModal && (
          <>
            <h3>{drawModal.id ? 'Edit Owner Draw' : 'New Owner Draw'}</h3>
            <div className="grid-2">
              <div className="field"><label>Date *</label><input type="date" value={drawModal.date} onChange={(e) => setDrawModal({ ...drawModal, date: e.target.value })} /></div>
              <div className="field"><label>Amount ($) *</label><input type="number" min="0" step="0.01" value={drawModal.amount} onChange={(e) => setDrawModal({ ...drawModal, amount: e.target.value })} /></div>
            </div>
            <div className="field"><label>Note</label><input value={drawModal.note} onChange={(e) => setDrawModal({ ...drawModal, note: e.target.value })} placeholder="e.g. June owner distribution" /></div>
            <div className="modal-actions">
              <button className="btn ghost" disabled={savingDraw} onClick={() => setDrawModal(null)}>Cancel</button>
              <button className="btn amber" disabled={savingDraw} onClick={saveDraw}>{savingDraw ? 'Saving…' : 'Save Draw'}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
