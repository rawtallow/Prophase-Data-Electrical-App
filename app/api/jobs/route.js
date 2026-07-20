import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import { sydneyToday, serializeDates } from '../../../lib/format';

export const runtime = 'nodejs';

// The neon driver parses `date` columns using local-time components; once a
// raw Date crosses NextResponse.json() (JSON.stringify -> UTC toJSON), it can
// land on the wrong calendar day for servers running outside UTC. See
// lib/format.js's serializeDates for the full explanation.
const JOB_DATE_FIELDS = ['scheduled_date', 'created_date', 'completed_date'];

async function nextJobNumber() {
  const rows = await sql`update counters set value = value + 1 where key = 'job' returning value`;
  return 'J-' + String(rows[0].value).padStart(4, '0');
}

// Job line items are optional (unlike quotes/POs, which require at least
// one) — most jobs are simple call-outs that shouldn't need itemization.
// When present, they become the computed source of truth for the invoiced
// total; GST is fixed at 10% (the app's default rate everywhere else)
// since jobs don't carry their own tax_rate column.
function cleanLineItems(lineItems) {
  return (lineItems || []).filter((li) => (li.description || '').trim() !== '' || (Number(li.qty) || 0) * (Number(li.price) || 0) !== 0);
}
function lineItemsTotal(cleanItems) {
  const subtotal = cleanItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.price) || 0), 0);
  return subtotal + subtotal * 0.1;
}
async function insertLineItems(jobId, cleanItems) {
  for (let i = 0; i < cleanItems.length; i++) {
    const li = cleanItems[i];
    await sql`
      insert into job_line_items (job_id, description, qty, price, sort_order)
      values (${jobId}, ${li.description || ''}, ${Number(li.qty) || 0}, ${Number(li.price) || 0}, ${i})
    `;
  }
}
async function resolveAssignee(assignedToId) {
  if (!assignedToId) return { id: null, name: '' };
  const rows = await sql`select id, name from employees where id = ${assignedToId}`;
  return rows[0] ? { id: rows[0].id, name: rows[0].name } : { id: null, name: '' };
}

// Sorts High-priority jobs to the top of the list, then Medium, then Low,
// so urgent work stays visible without hiding the rest of the log.
const PRIORITY_ORDER = `case priority when 'High' then 0 when 'Medium' then 1 when 'Low' then 2 else 1 end`;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await sql(`select * from jobs order by ${PRIORITY_ORDER}, created_date desc, job_number desc`);
  return NextResponse.json(rows.map((r) => serializeDates(r, JOB_DATE_FIELDS)));
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.manageJobs(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const { clientId, assetId, clientName, jobDescription, scheduledDate, status, priority, jobType, amountInvoiced, amountPaid, notes, quoteId, assignedToId, lineItems } = await req.json();
  if (!clientName || !clientName.trim()) {
    return NextResponse.json({ error: 'Client is required' }, { status: 400 });
  }
  const jobNumber = await nextJobNumber();
  const initialStatus = status || 'Quoted';
  const assignee = await resolveAssignee(assignedToId);
  const cleanItems = cleanLineItems(lineItems);
  const finalAmountInvoiced = cleanItems.length > 0 ? lineItemsTotal(cleanItems) : Number(amountInvoiced) || 0;
  const rows = await sql`
    insert into jobs (job_number, quote_id, client_id, asset_id, client_name, job_description, scheduled_date, status, priority, job_type, amount_invoiced, amount_paid, notes, created_date, completed_date, assigned_to_id, assigned_to_name)
    values (${jobNumber}, ${quoteId || null}, ${clientId || null}, ${assetId || null}, ${clientName.trim()}, ${jobDescription || ''}, ${scheduledDate || null},
      ${initialStatus}, ${priority || 'Medium'}, ${jobType || 'Quoted Job'}, ${finalAmountInvoiced}, ${Number(amountPaid) || 0}, ${notes || ''},
      ${sydneyToday()}, ${initialStatus === 'Complete' ? sydneyToday() : null}, ${assignee.id}, ${assignee.name})
    returning *
  `;
  const job = rows[0];
  if (cleanItems.length > 0) await insertLineItems(job.id, cleanItems);
  return NextResponse.json(serializeDates(job, JOB_DATE_FIELDS));
}
