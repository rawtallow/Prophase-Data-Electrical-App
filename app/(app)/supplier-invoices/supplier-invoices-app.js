'use client';
import { useState } from 'react';
import { toast, confirmDialog } from '../ui-feedback';
import Modal from '../modal';
import { money, slug, toDateInputValue as dstr, sydneyToday } from '../../../lib/format';
import { getJson, getList, PENDING_APPROVAL_MESSAGE } from '../../../lib/api';

const STATUSES = ['Unpaid', 'Partially Paid', 'Paid'];
const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'];

function emptyPaymentForm() { return { amount: '', date: sydneyToday(), method: 'Bank Transfer', note: '' }; }

export default function SupplierInvoicesApp({ initialInvoices }) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Holds the on-demand-fetched invoice (with lineItems and payments), same
  // reasoning as Job Log's payment modal — the bulk list doesn't carry either.
  const [detailModal, setDetailModal] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm());
  const [savingPayment, setSavingPayment] = useState(false);
  const [voidingId, setVoidingId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    try {
      setInvoices(await getList('/api/purchase-order-invoices'));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function openDetail(inv) {
    setBusyId(inv.id);
    try {
      const full = await getJson(`/api/purchase-order-invoices/${inv.id}`);
      setDetailModal(full);
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
      const res = await fetch(`/api/purchase-order-invoices/${detailModal.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentForm)
      });
      if (res.ok) {
        const updated = await res.json();
        setDetailModal({ ...detailModal, ...updated });
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
      const res = await fetch(`/api/purchase-order-invoices/${detailModal.id}/payments/${paymentId}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        if (d.pending) {
          toast.success(PENDING_APPROVAL_MESSAGE);
        } else {
          setDetailModal({ ...detailModal, ...d });
          toast.success('Payment voided');
          await refresh();
        }
      } else {
        toast.error(d.error || 'Could not void payment');
      }
    } finally {
      setVoidingId(null);
    }
  }

  async function deleteInvoice() {
    const ok = await confirmDialog('Delete this invoice record? This only removes the paperwork record — it does not undo any stock already received.', {
      title: 'Delete invoice',
      confirmLabel: 'Delete Invoice',
      danger: true
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/purchase-order-invoices/${detailModal.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Invoice deleted');
        setDetailModal(null);
        await refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete invoice');
      }
    } finally {
      setDeleting(false);
    }
  }

  const list = invoices.filter((inv) => {
    if (statusFilter && inv.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !inv.invoice_number.toLowerCase().includes(s) &&
        !inv.po_number.toLowerCase().includes(s) &&
        !inv.supplier_name.toLowerCase().includes(s)
      ) return false;
    }
    return true;
  });

  return (
    <>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Supplier Invoices</h2>
        <div className="filters">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input placeholder="Search invoice #, PO #, or supplier" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <p className="small-note" style={{ marginTop: -10, marginBottom: 14 }}>
        Invoices are logged from a purchase order's "Receive Items" action — there's no separate "New Invoice" button here.
      </p>
      <div className="panel card-table">
        <table>
          <thead>
            <tr>
              <th>Invoice #</th><th>PO #</th><th>Supplier</th><th>Job</th><th>Invoice Date</th><th>Status</th>
              <th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((inv) => {
              const balance = Number(inv.total) - Number(inv.amount_paid);
              const busy = busyId === inv.id;
              return (
                <tr key={inv.id}>
                  <td data-label="Invoice #">{inv.invoice_number}</td>
                  <td data-label="PO #">{inv.po_number}</td>
                  <td data-label="Supplier">{inv.supplier_name}</td>
                  <td data-label="Job">{inv.job_number || '—'}</td>
                  <td data-label="Invoice Date">{dstr(inv.invoice_date)}</td>
                  <td data-label="Status"><span className={`badge ${slug(inv.status)}`}>{inv.status}</span></td>
                  <td className="num" data-label="Total">{money(inv.total)}</td>
                  <td className="num" data-label="Paid">{money(inv.amount_paid)}</td>
                  <td className="num" data-label="Balance" style={{ fontWeight: 700, color: balance > 0 ? 'var(--red)' : 'var(--green)' }}>{money(balance)}</td>
                  <td className="cell-actions" data-label="">
                    <button className="btn ghost sm" disabled={busy} onClick={() => openDetail(inv)}>{busy ? '…' : 'Manage'}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && (
          <div className="empty">{invoices.length === 0 ? 'No supplier invoices logged yet.' : 'No invoices match your filters.'}</div>
        )}
      </div>

      <Modal open={!!detailModal} onBackdropClick={() => setDetailModal(null)} wide>
        {detailModal && (() => {
          const balance = Number(detailModal.total) - Number(detailModal.amount_paid);
          return (
            <>
              <h3>Invoice {detailModal.invoice_number} — {detailModal.po_number}</h3>
              <p className="small-note" style={{ marginTop: -8 }}>{detailModal.supplier_name}{detailModal.job_number ? ` — ${detailModal.job_number}` : ''}</p>

              {detailModal.lineItems && detailModal.lineItems.length > 0 && (
                <table>
                  <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit Cost</th><th className="num">Line Total</th></tr></thead>
                  <tbody>
                    {detailModal.lineItems.map((li) => (
                      <tr key={li.id}>
                        <td>{li.description}</td>
                        <td className="num">{li.qty}</td>
                        <td className="num">{money(li.unit_cost)}</td>
                        <td className="num">{money(Number(li.qty) * Number(li.unit_cost))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="totals-box" style={{ marginTop: 14 }}>
                <div className="line"><span>Subtotal</span><span>{money(detailModal.subtotal)}</span></div>
                <div className="line"><span>Tax</span><span>{money(detailModal.tax)}</span></div>
                <div className="line total"><span>Total</span><span>{money(detailModal.total)}</span></div>
                <div className="line"><span>Paid</span><span>{money(detailModal.amount_paid)}</span></div>
                <div className="line total"><span>Balance Due</span><span style={{ color: balance > 0 ? 'var(--red)' : 'var(--green)' }}>{money(balance)}</span></div>
              </div>

              <h2 className="section-title" style={{ marginTop: 18 }}>Payment History</h2>
              {detailModal.payments && detailModal.payments.length > 0 ? (
                <table>
                  <thead><tr><th>Date</th><th>Method</th><th className="num">Amount</th><th></th></tr></thead>
                  <tbody>
                    {detailModal.payments.map((p) => (
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
                <button className="btn danger" disabled={deleting} onClick={deleteInvoice}>{deleting ? 'Deleting…' : 'Delete Invoice'}</button>
                <button className="btn ghost" disabled={savingPayment} onClick={() => setDetailModal(null)}>Close</button>
                <button className="btn amber" disabled={savingPayment} onClick={submitPayment}>{savingPayment ? 'Saving…' : 'Log Payment'}</button>
              </div>
            </>
          );
        })()}
      </Modal>
    </>
  );
}
