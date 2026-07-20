import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

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

export async function GET(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewPurchaseOrders(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const pos = await sql`select * from purchase_orders where id = ${params.id}`;
  if (!pos[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const lineItems = await sql`select * from purchase_order_line_items where purchase_order_id = ${params.id} order by sort_order asc`;
  return NextResponse.json({ ...pos[0], lineItems });
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
  const { supplierId, supplierName, jobId, jobNumber, lineItems, taxRate, notes, status } = body;
  const cleanItems = (lineItems || []).filter((li) => (li.description || '').trim() !== '' || (Number(li.qty) || 0) * (Number(li.unitCost) || 0) !== 0);
  if (cleanItems.length === 0) return NextResponse.json({ error: 'Add at least one line item' }, { status: 400 });
  if (!supplierName || !supplierName.trim()) return NextResponse.json({ error: 'Supplier is required' }, { status: 400 });

  const { subtotal, tax, total } = computeTotals(cleanItems, taxRate);

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
  } else if (finalStatus === 'Sent' && existing.approval_status !== 'Approved') {
    return NextResponse.json({ error: 'Approve this purchase order before it can be sent' }, { status: 400 });
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
      tax_rate = ${Number(taxRate) || 0}, subtotal = ${subtotal}, tax = ${tax}, total = ${total},
      status = ${finalStatus}, notes = ${notes || ''},
      approval_status = ${finalApprovalStatus}, approval_note = ${finalApprovalNote}, reviewed_by = ${finalReviewedBy}
    where id = ${params.id}
    returning *
  `;

  if (existing.status !== 'Cancelled' && finalStatus === 'Cancelled') {
    await sql`insert into po_number_pool (po_number) values (${existing.po_number}) on conflict do nothing`;
  }

  await sql`delete from purchase_order_line_items where purchase_order_id = ${params.id}`;
  for (let i = 0; i < cleanItems.length; i++) {
    const li = cleanItems[i];
    await sql`
      insert into purchase_order_line_items (purchase_order_id, part_id, description, qty, unit_cost, sort_order)
      values (${params.id}, ${li.partId || null}, ${li.description || ''}, ${Number(li.qty) || 0}, ${Number(li.unitCost) || 0}, ${i})
    `;
  }

  return NextResponse.json(rows[0]);
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`select po_number, created_by_id, approval_status from purchase_orders where id = ${params.id}`;
  const existing = rows[0];
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Employees can only remove their own PO while it's still awaiting (or
  // was sent back for) review — not once it's been approved.
  if (!CAN.editPurchaseOrders(session.role)) {
    if (existing.created_by_id !== session.id || existing.approval_status === 'Approved') {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }
  }

  // Deleting a PO — including a bare stub whose number was reserved but
  // never used — frees its number back into the pool. See nextPoNumber() in
  // app/api/purchase-orders/draft/route.js. Skip this for a row that was
  // already cancelled (relabelled " (Cancelled)" by the PUT handler above) —
  // its bare number was already released back then, and may since have been
  // legitimately claimed by a different, newer PO; re-pooling it here could
  // hand that same number out a second time while it's still live elsewhere.
  const queries = [sql`delete from purchase_orders where id = ${params.id}`];
  if (!existing.po_number.endsWith(' (Cancelled)')) {
    queries.unshift(sql`insert into po_number_pool (po_number) values (${existing.po_number}) on conflict do nothing`);
  }
  await sql.transaction(queries);
  return NextResponse.json({ ok: true });
}
