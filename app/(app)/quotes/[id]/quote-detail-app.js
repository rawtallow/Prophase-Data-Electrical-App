'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast, confirmDialog } from '../../ui-feedback';
import { money, slug, toDateInputValue as dstr, toDisplayDate as fmtDate } from '../../../../lib/format';
import { getJson, PENDING_APPROVAL_MESSAGE } from '../../../../lib/api';

const TABS = ['Overview', 'Quote Details', 'Line Items', 'Client', 'Status', 'Documents', 'Notes', 'History'];

export default function QuoteDetailApp({ initialQuote, initialLineItems, initialSends, clients, linkedJob, myId, fullAccess, canEdit }) {
  const router = useRouter();
  const [quote, setQuote] = useState(initialQuote);
  const [lineItems, setLineItems] = useState(
    initialLineItems.length
      ? initialLineItems.map((li) => ({ description: li.description, qty: li.qty, price: li.price }))
      : [{ description: '', qty: 1, price: 0 }]
  );
  const [sends, setSends] = useState(initialSends);
  const [tab, setTab] = useState('Overview');
  const [saving, setSaving] = useState(false);

  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [converting, setConverting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [emailForm, setEmailForm] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  function openEmailForm() {
    setEmailForm({
      to: quote.client_email || '',
      subject: `Quote ${quote.quote_number} from PROPHASE Data and Electrical`,
      body:
        `Hi ${quote.client_name || 'there'},\n\n` +
        `Please find attached our quote ${quote.quote_number}${quote.job_description ? ` for ${quote.job_description}` : ''}.\n\n` +
        `Total: ${money(quote.total)} (incl. GST)\n` +
        (quote.valid_until ? `Valid until: ${fmtDate(quote.valid_until)}\n\n` : '\n') +
        `If you have any questions or you're happy to go ahead, just reply to this email.\n\n` +
        `Thanks,\nPROPHASE Data and Electrical`
    });
  }

  async function sendQuoteEmail() {
    if (!emailForm.to.trim()) return toast.error('Enter a recipient email address');
    const ok = await confirmDialog(`Send this quote to ${emailForm.to.trim()}?`, {
      title: 'Email quote',
      confirmLabel: 'Send Email'
    });
    if (!ok) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailForm)
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Quote emailed to ${emailForm.to.trim()}`);
        if (d.quote) setQuote(d.quote);
        setEmailForm(null);
        try { setSends(await getJson(`/api/quotes/${quote.id}`).then((q) => q.sends)); } catch { /* history refresh is best-effort */ }
      } else {
        toast.error(d.error || 'Could not send email');
      }
    } finally {
      setSendingEmail(false);
    }
  }

  function set(field, value) { setQuote({ ...quote, [field]: value }); }

  // Keeps client_id in sync with whatever name is typed/picked from the
  // datalist — same pattern as quote-form.js / Job Log's onClientNameChange.
  function onClientNameChange(name) {
    const match = clients.find((c) => c.name.toLowerCase() === name.toLowerCase());
    setQuote({ ...quote, client_name: name, client_id: match ? match.id : null });
  }

  function updateItem(i, field, value) {
    const next = [...lineItems];
    next[i] = { ...next[i], [field]: value };
    setLineItems(next);
  }
  function addItem() { setLineItems([...lineItems, { description: '', qty: 1, price: 0 }]); }
  function removeItem(i) { setLineItems(lineItems.filter((_, idx) => idx !== i)); }

  const subtotal = lineItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.price) || 0), 0);
  const taxable = Math.max(subtotal - (Number(quote.discount) || 0), 0);
  const tax = taxable * ((Number(quote.tax_rate) || 0) / 100);
  const total = taxable + tax;

  // Every tab shares this one Save — the PUT always replaces the whole
  // record, so whichever tab's Save button was clicked, the payload always
  // carries the CURRENT shared draft state for every field, not just the
  // ones that tab visually owns.
  async function saveQuote(successMsg) {
    if (!quote.client_name.trim()) return toast.error('Customer name is required');
    setSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: quote.client_id,
          clientName: quote.client_name,
          clientPhone: quote.client_phone,
          clientEmail: quote.client_email,
          clientAddress: quote.client_address,
          jobDescription: quote.job_description,
          lineItems,
          taxRate: quote.tax_rate,
          discount: quote.discount,
          status: quote.status,
          notes: quote.notes,
          internalNotes: quote.internal_notes,
          // quote.valid_until can still be the raw Date object handed down
          // from the Server Component on first load (RSC props bypass the
          // API's serializeDates entirely) — JSON.stringify-ing a Date calls
          // its UTC toJSON(), which can land on the wrong calendar day once
          // the server reads it back. Always send the plain date string.
          validUntil: dstr(quote.valid_until)
        })
      });
      if (res.ok) {
        setQuote(await res.json());
        toast.success(successMsg || (fullAccess ? 'Quote updated' : 'Submitted for approval'));
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save quote');
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitReview(decision) {
    setReviewing(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: reviewNote })
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        if (d.pending) {
          toast.success(PENDING_APPROVAL_MESSAGE);
        } else {
          toast.success(decision === 'approved' ? 'Quote approved' : 'Sent back to the drafter');
          setQuote(await getJson(`/api/quotes/${quote.id}`));
        }
        setReviewNote('');
      } else {
        toast.error(d.error || 'Could not save review');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReviewing(false);
    }
  }

  async function duplicateQuote() {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const created = await res.json();
        toast.success('Quote duplicated');
        router.push(`/quotes/${created.id}`);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not duplicate quote');
        setDuplicating(false);
      }
    } catch {
      toast.error('Could not duplicate quote');
      setDuplicating(false);
    }
  }

  async function convertToJob() {
    setConverting(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/convert`, { method: 'POST' });
      if (res.ok) {
        toast.success('Converted to a job');
        router.push('/jobs');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not convert to a job');
        setConverting(false);
      }
    } catch {
      toast.error('Could not convert to a job');
      setConverting(false);
    }
  }

  async function deleteQuote() {
    const ok = await confirmDialog('Delete this quote? This cannot be undone.', {
      title: 'Delete quote',
      confirmLabel: 'Delete Quote',
      danger: true
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        if (d.pending) {
          toast.success(PENDING_APPROVAL_MESSAGE);
          setDeleting(false);
        } else {
          toast.success('Quote deleted');
          router.push('/quotes');
        }
      } else {
        toast.error(d.error || 'Could not delete quote');
        setDeleting(false);
      }
    } catch {
      toast.error('Could not delete quote');
      setDeleting(false);
    }
  }

  const canDelete = fullAccess || (quote.created_by_id === myId && quote.approval_status !== 'Approved');
  const canPrint = fullAccess && quote.approval_status === 'Approved';
  const canConvert = fullAccess && quote.approval_status === 'Approved' && ['Draft', 'Sent'].includes(quote.status);
  const statusOptions = quote.approval_status === 'Approved' ? ['Draft', 'Sent', 'Accepted', 'Declined'] : ['Draft'];
  const isExpired = quote.valid_until && new Date(quote.valid_until) < new Date() && ['Draft', 'Sent'].includes(quote.status);

  return (
    <>
      <div className="toolbar">
        <div>
          <Link href="/quotes" className="small-note" style={{ display: 'inline-block', marginBottom: 6 }}>&larr; All Quotes</Link>
          <h2 className="section-title" style={{ margin: 0 }}>Quote {quote.quote_number}</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span className={`badge ${slug(quote.approval_status)}`}>{quote.approval_status}</span>
          <span className={`badge ${slug(quote.status)}`}>{quote.status}</span>
          {isExpired && <span className="badge cancelled">Expired</span>}
        </div>
      </div>

      {!fullAccess && (
        <div className="panel small-note" style={{ marginBottom: 14 }}>
          {quote.approval_status === 'Rejected'
            ? 'A manager sent this back — make your changes and save to resubmit it for approval.'
            : quote.approval_status === 'Pending Approval'
              ? 'This quote is awaiting manager or admin approval before it can be sent to the customer.'
              : 'This quote has been approved and can no longer be edited.'}
        </div>
      )}
      {quote.approval_status === 'Rejected' && quote.approval_note && (
        <div className="error-box" style={{ marginBottom: 14 }}>
          <strong>Feedback from {quote.reviewed_by || 'reviewer'}:</strong> {quote.approval_note}
        </div>
      )}

      <div className="subtabs">
        {TABS.map((t) => (
          <a key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)} style={{ cursor: 'pointer' }}>{t}</a>
        ))}
      </div>

      {tab === 'Overview' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <div className="grid-3">
              <div><div className="small-note">Total</div><div style={{ fontSize: 20, fontWeight: 700 }}>{money(quote.total)}</div></div>
              <div><div className="small-note">Valid Until</div>{fmtDate(quote.valid_until)}</div>
              <div><div className="small-note">Created</div>{fmtDate(quote.created_at)}</div>
            </div>
          </div>
          <div className="panel">
            <h2 className="section-title">Client</h2>
            <div className="grid-3">
              <div>
                <div className="small-note">Name</div>
                {quote.client_id ? <Link href={`/clients/${quote.client_id}`}>{quote.client_name}</Link> : quote.client_name}
              </div>
              <div><div className="small-note">Phone</div>{quote.client_phone || '—'}</div>
              <div><div className="small-note">Email</div>{quote.client_email || '—'}</div>
            </div>
          </div>
          {linkedJob && (
            <div className="panel">
              <h2 className="section-title">Linked Job</h2>
              <p>Converted to <strong>{linkedJob.job_number}</strong> — <span className={`badge ${slug(linkedJob.status)}`}>{linkedJob.status}</span></p>
              <Link className="btn ghost sm" href="/jobs">View in Job Log</Link>
            </div>
          )}
        </div>
      )}

      {tab === 'Quote Details' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <div className="field">
              <label>Job Description</label>
              <textarea rows={3} disabled={!canEdit} value={quote.job_description || ''} onChange={(e) => set('job_description', e.target.value)} />
            </div>
            <div className={fullAccess ? 'grid-3' : 'grid-2'}>
              <div className="field">
                <label>GST (%)</label>
                <input type="number" min="0" step="0.01" disabled={!canEdit} value={quote.tax_rate} onChange={(e) => set('tax_rate', e.target.value)} />
              </div>
              <div className="field">
                <label>Discount ($)</label>
                <input type="number" min="0" step="0.01" disabled={!canEdit} value={quote.discount} onChange={(e) => set('discount', e.target.value)} />
              </div>
              {fullAccess && (
                <div className="field">
                  <label>Status</label>
                  <select value={quote.status} onChange={(e) => set('status', e.target.value)}>
                    {statusOptions.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="field">
              <label>Valid Until</label>
              <input type="date" disabled={!canEdit} value={dstr(quote.valid_until)} onChange={(e) => set('valid_until', e.target.value)} />
            </div>
            {canEdit && (
              <div className="footer-actions">
                <button className="btn amber" disabled={saving} onClick={() => saveQuote()}>{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Line Items' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <table>
              <thead><tr><th style={{ width: '50%' }}>Description</th><th className="num">Qty</th><th className="num">Unit Price</th><th className="num">Line Total</th><th></th></tr></thead>
              <tbody>
                {lineItems.map((li, i) => (
                  <tr key={i}>
                    <td><input disabled={!canEdit} value={li.description} placeholder="Materials, labor, service..." onChange={(e) => updateItem(i, 'description', e.target.value)} /></td>
                    <td className="num"><input type="number" min="0" step="0.01" disabled={!canEdit} value={li.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} /></td>
                    <td className="num"><input type="number" min="0" step="0.01" disabled={!canEdit} value={li.price} onChange={(e) => updateItem(i, 'price', e.target.value)} /></td>
                    <td className="num" style={{ fontWeight: 600 }}>{money((Number(li.qty) || 0) * (Number(li.price) || 0))}</td>
                    <td>{canEdit && <button className="btn danger sm" disabled={lineItems.length <= 1} onClick={() => removeItem(i)}>&times;</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canEdit && <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={addItem}>+ Add Line Item</button>}

            <div className="totals-box">
              <div className="line"><span>Subtotal</span><span>{money(subtotal)}</span></div>
              <div className="line"><span>Discount</span><span>-{money(quote.discount)}</span></div>
              <div className="line"><span>GST ({Number(quote.tax_rate) || 0}%)</span><span>{money(tax)}</span></div>
              <div className="line total"><span>Total</span><span>{money(total)}</span></div>
            </div>
            {canEdit && (
              <div className="footer-actions">
                <button className="btn amber" disabled={saving} onClick={() => saveQuote()}>{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Client' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <div className="grid-2">
              <div className="field">
                <label>Customer Name *</label>
                <input list="client-names" disabled={!canEdit} value={quote.client_name} onChange={(e) => onClientNameChange(e.target.value)} />
                <datalist id="client-names">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
              </div>
              <div className="field"><label>Phone</label><input disabled={!canEdit} value={quote.client_phone || ''} onChange={(e) => set('client_phone', e.target.value)} /></div>
            </div>
            <div className="grid-2">
              <div className="field"><label>Email</label><input disabled={!canEdit} value={quote.client_email || ''} onChange={(e) => set('client_email', e.target.value)} /></div>
              <div className="field"><label>Job Address</label><input disabled={!canEdit} value={quote.client_address || ''} onChange={(e) => set('client_address', e.target.value)} /></div>
            </div>
            {quote.client_id && <Link className="btn ghost sm" href={`/clients/${quote.client_id}`}>View Client Profile</Link>}
            {canEdit && (
              <div className="footer-actions">
                <button className="btn amber" disabled={saving} onClick={() => saveQuote()}>{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Status' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Approval</h2>
            <p><span className={`badge ${slug(quote.approval_status)}`}>{quote.approval_status}</span></p>
            {quote.approval_status === 'Rejected' && quote.approval_note && (
              <p className="small-note">Feedback from {quote.reviewed_by}: {quote.approval_note}</p>
            )}
            {fullAccess && quote.approval_status === 'Pending Approval' && (
              <>
                <div className="field">
                  <label>Note (shown to the drafter, e.g. what to fix if rejecting)</label>
                  <textarea rows={3} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
                </div>
                <div className="footer-actions">
                  <button className="btn danger-solid" disabled={reviewing} onClick={() => submitReview('rejected')}>{reviewing ? '…' : 'Reject'}</button>
                  <button className="btn amber" disabled={reviewing} onClick={() => submitReview('approved')}>{reviewing ? '…' : 'Approve'}</button>
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <h2 className="section-title">Actions</h2>
            <div className="row-actions">
              {canPrint && <a className="btn ghost sm" href={`/quotes/${quote.id}/print`} target="_blank" rel="noreferrer">Print</a>}
              {canPrint && <a className="btn ghost sm" href={`/api/quotes/${quote.id}/pdf`}>Download PDF</a>}
              {canPrint && !emailForm && <button className="btn amber sm" onClick={openEmailForm}>Email Quote</button>}
              {canPrint && <a className="btn ghost sm" href={`/api/quotes/${quote.id}/agreement`}>Work Agreement</a>}
              {fullAccess && <button className="btn ghost sm" disabled={duplicating} onClick={duplicateQuote}>{duplicating ? 'Duplicating…' : 'Duplicate'}</button>}
              {canConvert && <button className="btn amber sm" disabled={converting} onClick={convertToJob}>{converting ? 'Converting…' : 'Convert to Job'}</button>}
              {canDelete && <button className="btn danger sm" disabled={deleting} onClick={deleteQuote}>{deleting ? 'Deleting…' : 'Delete Quote'}</button>}
            </div>
            {linkedJob && <p className="small-note" style={{ marginTop: 10 }}>Already converted to job {linkedJob.job_number} — Convert to Job is hidden.</p>}

            {emailForm && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <h3 style={{ marginTop: 0 }}>Email Quote {quote.quote_number}</h3>
                <div className="field">
                  <label>To</label>
                  <input type="email" value={emailForm.to} onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })} />
                </div>
                <div className="field">
                  <label>Subject</label>
                  <input value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} />
                </div>
                <div className="field">
                  <label>Message</label>
                  <textarea rows={8} value={emailForm.body} onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })} />
                </div>
                <p className="small-note">The PDF quote is attached automatically. Sending marks this quote as Sent.</p>
                <div className="row-actions">
                  <button className="btn ghost sm" disabled={sendingEmail} onClick={() => setEmailForm(null)}>Cancel</button>
                  <button className="btn amber sm" disabled={sendingEmail} onClick={sendQuoteEmail}>{sendingEmail ? 'Sending…' : 'Send Email'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Documents' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Documents</h2>
            <div className="empty">
              Attachments, drawings, and photos aren&apos;t built yet for quotes — this tab is ready for it. The auto-filled Work Agreement is still available from the Status tab.
            </div>
          </div>
        </div>
      )}

      {tab === 'Notes' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Customer Notes / Terms</h2>
            <p className="small-note" style={{ marginTop: -8 }}>Printed on the customer-facing quote.</p>
            <textarea rows={5} disabled={!canEdit} value={quote.notes || ''} onChange={(e) => set('notes', e.target.value)} />
          </div>
          {fullAccess && (
            <div className="panel">
              <h2 className="section-title">Internal Notes</h2>
              <p className="small-note" style={{ marginTop: -8 }}>Only visible to admins/managers — never printed.</p>
              <textarea rows={5} value={quote.internal_notes || ''} onChange={(e) => set('internal_notes', e.target.value)} />
            </div>
          )}
          {canEdit && (
            <div className="footer-actions">
              <button className="btn amber" disabled={saving} onClick={() => saveQuote('Notes saved')}>{saving ? 'Saving…' : 'Save Notes'}</button>
            </div>
          )}
        </div>
      )}

      {tab === 'History' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <div className="grid-2">
              <div><div className="small-note">Created</div>{fmtDate(quote.created_at)}{quote.created_by ? ` by ${quote.created_by}` : ''}</div>
              <div><div className="small-note">Last Updated</div>{quote.updated_at ? fmtDate(quote.updated_at) : '—'}</div>
            </div>
            {quote.reviewed_by && (
              <div style={{ marginTop: 14 }}>
                <div className="small-note">Last Review</div>
                <div>{quote.reviewed_by} — {quote.approval_status}{quote.approval_note ? `: ${quote.approval_note}` : ''}</div>
              </div>
            )}
            {linkedJob && (
              <div style={{ marginTop: 14 }}>
                <div className="small-note">Converted to Job</div>
                <div>{linkedJob.job_number} — <span className={`badge ${slug(linkedJob.status)}`}>{linkedJob.status}</span></div>
              </div>
            )}
          </div>

          <div className="panel">
            <h2 className="section-title">Emails Sent</h2>
            {sends.length === 0 ? (
              <div className="empty">This quote hasn&apos;t been emailed yet.</div>
            ) : (
              <table>
                <thead><tr><th>Date</th><th>To</th><th>Subject</th><th>By</th><th>Status</th></tr></thead>
                <tbody>
                  {sends.map((s) => (
                    <tr key={s.id}>
                      <td data-label="Date">{fmtDate(s.created_at)}</td>
                      <td data-label="To">{s.recipient_email}</td>
                      <td data-label="Subject">{s.subject}</td>
                      <td data-label="By">{s.sent_by || '—'}</td>
                      <td data-label="Status">
                        <span className={`badge ${s.status === 'Sent' ? 'activestatus' : 'lowstock'}`}>{s.status}</span>
                        {s.status === 'Failed' && s.error_message && (
                          <div className="small-note" style={{ marginTop: 2 }}>{s.error_message}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
