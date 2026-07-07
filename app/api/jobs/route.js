import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';

export const runtime = 'nodejs';

async function nextJobNumber() {
  const rows = await sql`update counters set value = value + 1 where key = 'job' returning value`;
  return 'J-' + String(rows[0].value).padStart(4, '0');
}

// Sorts High-priority jobs to the top of the list, then Medium, then Low,
// so urgent work stays visible without hiding the rest of the log.
const PRIORITY_ORDER = `case priority when 'High' then 0 when 'Medium' then 1 when 'Low' then 2 else 1 end`;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await sql(`select * from jobs order by ${PRIORITY_ORDER}, created_date desc, job_number desc`);
  return NextResponse.json(rows);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.manageJobs(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const { clientId, clientName, jobDescription, scheduledDate, status, priority, jobType, amountInvoiced, amountPaid, notes, quoteId } = await req.json();
  if (!clientName || !clientName.trim()) {
    return NextResponse.json({ error: 'Client is required' }, { status: 400 });
  }
  const jobNumber = await nextJobNumber();
  const rows = await sql`
    insert into jobs (job_number, quote_id, client_id, client_name, job_description, scheduled_date, status, priority, job_type, amount_invoiced, amount_paid, notes)
    values (${jobNumber}, ${quoteId || null}, ${clientId || null}, ${clientName.trim()}, ${jobDescription || ''}, ${scheduledDate || null},
      ${status || 'Quoted'}, ${priority || 'Medium'}, ${jobType || 'Quoted Job'}, ${Number(amountInvoiced) || 0}, ${Number(amountPaid) || 0}, ${notes || ''})
    returning *
  `;
  return NextResponse.json(rows[0]);
}
