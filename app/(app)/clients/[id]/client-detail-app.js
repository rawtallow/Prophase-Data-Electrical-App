'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast, confirmDialog } from '../../ui-feedback';
import { money, slug, toDisplayDate as fmtDate } from '../../../../lib/format';
import { LEAD_SOURCES } from '../../../../lib/lead-sources';
import { getList, PENDING_APPROVAL_MESSAGE } from '../../../../lib/api';

const TABS = ['Overview', 'Assets', 'Jobs', 'Documents', 'Invoices', 'Notes', 'Settings'];

// Same 30-day warning window as the Compliance page's own dueSoon().
function retestBadge(retestDue) {
  if (!retestDue) return null;
  const days = (new Date(retestDue) - new Date()) / 86400000;
  if (days < 0) return 'lowstock';
  if (days <= 30) return 'lowstock';
  return 'instock';
}

function emptyAssetForm() {
  return { name: '', model: '', serial: '', installDate: '', warrantyExpiry: '', notes: '' };
}

export default function ClientDetailApp({
  initialClient, initialAssets, quotes, jobs, compliance, contracts, jobsByAsset,
  showContracts, fullAccess, canManage
}) {
  const router = useRouter();
  const [client, setClient] = useState(initialClient);
  const [assets, setAssets] = useState(initialAssets);
  const [tab, setTab] = useState('Overview');

  const [form, setForm] = useState({
    name: initialClient.name,
    company: initialClient.company || '',
    phone: initialClient.phone || '',
    email: initialClient.email || '',
    address: initialClient.address || '',
    leadSource: initialClient.lead_source || ''
  });
  const [savingClient, setSavingClient] = useState(false);

  const [notesDraft, setNotesDraft] = useState(initialClient.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);

  const [assetForm, setAssetForm] = useState(emptyAssetForm());
  const [savingAsset, setSavingAsset] = useState(false);
  const [busyAssetId, setBusyAssetId] = useState(null);

  const [deleting, setDeleting] = useState(false);

  // Keeps client, form, and notesDraft all in sync after any successful save
  // — regardless of which tab triggered it — so a save on one tab never
  // clobbers an unrelated in-progress edit sitting in another tab's draft.
  function applyUpdatedClient(updated) {
    setClient(updated);
    setForm({
      name: updated.name,
      company: updated.company || '',
      phone: updated.phone || '',
      email: updated.email || '',
      address: updated.address || '',
      leadSource: updated.lead_source || ''
    });
    setNotesDraft(updated.notes || '');
  }

  async function saveOverview() {
    if (!form.name.trim()) return toast.error('Name is required');
    setSavingClient(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, notes: client.notes })
      });
      if (res.ok) {
        applyUpdatedClient(await res.json());
        toast.success('Client updated');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save client');
      }
    } finally {
      setSavingClient(false);
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: client.name,
          company: client.company,
          phone: client.phone,
          email: client.email,
          address: client.address,
          leadSource: client.lead_source,
          notes: notesDraft
        })
      });
      if (res.ok) {
        applyUpdatedClient(await res.json());
        toast.success('Notes saved');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save notes');
      }
    } finally {
      setSavingNotes(false);
    }
  }

  function editAsset(a) {
    setAssetForm({
      id: a.id,
      name: a.name,
      model: a.model || '',
      serial: a.serial || '',
      installDate: a.install_date ? String(a.install_date).slice(0, 10) : '',
      warrantyExpiry: a.warranty_expiry ? String(a.warranty_expiry).slice(0, 10) : '',
      notes: a.notes || ''
    });
  }

  async function refreshAssets() {
    try {
      setAssets(await getList(`/api/assets?clientId=${client.id}`));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveAsset() {
    if (!assetForm.name.trim()) return toast.error('Asset name / type is required');
    setSavingAsset(true);
    try {
      const method = assetForm.id ? 'PUT' : 'POST';
      const url = assetForm.id ? `/api/assets/${assetForm.id}` : '/api/assets';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...assetForm, clientId: client.id })
      });
      if (res.ok) {
        setAssetForm(emptyAssetForm());
        toast.success('Asset saved');
        await refreshAssets();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save asset');
      }
    } finally {
      setSavingAsset(false);
    }
  }

  async function deleteAsset(id) {
    const ok = await confirmDialog('Delete this asset record?', { title: 'Delete asset', confirmLabel: 'Delete Asset', danger: true });
    if (!ok) return;
    setBusyAssetId(id);
    try {
      const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        if (d.pending) {
          toast.success(PENDING_APPROVAL_MESSAGE);
        } else {
          toast.success('Asset deleted');
          await refreshAssets();
        }
      } else {
        toast.error(d.error || 'Could not delete asset');
      }
    } finally {
      setBusyAssetId(null);
    }
  }

  async function deleteClient() {
    const ok = await confirmDialog('Delete this client? Existing quotes and jobs will keep their saved info.', {
      title: 'Delete client',
      confirmLabel: 'Delete Client',
      danger: true
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        if (d.pending) {
          toast.success(PENDING_APPROVAL_MESSAGE);
          setDeleting(false);
        } else {
          toast.success('Client deleted');
          router.push('/clients');
        }
      } else {
        toast.error(d.error || 'Could not delete client');
        setDeleting(false);
      }
    } catch {
      toast.error('Could not delete client');
      setDeleting(false);
    }
  }

  const invoicedJobs = jobs.filter((j) => Number(j.amount_invoiced) > 0);

  return (
    <>
      <div className="toolbar">
        <div>
          <Link href="/clients" className="small-note" style={{ display: 'inline-block', marginBottom: 6 }}>&larr; All Clients</Link>
          <h2 className="section-title" style={{ margin: 0 }}>{client.name}</h2>
          {client.company && <div className="small-note">{client.company}</div>}
        </div>
        {client.lead_source && <span className={`badge ${slug(client.lead_source)}`}>{client.lead_source}</span>}
      </div>

      <div className="subtabs">
        {TABS.map((t) => (
          <a key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)} style={{ cursor: 'pointer' }}>{t}</a>
        ))}
      </div>

      {tab === 'Overview' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <div className="grid-2">
              <div className="field">
                <label>Name *</label>
                <input disabled={!canManage} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Company</label>
                <input disabled={!canManage} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Phone</label>
                <input disabled={!canManage} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="field">
                <label>Email</label>
                <input disabled={!canManage} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Address</label>
                <input disabled={!canManage} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="field">
                <label>How did they find us?</label>
                <select disabled={!canManage} value={form.leadSource} onChange={(e) => setForm({ ...form, leadSource: e.target.value })}>
                  <option value="">— Not set —</option>
                  {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            {canManage && (
              <div className="footer-actions">
                <button className="btn amber" disabled={savingClient} onClick={saveOverview}>{savingClient ? 'Saving…' : 'Save Changes'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Assets' && (
        <div key={tab} className="page-transition">
          {canManage && (
            <div className="panel">
              <h2 className="section-title">{assetForm.id ? 'Edit Asset' : 'Add Asset'}</h2>
              <div className="grid-3">
                <div className="field">
                  <label>Name / Type *</label>
                  <input placeholder="e.g. Switchboard, EV Charger" value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} />
                </div>
                <div className="field">
                  <label>Model</label>
                  <input value={assetForm.model} onChange={(e) => setAssetForm({ ...assetForm, model: e.target.value })} />
                </div>
                <div className="field">
                  <label>Serial Number</label>
                  <input value={assetForm.serial} onChange={(e) => setAssetForm({ ...assetForm, serial: e.target.value })} />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Install Date</label>
                  <input type="date" value={assetForm.installDate} onChange={(e) => setAssetForm({ ...assetForm, installDate: e.target.value })} />
                </div>
                <div className="field">
                  <label>Warranty Expiry</label>
                  <input type="date" value={assetForm.warrantyExpiry} onChange={(e) => setAssetForm({ ...assetForm, warrantyExpiry: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Notes</label>
                <textarea rows={2} value={assetForm.notes} onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })} />
              </div>
              <div className="footer-actions">
                <button className="btn ghost sm" disabled={savingAsset} onClick={() => setAssetForm(emptyAssetForm())}>Clear / New Asset</button>
                <button className="btn amber sm" disabled={savingAsset} onClick={saveAsset}>{savingAsset ? 'Saving…' : 'Save Asset'}</button>
              </div>
            </div>
          )}

          <div className="panel card-table">
            <h2 className="section-title">Assets ({assets.length})</h2>
            <table>
              <thead>
                <tr>
                  <th>Name / Type</th><th>Model</th><th>Serial</th><th>Installed</th><th>Warranty Exp.</th><th>Job History</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => {
                  const history = jobsByAsset[a.id] || [];
                  return (
                    <tr key={a.id}>
                      <td data-label="Name / Type">{a.name}</td>
                      <td data-label="Model">{a.model || '—'}</td>
                      <td data-label="Serial">{a.serial || '—'}</td>
                      <td data-label="Installed">{fmtDate(a.install_date)}</td>
                      <td data-label="Warranty Exp.">{fmtDate(a.warranty_expiry)}</td>
                      <td data-label="Job History">
                        {history.length === 0 && '—'}
                        {history.map((j) => (
                          <div key={j.id} style={{ marginBottom: 4, whiteSpace: 'nowrap' }}>
                            {j.job_number} <span className={`badge ${slug(j.status)}`}>{j.status}</span>
                          </div>
                        ))}
                      </td>
                      {canManage && (
                        <td className="cell-actions" data-label="">
                          <div className="row-actions">
                            <button className="btn ghost sm" disabled={busyAssetId === a.id} onClick={() => editAsset(a)}>Edit</button>
                            <button className="btn danger sm" disabled={busyAssetId === a.id} onClick={() => deleteAsset(a.id)}>
                              {busyAssetId === a.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {assets.length === 0 && <div className="empty">No assets logged for this client yet.</div>}
          </div>
        </div>
      )}

      {tab === 'Jobs' && (
        <div key={tab} className="page-transition">
          <div className="panel card-table">
            <h2 className="section-title">Quotes ({quotes.length})</h2>
            <table>
              <thead><tr><th>Quote #</th><th>Date</th><th>Status</th><th className="num">Total</th><th>Actions</th></tr></thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td data-label="Quote #">{q.quote_number}</td>
                    <td data-label="Date">{fmtDate(q.date)}</td>
                    <td data-label="Status"><span className={`badge ${slug(q.status)}`}>{q.status}</span></td>
                    <td className="num" data-label="Total">{money(q.total)}</td>
                    <td className="cell-actions" data-label="">
                      {q.approval_status === 'Approved' && (
                        <a className="btn ghost sm" href={`/quotes/${q.id}/print`} target="_blank" rel="noreferrer">Print</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {quotes.length === 0 && <div className="empty">No quotes yet.</div>}
          </div>

          <div className="panel card-table">
            <h2 className="section-title">Jobs ({jobs.length})</h2>
            <table>
              <thead>
                <tr>
                  <th>Job #</th><th>Type</th><th>Assigned</th><th>Scheduled</th><th>Status</th>
                  {fullAccess && <><th className="num">Invoiced</th><th className="num">Balance</th></>}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const balance = Number(j.amount_invoiced) - Number(j.amount_paid);
                  return (
                    <tr key={j.id} onClick={() => router.push(`/jobs/${j.id}`)} style={{ cursor: 'pointer' }}>
                      <td data-label="Job #" style={{ color: 'var(--amber-dark)', fontWeight: 650 }}>{j.job_number}</td>
                      <td data-label="Type"><span className={`badge ${slug(j.job_type)}`}>{j.job_type}</span></td>
                      <td data-label="Assigned">{j.assigned_names || '—'}</td>
                      <td data-label="Scheduled">{fmtDate(j.scheduled_date)}</td>
                      <td data-label="Status"><span className={`badge ${slug(j.status)}`}>{j.status}</span></td>
                      {fullAccess && (
                        <>
                          <td className="num" data-label="Invoiced">{money(j.amount_invoiced)}</td>
                          <td className="num" data-label="Balance" style={{ fontWeight: 700, color: balance > 0 ? 'var(--red)' : 'var(--green)' }}>{money(balance)}</td>
                        </>
                      )}
                      <td className="cell-actions" data-label="" onClick={(e) => e.stopPropagation()}>
                        {fullAccess && Number(j.amount_invoiced) > 0 && (
                          <a className="btn ghost sm" href={`/jobs/${j.id}/invoice`} target="_blank" rel="noreferrer">Invoice</a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {jobs.length === 0 && <div className="empty">No jobs yet.</div>}
          </div>

          <div className="panel card-table">
            <h2 className="section-title">Compliance Records ({compliance.length})</h2>
            <table>
              <thead><tr><th>Type</th><th>Date</th><th>Result</th><th>Retest Due</th><th>Reference #</th></tr></thead>
              <tbody>
                {compliance.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Type">{c.type}</td>
                    <td data-label="Date">{fmtDate(c.record_date)}</td>
                    <td data-label="Result">{c.result || '—'}</td>
                    <td data-label="Retest Due">
                      {c.retest_due ? <span className={`badge ${retestBadge(c.retest_due)}`}>{fmtDate(c.retest_due)}</span> : '—'}
                    </td>
                    <td data-label="Reference #">{c.reference_number || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {compliance.length === 0 && <div className="empty">No compliance records yet.</div>}
          </div>

          {showContracts && (
            <div className="panel card-table">
              <h2 className="section-title">Maintenance Contracts ({contracts.length})</h2>
              <table>
                <thead><tr><th>Title</th><th>Frequency</th><th>Next Due</th><th>Status</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Title">{c.title}</td>
                      <td data-label="Frequency">{c.frequency}</td>
                      <td data-label="Next Due">{fmtDate(c.next_due_date)}</td>
                      <td data-label="Status"><span className={`badge ${slug(c.status)}`}>{c.status}</span></td>
                      <td className="num" data-label="Amount">{money(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {contracts.length === 0 && <div className="empty">No maintenance contracts yet.</div>}
            </div>
          )}
        </div>
      )}

      {tab === 'Documents' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Documents</h2>
            <div className="empty">
              Document and photo storage for clients hasn&apos;t been built yet — this tab is ready for it. Let us know if you&apos;d like to attach contracts, site photos, or other files here.
            </div>
          </div>
        </div>
      )}

      {tab === 'Invoices' && (
        <div key={tab} className="page-transition">
          <div className="panel card-table">
            <h2 className="section-title">Invoices</h2>
            {!fullAccess ? (
              <div className="empty">Financial details are only visible to admins and managers.</div>
            ) : (
              <>
                <table>
                  <thead><tr><th>Job #</th><th>Date</th><th>Status</th><th className="num">Invoiced</th><th className="num">Paid</th><th className="num">Balance</th><th>Actions</th></tr></thead>
                  <tbody>
                    {invoicedJobs.map((j) => {
                      const balance = Number(j.amount_invoiced) - Number(j.amount_paid);
                      return (
                        <tr key={j.id}>
                          <td data-label="Job #">{j.job_number}</td>
                          <td data-label="Date">{fmtDate(j.created_date)}</td>
                          <td data-label="Status"><span className={`badge ${slug(j.status)}`}>{j.status}</span></td>
                          <td className="num" data-label="Invoiced">{money(j.amount_invoiced)}</td>
                          <td className="num" data-label="Paid">{money(j.amount_paid)}</td>
                          <td className="num" data-label="Balance" style={{ fontWeight: 700, color: balance > 0 ? 'var(--red)' : 'var(--green)' }}>{money(balance)}</td>
                          <td className="cell-actions" data-label="">
                            <a className="btn ghost sm" href={`/jobs/${j.id}/invoice`} target="_blank" rel="noreferrer">View Invoice</a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {invoicedJobs.length === 0 && <div className="empty">No invoiced jobs yet.</div>}
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'Notes' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Notes</h2>
            <div className="field">
              <textarea
                rows={8}
                disabled={!canManage}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder={canManage ? 'Anything worth remembering about this client…' : 'No notes yet.'}
              />
            </div>
            {canManage && (
              <div className="footer-actions">
                <button className="btn amber" disabled={savingNotes} onClick={saveNotes}>{savingNotes ? 'Saving…' : 'Save Notes'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Settings' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Client Details</h2>
            <div className="grid-2">
              <div><div className="small-note">Client Since</div>{fmtDate(client.created_at)}</div>
            </div>
          </div>
          {canManage && (
            <div className="panel" style={{ borderColor: 'var(--red)' }}>
              <h2 className="section-title" style={{ color: 'var(--red)' }}>Danger Zone</h2>
              <p className="small-note">
                Deleting a client is permanent. Existing quotes and jobs keep their saved info, but a client with compliance records on file can&apos;t be deleted.
              </p>
              <button className="btn danger" disabled={deleting} onClick={deleteClient}>{deleting ? 'Deleting…' : 'Delete Client'}</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
