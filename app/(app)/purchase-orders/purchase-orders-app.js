'use client';
import { useState } from 'react';
import { toast, confirmDialog } from '../ui-feedback';
import Modal from '../modal';
import { money, slug, toDateInputValue as dstr } from '../../../lib/format';
import { getJson, getList } from '../../../lib/api';

const APPROVAL_STATUSES = ['Pending Approval', 'Approved', 'Rejected'];
const STATUSES = ['Draft', 'Sent', 'Partially Received', 'Received', 'Cancelled'];

export default function PurchaseOrdersApp({ initialOrders, myId, fullAccess }) {
  const [orders, setOrders] = useState(initialOrders);
  const [statusFilter, setStatusFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [reviewModal, setReviewModal] = useState(null); // { po, note }
  const [reviewing, setReviewing] = useState(false);
  const [receiveModal, setReceiveModal] = useState(null); // { po, lines: [{ id, description, qty, qty_received, qtyNow }] }
  const [receiving, setReceiving] = useState(false);

  async function refresh() {
    try {
      setOrders(await getList('/api/purchase-orders'));
    } catch (err) {
      toast.error(err.message);
    }
  }

  function canEditOrDelete(po) {
    return fullAccess || (po.created_by_id === myId && po.approval_status !== 'Approved');
  }
  function canReceive(po) {
    return po.approval_status === 'Approved' && po.status !== 'Cancelled' && po.status !== 'Received';
  }

  async function del(id) {
    const ok = await confirmDialog('Delete this purchase order? This cannot be undone.', {
      title: 'Delete purchase order',
      confirmLabel: 'Delete PO',
      danger: true
    });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/purchase-orders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Purchase order deleted');
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete purchase order');
      }
    } finally {
      setBusyId(null);
    }
  }

  async function submitReview(decision) {
    setReviewing(true);
    try {
      const res = await fetch(`/api/purchase-orders/${reviewModal.po.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: reviewModal.note })
      });
      if (res.ok) {
        toast.success(decision === 'approved' ? 'Purchase order approved' : 'Sent back to the drafter');
        setReviewModal(null);
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save review');
      }
    } finally {
      setReviewing(false);
    }
  }

  async function openReceive(po) {
    setBusyId(po.id);
    try {
      const full = await getJson(`/api/purchase-orders/${po.id}`);
      const lines = (full.lineItems || []).map((li) => ({
        id: li.id,
        description: li.description,
        qty: Number(li.qty),
        qtyReceived: Number(li.qty_received),
        qtyNow: Math.max(Number(li.qty) - Number(li.qty_received), 0)
      }));
      setReceiveModal({ po, lines });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }
  function updateReceiveQty(lineId, value) {
    setReceiveModal({
      ...receiveModal,
      lines: receiveModal.lines.map((l) => (l.id === lineId ? { ...l, qtyNow: value } : l))
    });
  }
  async function submitReceive() {
    const lines = receiveModal.lines
      .filter((l) => (Number(l.qtyNow) || 0) > 0)
      .map((l) => ({ lineItemId: l.id, qtyNow: Number(l.qtyNow) || 0 }));
    if (lines.length === 0) return toast.error('Enter a quantity for at least one item');
    setReceiving(true);
    try {
      const res = await fetch(`/api/purchase-orders/${receiveModal.po.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines })
      });
      if (res.ok) {
        toast.success('Received items logged — stock updated');
        setReceiveModal(null);
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not log received items');
      }
    } finally {
      setReceiving(false);
    }
  }

  const list = orders.filter((po) => {
    if (statusFilter && po.status !== statusFilter) return false;
    if (approvalFilter && po.approval_status !== approvalFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!po.supplier_name.toLowerCase().includes(s) && !po.po_number.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Purchase Orders</h2>
        <div className="filters">
          <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)}>
            <option value="">All Approvals</option>
            {APPROVAL_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input placeholder="Search supplier or #" value={search} onChange={(e) => setSearch(e.target.value)} />
          <a className="btn amber sm" href="/purchase-orders/new">+ New PO</a>
        </div>
      </div>
      <div className="panel card-table">
        <table>
          <thead>
            <tr>
              <th>PO #</th><th>Supplier</th><th>Job</th><th>Date</th><th>Approval</th><th>Status</th>
              <th className="num">Total</th><th>Created By</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((po) => {
              const busy = busyId === po.id;
              const canReview = fullAccess && po.approval_status === 'Pending Approval';
              const canPrint = fullAccess && po.approval_status === 'Approved';
              return (
                <tr key={po.id}>
                  <td data-label="PO #">{po.po_number}</td>
                  <td data-label="Supplier">{po.supplier_name}</td>
                  <td data-label="Job">{po.job_number || '—'}</td>
                  <td data-label="Date">{dstr(po.date)}</td>
                  <td data-label="Approval">
                    <span className={`badge ${slug(po.approval_status)}`}>{po.approval_status}</span>
                    {po.approval_status === 'Rejected' && po.approval_note && (
                      <div className="small-note" style={{ marginTop: 4, maxWidth: 200 }}>{po.approval_note}</div>
                    )}
                  </td>
                  <td data-label="Status"><span className={`badge ${slug(po.status)}`}>{po.status}</span></td>
                  <td className="num" data-label="Total">{money(po.total)}</td>
                  <td data-label="Created By">{po.created_by || '—'}</td>
                  <td className="cell-actions" data-label="">
                    <div className="row-actions">
                      {canReview && (
                        <button className="btn amber sm" disabled={busy} onClick={() => setReviewModal({ po, note: '' })}>
                          Review
                        </button>
                      )}
                      {canEditOrDelete(po) && <a className="btn ghost sm" href={`/purchase-orders/${po.id}/edit`}>Edit</a>}
                      {canPrint && <a className="btn ghost sm" href={`/purchase-orders/${po.id}/print`} target="_blank" rel="noreferrer">Print</a>}
                      {canReceive(po) && <button className="btn ghost sm" disabled={busy} onClick={() => openReceive(po)}>Receive Items</button>}
                      {canEditOrDelete(po) && (
                        <button className="btn danger sm" disabled={busy} onClick={() => del(po.id)}>{busy ? '…' : 'Delete'}</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No purchase orders match your filters.</div>}
      </div>

      <Modal open={!!reviewModal}>
        {reviewModal && (
          <>
            <h3>Review Purchase Order {reviewModal.po.po_number}</h3>
            <p className="small-note">
              {reviewModal.po.supplier_name} — {money(reviewModal.po.total)} — drafted by {reviewModal.po.created_by || 'unknown'}
            </p>
            <div className="field">
              <label>Note (shown to the drafter, e.g. what to fix if rejecting)</label>
              <textarea rows={3} value={reviewModal.note} onChange={(e) => setReviewModal({ ...reviewModal, note: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn ghost" disabled={reviewing} onClick={() => setReviewModal(null)}>Cancel</button>
              <button className="btn danger-solid" disabled={reviewing} onClick={() => submitReview('rejected')}>
                {reviewing ? '…' : 'Reject'}
              </button>
              <button className="btn amber" disabled={reviewing} onClick={() => submitReview('approved')}>
                {reviewing ? '…' : 'Approve'}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!receiveModal} wide>
        {receiveModal && (
          <>
            <h3>Receive Items — {receiveModal.po.po_number}</h3>
            <p className="small-note">{receiveModal.po.supplier_name}. Enter how many of each item arrived — defaults to what's still outstanding.</p>
            <table>
              <thead><tr><th>Item</th><th className="num">Ordered</th><th className="num">Already Received</th><th className="num">Receiving Now</th></tr></thead>
              <tbody>
                {receiveModal.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.description}</td>
                    <td className="num">{l.qty}</td>
                    <td className="num">{l.qtyReceived}</td>
                    <td className="num">
                      <input
                        type="number" min="0" step="0.01"
                        max={Math.max(l.qty - l.qtyReceived, 0)}
                        value={l.qtyNow}
                        onChange={(e) => updateReceiveQty(l.id, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="modal-actions">
              <button className="btn ghost" disabled={receiving} onClick={() => setReceiveModal(null)}>Cancel</button>
              <button className="btn amber" disabled={receiving} onClick={submitReceive}>{receiving ? 'Saving…' : 'Log Received Items'}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
