import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { sydneyToday } from '../../../../../lib/format';

export const runtime = 'nodejs';

export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageJobs(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const quotes = await sql`select * from quotes where id = ${params.id}`;
  const q = quotes[0];
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (q.approval_status !== 'Approved') {
    return NextResponse.json({ error: 'Approve this quote before converting it to a job' }, { status: 400 });
  }
  if (q.status === 'Accepted') {
    return NextResponse.json({ error: 'This quote has already been converted to a job' }, { status: 400 });
  }
  if (q.status === 'Declined') {
    return NextResponse.json({ error: 'This quote was declined and can\'t be converted to a job' }, { status: 400 });
  }

  const numRows = await sql`update counters set value = value + 1 where key = 'job' returning value`;
  const jobNumber = 'J-' + String(numRows[0].value).padStart(4, '0');

  const rows = await sql`
    insert into jobs (job_number, quote_id, client_id, client_name, job_description, status, amount_invoiced, amount_paid, created_date)
    values (${jobNumber}, ${q.id}, ${q.client_id}, ${q.client_name}, ${q.job_description}, 'Quoted', ${q.total}, 0, ${sydneyToday()})
    returning *
  `;
  const job = rows[0];

  // Carry the quote's itemization forward so the job's eventual invoice can
  // be itemized too, instead of only having the single rolled-up total.
  // amount_invoiced above is deliberately left as the quote's own total
  // (post-discount) rather than recomputed from these lines — jobs don't
  // have a discount concept, so a discounted quote's line items won't sum
  // back to exactly amount_invoiced until/unless someone edits the job.
  const quoteLineItems = await sql`select * from quote_line_items where quote_id = ${q.id} order by sort_order asc`;
  for (let i = 0; i < quoteLineItems.length; i++) {
    const li = quoteLineItems[i];
    await sql`
      insert into job_line_items (job_id, description, qty, price, sort_order)
      values (${job.id}, ${li.description || ''}, ${Number(li.qty) || 0}, ${Number(li.price) || 0}, ${i})
    `;
  }

  // Converting to a job means the customer accepted it — keep the quote's
  // status in sync so it doesn't sit as "Draft"/"Sent" while work proceeds.
  await sql`update quotes set status = 'Accepted' where id = ${q.id}`;
  return NextResponse.json(job);
}
