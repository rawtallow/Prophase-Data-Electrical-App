import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import { gateOrExecute } from '../../../../lib/approvals';

export const runtime = 'nodejs';

// See app/api/purchase-orders/route.js's copy of this same helper for the
// full explanation — duplicated rather than shared, matching this codebase's
// per-file convention for small helpers.
async function nextPoNumber() {
  const released = await sql`
    delete from po_number_pool
    where po_number = (select po_number from po_number_pool order by po_number asc limit 1)
    returning po_number
  `;
  if (released[0]) return released[0].po_number;
  const rows = await sql`update counters set value = value + 1 where key = 'po' returning value`;
  return 'PO-' + String(rows[0].value).padStart(4, '0');
}

function computeTotals(lineItems, taxRate) {
  const subtotal = lineItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.unitCost) || 0), 0);
  const tax = subtotal * ((Number(taxRate) || 0) / 100);
  const total = subtotal + tax;
  return { subtotal, tax, total };
}
async function resolveAssignee(assignedToId) {
  if (!assignedToId) return { id: null, name: '' };
  const rows = await sql`select id, name from employees where id = ${assignedToId}`;
  return rows[0] ? { id: rows[0].id, name: rows[0].name } : { id: null, name: '' };
}
async function logActivity(poId, type, message, createdBy) {
  await sql`insert into po_activity (purchase_order_id, type, message, created_by) values (${poId}, ${type}, ${message}, ${createdBy})`;
}

export async function GET(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewPurchaseOrders(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const pos = await sql`select * from purchase_orders where id = ${params.id}`;
  if (!pos[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [lineItems, invoices, documents, activity] = await Promise.all([
    sql`select * from purchase_order_line_items where purchase_order_id = ${params.id} order by sort_order asc`,
    sql`select * from purchase_order_invoices where purchase_order_id = ${params.id} order by invoice_date desc, created_at desc`,
    sql`select * from po_documents where purchase_order_id = ${params.id} order by created_at desc`,
    sql`select * from po_activity where purchase_order_id = ${params.id} order by created_at desc`
  ]);
  return NextResponse.json({ ...pos[0], lineItems, invoices, documents, activity });
}

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existingRows = await sql`select * from purchase_orders where id = ${params.id}`;
  const existing = existingRows[0];
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isEmployee = session.role === 'employee';
  if (isEmployee) {
    if (existing.created_by_id !== session.id) {
      return NextResponse.json({ error: 'You can only edit your own purchase orders' }, { status: 403 });
    }
    if (existing.approval_status === 'Approved') {
      return NextResponse.json({ error: 'This purchase order has already been approved and can no longer be edited' }, { status: 403 });
    }
  }

  const body = await req.json();
  const {
    supplierId, supplierName, jobId, jobNumber, clientId, clientName, assetId, quoteId, assignedToId,
    deliveryMethod, deliveryAddress, expectedDeliveryDate, deliveryNotes, lineItems, taxRate, notes, status
  } = body;
  const cleanItems = (lineItems || []).filter((li) => (li.description || '').trim() !== '' || (Number(li.qty) || 0) * (Number(li.unitCost) || 0) !== 0);
  if (cleanItems.length === 0) return NextResponse.json({ error: 'Add at least one line item' }, { status: 400 });
  if (!supplierName || !supplierName.trim()) return NextResponse.json({ error: 'Supplier is required' }, { status: 400 });

  const { subtotal, tax, total } = computeTotals(cleanItems, taxRate);
  const assignee = await resolveAssignee(assignedToId);

  let finalStatus = status || existing.status;
  let finalApprovalStatus = existing.approval_status;
  let finalApprovalNote = existing.approval_note;
  let finalReviewedBy = existing.reviewed_by;
  if (isEmployee) {
    // Any employee edit (including fixing up a rejected PO) goes back into
    // the review queue — a resubmission clears the previous review so it
    // doesn't look stale, same behaviour as quotes.
    finalStatus = 'Draft';
    finalApprovalStatus = 'Pending Approval';
    finalApprovalNote = '';
    finalReviewedBy = '';
  } else if (finalStatus === 'Ordered' && existing.approval_status !== 'Approved') {
    return NextResponse.json({ error: 'Approve this purchase order before it can be sent to the supplier' }, { status: 400 });
  }

  if (finalStatus !== existing.status) {
    await logActivity(params.id, 'status_change', `Status changed from ${existing.status} to ${finalStatus}`, session.name);
  }

  // A cancelled PO's row stays in the table (it's kept in history, visible
  // under the Cancelled status filter), so its number can't just move to the
  // pool as-is — the unique constraint on po_number would collide the moment
  // a future PO actually reused it while this row still held that exact
  // string. Cancelling instead relabels this row (freeing the bare number)
  // and un-cancelling reclaims the bare number if nothing's claimed it since,
  // or mints a fresh one via nextPoNumber() if it has — so this row never
  // ends up silently sharing a number with a different, newer PO. Keyed off
  // finalStatus (not the raw submitted status) since the employee branch
  // above can override a submitted 'Cancelled' back to 'Draft'.
  let finalPoNumber = existing.po_number;
  if (existing.status !== 'Cancelled' && finalStatus === 'Cancelled') {
    finalPoNumber = existing.po_number + ' (Cancelled)';
  } else if (existing.status === 'Cancelled' && finalStatus !== 'Cancelled') {
    const original = existing.po_number.replace(/ \(Cancelled\)$/, '');
    const reclaimed = await sql`delete from po_number_pool where po_number = ${original} returning po_number`;
    finalPoNumber = reclaimed[0] ? original : await nextPoNumber();
  }

  const rows = await sql`
    update purchase_orders set
      po_number = ${finalPoNumber},
      supplier_id = ${supplierId || null}, supplier_name = ${supplierName.trim()},
      job_id = ${jobId || null}, job_number = ${jobNumber || ''},
      client_id = ${clientId || null}, client_name = ${clientName || ''}, asset_id = ${assetId || null}, quote_id = ${quoteId || null},
      assigned_to_id = ${assignee.id}, assigned_to_name = ${assignee.name},
      delivery_method = ${deliveryMethod || ''}, delivery_address = ${deliveryAddress || ''},
      expected_delivery_date = ${expectedDeliveryDate || null}, delivery_notes = ${deliveryNotes || ''},
      tax_rate = ${Number(taxRate) || 0}, subtotal = ${subtotal}, tax = ${tax}, total = ${total},
      status = ${finalStatus}, notes = ${notes || ''},
      approval_status = ${finalApprovalStatus}, approval_note = ${finalApprovalNote}, reviewed_by = ${finalReviewedBy},
      updated_at = now()
    where id = ${params.id}
    returning *
  `;

  if (existing.status !== 'Cancelled' && finalStatus === 'Cancelled') {
    await sql`insert into po_number_pool (po_number) values (${existing.po_number}) on conflict do nothing`;
  }

  // Carry forward qty_received for lines that already existed — a delete+
  // reinsert with no memory of it would silently wipe out receiving progress
  // any time notes, delivery info, or an unrelated line got edited on a PO
  // that's already been partially received.
  const priorLineItems = await sql`select id, qty_received from purchase_order_line_items where purchase_order_id = ${params.id}`;
  const receivedById = Object.fromEntries(priorLineItems.map((l) => [l.id, Number(l.qty_received)]));

  await sql`delete from purchase_order_line_items where purchase_order_id = ${params.id}`;
  for (let i = 0; i < cleanItems.length; i++) {
    const li = cleanItems[i];
    const qtyReceived = li.id && receivedById[li.id] !== undefined ? receivedById[li.id] : 0;
    await sql`
      insert into purchase_order_line_items (purchase_order_id, part_id, description, supplier_product_code, qty, unit_cost, qty_received, sort_order)
      values (${params.id}, ${li.partId || null}, ${li.description || ''}, ${li.supplierProductCode || ''}, ${Number(li.qty) || 0}, ${Number(li.unitCost) || 0}, ${qtyReceived}, ${i})
    `;
  }

  return NextResponse.json(rows[0]);
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`select po_number, supplier_name, created_by_id, approval_status from purchase_orders where id = ${params.id}`;
  const existing = rows[0];
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Employees can only remove their own PO while it's still awaiting (or
  // was sent back for) review — not once it's been approved.
  if (!CAN.editPurchaseOrders(session.role)) {
    if (existing.created_by_id !== session.id || existing.approval_status === 'Approved') {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }
  }

  const { pending, request, result } = await gateOrExecute({
    session,
    actionType: 'delete_purchase_order',
    targetId: params.id,
    targetLabel: `${existing.po_number} — ${existing.supplier_name}`,
    payload: {},
    execute: async () => {
      // Deleting a PO — including a bare stub whose number was reserved but
      // never used — frees its number back into the pool. See nextPoNumber()
      // in app/api/purchase-orders/draft/route.js. Skip this for a row that
      // was already cancelled (relabelled " (Cancelled)" by the PUT handler
      // above) — its bare number was already released back then, and may
      // since have been legitimately claimed by a different, newer PO;
      // re-pooling it here could hand that same number out a second time
      // while it's still live elsewhere.
      const queries = [sql`delete from purchase_orders where id = ${params.id}`];
      if (!existing.po_number.endsWith(' (Cancelled)')) {
        queries.unshift(sql`insert into po_number_pool (po_number) values (${existing.po_number}) on conflict do nothing`);
      }
      await sql.transaction(queries);
      return { ok: true };
    }
  });
  return NextResponse.json(pending ? { pending: true, request } : result);
}
