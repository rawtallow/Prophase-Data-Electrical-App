import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import { sydneyToday, serializeDates } from '../../../../lib/format';

export const runtime = 'nodejs';

const PO_DATE_FIELDS = ['date'];

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

// Reserves a real, permanent PO number the instant "+ New PO" is clicked —
// before a supplier, job, or a single line item has been chosen. Wholesalers
// require this number up front to give a price over the phone, so the usual
// "assign the number on Save" pattern (used by Quotes and Jobs) doesn't work
// here; the row starts as a bare Draft and gets filled in afterward on the
// edit page. Also used by the Spare Parts "Reorder" shortcut, which passes
// partId/qty to pre-populate one real (persisted) line item at creation time
// instead of the old query-string-prefill that only lived in the browser.
export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.viewPurchaseOrders(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { partId, qty } = body;

  const poNumber = await nextPoNumber();
  const isEmployee = session.role === 'employee';
  const status = 'Draft';
  const approvalStatus = isEmployee ? 'Pending Approval' : 'Approved';

  const rows = await sql`
    insert into purchase_orders (po_number, date, supplier_name, status, approval_status, created_by_id, created_by, updated_at)
    values (${poNumber}, ${sydneyToday()}, '', ${status}, ${approvalStatus}, ${session.id}, ${session.name}, now())
    returning *
  `;
  const po = rows[0];

  if (partId) {
    const parts = await sql`select id, name, unit_cost from parts where id = ${partId}`;
    const part = parts[0];
    if (part) {
      await sql`
        insert into purchase_order_line_items (purchase_order_id, part_id, description, qty, unit_cost, sort_order)
        values (${po.id}, ${part.id}, ${part.name}, ${Number(qty) || 1}, ${Number(part.unit_cost) || 0}, 0)
      `;
    }
  }
  await sql`insert into po_activity (purchase_order_id, type, message, created_by) values (${po.id}, 'note', 'Purchase order created', ${session.name})`;

  return NextResponse.json(serializeDates(po, PO_DATE_FIELDS));
}
