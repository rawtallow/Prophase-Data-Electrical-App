import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageJobs(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const quotes = await sql`select * from quotes where id = ${params.id}`;
  const q = quotes[0];
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const numRows = await sql`update counters set value = value + 1 where key = 'job' returning value`;
  const jobNumber = 'J-' + String(numRows[0].value).padStart(4, '0');

  const rows = await sql`
    insert into jobs (job_number, quote_id, client_id, client_name, job_description, status, amount_invoiced, amount_paid)
    values (${jobNumber}, ${q.id}, ${q.client_id}, ${q.client_name}, ${q.job_description}, 'Quoted', ${q.total}, 0)
    returning *
  `;
  // Converting to a job means the customer accepted it — keep the quote's
  // status in sync so it doesn't sit as "Draft"/"Sent" while work proceeds.
  await sql`update quotes set status = 'Accepted' where id = ${q.id}`;
  return NextResponse.json(rows[0]);
}
