import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';

export const runtime = 'nodejs';

async function nextJobNumber() {
  const rows = await sql`update counters set value = value + 1 where key = 'job' returning value`;
  return 'J-' + String(rows[0].value).padStart(4, '0');
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await sql`select * from jobs order by created_date desc, job_number desc`;
  return NextResponse.json(rows);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.manageJobs(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const { clientId, clientName, jobDescription, scheduledDate, status, amountInvoiced, amountPaid, notes, quoteId } = await req.json();
  if (!clientName || !clientName.trim()) {
    return NextResponse.json({ error: 'Client is required' }, { status: 400 });
  }
  const jobNumber = await nextJobNumber();
  const rows = await sql`
    insert into jobs (job_number, quote_id, client_id, client_name, job_description, scheduled_date, status, amount_invoiced, amount_paid, notes)
    values (${jobNumber}, ${quoteId || null}, ${clientId || null}, ${clientName.trim()}, ${jobDescription || ''}, ${scheduledDate || null},
      ${status || 'Quoted'}, ${Number(amountInvoiced) || 0}, ${Number(amountPaid) || 0}, ${notes || ''})
    returning *
  `;
  return NextResponse.json(rows[0]);
}
