import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import { serializeDates } from '../../../../lib/format';

export const runtime = 'nodejs';

const DATE_FIELDS = ['invoice_date'];

export async function GET(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewFinancials(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const rows = await sql`
    select pi.*, po.po_number, po.supplier_name, po.job_number
    from purchase_order_invoices pi
    join purchase_orders po on po.id = pi.purchase_order_id
    where pi.id = ${params.id}
  `;
  const invoice = rows[0];
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [lineItems, payments] = await Promise.all([
    sql`select * from purchase_order_invoice_line_items where purchase_order_invoice_id = ${params.id} order by sort_order asc`,
    sql`select * from purchase_order_invoice_payments where purchase_order_invoice_id = ${params.id} order by date desc, created_at desc`
  ]);
  return NextResponse.json({
    ...serializeDates(invoice, DATE_FIELDS),
    lineItems,
    payments: payments.map((p) => serializeDates(p, ['date']))
  });
}

// Deleting an invoice is a correction for a mistaken entry (wrong number
// typed, duplicate log, etc.) — it does NOT reverse the PO's qty_received
// bump, since receiving stock is a separate physical fact that already
// happened and shouldn't be silently undone by deleting a paperwork record.
export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewFinancials(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const rows = await sql`select id from purchase_order_invoices where id = ${params.id}`;
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await sql`delete from purchase_order_invoices where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
