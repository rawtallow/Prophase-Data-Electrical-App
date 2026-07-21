import { NextResponse } from 'next/server';
import { sql } from '../../../../../../lib/db';
import { getSession, CAN } from '../../../../../../lib/auth';
import { serializeDates } from '../../../../../../lib/format';
import { gateOrExecute } from '../../../../../../lib/approvals';

export const runtime = 'nodejs';

const DATE_FIELDS = ['invoice_date'];

function statusFor(total, paid) {
  if (paid <= 0) return 'Unpaid';
  if (paid >= total) return 'Paid';
  return 'Partially Paid';
}

// Voids a mistaken payment entry: deletes the row and decrements amount_paid
// by the same amount, clamped at 0 with greatest() (same guard used in
// app/api/parts/[id]/route.js's stock-adjustment PATCH) so a stray double-
// void can't push the total negative, then recomputes status.
export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewFinancials(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const invoices = await sql`select * from purchase_order_invoices where id = ${params.id}`;
  const invoice = invoices[0];
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const payments = await sql`select * from purchase_order_invoice_payments where id = ${params.paymentId} and purchase_order_invoice_id = ${params.id}`;
  const payment = payments[0];
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { pending, request, result } = await gateOrExecute({
    session,
    actionType: 'void_po_invoice_payment',
    targetId: payment.id,
    targetLabel: `$${Number(payment.amount).toFixed(2)} payment on invoice`,
    payload: {},
    execute: async () => {
      const newPaid = Math.max(0, Number(invoice.amount_paid) - Number(payment.amount));
      const newStatus = statusFor(Number(invoice.total), newPaid);

      await sql.transaction([
        sql`delete from purchase_order_invoice_payments where id = ${params.paymentId}`,
        sql`update purchase_order_invoices set amount_paid = ${newPaid}, status = ${newStatus} where id = ${params.id}`
      ]);

      const [updatedRows, remainingPayments] = await Promise.all([
        sql`
          select pi.*, po.po_number, po.supplier_name, po.job_number
          from purchase_order_invoices pi join purchase_orders po on po.id = pi.purchase_order_id
          where pi.id = ${params.id}
        `,
        sql`select * from purchase_order_invoice_payments where purchase_order_invoice_id = ${params.id} order by date desc, created_at desc`
      ]);
      return {
        ...serializeDates(updatedRows[0], DATE_FIELDS),
        payments: remainingPayments.map((p) => serializeDates(p, ['date']))
      };
    }
  });
  return NextResponse.json(pending ? { pending: true, request } : result);
}
