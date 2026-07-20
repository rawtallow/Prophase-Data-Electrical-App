import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import { sydneyToday, serializeDates } from '../../../lib/format';

export const runtime = 'nodejs';

// The neon driver parses `date` columns using local-time components; once a
// raw Date crosses NextResponse.json() (JSON.stringify -> UTC toJSON), it can
// land on the wrong calendar day for servers running outside UTC. See
// lib/format.js's serializeDates for the full explanation.
const JOB_DATE_FIELDS = ['scheduled_date', 'created_date', 'completed_date', 'start_date'];

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
// Resolves a list of employee ids to {id, name} rows, deduped and dropping
// anything that doesn't exist. The first entry (if any) is also cached onto
// jobs.assigned_to_id/assigned_to_name for the couple of older call sites
// that just want a single display string — job_assignees is the real
// source of truth for the full list.
async function resolveAssignees(assigneeIds) {
  const ids = [...new Set((assigneeIds || []).filter(Boolean))];
  if (ids.length === 0) return [];
  const rows = await sql`select id, name from employees where id = any(${ids})`;
  return rows;
}
async function insertAssignees(jobId, assignees) {
  for (const a of assignees) {
    await sql`insert into job_assignees (job_id, employee_id, employee_name) values (${jobId}, ${a.id}, ${a.name})`;
  }
}

// Sorts High-priority jobs to the top of the list, then Medium, then Low,
// so urgent work stays visible without hiding the rest of the log.
const PRIORITY_ORDER = `case priority when 'High' then 0 when 'Medium' then 1 when 'Low' then 2 else 1 end`;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await sql(`
    select j.*, coalesce(string_agg(distinct ja.employee_name, ', ' order by ja.employee_name), '') as assigned_names
    from jobs j
    left join job_assignees ja on ja.job_id = j.id
    group by j.id
    order by ${PRIORITY_ORDER}, j.created_date desc, j.job_number desc
  `);
  return NextResponse.json(rows.map((r) => serializeDates(r, JOB_DATE_FIELDS)));
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.manageJobs(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const {
    clientId, assetId, clientName, jobTitle, jobDescription, siteAddress, scheduledDate, startDate,
    estimatedHours, status, priority, jobType, amountInvoiced, amountPaid, notes, customerNotes,
    quoteId, assigneeIds, lineItems
  } = await req.json();
  if (!clientName || !clientName.trim()) {
    return NextResponse.json({ error: 'Client is required' }, { status: 400 });
  }
  const jobNumber = await nextJobNumber();
  const initialStatus = status || 'Quoted';
  const assignees = await resolveAssignees(assigneeIds);
  const primary = assignees[0] || { id: null, name: '' };
  const cleanItems = cleanLineItems(lineItems);
  const finalAmountInvoiced = cleanItems.length > 0 ? lineItemsTotal(cleanItems) : Number(amountInvoiced) || 0;
  const rows = await sql`
    insert into jobs (
      job_number, quote_id, client_id, asset_id, client_name, job_title, job_description, site_address,
      scheduled_date, start_date, estimated_hours, status, priority, job_type, amount_invoiced, amount_paid,
      notes, customer_notes, created_date, updated_at, completed_date, assigned_to_id, assigned_to_name
    )
    values (
      ${jobNumber}, ${quoteId || null}, ${clientId || null}, ${assetId || null}, ${clientName.trim()}, ${jobTitle || ''}, ${jobDescription || ''}, ${siteAddress || ''},
      ${scheduledDate || null}, ${startDate || null}, ${estimatedHours || null}, ${initialStatus}, ${priority || 'Medium'}, ${jobType || 'Quoted Job'}, ${finalAmountInvoiced}, ${Number(amountPaid) || 0},
      ${notes || ''}, ${customerNotes || ''}, ${sydneyToday()}, now(), ${initialStatus === 'Complete' ? sydneyToday() : null}, ${primary.id}, ${primary.name}
    )
    returning *
  `;
  const job = rows[0];
  if (cleanItems.length > 0) await insertLineItems(job.id, cleanItems);
  if (assignees.length > 0) await insertAssignees(job.id, assignees);
  await sql`insert into job_activity (job_id, type, message, created_by) values (${job.id}, 'note', 'Job created', ${session.name})`;
  return NextResponse.json(serializeDates(job, JOB_DATE_FIELDS));
}
