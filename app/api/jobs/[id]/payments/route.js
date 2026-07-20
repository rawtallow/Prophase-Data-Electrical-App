import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { sydneyToday, serializeDates } from '../../../../../lib/format';

export const runtime = 'nodejs';

// See lib/format.js's serializeDates — raw Date columns shift by a day once
// they cross NextResponse.json() on a server running outside UTC.
const JOB_DATE_FIELDS = ['scheduled_date', 'created_date', 'completed_date'];

// Logs a payment against a job: inserts one job_payments row and bumps the
// cached jobs.amount_paid total by the same amount, atomically (same
// build-queries-then-one-transaction pattern as app/api/purchase-orders/
// [id]/receive, just without a per-line clamping loop since there's only
// one running total here).
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewFinancials(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const jobs = await sql`select * from jobs where id = ${params.id}`;
  const job = jobs[0];
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { amount, date, method, note } = await req.json();
  const cleanAmount = Number(amount) || 0;
  if (cleanAmount <= 0) return NextResponse.json({ error: 'Enter an amount greater than 0' }, { status: 400 });

  const paymentDate = date || sydneyToday();
  await sql.transaction([
    sql`insert into job_payments (job_id, date, amount, method, note, created_by) values (${params.id}, ${paymentDate}, ${cleanAmount}, ${method || ''}, ${note || ''}, ${session.name})`,
    sql`update jobs set amount_paid = amount_paid + ${cleanAmount} where id = ${params.id}`
  ]);

  const [updatedJob, lineItems, payments] = await Promise.all([
    sql`select * from jobs where id = ${params.id}`,
    sql`select * from job_line_items where job_id = ${params.id} order by sort_order asc`,
    sql`select * from job_payments where job_id = ${params.id} order by date desc, created_at desc`
  ]);
  return NextResponse.json({
    ...serializeDates(updatedJob[0], JOB_DATE_FIELDS),
    lineItems,
    payments: payments.map((p) => serializeDates(p, ['date']))
  });
}
