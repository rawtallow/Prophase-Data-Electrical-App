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

export async function GET() {
  const session = await getSession();
  if (!session || !CAN.viewPurchaseOrders(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const rows = await sql`select * from purchase_orders order by created_at desc`;
  return NextResponse.json(rows.map((r) => serializeDates(r, PO_DATE_FIELDS)));
}

export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { supplierId, supplierName, jobId, jobNumber, lineItems, taxRate, status, notes } = body;

  if (!supplierName || !supplierName.trim()) return NextResponse.json({ error: 'Supplier is required' }, { status: 400 });
  const cleanItems = (lineItems || []).filter((li) => (li.description || '').trim() !== '' || (Number(li.qty) || 0) * (Number(li.unitCost) || 0) !== 0);
  if (cleanItems.length === 0) return NextResponse.json({ error: 'Add at least one line item' }, { status: 400 });

  const { subtotal, tax, total } = computeTotals(cleanItems, taxRate);
  const poNumber = await nextPoNumber();

  // Employees can draft a PO, but it needs manager/admin sign-off before it
  // can be sent to the supplier — same rule as quotes (see
  // app/api/quotes/route.js). A manager/admin's own PO is auto-approved.
  const isEmployee = session.role === 'employee';
  const finalStatus = isEmployee ? 'Draft' : (status || 'Draft');
  const approvalStatus = isEmployee ? 'Pending Approval' : 'Approved';

  const rows = await sql`
    insert into purchase_orders (po_number, date, supplier_id, supplier_name, job_id, job_number, status, tax_rate, subtotal, tax, total, notes, approval_status, created_by_id, created_by)
    values (${poNumber}, ${sydneyToday()}, ${supplierId || null}, ${supplierName.trim()}, ${jobId || null}, ${jobNumber || ''}, ${finalStatus},
      ${Number(taxRate) || 0}, ${subtotal}, ${tax}, ${total}, ${notes || ''}, ${approvalStatus}, ${session.id}, ${session.name})
    returning *
  `;
  const po = rows[0];

  for (let i = 0; i < cleanItems.length; i++) {
    const li = cleanItems[i];
    await sql`
      insert into purchase_order_line_items (purchase_order_id, part_id, description, qty, unit_cost, sort_order)
      values (${po.id}, ${li.partId || null}, ${li.description || ''}, ${Number(li.qty) || 0}, ${Number(li.unitCost) || 0}, ${i})
    `;
  }

  return NextResponse.json(serializeDates(po, PO_DATE_FIELDS));
}
