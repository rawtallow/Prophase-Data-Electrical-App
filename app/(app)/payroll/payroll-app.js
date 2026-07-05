'use client';
import { useState } from 'react';

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dstr(d) { return d ? String(d).slice(0, 10) : ''; }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function today() { return new Date().toISOString().slice(0, 10); }

export default function PayrollApp({ initialEmployees, initialEntries, initialDraws, jobs }) {
  const [sub, setSub] = useState('employees');
  const [employees, setEmployees] = useState(initialEmployees);
  const [entries, setEntries] = useState(initialEntries);
  const [draws, setDraws] = useState(initialDraws);

  const [empModal, setEmpModal] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [drawModal, setDrawModal] = useState(null);
  const [payFilter, setPayFilter] = useState('');

  async function refreshAll() {
    const [e, p, d] = await Promise.all([
      fetch('/api/employees').then((r) => r.json()),
      fetch('/api/payroll').then((r) => r.json()),
      fetch('/api/draws').then((r) => r.json())
    ]);
    setEmployees(e);
    setEntries(p);
    setDraws(d);
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
  function emptyEmp() { return { name: '', phone: '', hourlyRate: 0, status: 'Active' }; }
  async function saveEmp() {
    if (!empModal.name.trim()) return alert('Employee name is required');
    const method = empModal.id ? 'PUT' : 'POST';
    const url = empModal.id ? `/api/employees/${empModal.id}` : '/api/employees';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(empModal) });
    if (res.ok) { setEmpModal(null); await refreshAll(); }
  }
  async function delEmp(id) {
    if (!confirm('Delete this employee? Past pay runs will keep their saved info.')) return;
    await fetch(`/api/employees/${id}`, { method: 'DELETE' });
    await refreshAll();
  }

  // ---- pay runs ----
  function emptyAllocation() { return { jobId: '', regHours: 0, otHours: 0 }; }
  function emptyPay() {
    return { employeeId: '', hourlyRate: 0, datePaid: today(), periodStart: '', periodEnd: '', notes: '', netPay: 0, netTouched: false, allocations: [emptyAllocation()] };
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
      allocations: e.allocations.length ? e.allocations.map((a) => ({ jobId: a.job_id || '', regHours: a.reg_hours, otHours: a.ot_hours })) : [emptyAllocation()]
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
    if (!payModal.employeeId) return alert('Select an employee');
    const method = payModal.id ? 'PUT' : 'POST';
    const url = payModal.id ? `/api/payroll/${payModal.id}` : '/api/payroll';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payModal) });
    if (res.ok) { setPayModal(null); await refreshAll(); }
    else { const d = await res.json(); alert(d.error || 'Could not save pay run'); }
  }
  async function delPay(id) {
    if (!confirm('Delete this pay run? This cannot be undone.')) return;
    await fetch(`/api/payroll/${id}`, { method: 'DELETE' });
    await refreshAll();
  }

  // ---- owner draws ----
  function emptyDraw() { return { date: today(), amount: 0, note: '' }; }
  async function saveDraw() {
    if (!(Number(drawModal.amount) > 0)) return alert('Enter an amount greater than 0');
    const method = drawModal.id ? 'PUT' : 'POST';
    const url = drawModal.id ? `/api/draws/${drawModal.id}` : '/api/draws';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(drawModal) });
    if (res.ok) { setDrawModal(null); await refreshAll(); }
  }
  async function delDraw(id) {
    if (!confirm('Delete this owner draw?')) return;
    await fetch(`/api/draws/${id}`, { method: 'DELETE' });
    await refreshAll();
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
        <a className={sub === 'payruns' ? 'active' : ''} onClick={() => setSub('payruns')} style={{ cursor: 'pointer' }}>Pay Runs</a>
        <a className={sub === 'draws' ? 'active' : ''} onClick={() => setSub('draws')} style={{ cursor: 'pointer' }}>Owner Draws</a>
      </div>

      {sub === 'employees' && (
        <>
          <div className="toolbar">
            <h2 className="section-title" style={{ margin: 0 }}>Employees</h2>
            <button className="btn amber sm" onClick={() => setEmpModal(emptyEmp())}>+ New Employee</button>
          </div>
          <div className="panel">
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th className="num">Hourly Rate</th><th>Status</th><th className="num">Total Paid</th><th>Actions</th></tr></thead>
              <tbody>
                {employees.map((e) => {
                  const ytd = entries.filter((p) => p.employee_id === e.id).reduce((s, p) => s + Number(p.net_pay), 0);
                  return (
                    <tr key={e.id}>
                      <td>{e.name}</td>
                      <td>{e.phone || '—'}</td>
                      <td className="num">{money(e.hourly_rate)}/hr</td>
                      <td><span className={`badge ${e.status === 'Inactive' ? 'inactive' : 'activestatus'}`}>{e.status}</span></td>
                      <td className="num">{money(ytd)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn ghost sm" onClick={() => setEmpModal({ id: e.id, name: e.name, phone: e.phone || '', hourlyRate: e.hourly_rate, status: e.status })}>Edit</button>
                          <button className="btn danger sm" onClick={() => delEmp(e.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {employees.length === 0 && <div className="empty">No employees yet. Add your crew here so you can log their pay runs.</div>}
          </div>
        </>
      )}

      {sub === 'payruns' && (
        <>
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
                          <button className="btn ghost sm" onClick={() => openEditPay(e)}>Edit</button>
                          <button className="btn danger sm" onClick={() => delPay(e.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredEntries.length === 0 && <div className="empty">No pay runs logged yet.</div>}
          </div>
        </>
      )}

      {sub === 'draws' && (
        <>
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
                {draws.map((d) => (
                  <tr key={d.id}>
                    <td>{fmtDate(d.date)}</td>
                    <td>{d.note || '—'}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{money(d.amount)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost sm" onClick={() => setDrawModal({ id: d.id, date: dstr(d.date), amount: d.amount, note: d.note || '' })}>Edit</button>
                        <button className="btn danger sm" onClick={() => delDraw(d.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {draws.length === 0 && <div className="empty">No owner draws logged yet.</div>}
          </div>
        </>
      )}

      {empModal && (
        <div className="modal-overlay active">
          <div className="modal">
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
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setEmpModal(null)}>Cancel</button>
              <button className="btn amber" onClick={saveEmp}>Save Employee</button>
            </div>
          </div>
        </div>
      )}

      {payModal && (
        <div className="modal-overlay active">
          <div className="modal" style={{ maxWidth: 760 }}>
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

            <h2 className="section-title" style={{ marginTop: 8 }}>Hours by Job</h2>
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
              <button className="btn ghost" onClick={() => setPayModal(null)}>Cancel</button>
              <button className="btn amber" onClick={savePay}>Save Pay Run</button>
            </div>
          </div>
        </div>
      )}

      {drawModal && (
        <div className="modal-overlay active">
          <div className="modal">
            <h3>{drawModal.id ? 'Edit Owner Draw' : 'New Owner Draw'}</h3>
            <div className="grid-2">
              <div className="field"><label>Date *</label><input type="date" value={drawModal.date} onChange={(e) => setDrawModal({ ...drawModal, date: e.target.value })} /></div>
              <div className="field"><label>Amount ($) *</label><input type="number" min="0" step="0.01" value={drawModal.amount} onChange={(e) => setDrawModal({ ...drawModal, amount: e.target.value })} /></div>
            </div>
            <div className="field"><label>Note</label><input value={drawModal.note} onChange={(e) => setDrawModal({ ...drawModal, note: e.target.value })} placeholder="e.g. June owner distribution" /></div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setDrawModal(null)}>Cancel</button>
              <button className="btn amber" onClick={saveDraw}>Save Draw</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
