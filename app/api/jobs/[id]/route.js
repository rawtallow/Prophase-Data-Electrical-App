import { NextResponse } from 'next/server';
import { sql, isForeignKeyViolation } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

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
    const { clientId, assetId, clientName, jobDescription, scheduledDate, status, priority, jobType, amountInvoiced, amountPaid, notes } = body;
    const rows = await sql`
      update jobs set
        client_id = ${clientId || null}, asset_id = ${assetId || null},
        client_name = ${clientName}, job_description = ${jobDescription || ''},
        scheduled_date = ${scheduledDate || null}, status = ${status},
        priority = ${priority || 'Medium'}, job_type = ${jobType || 'Quoted Job'},
        amount_invoiced = ${Number(amountInvoiced) || 0}, amount_paid = ${Number(amountPaid) || 0},
        notes = ${notes || ''},
        completed_date = case
          when ${status} = 'Complete' and completed_date is null then current_date
          when ${status} != 'Complete' then null
          else completed_date
        end
      where id = ${params.id}
      returning *
    `;
    return NextResponse.json(rows[0]);
  }

  // Employees: allowed to update status, scheduled date, priority, and notes.
  // Job type stays admin/manager-only, like customer name and description.
  const { scheduledDate, status, priority, notes } = body;
  const rows = await sql`
    update jobs set
      scheduled_date = ${scheduledDate || null}, status = ${status}, priority = ${priority || 'Medium'}, notes = ${notes || ''},
      completed_date = case
        when ${status} = 'Complete' and completed_date is null then current_date
        when ${status} != 'Complete' then null
        else completed_date
      end
    where id = ${params.id}
    returning *
  `;
  return NextResponse.json(rows[0]);
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
