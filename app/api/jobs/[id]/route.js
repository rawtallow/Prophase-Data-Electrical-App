import { NextResponse } from 'next/server';
import { sql, isForeignKeyViolation } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import { sydneyToday, serializeDates } from '../../../../lib/format';

export const runtime = 'nodejs';

// The neon driver parses `date` columns using local-time components; once a
// raw Date crosses NextResponse.json() (JSON.stringify -> UTC toJSON), it can
// land on the wrong calendar day for servers running outside UTC. See
// lib/format.js's serializeDates for the full explanation.
const JOB_DATE_FIELDS = ['scheduled_date', 'created_date', 'completed_date'];

// See app/api/jobs/route.js for the reasoning — job line items are optional,
// and when present drive the computed invoiced total at a fixed 10% GST.
function cleanLineItems(lineItems) {
  return (lineItems || []).filter((li) => (li.description || '').trim() !== '' || (Number(li.qty) || 0) * (Number(li.price) || 0) !== 0);
}
function lineItemsTotal(cleanItems) {
  const subtotal = cleanItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.price) || 0), 0);
  return subtotal + subtotal * 0.1;
}
async function resolveAssignee(assignedToId) {
  if (!assignedToId) return { id: null, name: '' };
  const rows = await sql`select id, name from employees where id = ${assignedToId}`;
  return rows[0] ? { id: rows[0].id, name: rows[0].name } : { id: null, name: '' };
}

export async function GET(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const jobs = await sql`select * from jobs where id = ${params.id}`;
  const job = jobs[0];
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [lineItems, payments] = await Promise.all([
    sql`select * from job_line_items where job_id = ${params.id} order by sort_order asc`,
    sql`select * from job_payments where job_id = ${params.id} order by date desc, created_at desc`
  ]);
  return NextResponse.json({
    ...serializeDates(job, JOB_DATE_FIELDS),
    lineItems,
    payments: payments.map((p) => serializeDates(p, ['date']))
  });
}

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const fullAccess = CAN.viewFinancials(session.role);

  // Stamps completed_date the first time status becomes 'Complete', and
  // clears it if the job is moved off Complete again — keeps the Workmanship
  // Warranty document's completion/expiry dates trustworthy rather than
  // reflecting whenever the job happened to be last edited.
  if (fullAccess) {
    const { clientId, assetId, clientName, jobDescription, scheduledDate, status, priority, jobType, amountInvoiced, notes, assignedToId, lineItems } = body;
    const assignee = await resolveAssignee(assignedToId);
    const cleanItems = cleanLineItems(lineItems);
    const finalAmountInvoiced = cleanItems.length > 0 ? lineItemsTotal(cleanItems) : Number(amountInvoiced) || 0;
    const rows = await sql`
      update jobs set
        client_id = ${clientId || null}, asset_id = ${assetId || null},
        client_name = ${clientName}, job_description = ${jobDescription || ''},
        scheduled_date = ${scheduledDate || null}, status = ${status},
        priority = ${priority || 'Medium'}, job_type = ${jobType || 'Quoted Job'},
        amount_invoiced = ${finalAmountInvoiced},
        notes = ${notes || ''},
        assigned_to_id = ${assignee.id}, assigned_to_name = ${assignee.name},
        completed_date = case
          when ${status} = 'Complete' and completed_date is null then ${sydneyToday()}
          when ${status} != 'Complete' then null
          else completed_date
        end
      where id = ${params.id}
      returning *
    `;
    await sql`delete from job_line_items where job_id = ${params.id}`;
    for (let i = 0; i < cleanItems.length; i++) {
      const li = cleanItems[i];
      await sql`
        insert into job_line_items (job_id, description, qty, price, sort_order)
        values (${params.id}, ${li.description || ''}, ${Number(li.qty) || 0}, ${Number(li.price) || 0}, ${i})
      `;
    }
    return NextResponse.json(serializeDates(rows[0], JOB_DATE_FIELDS));
  }

  // Employees: allowed to update status, scheduled date, priority, and notes.
  // Job type, assignment, and invoicing stay admin/manager-only, like
  // customer name and description.
  const { scheduledDate, status, priority, notes } = body;
  const rows = await sql`
    update jobs set
      scheduled_date = ${scheduledDate || null}, status = ${status}, priority = ${priority || 'Medium'}, notes = ${notes || ''},
      completed_date = case
        when ${status} = 'Complete' and completed_date is null then ${sydneyToday()}
        when ${status} != 'Complete' then null
        else completed_date
      end
    where id = ${params.id}
    returning *
  `;
  return NextResponse.json(serializeDates(rows[0], JOB_DATE_FIELDS));
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageJobs(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  try {
    await sql`delete from jobs where id = ${params.id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'This job has payroll, compliance, or purchase order records linked to it and can\'t be deleted.' }, { status: 409 });
    }
    console.error('Delete job error:', err);
    return NextResponse.json({ error: 'Could not delete job' }, { status: 500 });
  }
}
