'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast, confirmDialog } from '../ui-feedback';
import { money, slug, toDateInputValue as dstr, toDisplayDate as fmtDate } from '../../../lib/format';
import { getList, PENDING_APPROVAL_MESSAGE } from '../../../lib/api';

const APPROVAL_STATUSES = ['Pending Approval', 'Approved', 'Rejected'];
const STATUSES = ['Draft', 'Ordered', 'Partially Received', 'Received', 'Invoiced', 'Completed', 'Cancelled'];

function invoiceStatusLabel(po) {
  if (!po.invoice_count) return 'Not Invoiced';
  const total = Number(po.invoiced_total);
  const paid = Number(po.invoice_paid_total);
  if (paid <= 0) return 'Unpaid';
  if (paid >= total) return 'Paid';
  return 'Partially Paid';
}

// Small per-row "⋮" options menu for the less-frequent actions — reviewing,
// receiving, and everything else now happens on the PO's own detail page.
// Same shape as quotes-app.js's RowMenu.
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

export default function PurchaseOrdersApp({ initialOrders, myId, fullAccess }) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [statusFilter, setStatusFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [creating, setCreating] = useState(false);

  // Wholesalers require a PO number before they'll quote a price, so this
  // reserves a real, permanent number immediately (see the draft route's
  // nextPoNumber()) rather than waiting for the form to be saved — then
  // drops straight into the new PO's own detail page to fill everything in.
  async function createNew() {
    setCreating(true);
    try {
      const res = await fetch('/api/purchase-orders/draft', { method: 'POST' });
      if (res.ok) {
        const po = await res.json();
        router.push(`/purchase-orders/${po.id}`);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not start a new purchase order');
        setCreating(false);
      }
    } catch {
      toast.error('Could not start a new purchase order');
      setCreating(false);
    }
  }

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
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        if (d.pending) {
          toast.success(PENDING_APPROVAL_MESSAGE);
        } else {
          toast.success('Purchase order deleted');
          await refresh();
        }
      } else {
        toast.error(d.error || 'Could not delete purchase order');
      }
    } finally {
      setBusyId(null);
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
          <button className="btn amber sm" disabled={creating} onClick={createNew}>{creating ? 'Creating…' : '+ New PO'}</button>
        </div>
      </div>
      <div className="panel card-table">
        <table>
          <thead>
            <tr>
              <th>PO #</th><th>Supplier</th><th>Job</th><th>Client</th>
              <th className="num">Total</th><th>Status</th><th>Invoice Status</th><th>Created</th><th>Last Updated</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((po) => {
              const busy = busyId === po.id;
              const canPrint = fullAccess && po.approval_status === 'Approved';
              return (
                <tr key={po.id} onClick={() => router.push(`/purchase-orders/${po.id}`)} style={{ cursor: 'pointer' }}>
                  <td data-label="PO #" style={{ color: 'var(--amber-dark)', fontWeight: 650 }}>
                    {po.po_number}
                    {po.approval_status === 'Pending Approval' && <div className="small-note" style={{ color: 'var(--amber-dark)' }}>Awaiting approval</div>}
                    {po.approval_status === 'Rejected' && <div className="small-note" style={{ color: 'var(--red)' }}>Rejected</div>}
                  </td>
                  <td data-label="Supplier">{po.supplier_name || '—'}</td>
                  <td data-label="Job">{po.job_number || '—'}</td>
                  <td data-label="Client">{po.client_name || '—'}</td>
                  <td className="num" data-label="Total">{money(po.total)}</td>
                  <td data-label="Status"><span className={`badge ${slug(po.status)}`}>{po.status}</span></td>
                  <td data-label="Invoice Status"><span className={`badge ${slug(invoiceStatusLabel(po))}`}>{invoiceStatusLabel(po)}</span></td>
                  <td data-label="Created">{dstr(po.date)}</td>
                  <td data-label="Last Updated">{po.updated_at ? fmtDate(po.updated_at) : '—'}</td>
                  <td className="cell-actions" data-label="">
                    <RowMenu>
                      {canPrint && <a className="btn ghost sm" href={`/purchase-orders/${po.id}/print`} target="_blank" rel="noreferrer">Print</a>}
                      {canEditOrDelete(po) && <button className="btn danger sm" disabled={busy} onClick={() => del(po.id)}>{busy ? '…' : 'Delete'}</button>}
                    </RowMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No purchase orders match your filters.</div>}
      </div>
    </>
  );
}
