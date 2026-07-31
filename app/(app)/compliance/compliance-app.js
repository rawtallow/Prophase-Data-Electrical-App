'use client';
import { useState } from 'react';
import { toast, confirmDialog } from '../ui-feedback';
import Modal from '../modal';
import { COMPLIANCE_TYPES, COMPLIANCE_RESULTS } from '../../../lib/compliance-types';
import { slug, toDateInputValue as dstr } from '../../../lib/format';
import { getList } from '../../../lib/api';

// toISOString() is UTC-based, so "today" near midnight local time can
// resolve to the wrong calendar day (e.g. it read one day behind in
// Sydney, UTC+10) — dstr() extracts local date components instead.
function today() { return dstr(new Date()); }

// Warns once something is within 30 days of its retest-due date (or
// already overdue), so it's visible before it lapses.
function dueSoon(retestDue) {
  if (!retestDue) return null;
  const days = (new Date(retestDue) - new Date()) / 86400000;
  if (days < 0) return 'overdue';
  if (days <= 30) return 'soon';
  return null;
}
function licenseWarning(expiry) {
  if (!expiry) return null;
  const days = (new Date(expiry) - new Date()) / 86400000;
  if (days < 0) return 'expired';
  if (days <= 60) return 'expiring';
  return null;
}

export default function ComplianceApp({ initialRecords, jobs, clients, employees, initialBusinessSettings, canManage }) {
  const [records, setRecords] = useState(initialRecords);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [biz, setBiz] = useState(initialBusinessSettings);
  const [bizModal, setBizModal] = useState(null);
  const [savingBiz, setSavingBiz] = useState(false);
  const [detailsModal, setDetailsModal] = useState(null);
  const [savingDetails, setSavingDetails] = useState(false);

  async function refresh() {
    try {
      setRecords(await getList('/api/compliance'));
    } catch (err) {
      toast.error(err.message);
    }
  }

  function openBizEdit() {
    setBizModal({
      contractorLicenseNumber: biz.contractor_license_number || '',
      contractorLicenseExpiry: dstr(biz.contractor_license_expiry),
      publicLiabilityProvider: biz.public_liability_provider || '',
      publicLiabilityExpiry: dstr(biz.public_liability_expiry),
      workersCompProvider: biz.workers_comp_provider || '',
      workersCompExpiry: dstr(biz.workers_comp_expiry)
    });
  }

  async function saveBiz() {
    setSavingBiz(true);
    try {
      const res = await fetch('/api/business-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bizModal)
      });
      if (res.ok) {
        setBiz(await res.json());
        toast.success('License and insurance updated');
        setBizModal(null);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save business details');
      }
    } finally {
      setSavingBiz(false);
    }
  }

  // Company identity + remittance details. Kept as a separate form from the
  // licence/insurance one above because they're edited on completely
  // different cadences — this is set up once and rarely touched, whereas
  // renewal dates change every year.
  function openDetailsEdit() {
    setDetailsModal({
      legalName: biz.legal_name || '',
      abn: biz.abn || '',
      address: biz.address || '',
      phone: biz.phone || '',
      email: biz.email || '',
      website: biz.website || '',
      bankName: biz.bank_name || '',
      bankBsb: biz.bank_bsb || '',
      bankAccount: biz.bank_account || '',
      paymentTerms: biz.payment_terms || ''
    });
  }

  async function saveDetails() {
    setSavingDetails(true);
    try {
      const res = await fetch('/api/business-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(detailsModal)
      });
      if (res.ok) {
        setBiz(await res.json());
        toast.success('Business details updated');
        setDetailsModal(null);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save business details');
      }
    } finally {
      setSavingDetails(false);
    }
  }

  function emptyRecord() {
    return {
      type: COMPLIANCE_TYPES[0], jobId: '', clientId: '', employeeId: '',
      recordDate: today(), referenceNumber: '', result: '', retestDue: '',
      description: '', notes: '', file: null
    };
  }

  function openNew() { setModal(emptyRecord()); }

  function openEdit(r) {
    setModal({
      id: r.id,
      type: r.type,
      jobId: r.job_id || '',
      clientId: r.client_id || '',
      employeeId: r.employee_id || '',
      recordDate: dstr(r.record_date),
      referenceNumber: r.reference_number || '',
      result: r.result || '',
      retestDue: dstr(r.retest_due),
      description: r.description || '',
      notes: r.notes || '',
      fileUrl: r.file_url
    });
  }

  function onJobChange(jobId) {
    const job = jobs.find((j) => j.id === jobId);
    setModal({ ...modal, jobId, clientId: job ? job.client_id || '' : modal.clientId });
  }

  async function save() {
    setSaving(true);
    try {
      let res;
      if (modal.id) {
        res = await fetch(`/api/compliance/${modal.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(modal)
        });
      } else {
        const formData = new FormData();
        formData.append('type', modal.type);
        formData.append('jobId', modal.jobId);
        formData.append('clientId', modal.clientId);
        formData.append('employeeId', modal.employeeId);
        formData.append('recordDate', modal.recordDate);
        formData.append('referenceNumber', modal.referenceNumber);
        formData.append('result', modal.result);
        formData.append('retestDue', modal.retestDue);
        formData.append('description', modal.description);
        formData.append('notes', modal.notes);
        if (modal.file) formData.append('file', modal.file);
        res = await fetch('/api/compliance', { method: 'POST', body: formData });
      }
      if (res.ok) {
        toast.success(modal.id ? 'Record updated' : 'Record saved');
        setModal(null);
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save record');
      }
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    const ok = await confirmDialog('Delete this compliance record? This cannot be undone.', {
      title: 'Delete record',
      confirmLabel: 'Delete Record',
      danger: true
    });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/compliance/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Record deleted');
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete record');
      }
    } finally {
      setBusyId(null);
    }
  }

  const list = records.filter((r) => {
    if (typeFilter && r.type !== typeFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const haystack = [r.reference_number, r.description, r.job_number, r.client_name, r.employee_name].join(' ').toLowerCase();
      if (!haystack.includes(s)) return false;
    }
    return true;
  });

  const dueSoonCount = records.filter((r) => dueSoon(r.retest_due)).length;
  const expiringLicenses = employees.filter((e) => licenseWarning(e.license_expiry));
  const bizExpiries = [
    { label: 'Contractor License', expiry: biz.contractor_license_expiry },
    { label: 'Public Liability Insurance', expiry: biz.public_liability_expiry },
    { label: 'Workers Comp Insurance', expiry: biz.workers_comp_expiry }
  ];
  const bizWarningCount = bizExpiries.filter((b) => licenseWarning(b.expiry)).length;
  const totalExpiringSoon = expiringLicenses.length + bizWarningCount;

  return (
    <>
      <div className="cards">
        <div className="card"><div className="label">Records Logged</div><div className="value">{records.length}</div></div>
        <div className={`card${dueSoonCount ? ' warn' : ''}`}><div className="label">Retests Due Soon / Overdue</div><div className="value">{dueSoonCount}</div></div>
        <div className={`card${totalExpiringSoon ? ' warn' : ''}`}><div className="label">Licenses / Insurance Expiring Soon</div><div className="value">{totalExpiringSoon}</div></div>
      </div>

      <div className="panel">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Business Details</h2>
          {canManage && <button className="btn ghost sm" onClick={openDetailsEdit}>Edit</button>}
        </div>
        {!biz.abn && (
          <div className="small-note" style={{ marginBottom: 10 }}>
            Your ABN and bank details appear on every quote and tax invoice you issue. An invoice
            without an ABN isn&apos;t a valid tax invoice, and without bank details your customer
            has no way to pay it.
          </div>
        )}
        <table>
          <thead><tr><th>Field</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Legal / Trading Name</td><td>{biz.legal_name || <span className="small-note">Prophase Data and Electrical</span>}</td></tr>
            <tr><td>ABN</td><td>{biz.abn || <span className="badge lowstock">Not set</span>}</td></tr>
            <tr><td>Business Address</td><td>{biz.address || '—'}</td></tr>
            <tr><td>Phone</td><td>{biz.phone || '—'}</td></tr>
            <tr><td>Email</td><td>{biz.email || '—'}</td></tr>
            <tr><td>Website</td><td>{biz.website || '—'}</td></tr>
            <tr>
              <td>Bank Account</td>
              <td>
                {biz.bank_bsb || biz.bank_account
                  ? `${biz.bank_name ? biz.bank_name + ' — ' : ''}BSB ${biz.bank_bsb || '—'} / Acct ${biz.bank_account || '—'}`
                  : <span className="badge lowstock">Not set</span>}
              </td>
            </tr>
            <tr><td>Payment Terms</td><td>{biz.payment_terms || '—'}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Business License &amp; Insurance</h2>
          {canManage && <button className="btn ghost sm" onClick={openBizEdit}>Edit</button>}
        </div>
        <table>
          <thead><tr><th>Item</th><th>Provider / Number</th><th>Expiry</th></tr></thead>
          <tbody>
            <tr>
              <td>Contractor License</td>
              <td>{biz.contractor_license_number || '—'}</td>
              <td>
                {biz.contractor_license_expiry ? (
                  <span className={`badge ${licenseWarning(biz.contractor_license_expiry) ? 'lowstock' : 'instock'}`}>
                    {licenseWarning(biz.contractor_license_expiry) === 'expired' ? 'Expired' : licenseWarning(biz.contractor_license_expiry) === 'expiring' ? 'Expiring Soon' : 'Valid'} {dstr(biz.contractor_license_expiry)}
                  </span>
                ) : '—'}
              </td>
            </tr>
            <tr>
              <td>Public Liability Insurance</td>
              <td>{biz.public_liability_provider || '—'}</td>
              <td>
                {biz.public_liability_expiry ? (
                  <span className={`badge ${licenseWarning(biz.public_liability_expiry) ? 'lowstock' : 'instock'}`}>
                    {licenseWarning(biz.public_liability_expiry) === 'expired' ? 'Expired' : licenseWarning(biz.public_liability_expiry) === 'expiring' ? 'Expiring Soon' : 'Valid'} {dstr(biz.public_liability_expiry)}
                  </span>
                ) : '—'}
              </td>
            </tr>
            <tr>
              <td>Workers Comp Insurance</td>
              <td>{biz.workers_comp_provider || '—'}</td>
              <td>
                {biz.workers_comp_expiry ? (
                  <span className={`badge ${licenseWarning(biz.workers_comp_expiry) ? 'lowstock' : 'instock'}`}>
                    {licenseWarning(biz.workers_comp_expiry) === 'expired' ? 'Expired' : licenseWarning(biz.workers_comp_expiry) === 'expiring' ? 'Expiring Soon' : 'Valid'} {dstr(biz.workers_comp_expiry)}
                  </span>
                ) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2 className="section-title">Licensed Team</h2>
        <table>
          <thead><tr><th>Name</th><th>License Number</th><th>Expiry</th></tr></thead>
          <tbody>
            {employees.map((e) => {
              const warn = licenseWarning(e.license_expiry);
              return (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>{e.license_number || '—'}</td>
                  <td>
                    {e.license_expiry ? (
                      <span className={`badge ${warn ? 'lowstock' : 'instock'}`}>
                        {warn === 'expired' ? 'Expired' : warn === 'expiring' ? 'Expiring Soon' : 'Valid'} {dstr(e.license_expiry)}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {employees.length === 0 && <div className="empty">No active team members yet — add them from Payroll &gt; Employees.</div>}
      </div>

      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Compliance Records</h2>
        <div className="filters">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            {COMPLIANCE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input placeholder="Search reference, job, client..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn amber sm" onClick={openNew}>+ Add Record</button>
        </div>
      </div>

      <div className="panel card-table">
        <table>
          <thead>
            <tr>
              <th>Type</th><th>Date</th><th>Reference #</th><th>Job / Client</th><th>Electrician</th>
              <th>Result</th><th>Retest Due</th><th>File</th><th>Logged By</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const busy = busyId === r.id;
              const warn = dueSoon(r.retest_due);
              return (
                <tr key={r.id}>
                  <td data-label="Type"><span className={`badge ${slug(r.type)}`}>{r.type}</span></td>
                  <td data-label="Date">{dstr(r.record_date) || '—'}</td>
                  <td data-label="Reference #">{r.reference_number || '—'}</td>
                  <td data-label="Job / Client">{r.job_number ? `${r.job_number} — ${r.client_name || ''}` : r.client_name || '—'}</td>
                  <td data-label="Electrician">{r.employee_name || '—'}</td>
                  <td data-label="Result">{r.result ? <span className={`badge ${slug(r.result)}`}>{r.result}</span> : '—'}</td>
                  <td data-label="Retest Due">
                    {r.retest_due ? (
                      <span className={`badge ${warn ? 'lowstock' : 'instock'}`}>{dstr(r.retest_due)}</span>
                    ) : '—'}
                  </td>
                  <td data-label="File">
                    {r.file_url ? (
                      <a href={r.file_url} target="_blank" rel="noreferrer">
                        {/\.(jpe?g|png|webp)$/i.test(r.file_url) ? (
                          <img src={r.file_url} alt="Certificate" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', display: 'block' }} />
                        ) : 'View PDF'}
                      </a>
                    ) : '—'}
                  </td>
                  <td data-label="Logged By">{r.uploaded_by}</td>
                  <td className="cell-actions" data-label="">
                    <div className="row-actions">
                      {canManage && <button className="btn ghost sm" disabled={busy} onClick={() => openEdit(r)}>Edit</button>}
                      {canManage && <button className="btn danger sm" disabled={busy} onClick={() => del(r.id)}>{busy ? 'Deleting…' : 'Delete'}</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No compliance records match your filters.</div>}
      </div>

      <Modal open={!!modal}>
        {modal && (
          <>
            <h3>{modal.id ? 'Edit Compliance Record' : 'Add Compliance Record'}</h3>
            <div className="grid-2">
              <div className="field">
                <label>Type *</label>
                <select value={modal.type} onChange={(e) => setModal({ ...modal, type: e.target.value })}>
                  {COMPLIANCE_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Date *</label>
                <input type="date" value={modal.recordDate} onChange={(e) => setModal({ ...modal, recordDate: e.target.value })} />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Job (optional)</label>
                <select value={modal.jobId} onChange={(e) => onJobChange(e.target.value)}>
                  <option value="">— Not tied to a job —</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.job_number} — {j.client_name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Client {modal.jobId ? '' : '(optional)'}</label>
                <select disabled={!!modal.jobId} value={modal.clientId} onChange={(e) => setModal({ ...modal, clientId: e.target.value })}>
                  <option value="">— Select client —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Electrician</label>
                <select value={modal.employeeId} onChange={(e) => setModal({ ...modal, employeeId: e.target.value })}>
                  <option value="">— Select —</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.license_number ? ` (${e.license_number})` : ''}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Reference / Certificate #</label>
                <input value={modal.referenceNumber} onChange={(e) => setModal({ ...modal, referenceNumber: e.target.value })} />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Result</label>
                <select value={modal.result} onChange={(e) => setModal({ ...modal, result: e.target.value })}>
                  <option value="">— Not set —</option>
                  {COMPLIANCE_RESULTS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Retest / Next Due Date</label>
                <input type="date" value={modal.retestDue} onChange={(e) => setModal({ ...modal, retestDue: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Description</label>
              <input value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} placeholder="e.g. Main switchboard upgrade, 3x power tools tested" />
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea rows={2} value={modal.notes} onChange={(e) => setModal({ ...modal, notes: e.target.value })} />
            </div>
            {!modal.id && (
              <div className="field">
                <label>Attach Certificate (photo or PDF, optional)</label>
                <input type="file" accept="image/*,application/pdf" onChange={(e) => setModal({ ...modal, file: e.target.files[0] || null })} />
              </div>
            )}
            {modal.id && modal.fileUrl && (
              <div className="field">
                <label>Attached Certificate</label>
                <div><a href={modal.fileUrl} target="_blank" rel="noreferrer">View attached file</a></div>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn ghost" disabled={saving} onClick={() => setModal(null)}>Cancel</button>
              <button className="btn amber" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Record'}</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!detailsModal} wide>
        {detailsModal && (
          <>
            <h3>Edit Business Details</h3>
            <div className="small-note" style={{ marginBottom: 12 }}>
              These appear on every quote, invoice and purchase order you issue.
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Legal / Trading Name</label>
                <input
                  placeholder="Prophase Data and Electrical"
                  value={detailsModal.legalName}
                  onChange={(e) => setDetailsModal({ ...detailsModal, legalName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>ABN</label>
                <input
                  placeholder="12 345 678 901"
                  value={detailsModal.abn}
                  onChange={(e) => setDetailsModal({ ...detailsModal, abn: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>Business Address</label>
              <input value={detailsModal.address} onChange={(e) => setDetailsModal({ ...detailsModal, address: e.target.value })} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Phone</label>
                <input value={detailsModal.phone} onChange={(e) => setDetailsModal({ ...detailsModal, phone: e.target.value })} />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={detailsModal.email} onChange={(e) => setDetailsModal({ ...detailsModal, email: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Website</label>
              <input value={detailsModal.website} onChange={(e) => setDetailsModal({ ...detailsModal, website: e.target.value })} />
            </div>
            <h4 style={{ margin: '18px 0 6px' }}>Payment Details</h4>
            <div className="small-note" style={{ marginBottom: 10 }}>
              Printed on invoices so customers can pay you without having to ask.
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Bank Name</label>
                <input value={detailsModal.bankName} onChange={(e) => setDetailsModal({ ...detailsModal, bankName: e.target.value })} />
              </div>
              <div className="field">
                <label>BSB</label>
                <input placeholder="000-000" value={detailsModal.bankBsb} onChange={(e) => setDetailsModal({ ...detailsModal, bankBsb: e.target.value })} />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Account Number</label>
                <input value={detailsModal.bankAccount} onChange={(e) => setDetailsModal({ ...detailsModal, bankAccount: e.target.value })} />
              </div>
              <div className="field">
                <label>Payment Terms</label>
                <input
                  placeholder="Payment due within 14 days"
                  value={detailsModal.paymentTerms}
                  onChange={(e) => setDetailsModal({ ...detailsModal, paymentTerms: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn ghost" disabled={savingDetails} onClick={() => setDetailsModal(null)}>Cancel</button>
              <button className="btn amber" disabled={savingDetails} onClick={saveDetails}>{savingDetails ? 'Saving…' : 'Save'}</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!bizModal}>
        {bizModal && (
          <>
            <h3>Edit Business License &amp; Insurance</h3>
            <div className="grid-2">
              <div className="field">
                <label>Contractor License Number</label>
                <input value={bizModal.contractorLicenseNumber} onChange={(e) => setBizModal({ ...bizModal, contractorLicenseNumber: e.target.value })} />
              </div>
              <div className="field">
                <label>License Expiry</label>
                <input type="date" value={bizModal.contractorLicenseExpiry} onChange={(e) => setBizModal({ ...bizModal, contractorLicenseExpiry: e.target.value })} />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Public Liability Insurer</label>
                <input value={bizModal.publicLiabilityProvider} onChange={(e) => setBizModal({ ...bizModal, publicLiabilityProvider: e.target.value })} />
              </div>
              <div className="field">
                <label>Public Liability Expiry</label>
                <input type="date" value={bizModal.publicLiabilityExpiry} onChange={(e) => setBizModal({ ...bizModal, publicLiabilityExpiry: e.target.value })} />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Workers Comp Insurer</label>
                <input value={bizModal.workersCompProvider} onChange={(e) => setBizModal({ ...bizModal, workersCompProvider: e.target.value })} />
              </div>
              <div className="field">
                <label>Workers Comp Expiry</label>
                <input type="date" value={bizModal.workersCompExpiry} onChange={(e) => setBizModal({ ...bizModal, workersCompExpiry: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn ghost" disabled={savingBiz} onClick={() => setBizModal(null)}>Cancel</button>
              <button className="btn amber" disabled={savingBiz} onClick={saveBiz}>{savingBiz ? 'Saving…' : 'Save'}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
