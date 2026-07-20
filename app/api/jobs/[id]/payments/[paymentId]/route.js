import { NextResponse } from 'next/server';
import { sql } from '../../../../../../lib/db';
import { getSession, CAN } from '../../../../../../lib/auth';
import { serializeDates } from '../../../../../../lib/format';

export const runtime = 'nodejs';

// See lib/format.js's serializeDates — raw Date columns shift by a day once
// they cross NextResponse.json() on a server running outside UTC.
const JOB_DATE_FIELDS = ['scheduled_date', 'created_date', 'completed_date'];

// Voids a mistaken payment entry: deletes the row and decrements the
// cached jobs.amount_paid total by the same amount, atomically. Clamped at
// 0 with greatest() — the same guard already used in app/api/parts/[id]
// route.js's stock-adjustment PATCH — so a stray double-void or an out-of-
// order delete can never push the total negative.
export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewFinancials(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const payments = await sql`select * from job_payments where id = ${params.paymentId} and job_id = ${params.id}`;
  const payment = payments[0];
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await sql.transaction([
    sql`delete from job_payments where id = ${params.paymentId}`,
    sql`update jobs set amount_paid = greatest(0, amount_paid - ${payment.amount}) where id = ${params.id}`
  ]);

  const [updatedJob, lineItems, remainingPayments] = await Promise.all([
    sql`select * from jobs where id = ${params.id}`,
    sql`select * from job_line_items where job_id = ${params.id} order by sort_order asc`,
    sql`select * from job_payments where job_id = ${params.id} order by date desc, created_at desc`
  ]);
  return NextResponse.json({
    ...serializeDates(updatedJob[0], JOB_DATE_FIELDS),
    lineItems,
    payments: remainingPayments.map((p) => serializeDates(p, ['date']))
  });
}
