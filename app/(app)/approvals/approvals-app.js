'use client';
import { useState } from 'react';
import { toast, confirmDialog } from '../ui-feedback';
import { slug, toDisplayDate as fmtDate } from '../../../lib/format';
import { getList } from '../../../lib/api';

const ACTION_LABELS = {
  delete_client: 'Delete Client',
  delete_job: 'Delete Job',
  delete_quote: 'Delete Quote',
  delete_purchase_order: 'Delete Purchase Order',
  delete_asset: 'Delete Asset',
  delete_part: 'Delete Part',
  void_job_payment: 'Void Job Payment',
  void_po_invoice_payment: 'Void Supplier Invoice Payment',
  review_quote: 'Approve/Reject Quote',
  review_purchase_order: 'Approve/Reject Purchase Order',
  create_payroll_entry: 'Create Payroll Pay Run',
  create_owner_draw: 'Log Owner Draw',
  restore_backup: 'Restore From Backup',
  create_user: 'Create User Account',
  edit_user: 'Edit User Account',
  delete_user: 'Delete User Account'
};

function actionLabel(type) { return ACTION_LABELS[type] || type; }

export default function ApprovalsApp({ initialRequests, isDirector, myId }) {
  const [requests, setRequests] = useState(initialRequests);
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [expandedId, setExpandedId] = useState(null);
  const [noteById, setNoteById] = useState({});
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    try {
      setRequests(await getList('/api/approvals'));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function review(id, decision) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/approvals/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: noteById[id] || '' })
      });
      if (res.ok) {
        toast.success(decision === 'approved' ? 'Approved and carried out' : 'Rejected');
        await refresh();
        setExpandedId(null);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save review');
      }
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(id) {
    const ok = await confirmDialog('Withdraw this request?', { title: 'Cancel request', confirmLabel: 'Withdraw Request' });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/approvals/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Request withdrawn');
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not withdraw request');
      }
    } finally {
      setBusyId(null);
    }
  }

  const list = requests.filter((r) => !statusFilter || r.status === statusFilter);
  const pendingCount = requests.filter((r) => r.status === 'Pending').length;

  return (
    <>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>
          {isDirector ? 'Approvals' : 'My Requests'}
        </h2>
        <div className="filters">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option>Pending</option>
            <option>Approved</option>
            <option>Rejected</option>
            <option>Cancelled</option>
          </select>
        </div>
      </div>

      {isDirector && pendingCount > 0 && (
        <div className="cards" style={{ marginBottom: 14 }}>
          <div className="card warn">
            <div className="label">Awaiting Your Review</div>
            <div className="value">{pendingCount}</div>
          </div>
        </div>
      )}

      <div className="panel card-table">
        <table>
          <thead>
            <tr>
              <th>Requested</th><th>Action</th><th>Target</th><th>Requested By</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const expanded = expandedId === r.id;
              const busy = busyId === r.id;
              const canReview = isDirector && r.status === 'Pending';
              const canCancel = r.status === 'Pending' && (isDirector || r.requested_by_id === myId);
              return (
                <>
                  <tr key={r.id} onClick={() => setExpandedId(expanded ? null : r.id)} style={{ cursor: 'pointer' }}>
                    <td data-label="Requested">{fmtDate(r.created_at)}</td>
                    <td data-label="Action">{actionLabel(r.action_type)}</td>
                    <td data-label="Target">{r.target_label || '—'}</td>
                    <td data-label="Requested By">{r.requested_by}</td>
                    <td data-label="Status"><span className={`badge ${slug(r.status)}`}>{r.status}</span></td>
                    <td className="cell-actions" data-label="">
                      {canCancel && <button className="btn ghost sm" disabled={busy} onClick={(e) => { e.stopPropagation(); cancel(r.id); }}>Withdraw</button>}
                    </td>
                  </tr>
                  {expanded && (
                    <tr key={r.id + '-detail'}>
                      <td colSpan={6} style={{ background: 'var(--bg-soft)' }}>
                        <div style={{ padding: '12px 4px' }}>
                          {r.reviewed_by && (
                            <p className="small-note" style={{ marginTop: 0 }}>
                              Reviewed by {r.reviewed_by} on {fmtDate(r.reviewed_at)}{r.review_note ? ` — ${r.review_note}` : ''}
                            </p>
                          )}
                          {Object.keys(r.payload || {}).length > 0 && (
                            <details style={{ marginBottom: 10 }}>
                              <summary className="small-note" style={{ cursor: 'pointer' }}>Request details</summary>
                              <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', overflowX: 'auto', maxHeight: 240, overflowY: 'auto' }}>
                                {JSON.stringify(r.payload, null, 2)}
                              </pre>
                            </details>
                          )}
                          {canReview && (
                            <>
                              <div className="field">
                                <label>Note (optional, shown to the requester)</label>
                                <textarea rows={2} value={noteById[r.id] || ''} onChange={(e) => setNoteById({ ...noteById, [r.id]: e.target.value })} />
                              </div>
                              <div className="row-actions">
                                <button className="btn danger sm" disabled={busy} onClick={() => review(r.id, 'rejected')}>{busy ? '…' : 'Reject'}</button>
                                <button className="btn amber sm" disabled={busy} onClick={() => review(r.id, 'approved')}>{busy ? '…' : 'Approve'}</button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No requests match your filters.</div>}
      </div>
    </>
  );
}
