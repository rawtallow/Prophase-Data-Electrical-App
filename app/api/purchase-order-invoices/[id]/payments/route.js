import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { sydneyToday, serializeDates } from '../../../../../lib/format';

export const runtime = 'nodejs';

const DATE_FIELDS = ['invoice_date'];

function statusFor(total, paid) {
  if (paid <= 0) return 'Unpaid';
  if (paid >= total) return 'Paid';
  return 'Partially Paid';
}

// Logs a payment against a supplier invoice: inserts one payment row and
// bumps the cached amount_paid total, recomputing status from the new total
// — same build-queries-then-one-transaction shape as app/api/jobs/[id]/
// payments/route.js.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewFinancials(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const invoices = await sql`select * from purchase_order_invoices where id = ${params.id}`;
  const invoice = invoices[0];
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { amount, date, method, note } = await req.json();
  const cleanAmount = Number(amount) || 0;
  if (cleanAmount <= 0) return NextResponse.json({ error: 'Enter an amount greater than 0' }, { status: 400 });

  const newPaid = Number(invoice.amount_paid) + cleanAmount;
  const newStatus = statusFor(Number(invoice.total), newPaid);
  const paymentDate = date || sydneyToday();

  await sql.transaction([
    sql`insert into purchase_order_invoice_payments (purchase_order_invoice_id, date, amount, method, note, created_by) values (${params.id}, ${paymentDate}, ${cleanAmount}, ${method || ''}, ${note || ''}, ${session.name})`,
    sql`update purchase_order_invoices set amount_paid = ${newPaid}, status = ${newStatus} where id = ${params.id}`
  ]);

  const [updatedRows, payments] = await Promise.all([
    sql`
      select pi.*, po.po_number, po.supplier_name, po.job_number
      from purchase_order_invoices pi join purchase_orders po on po.id = pi.purchase_order_id
      where pi.id = ${params.id}
    `,
    sql`select * from purchase_order_invoice_payments where purchase_order_invoice_id = ${params.id} order by date desc, created_at desc`
  ]);
  return NextResponse.json({
    ...serializeDates(updatedRows[0], DATE_FIELDS),
    payments: payments.map((p) => serializeDates(p, ['date']))
  });
}
