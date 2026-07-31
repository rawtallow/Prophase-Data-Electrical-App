'use client';
import { useState, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast, confirmDialog } from '../../ui-feedback';
import { money, slug, toDateInputValue as dstr, toDisplayDate as fmtDate, sydneyToday } from '../../../../lib/format';
import { getJson, PENDING_APPROVAL_MESSAGE } from '../../../../lib/api';

const TABS = ['Overview', 'Details', 'Line Items', 'Receiving', 'Invoices', 'Documents', 'Notes', 'History'];
const STATUSES = ['Draft', 'Ordered', 'Partially Received', 'Received', 'Invoiced', 'Completed', 'Cancelled'];
const DOC_CATEGORIES = ['Document', 'Invoice', 'Delivery Docket', 'Other'];
const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'];

function emptyInvoiceForm() { return { invoiceNumber: '', invoiceDate: sydneyToday(), deliveryCharge: 0, discount: 0 }; }
function emptyPaymentForm() { return { amount: '', date: sydneyToday(), method: 'Bank Transfer', note: '' }; }

export default function PoDetailApp({
  initialPo, initialLineItems, initialInvoices, initialDocuments, initialActivity,
  suppliers, parts, jobs, clients, assets, quotes, employees, myId, fullAccess
}) {
  const router = useRouter();
  const [po, setPo] = useState(initialPo);
  const [lineItems, setLineItems] = useState(initialLineItems.map((li) => ({
    id: li.id, partId: li.part_id, description: li.description, supplierProductCode: li.supplier_product_code || '',
    qty: li.qty, unitCost: li.unit_cost, qtyReceived: Number(li.qty_received)
  })));
  const [invoices, setInvoices] = useState(initialInvoices);
  const [documents, setDocuments] = useState(initialDocuments);
  const [activity, setActivity] = useState(initialActivity);
  const [tab, setTab] = useState('Overview');
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [supplierList, setSupplierList] = useState(suppliers);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', accountNumber: '', phone: '' });
  const [savingSupplier, setSavingSupplier] = useState(false);

  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [postingNote, setPostingNote] = useState(false);

  const [uploadForm, setUploadForm] = useState({ label: '', category: 'Document' });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [deletingDocId, setDeletingDocId] = useState(null);

  const [receiveQtyById, setReceiveQtyById] = useState({});
  const [receiveCostById, setReceiveCostById] = useState({});
  const [receiveSerialsById, setReceiveSerialsById] = useState({});
  const [receiveBatchById, setReceiveBatchById] = useState({});
  const [logInvoice, setLogInvoice] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm());
  const [receiving, setReceiving] = useState(false);
  const aiFileRef = useRef(null);
  const [parsing, setParsing] = useState(false);
  const [aiReview, setAiReview] = useState(null);
  const [confirmingAi, setConfirmingAi] = useState(false);

  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm());
  const [savingPayment, setSavingPayment] = useState(false);
  const [voidingId, setVoidingId] = useState(null);
  const [deletingInvoice, setDeletingInvoice] = useState(false);

  function set(field, value) { setPo({ ...po, [field]: value }); }

  async function refreshFull() {
    const full = await getJson(`/api/purchase-orders/${po.id}`);
    setPo(full);
    setLineItems((full.lineItems || []).map((li) => ({
      id: li.id, partId: li.part_id, description: li.description, supplierProductCode: li.supplier_product_code || '',
      qty: li.qty, unitCost: li.unit_cost, qtyReceived: Number(li.qty_received)
    })));
    setInvoices(full.invoices || []);
    setDocuments(full.documents || []);
    setActivity(full.activity || []);
  }

  function onSupplierSelect(value) {
    if (value === '__new__') { setAddingSupplier(true); return; }
    const match = supplierList.find((s) => s.id === value);
    setPo({ ...po, supplier_id: value, supplier_name: match ? match.name : '' });
  }
  async function saveNewSupplier() {
    if (!newSupplier.name.trim()) return toast.error('Supplier name is required');
    setSavingSupplier(true);
    const res = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSupplier)
    });
    setSavingSupplier(false);
    if (res.ok) {
      const created = await res.json();
      setSupplierList([...supplierList, created].sort((a, b) => a.name.localeCompare(b.name)));
      setPo({ ...po, supplier_id: created.id, supplier_name: created.name });
      setAddingSupplier(false);
      setNewSupplier({ name: '', accountNumber: '', phone: '' });
      toast.success('Supplier added');
    } else {
      const d = await res.json();
      toast.error(d.error || 'Could not add supplier');
    }
  }
  function onJobChange(jobId) {
    const job = jobs.find((j) => j.id === jobId);
    setPo({ ...po, job_id: jobId, job_number: job ? job.job_number : '' });
  }
  function onClientChange(clientId) {
    const client = clients.find((c) => c.id === clientId);
    setPo({ ...po, client_id: clientId, client_name: client ? client.name : '', asset_id: '' });
  }
  const assetsForClient = assets.filter((a) => a.client_id === po.client_id);

  function updateItem(i, field, value) {
    const next = [...lineItems];
    if (field === 'description') {
      const match = parts.find((p) => p.name.toLowerCase() === String(value).toLowerCase());
      next[i] = { ...next[i], description: value, partId: match ? match.id : null, unitCost: match ? Number(match.unit_cost) : next[i].unitCost };
    } else {
      next[i] = { ...next[i], [field]: value };
    }
    setLineItems(next);
  }
  function addItem() { setLineItems([...lineItems, { partId: null, description: '', supplierProductCode: '', qty: 1, unitCost: 0, qtyReceived: 0 }]); }
  function removeItem(i) { setLineItems(lineItems.filter((_, idx) => idx !== i)); }

  const subtotal = lineItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.unitCost) || 0), 0);
  const tax = subtotal * ((Number(po.tax_rate) || 0) / 100);
  const total = subtotal + tax;

  // Every editing tab shares this one Save — the PUT always replaces the
  // whole record, so the payload always carries the current shared draft
  // state for every field, not just the ones that tab visually owns. See
  // quote-detail-app.js / job-detail-app.js for the same convention.
  async function savePo(successMsg) {
    if (!po.supplier_name.trim()) return toast.error('Supplier is required');
    setSaving(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: po.supplier_id,
          supplierName: po.supplier_name,
          jobId: po.job_id,
          jobNumber: po.job_number,
          clientId: po.client_id,
          clientName: po.client_name,
          assetId: po.asset_id,
          quoteId: po.quote_id,
          assignedToId: po.assigned_to_id,
          deliveryMethod: po.delivery_method,
          deliveryAddress: po.delivery_address,
          expectedDeliveryDate: dstr(po.expected_delivery_date),
          deliveryNotes: po.delivery_notes,
          taxRate: po.tax_rate,
          status: po.status,
          notes: po.notes,
          lineItems
        })
      });
      if (res.ok) {
        await refreshFull();
        toast.success(successMsg || 'Purchase order updated');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not save purchase order');
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitReview(decision) {
    setReviewing(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: reviewNote })
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        if (d.pending) {
          toast.success(PENDING_APPROVAL_MESSAGE);
        } else {
          toast.success(decision === 'approved' ? 'Purchase order approved' : 'Sent back to the drafter');
          await refreshFull();
        }
        setReviewNote('');
      } else {
        toast.error(d.error || 'Could not save review');
      }
    } finally {
      setReviewing(false);
    }
  }

  async function postNote() {
    if (!noteDraft.trim()) return toast.error('Enter a note first');
    setPostingNote(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: noteDraft.trim() })
      });
      if (res.ok) {
        const created = await res.json();
        setActivity([created, ...activity]);
        setNoteDraft('');
        toast.success('Note added');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not add note');
      }
    } finally {
      setPostingNote(false);
    }
  }

  async function uploadDocument() {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error('Choose a file first');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('label', uploadForm.label || file.name);
      fd.append('category', uploadForm.category);
      const res = await fetch(`/api/purchase-orders/${po.id}/documents`, { method: 'POST', body: fd });
      if (res.ok) {
        const created = await res.json();
        setDocuments([created, ...documents]);
        setUploadForm({ label: '', category: 'Document' });
        if (fileRef.current) fileRef.current.value = '';
        toast.success('File uploaded');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not upload file');
      }
    } finally {
      setUploading(false);
    }
  }
  async function deleteDocument(docId) {
    const ok = await confirmDialog('Delete this file? This cannot be undone.', { title: 'Delete file', confirmLabel: 'Delete File', danger: true });
    if (!ok) return;
    setDeletingDocId(docId);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/documents/${docId}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments(documents.filter((d) => d.id !== docId));
        toast.success('File deleted');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete file');
      }
    } finally {
      setDeletingDocId(null);
    }
  }

  function outstandingFor(li) { return Math.max(Number(li.qty) - li.qtyReceived, 0); }
  function receiveQty(li) { return receiveQtyById[li.id] ?? outstandingFor(li); }

  async function submitReceive() {
    const lines = lineItems
      .map((li) => ({ lineItemId: li.id, qtyNow: Number(receiveQty(li)) || 0 }))
      .filter((l) => l.qtyNow > 0);
    if (lines.length === 0) return toast.error('Enter a quantity for at least one item');
    if (logInvoice && !invoiceForm.invoiceNumber.trim()) return toast.error("Enter the supplier's invoice number");

    const body = { lines };
    if (logInvoice) {
      body.invoice = {
        invoiceNumber: invoiceForm.invoiceNumber,
        invoiceDate: invoiceForm.invoiceDate,
        deliveryCharge: invoiceForm.deliveryCharge,
        discount: invoiceForm.discount,
        source: 'manual',
        // Falls back to the line's own PO cost, matching what the (possibly
        // untouched) Invoice Cost input actually displays — a plain
        // Number(receiveCostById[...]) would be NaN and silently drop any
        // line the user never edited, undercounting the invoice.
        lines: lines.map((l) => {
          const li = lineItems.find((x) => x.id === l.lineItemId);
          const cost = receiveCostById[l.lineItemId] ?? li?.unitCost ?? 0;
          return { lineItemId: l.lineItemId, unitCost: Number(cost) || 0 };
        })
      };
    }
    lines.forEach((l) => {
      const li = lineItems.find((x) => x.id === l.lineItemId);
      const part = parts.find((p) => p.id === li?.partId);
      if (part?.track_serials) {
        const raw = receiveSerialsById[l.lineItemId] || '';
        l.serialNumbers = raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
        l.batchNumber = receiveBatchById[l.lineItemId] || '';
      }
    });

    setReceiving(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(result.invoiceId ? 'Received items logged — invoice recorded' : 'Received items logged — stock updated');
        setReceiveQtyById({});
        setReceiveCostById({});
        setReceiveSerialsById({});
        setReceiveBatchById({});
        setLogInvoice(false);
        setInvoiceForm(emptyInvoiceForm());
        await refreshFull();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not log received items');
      }
    } finally {
      setReceiving(false);
    }
  }

  async function parseInvoiceFile() {
    const file = aiFileRef.current?.files?.[0];
    if (!file) return toast.error('Choose a PDF or photo first');
    setParsing(true);
    setAiReview(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/purchase-orders/${po.id}/parse-invoice`, { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setAiReview(d);
        toast.success('Invoice read — review the extracted details below');
      } else {
        toast.error(d.error || 'Could not read the invoice');
      }
    } finally {
      setParsing(false);
    }
  }
  function updateAiLine(i, field, value) {
    const next = [...aiReview.lineItems];
    next[i] = { ...next[i], [field]: value };
    setAiReview({ ...aiReview, lineItems: next });
  }
  async function confirmAiInvoice() {
    const matched = aiReview.lineItems.filter((li) => li.matchedLineItemId);
    if (matched.length === 0) return toast.error('None of the extracted lines matched an item on this PO — log it manually instead');
    if (!aiReview.invoiceNumber?.trim()) return toast.error('Invoice number is required');

    const lines = matched.map((li) => ({ lineItemId: li.matchedLineItemId, qtyNow: Number(li.qty) || 0 }));
    const body = {
      lines,
      invoice: {
        invoiceNumber: aiReview.invoiceNumber,
        invoiceDate: aiReview.invoiceDate || sydneyToday(),
        deliveryCharge: aiReview.deliveryCharge || 0,
        discount: aiReview.discount || 0,
        source: 'ai_import',
        sourceFileUrl: aiReview.sourceFileUrl,
        lines: matched.map((li) => ({ lineItemId: li.matchedLineItemId, unitCost: Number(li.unitCost) || 0 }))
      }
    };
    setConfirmingAi(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        toast.success('Invoice imported and matched');
        setAiReview(null);
        if (aiFileRef.current) aiFileRef.current.value = '';
        await refreshFull();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not log the imported invoice');
      }
    } finally {
      setConfirmingAi(false);
    }
  }

  async function openInvoice(invoiceId) {
    setSelectedInvoiceId(invoiceId);
    setLoadingInvoice(true);
    setPaymentForm(emptyPaymentForm());
    try {
      const full = await getJson(`/api/purchase-order-invoices/${invoiceId}`);
      setSelectedInvoice(full);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingInvoice(false);
    }
  }
  async function submitPayment() {
    if (!(Number(paymentForm.amount) > 0)) return toast.error('Enter an amount greater than 0');
    setSavingPayment(true);
    try {
      const res = await fetch(`/api/purchase-order-invoices/${selectedInvoiceId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentForm)
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedInvoice(updated);
        setPaymentForm(emptyPaymentForm());
        toast.success('Payment logged');
        await refreshFull();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not log payment');
      }
    } finally {
      setSavingPayment(false);
    }
  }
  async function voidPayment(paymentId) {
    const ok = await confirmDialog('Void this payment? This cannot be undone.', { title: 'Void payment', confirmLabel: 'Void Payment', danger: true });
    if (!ok) return;
    setVoidingId(paymentId);
    try {
      const res = await fetch(`/api/purchase-order-invoices/${selectedInvoiceId}/payments/${paymentId}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        if (d.pending) {
          toast.success(PENDING_APPROVAL_MESSAGE);
        } else {
          setSelectedInvoice(d);
          toast.success('Payment voided');
          await refreshFull();
        }
      } else {
        toast.error(d.error || 'Could not void payment');
      }
    } finally {
      setVoidingId(null);
    }
  }
  async function deleteInvoice() {
    const ok = await confirmDialog('Delete this invoice? This does not reverse received quantities. This cannot be undone.', { title: 'Delete invoice', confirmLabel: 'Delete Invoice', danger: true });
    if (!ok) return;
    setDeletingInvoice(true);
    try {
      const res = await fetch(`/api/purchase-order-invoices/${selectedInvoiceId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Invoice deleted');
        setSelectedInvoiceId(null);
        setSelectedInvoice(null);
        await refreshFull();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete invoice');
      }
    } finally {
      setDeletingInvoice(false);
    }
  }

  async function duplicatePo() {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const created = await res.json();
        toast.success('Purchase order duplicated');
        router.push(`/purchase-orders/${created.id}`);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not duplicate purchase order');
        setDuplicating(false);
      }
    } catch {
      toast.error('Could not duplicate purchase order');
      setDuplicating(false);
    }
  }
  async function deletePo() {
    const ok = await confirmDialog('Delete this purchase order? This cannot be undone.', { title: 'Delete purchase order', confirmLabel: 'Delete PO', danger: true });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Purchase order deleted');
        router.push('/purchase-orders');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Could not delete purchase order');
        setDeleting(false);
      }
    } catch {
      toast.error('Could not delete purchase order');
      setDeleting(false);
    }
  }

  const canEdit = fullAccess || (po.created_by_id === myId && po.approval_status !== 'Approved');
  const canReview = fullAccess && po.approval_status === 'Pending Approval';
  const canPrint = fullAccess && po.approval_status === 'Approved';
  const canReceive = po.approval_status === 'Approved' && po.status !== 'Cancelled' && po.status !== 'Received' && po.status !== 'Invoiced' && po.status !== 'Completed';
  const canDelete = fullAccess || (po.created_by_id === myId && po.approval_status !== 'Approved');
  const invoicedTotal = invoices.reduce((s, i) => s + Number(i.total), 0);
  const invoicePaidTotal = invoices.reduce((s, i) => s + Number(i.amount_paid), 0);

  return (
    <>
      <div className="toolbar">
        <div>
          <Link href="/purchase-orders" className="small-note" style={{ display: 'inline-block', marginBottom: 6 }}>&larr; All Purchase Orders</Link>
          <h2 className="section-title" style={{ margin: 0 }}>{po.po_number}{po.supplier_name ? ` — ${po.supplier_name}` : ''}</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span className={`badge ${slug(po.approval_status)}`}>{po.approval_status}</span>
          <span className={`badge ${slug(po.status)}`}>{po.status}</span>
        </div>
      </div>

      {!fullAccess && po.approval_status !== 'Approved' && (
        <div className="panel small-note" style={{ marginBottom: 14 }}>
          {po.approval_status === 'Rejected'
            ? 'A manager sent this back — make your changes and save to resubmit it for approval.'
            : 'This purchase order needs manager or admin approval before it can be sent to the supplier.'}
        </div>
      )}
      {po.approval_status === 'Rejected' && po.approval_note && (
        <div className="error-box" style={{ marginBottom: 14 }}>
          <strong>Feedback from {po.reviewed_by || 'reviewer'}:</strong> {po.approval_note}
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
              <div><div className="small-note">Supplier</div>{po.supplier_name || '—'}</div>
              <div>
                <div className="small-note">Client</div>
                {po.client_id ? <Link href={`/clients/${po.client_id}`}>{po.client_name}</Link> : (po.client_name || '—')}
              </div>
              <div>
                <div className="small-note">Job</div>
                {po.job_number || '—'}
              </div>
            </div>
            <div className="grid-3" style={{ marginTop: 14 }}>
              <div><div className="small-note">Assigned To</div>{po.assigned_to_name || '—'}</div>
              <div><div className="small-note">Expected Delivery</div>{fmtDate(po.expected_delivery_date)}</div>
              <div><div className="small-note">Last Updated</div>{po.updated_at ? fmtDate(po.updated_at) : '—'}</div>
            </div>
          </div>

          <div className="panel">
            <h2 className="section-title">Cost Summary</h2>
            <div className="totals-box">
              <div className="line"><span>Subtotal</span><span>{money(subtotal)}</span></div>
              <div className="line"><span>GST ({Number(po.tax_rate) || 0}%)</span><span>{money(tax)}</span></div>
              <div className="line total"><span>PO Total</span><span>{money(total)}</span></div>
            </div>
            {invoices.length > 0 && (
              <div className="totals-box" style={{ marginTop: 10 }}>
                <div className="line"><span>Invoiced</span><span>{money(invoicedTotal)}</span></div>
                <div className="line"><span>Paid</span><span>{money(invoicePaidTotal)}</span></div>
                <div className="line total"><span>Outstanding</span><span style={{ color: invoicedTotal - invoicePaidTotal > 0 ? 'var(--red)' : 'var(--green)' }}>{money(invoicedTotal - invoicePaidTotal)}</span></div>
              </div>
            )}
          </div>

          <div className="panel">
            <h2 className="section-title">Status</h2>
            <p className="small-note" style={{ marginTop: -8, marginBottom: 12 }}>Partially Received/Received/Invoiced are normally set automatically by receiving and invoicing — override here if needed.</p>
            <div className="field">
              <label>Status</label>
              <select disabled={!canEdit} value={po.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            {canEdit && (
              <div className="footer-actions">
                <button className="btn amber" disabled={saving} onClick={() => savePo()}>{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            )}
          </div>

          {po.quote_id && (
            <div className="panel">
              <h2 className="section-title">Linked Quote</h2>
              <Link href={`/quotes/${po.quote_id}`}>{(quotes.find((q) => q.id === po.quote_id) || {}).quote_number || 'View quote'}</Link>
            </div>
          )}
        </div>
      )}

      {tab === 'Details' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Supplier</h2>
            <div className="field">
              <label>Supplier *</label>
              {!addingSupplier ? (
                <select disabled={!canEdit} value={po.supplier_id || ''} onChange={(e) => onSupplierSelect(e.target.value)}>
                  <option value="">— Select a supplier —</option>
                  {supplierList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  {po.supplier_id && !supplierList.some((s) => s.id === po.supplier_id) && (
                    <option value={po.supplier_id}>{po.supplier_name} (not in supplier list)</option>
                  )}
                  {canEdit && <option value="__new__">+ Add New Supplier…</option>}
                </select>
              ) : (
                <div style={{ background: 'var(--bg-soft)', border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-sm)', padding: 12 }}>
                  <div className="field"><label>New Supplier Name *</label><input value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} /></div>
                  <div className="grid-2">
                    <div className="field"><label>Account Number</label><input value={newSupplier.accountNumber} onChange={(e) => setNewSupplier({ ...newSupplier, accountNumber: e.target.value })} /></div>
                    <div className="field"><label>Phone</label><input value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} /></div>
                  </div>
                  <div className="footer-actions" style={{ marginTop: 0 }}>
                    <button type="button" className="btn ghost sm" onClick={() => { setAddingSupplier(false); setNewSupplier({ name: '', accountNumber: '', phone: '' }); }}>Cancel</button>
                    <button type="button" className="btn amber sm" disabled={savingSupplier} onClick={saveNewSupplier}>{savingSupplier ? 'Saving…' : 'Save Supplier'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <h2 className="section-title">Linked Records</h2>
            <div className="grid-2">
              <div className="field">
                <label>Job (optional)</label>
                <select disabled={!canEdit} value={po.job_id || ''} onChange={(e) => onJobChange(e.target.value)}>
                  <option value="">— Not tied to a job —</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.job_number} — {j.client_name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Client (optional)</label>
                <select disabled={!canEdit} value={po.client_id || ''} onChange={(e) => onClientChange(e.target.value)}>
                  <option value="">— Not tied to a client —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Asset (optional)</label>
                <select disabled={!canEdit || !po.client_id} value={po.asset_id || ''} onChange={(e) => set('asset_id', e.target.value)}>
                  <option value="">{po.client_id ? '— Not tied to an asset —' : 'Pick a client first'}</option>
                  {assetsForClient.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Source Quote (optional)</label>
                <select disabled={!canEdit} value={po.quote_id || ''} onChange={(e) => set('quote_id', e.target.value)}>
                  <option value="">— Not raised from a quote —</option>
                  {quotes.map((q) => <option key={q.id} value={q.id}>{q.quote_number} — {q.client_name}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Assigned Technician (optional)</label>
              <select disabled={!canEdit} value={po.assigned_to_id || ''} onChange={(e) => set('assigned_to_id', e.target.value)}>
                <option value="">— Unassigned —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>

          <div className="panel">
            <h2 className="section-title">Delivery</h2>
            <div className="grid-2">
              <div className="field"><label>Delivery Method</label><input disabled={!canEdit} value={po.delivery_method || ''} onChange={(e) => set('delivery_method', e.target.value)} placeholder="e.g. Supplier delivery, pickup" /></div>
              <div className="field"><label>Expected Delivery Date</label><input type="date" disabled={!canEdit} value={dstr(po.expected_delivery_date)} onChange={(e) => set('expected_delivery_date', e.target.value)} /></div>
            </div>
            <div className="field"><label>Delivery Address</label><input disabled={!canEdit} value={po.delivery_address || ''} onChange={(e) => set('delivery_address', e.target.value)} /></div>
            <div className="field"><label>Delivery Notes</label><textarea rows={2} disabled={!canEdit} value={po.delivery_notes || ''} onChange={(e) => set('delivery_notes', e.target.value)} /></div>
            {canEdit && (
              <div className="footer-actions">
                <button className="btn amber" disabled={saving} onClick={() => savePo()}>{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Line Items' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <p className="small-note" style={{ marginTop: 0, marginBottom: 10 }}>
              Type an existing Spare Parts name to link this line to inventory (its cost fills in and receiving it later updates stock), or type anything else for a one-off item.
            </p>
            <table>
              <thead>
                <tr><th style={{ width: '40%' }}>Description</th><th>Supplier Code</th><th className="num">Qty</th><th className="num">Unit Cost</th><th className="num">Line Total</th><th></th></tr>
              </thead>
              <tbody>
                {lineItems.map((li, i) => (
                  <tr key={i}>
                    <td>
                      <input list="part-names" disabled={!canEdit} value={li.description} placeholder="Materials, part name..." onChange={(e) => updateItem(i, 'description', e.target.value)} />
                      <datalist id="part-names">{parts.map((p) => <option key={p.id} value={p.name} />)}</datalist>
                    </td>
                    <td><input disabled={!canEdit} value={li.supplierProductCode} onChange={(e) => updateItem(i, 'supplierProductCode', e.target.value)} /></td>
                    <td className="num"><input type="number" min="0" step="0.01" disabled={!canEdit} value={li.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} /></td>
                    <td className="num"><input type="number" min="0" step="0.01" disabled={!canEdit} value={li.unitCost} onChange={(e) => updateItem(i, 'unitCost', e.target.value)} /></td>
                    <td className="num" style={{ fontWeight: 600 }}>{money((Number(li.qty) || 0) * (Number(li.unitCost) || 0))}</td>
                    <td>{canEdit && <button className="btn danger sm" disabled={lineItems.length <= 1} onClick={() => removeItem(i)}>&times;</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canEdit && <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={addItem}>+ Add Line Item</button>}

            <div className="grid-2" style={{ marginTop: 20 }}>
              <div className="field"><label>GST (%)</label><input type="number" min="0" step="0.01" disabled={!canEdit} value={po.tax_rate} onChange={(e) => set('tax_rate', e.target.value)} /></div>
            </div>
            <div className="totals-box">
              <div className="line"><span>Subtotal</span><span>{money(subtotal)}</span></div>
              <div className="line"><span>GST ({Number(po.tax_rate) || 0}%)</span><span>{money(tax)}</span></div>
              <div className="line total"><span>Total</span><span>{money(total)}</span></div>
            </div>
            {canEdit && (
              <div className="footer-actions">
                <button className="btn amber" disabled={saving} onClick={() => savePo()}>{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Receiving' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Quantities</h2>
            {!canReceive ? (
              <div className="empty">
                {po.approval_status !== 'Approved' ? 'This PO needs to be approved before items can be received.' : `Nothing left to receive — status is ${po.status}.`}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Item</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Outstanding</th><th className="num">Receiving Now</th>
                    {fullAccess && logInvoice && <th className="num">Invoice Cost</th>}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.filter((li) => li.id).map((li) => {
                    const outstanding = outstandingFor(li);
                    const qtyNow = receiveQty(li);
                    const receivingNow = (Number(qtyNow) || 0) > 0;
                    const mismatch = receivingNow && logInvoice && Number(receiveCostById[li.id] ?? li.unitCost) !== Number(li.unitCost);
                    const part = parts.find((p) => p.id === li.partId);
                    return (
                      <Fragment key={li.id}>
                        <tr>
                          <td>{li.description}</td>
                          <td className="num">{li.qty}</td>
                          <td className="num">{li.qtyReceived}</td>
                          <td className="num">{outstanding}</td>
                          <td className="num">
                            <input type="number" min="0" step="0.01" max={outstanding} value={qtyNow}
                              onChange={(e) => setReceiveQtyById({ ...receiveQtyById, [li.id]: e.target.value })} />
                          </td>
                          {fullAccess && logInvoice && (
                            <td className="num">
                              <input type="number" min="0" step="0.01" disabled={!receivingNow} value={receiveCostById[li.id] ?? li.unitCost}
                                onChange={(e) => setReceiveCostById({ ...receiveCostById, [li.id]: e.target.value })} />
                              {mismatch && <div className="small-note" style={{ color: 'var(--amber-dark)', whiteSpace: 'nowrap' }}>≠ PO: {money(li.unitCost)}</div>}
                            </td>
                          )}
                        </tr>
                        {receivingNow && part?.track_serials && (
                          <tr>
                            <td colSpan={fullAccess && logInvoice ? 6 : 5} style={{ background: 'var(--bg-soft)' }}>
                              <div className="grid-2">
                                <div className="field">
                                  <label>Serial Numbers (one per line, or comma-separated)</label>
                                  <textarea rows={2} value={receiveSerialsById[li.id] || ''} onChange={(e) => setReceiveSerialsById({ ...receiveSerialsById, [li.id]: e.target.value })} />
                                </div>
                                <div className="field">
                                  <label>Batch Number (optional)</label>
                                  <input value={receiveBatchById[li.id] || ''} onChange={(e) => setReceiveBatchById({ ...receiveBatchById, [li.id]: e.target.value })} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}

            {canReceive && fullAccess && (
              <div className="panel" style={{ marginTop: 14, background: 'var(--bg-soft)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer' }}>
                  <input type="checkbox" checked={logInvoice} onChange={(e) => setLogInvoice(e.target.checked)} />
                  Also log the supplier's invoice for this delivery
                </label>
                {logInvoice && (
                  <div className="grid-2" style={{ marginTop: 10 }}>
                    <div className="field"><label>Invoice Number *</label><input value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })} /></div>
                    <div className="field"><label>Invoice Date</label><input type="date" value={invoiceForm.invoiceDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceDate: e.target.value })} /></div>
                    <div className="field"><label>Delivery Charge ($)</label><input type="number" min="0" step="0.01" value={invoiceForm.deliveryCharge} onChange={(e) => setInvoiceForm({ ...invoiceForm, deliveryCharge: e.target.value })} /></div>
                    <div className="field"><label>Discount ($)</label><input type="number" min="0" step="0.01" value={invoiceForm.discount} onChange={(e) => setInvoiceForm({ ...invoiceForm, discount: e.target.value })} /></div>
                  </div>
                )}
              </div>
            )}

            {canReceive && (
              <div className="footer-actions">
                <button className="btn amber" disabled={receiving} onClick={submitReceive}>{receiving ? 'Saving…' : 'Log Received Items'}</button>
              </div>
            )}
          </div>

          {canReceive && fullAccess && (
            <div className="panel">
              <h2 className="section-title">AI-Assisted Invoice Import</h2>
              <p className="small-note" style={{ marginTop: -8, marginBottom: 10 }}>
                Upload a PDF or photo of the supplier's invoice — it's read automatically and matched to this PO's line items for you to review before anything is logged.
              </p>
              <div className="field">
                <label>Invoice File (JPEG, PNG, WebP, or PDF — max 8MB)</label>
                <input type="file" ref={aiFileRef} accept="image/jpeg,image/png,image/webp,application/pdf" />
              </div>
              <div className="footer-actions">
                <button className="btn ghost" disabled={parsing} onClick={parseInvoiceFile}>{parsing ? 'Reading…' : 'Read Invoice'}</button>
              </div>

              {aiReview && (
                <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
                  <h2 className="section-title">Review Before Confirming</h2>
                  {aiReview.duplicateWarning && <div className="error-box" style={{ marginBottom: 10 }}>{aiReview.duplicateWarning}</div>}
                  {aiReview.poMismatchWarning && <div className="error-box" style={{ marginBottom: 10 }}>{aiReview.poMismatchWarning}</div>}
                  <div className="grid-2">
                    <div className="field"><label>Invoice Number</label><input value={aiReview.invoiceNumber || ''} onChange={(e) => setAiReview({ ...aiReview, invoiceNumber: e.target.value })} /></div>
                    <div className="field"><label>Invoice Date</label><input type="date" value={aiReview.invoiceDate || ''} onChange={(e) => setAiReview({ ...aiReview, invoiceDate: e.target.value })} /></div>
                    <div className="field"><label>Delivery Charge ($)</label><input type="number" step="0.01" value={aiReview.deliveryCharge || 0} onChange={(e) => setAiReview({ ...aiReview, deliveryCharge: e.target.value })} /></div>
                    <div className="field"><label>Discount ($)</label><input type="number" step="0.01" value={aiReview.discount || 0} onChange={(e) => setAiReview({ ...aiReview, discount: e.target.value })} /></div>
                  </div>
                  <table>
                    <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit Cost</th><th>Match</th></tr></thead>
                    <tbody>
                      {aiReview.lineItems.map((li, i) => (
                        <tr key={i}>
                          <td><input value={li.description} onChange={(e) => updateAiLine(i, 'description', e.target.value)} /></td>
                          <td className="num"><input type="number" step="0.01" value={li.qty} onChange={(e) => updateAiLine(i, 'qty', e.target.value)} /></td>
                          <td className="num">
                            <input type="number" step="0.01" value={li.unitCost} onChange={(e) => updateAiLine(i, 'unitCost', e.target.value)} />
                            {li.priceMismatch && <div className="small-note" style={{ color: 'var(--amber-dark)' }}>≠ PO: {money(li.poUnitCost)}</div>}
                          </td>
                          <td>{li.matchedLineItemId ? <span className="badge paid">Matched</span> : <span className="badge unpaid">No match — won't be logged</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="footer-actions">
                    <button className="btn ghost" disabled={confirmingAi} onClick={() => setAiReview(null)}>Discard</button>
                    <button className="btn amber" disabled={confirmingAi} onClick={confirmAiInvoice}>{confirmingAi ? 'Logging…' : 'Confirm & Log Invoice'}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'Invoices' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Invoices</h2>
            {invoices.length === 0 ? (
              <div className="empty">No invoices logged yet — use the Receiving tab to log one.</div>
            ) : (
              <table>
                <thead><tr><th>Invoice #</th><th>Date</th><th>Source</th><th className="num">Total</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td data-label="Invoice #">{inv.invoice_number}</td>
                      <td data-label="Date">{dstr(inv.invoice_date)}</td>
                      <td data-label="Source">{inv.source === 'ai_import' ? 'AI Import' : 'Manual'}</td>
                      <td className="num" data-label="Total">{money(inv.total)}</td>
                      <td data-label="Status"><span className={`badge ${slug(inv.status)}`}>{inv.status}</span></td>
                      <td><button className="btn ghost sm" onClick={() => openInvoice(inv.id)}>Manage</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {selectedInvoiceId && (
            <div className="panel">
              {loadingInvoice || !selectedInvoice ? (
                <div className="empty">Loading…</div>
              ) : (
                <>
                  <h2 className="section-title">Invoice {selectedInvoice.invoice_number}</h2>
                  <table>
                    <thead><tr><th>Description</th><th>Code</th><th className="num">Qty</th><th className="num">Unit Cost</th><th className="num">Line Total</th></tr></thead>
                    <tbody>
                      {(selectedInvoice.lineItems || []).map((li) => (
                        <tr key={li.id}>
                          <td data-label="Description">{li.description}</td>
                          <td data-label="Code">{li.supplier_product_code || '—'}</td>
                          <td className="num" data-label="Qty">{li.qty}</td>
                          <td className="num" data-label="Unit Cost">{money(li.unit_cost)}</td>
                          <td className="num" data-label="Line Total">{money(Number(li.qty) * Number(li.unit_cost))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="totals-box">
                    <div className="line"><span>Subtotal</span><span>{money(selectedInvoice.subtotal)}</span></div>
                    {Number(selectedInvoice.discount) > 0 && <div className="line"><span>Discount</span><span>-{money(selectedInvoice.discount)}</span></div>}
                    {Number(selectedInvoice.delivery_charge) > 0 && <div className="line"><span>Delivery</span><span>{money(selectedInvoice.delivery_charge)}</span></div>}
                    <div className="line"><span>GST</span><span>{money(selectedInvoice.tax)}</span></div>
                    <div className="line total"><span>Total</span><span>{money(selectedInvoice.total)}</span></div>
                    <div className="line"><span>Paid</span><span>{money(selectedInvoice.amount_paid)}</span></div>
                  </div>

                  <h2 className="section-title" style={{ marginTop: 18 }}>Payment History</h2>
                  {(selectedInvoice.payments || []).length === 0 ? (
                    <div className="empty">No payments logged yet.</div>
                  ) : (
                    <table>
                      <thead><tr><th>Date</th><th>Method</th><th className="num">Amount</th><th></th></tr></thead>
                      <tbody>
                        {selectedInvoice.payments.map((p) => (
                          <tr key={p.id}>
                            <td data-label="Date">{dstr(p.date)}</td>
                            <td data-label="Method">{p.method || '—'}</td>
                            <td className="num" data-label="Amount">{money(p.amount)}</td>
                            <td><button className="btn danger sm" disabled={voidingId === p.id} onClick={() => voidPayment(p.id)}>{voidingId === p.id ? 'Voiding…' : 'Void'}</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <h2 className="section-title" style={{ marginTop: 18 }}>Log a Payment</h2>
                  <div className="grid-2">
                    <div className="field"><label>Amount ($)</label><input type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></div>
                    <div className="field"><label>Date</label><input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} /></div>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label>Method</label>
                      <select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                        {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="field"><label>Note</label><input value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} /></div>
                  </div>
                  <div className="modal-actions">
                    <button className="btn danger" disabled={deletingInvoice} onClick={deleteInvoice}>{deletingInvoice ? 'Deleting…' : 'Delete Invoice'}</button>
                    <button className="btn ghost" onClick={() => { setSelectedInvoiceId(null); setSelectedInvoice(null); }}>Close</button>
                    <button className="btn amber" disabled={savingPayment} onClick={submitPayment}>{savingPayment ? 'Saving…' : 'Log Payment'}</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'Documents' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Attachments</h2>
            {documents.length === 0 ? (
              <div className="empty">No files uploaded yet.</div>
            ) : (
              <table>
                <thead><tr><th>Label</th><th>Category</th><th>Uploaded By</th><th>Date</th><th></th></tr></thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id}>
                      <td data-label="Label"><a href={d.file_url} target="_blank" rel="noreferrer">{d.label || 'File'}</a></td>
                      <td data-label="Category"><span className={`badge ${slug(d.category)}`}>{d.category}</span></td>
                      <td data-label="Uploaded By">{d.uploaded_by}</td>
                      <td data-label="Date">{fmtDate(d.created_at)}</td>
                      <td>{fullAccess && <button className="btn danger sm" disabled={deletingDocId === d.id} onClick={() => deleteDocument(d.id)}>{deletingDocId === d.id ? '…' : 'Delete'}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2 className="section-title" style={{ marginTop: 18 }}>Upload a File</h2>
            <div className="grid-2">
              <div className="field"><label>Label</label><input value={uploadForm.label} onChange={(e) => setUploadForm({ ...uploadForm, label: e.target.value })} placeholder="e.g. Delivery docket" /></div>
              <div className="field">
                <label>Category</label>
                <select value={uploadForm.category} onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })}>
                  {DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>File (JPEG, PNG, WebP, or PDF — max 8MB)</label>
              <input type="file" ref={fileRef} accept="image/jpeg,image/png,image/webp,application/pdf" />
            </div>
            <div className="footer-actions">
              <button className="btn amber" disabled={uploading} onClick={uploadDocument}>{uploading ? 'Uploading…' : 'Upload'}</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'Notes' && (
        <div key={tab} className="page-transition">
          <div className="panel">
            <h2 className="section-title">Notes</h2>
            <textarea rows={5} disabled={!canEdit} value={po.notes || ''} onChange={(e) => set('notes', e.target.value)} />
            {canEdit && (
              <div className="footer-actions">
                <button className="btn amber" disabled={saving} onClick={() => savePo('Notes saved')}>{saving ? 'Saving…' : 'Save Notes'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'History' && (
        <div key={tab} className="page-transition">
          {canReview && (
            <div className="panel">
              <h2 className="section-title">Approval</h2>
              <div className="field">
                <label>Note (shown to the drafter, e.g. what to fix if rejecting)</label>
                <textarea rows={3} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
              </div>
              <div className="footer-actions">
                <button className="btn danger-solid" disabled={reviewing} onClick={() => submitReview('rejected')}>{reviewing ? '…' : 'Reject'}</button>
                <button className="btn amber" disabled={reviewing} onClick={() => submitReview('approved')}>{reviewing ? '…' : 'Approve'}</button>
              </div>
            </div>
          )}

          <div className="panel">
            <h2 className="section-title">Add a Note</h2>
            <textarea rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Anything worth recording against this PO" />
            <div className="footer-actions">
              <button className="btn amber" disabled={postingNote} onClick={postNote}>{postingNote ? 'Posting…' : 'Add Note'}</button>
            </div>
          </div>

          <div className="panel">
            <h2 className="section-title">Activity &amp; Approval History</h2>
            {activity.length === 0 ? (
              <div className="empty">No activity logged yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activity.map((a) => (
                  <div key={a.id} style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>
                    <div className="small-note">{fmtDate(a.created_at)} — {a.created_by}{a.type !== 'note' ? ` · ${a.type.replace('_', ' ')}` : ''}</div>
                    <div>{a.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <h2 className="section-title">Actions</h2>
            <div className="row-actions">
              {canPrint && <a className="btn ghost sm" href={`/purchase-orders/${po.id}/print`} target="_blank" rel="noreferrer">Print</a>}
              {canPrint && <a className="btn ghost sm" href={`/api/purchase-orders/${po.id}/pdf`}>Download PDF</a>}
              {fullAccess && <button className="btn ghost sm" disabled={duplicating} onClick={duplicatePo}>{duplicating ? 'Duplicating…' : 'Duplicate'}</button>}
              {canDelete && <button className="btn danger sm" disabled={deleting} onClick={deletePo}>{deleting ? 'Deleting…' : 'Delete Purchase Order'}</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
