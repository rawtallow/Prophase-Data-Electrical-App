import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

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

  const rows = await sql`
    update purchase_orders set
      supplier_id = ${supplierId || null}, supplier_name = ${supplierName.trim()},
      job_id = ${jobId || null}, job_number = ${jobNumber || ''},
      tax_rate = ${Number(taxRate) || 0}, subtotal = ${subtotal}, tax = ${tax}, total = ${total},
      status = ${finalStatus}, notes = ${notes || ''},
      approval_status = ${finalApprovalStatus}, approval_note = ${finalApprovalNote}, reviewed_by = ${finalReviewedBy}
    where id = ${params.id}
    returning *
  `;

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

  if (CAN.editPurchaseOrders(session.role)) {
    await sql`delete from purchase_orders where id = ${params.id}`;
    return NextResponse.json({ ok: true });
  }

  // Employees can only remove their own PO while it's still awaiting (or
  // was sent back for) review — not once it's been approved.
  const rows = await sql`select created_by_id, approval_status from purchase_orders where id = ${params.id}`;
  const existing = rows[0];
  if (!existing || existing.created_by_id !== session.id || existing.approval_status === 'Approved') {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  await sql`delete from purchase_orders where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
