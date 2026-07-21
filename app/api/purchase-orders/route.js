import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import { sydneyToday, serializeDates } from '../../../lib/format';

export const runtime = 'nodejs';

// The neon driver parses `date` columns using local-time components; once a
// raw Date crosses NextResponse.json() (JSON.stringify -> UTC toJSON), it can
// land on the wrong calendar day for servers running outside UTC. See
// lib/format.js's serializeDates for the full explanation.
const PO_DATE_FIELDS = ['date'];

// Reuses the smallest number freed by a cancelled/deleted PO (see
// po_number_pool) before minting a brand new one — wholesalers need this
// number up front, before they'll quote a price, so numbers that were
// reserved but never actually used shouldn't be burned forever. The DELETE
// is a single statement, so it's atomic on its own: two concurrent callers
// can't both claim the same pooled row (the second just deletes 0 rows and
// falls through to minting a new one).
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

// A PO is tied to one responsible technician (who requested/is following
// up on it) rather than a multi-assignee list like Jobs — procurement
// paperwork isn't a multi-person physical task the way a job is.
async function resolveAssignee(assignedToId) {
  if (!assignedToId) return { id: null, name: '' };
  const rows = await sql`select id, name from employees where id = ${assignedToId}`;
  return rows[0] ? { id: rows[0].id, name: rows[0].name } : { id: null, name: '' };
}

export async function GET() {
  const session = await getSession();
  if (!session || !CAN.viewPurchaseOrders(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  // Aggregated (not a single status string) since a PO can have more than one
  // invoice across partial deliveries — the dashboard derives a display label
  // from these three numbers (see slug/invoiceStatusLabel in the list UI).
  const rows = await sql`
    select po.*, coalesce(count(pi.id), 0)::int as invoice_count,
           coalesce(sum(pi.total), 0) as invoiced_total, coalesce(sum(pi.amount_paid), 0) as invoice_paid_total
    from purchase_orders po
    left join purchase_order_invoices pi on pi.purchase_order_id = po.id
    group by po.id
    order by po.created_at desc
  `;
  return NextResponse.json(rows.map((r) => serializeDates(r, PO_DATE_FIELDS)));
}

export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    supplierId, supplierName, jobId, jobNumber, clientId, clientName, assetId, quoteId, assignedToId,
    deliveryMethod, deliveryAddress, expectedDeliveryDate, deliveryNotes, lineItems, taxRate, status, notes
  } = body;

  if (!supplierName || !supplierName.trim()) return NextResponse.json({ error: 'Supplier is required' }, { status: 400 });
  const cleanItems = (lineItems || []).filter((li) => (li.description || '').trim() !== '' || (Number(li.qty) || 0) * (Number(li.unitCost) || 0) !== 0);
  if (cleanItems.length === 0) return NextResponse.json({ error: 'Add at least one line item' }, { status: 400 });

  const { subtotal, tax, total } = computeTotals(cleanItems, taxRate);
  const poNumber = await nextPoNumber();
  const assignee = await resolveAssignee(assignedToId);

  // Employees can draft a PO, but it needs manager/admin sign-off before it
  // can be sent to the supplier — same rule as quotes (see
  // app/api/quotes/route.js). A manager/admin's own PO is auto-approved.
  const isEmployee = session.role === 'employee';
  const finalStatus = isEmployee ? 'Draft' : (status || 'Draft');
  const approvalStatus = isEmployee ? 'Pending Approval' : 'Approved';

  const rows = await sql`
    insert into purchase_orders (
      po_number, date, supplier_id, supplier_name, job_id, job_number, client_id, client_name, asset_id, quote_id,
      assigned_to_id, assigned_to_name, delivery_method, delivery_address, expected_delivery_date, delivery_notes,
      status, tax_rate, subtotal, tax, total, notes, approval_status, created_by_id, created_by, updated_at
    )
    values (
      ${poNumber}, ${sydneyToday()}, ${supplierId || null}, ${supplierName.trim()}, ${jobId || null}, ${jobNumber || ''}, ${clientId || null}, ${clientName || ''}, ${assetId || null}, ${quoteId || null},
      ${assignee.id}, ${assignee.name}, ${deliveryMethod || ''}, ${deliveryAddress || ''}, ${expectedDeliveryDate || null}, ${deliveryNotes || ''},
      ${finalStatus}, ${Number(taxRate) || 0}, ${subtotal}, ${tax}, ${total}, ${notes || ''}, ${approvalStatus}, ${session.id}, ${session.name}, now()
    )
    returning *
  `;
  const po = rows[0];

  for (let i = 0; i < cleanItems.length; i++) {
    const li = cleanItems[i];
    await sql`
      insert into purchase_order_line_items (purchase_order_id, part_id, description, supplier_product_code, qty, unit_cost, sort_order)
      values (${po.id}, ${li.partId || null}, ${li.description || ''}, ${li.supplierProductCode || ''}, ${Number(li.qty) || 0}, ${Number(li.unitCost) || 0}, ${i})
    `;
  }
  await sql`insert into po_activity (purchase_order_id, type, message, created_by) values (${po.id}, 'note', 'Purchase order created', ${session.name})`;

  return NextResponse.json(serializeDates(po, PO_DATE_FIELDS));
}
