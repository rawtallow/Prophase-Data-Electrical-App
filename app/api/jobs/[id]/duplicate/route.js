import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { sydneyToday } from '../../../../../lib/format';

export const runtime = 'nodejs';

export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageJobs(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const jobs = await sql`select * from jobs where id = ${params.id}`;
  const j = jobs[0];
  if (!j) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [lineItems, assignees] = await Promise.all([
    sql`select * from job_line_items where job_id = ${params.id} order by sort_order asc`,
    sql`select employee_id, employee_name from job_assignees where job_id = ${params.id}`
  ]);

  const numRows = await sql`update counters set value = value + 1 where key = 'job' returning value`;
  const jobNumber = 'J-' + String(numRows[0].value).padStart(4, '0');

  // Fresh copy sheds anything that only makes sense for a specific past
  // job — status resets to Quoted, amount_paid and completion both zero
  // out, and documents/history/payments don't carry over. amount_invoiced
  // does need recomputing (not zeroing) when line items were copied,
  // though — otherwise the cached total on jobs would silently disagree
  // with its own job_line_items, the same invariant the POST/PUT handlers
  // keep (see cleanLineItems/lineItemsTotal in app/api/jobs/route.js).
  const subtotal = lineItems.reduce((s, li) => s + Number(li.qty) * Number(li.price), 0);
  const amountInvoiced = lineItems.length > 0 ? subtotal + subtotal * 0.1 : 0;
  const primary = assignees[0] || { employee_id: null, employee_name: '' };
  const newRows = await sql`
    insert into jobs (job_number, quote_id, client_id, asset_id, client_name, job_title, job_description, site_address,
      status, priority, job_type, amount_invoiced, notes, customer_notes, created_date, updated_at, assigned_to_id, assigned_to_name)
    values (${jobNumber}, ${j.quote_id}, ${j.client_id}, ${j.asset_id}, ${j.client_name}, ${j.job_title}, ${j.job_description}, ${j.site_address},
      'Quoted', ${j.priority}, ${j.job_type}, ${amountInvoiced}, ${j.notes}, ${j.customer_notes}, ${sydneyToday()}, now(), ${primary.employee_id}, ${primary.employee_name})
    returning *
  `;
  const newJob = newRows[0];
  for (const li of lineItems) {
    await sql`
      insert into job_line_items (job_id, description, qty, price, sort_order)
      values (${newJob.id}, ${li.description}, ${li.qty}, ${li.price}, ${li.sort_order})
    `;
  }
  for (const a of assignees) {
    await sql`insert into job_assignees (job_id, employee_id, employee_name) values (${newJob.id}, ${a.employee_id}, ${a.employee_name})`;
  }
  await sql`insert into job_activity (job_id, type, message, created_by) values (${newJob.id}, 'note', ${'Duplicated from ' + j.job_number}, ${session.name})`;
  return NextResponse.json(newJob);
}
