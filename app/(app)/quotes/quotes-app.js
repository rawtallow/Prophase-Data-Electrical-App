'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast, confirmDialog } from '../ui-feedback';
import { money, slug, toDateInputValue as dstr } from '../../../lib/format';
import { getList } from '../../../lib/api';

const APPROVAL_STATUSES = ['Pending Approval', 'Approved', 'Rejected'];
const STALE_DAYS = 10;

// A quote that's sat in Draft/Sent for a while without being accepted or
// declined is easy to forget about — flag it so it doesn't just go cold.
function isStale(q) {
  if (q.status !== 'Draft' && q.status !== 'Sent') return false;
  const days = (Date.now() - new Date(q.date)) / 86400000;
  return days >= STALE_DAYS;
}

// Small per-row "⋮" options menu for the less-frequent actions — everything
// else (viewing, editing, reviewing) now happens by clicking into the
// quote's own detail page. Same open/outside-click/stopPropagation shape as
// account-area.js's dropdown, just anchored to a table cell instead of the
// header, and stopping its clicks from also triggering the row's own
// navigate-to-detail-page handler.
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

export default function QuotesApp({ initialQuotes, myId, fullAccess }) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [statusFilter, setStatusFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    try {
      setQuotes(await getList('/api/quotes'));
    } catch (err) {
      toast.error(err.message);
    }
  }

  function canEditOrDelete(q) {
    return fullAccess || (q.created_by_id === myId && q.approval_status !== 'Approved');
  }

  async function del(id) {
    const ok = await confirmDialog('Delete this quote? This cannot be undone.', {
      title: 'Delete quote',
      confirmLabel: 'Delete Quote',
      danger: true
    });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Quote deleted');
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete quote');
      }
    } finally {
      setBusyId(null);
    }
  }
  async function duplicate(id) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/quotes/${id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const created = await res.json();
        toast.success('Quote duplicated');
        router.push(`/quotes/${created.id}`);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not duplicate quote');
        setBusyId(null);
      }
    } catch {
      toast.error('Could not duplicate quote');
      setBusyId(null);
    }
  }
  async function convert(id) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/quotes/${id}/convert`, { method: 'POST' });
      if (res.ok) {
        toast.success('Converted to a job');
        router.push('/jobs');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not convert to job');
        setBusyId(null);
      }
    } catch {
      toast.error('Could not convert to job');
      setBusyId(null);
    }
  }

  const list = quotes.filter((q) => {
    if (statusFilter && q.status !== statusFilter) return false;
    if (approvalFilter && q.approval_status !== approvalFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!q.client_name.toLowerCase().includes(s) && !q.quote_number.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const staleCount = quotes.filter(isStale).length;

  return (
    <>
      {staleCount > 0 && (
        <div className="cards" style={{ marginBottom: 14 }}>
          <div className="card warn">
            <div className="label">Needs Follow-Up ({STALE_DAYS}+ Days, No Response)</div>
            <div className="value">{staleCount}</div>
          </div>
        </div>
      )}
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Quotes</h2>
        <div className="filters">
          <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)}>
            <option value="">All Approvals</option>
            {APPROVAL_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {['Draft', 'Sent', 'Accepted', 'Declined'].map((s) => <option key={s}>{s}</option>)}
          </select>
          <input placeholder="Search customer or #" value={search} onChange={(e) => setSearch(e.target.value)} />
          <a className="btn amber sm" href="/quotes/new">+ New Quote</a>
        </div>
      </div>
      <div className="panel card-table">
        <table>
          <thead>
            <tr>
              <th>Quote #</th><th>Customer</th><th>Date</th><th>Approval</th><th>Status</th>
              <th className="num">Total</th><th>Created By</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((q) => {
              const busy = busyId === q.id;
              const canPrint = fullAccess && q.approval_status === 'Approved';
              const canConvert = canPrint && (q.status === 'Draft' || q.status === 'Sent');
              return (
                <tr key={q.id} onClick={() => router.push(`/quotes/${q.id}`)} style={{ cursor: 'pointer' }}>
                  <td data-label="Quote #" style={{ color: 'var(--amber-dark)', fontWeight: 650 }}>{q.quote_number}</td>
                  <td data-label="Customer">{q.client_name}</td>
                  <td data-label="Date">
                    {dstr(q.date)}
                    {isStale(q) && <div className="small-note" style={{ color: 'var(--red)', fontWeight: 700 }}>Follow up</div>}
                  </td>
                  <td data-label="Approval">
                    <span className={`badge ${slug(q.approval_status)}`}>{q.approval_status}</span>
                    {q.approval_status === 'Rejected' && q.approval_note && (
                      <div className="small-note" style={{ marginTop: 4, maxWidth: 200 }}>{q.approval_note}</div>
                    )}
                  </td>
                  <td data-label="Status"><span className={`badge ${slug(q.status)}`}>{q.status}</span></td>
                  <td className="num" data-label="Total">{money(q.total)}</td>
                  <td data-label="Created By">{q.created_by || '—'}</td>
                  <td className="cell-actions" data-label="">
                    <RowMenu>
                      {canPrint && <a className="btn ghost sm" href={`/quotes/${q.id}/print`} target="_blank" rel="noreferrer">Print</a>}
                      {canPrint && <a className="btn ghost sm" href={`/api/quotes/${q.id}/agreement`}>Work Agreement</a>}
                      {fullAccess && <button className="btn ghost sm" disabled={busy} onClick={() => duplicate(q.id)}>{busy ? '…' : 'Duplicate'}</button>}
                      {canConvert && <button className="btn ghost sm" disabled={busy} onClick={() => convert(q.id)}>{busy ? '…' : 'Convert to Job'}</button>}
                      {canEditOrDelete(q) && <button className="btn danger sm" disabled={busy} onClick={() => del(q.id)}>{busy ? '…' : 'Delete'}</button>}
                    </RowMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No quotes match your filters.</div>}
      </div>
    </>
  );
}
