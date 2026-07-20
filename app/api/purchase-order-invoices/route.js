import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import { serializeDates } from '../../../lib/format';

export const runtime = 'nodejs';

const DATE_FIELDS = ['invoice_date'];

// List view for the Supplier Invoices page — an AP ledger, so gated the same
// as the page itself (fullAccess only). Creation happens exclusively via
// app/api/purchase-orders/[id]/receive, not here — an invoice is always tied
// to receiving a specific delivery against a specific PO.
export async function GET() {
  const session = await getSession();
  if (!session || !CAN.viewFinancials(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const rows = await sql`
    select pi.*, po.po_number, po.supplier_name, po.job_number
    from purchase_order_invoices pi
    join purchase_orders po on po.id = pi.purchase_order_id
    order by pi.invoice_date desc nulls last, pi.created_at desc
  `;
  return NextResponse.json(rows.map((r) => serializeDates(r, DATE_FIELDS)));
}
