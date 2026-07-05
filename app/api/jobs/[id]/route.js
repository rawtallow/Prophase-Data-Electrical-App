import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const fullAccess = CAN.viewFinancials(session.role);

  if (fullAccess) {
    const { clientName, jobDescription, scheduledDate, status, amountInvoiced, amountPaid, notes } = body;
    const rows = await sql`
      update jobs set
        client_name = ${clientName}, job_description = ${jobDescription || ''},
        scheduled_date = ${scheduledDate || null}, status = ${status},
        amount_invoiced = ${Number(amountInvoiced) || 0}, amount_paid = ${Number(amountPaid) || 0},
        notes = ${notes || ''}
      where id = ${params.id}
      returning *
    `;
    return NextResponse.json(rows[0]);
  }

  // Employees: allowed to update status, scheduled date, and notes only.
  const { scheduledDate, status, notes } = body;
  const rows = await sql`
    update jobs set
      scheduled_date = ${scheduledDate || null}, status = ${status}, notes = ${notes || ''}
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
  await sql`delete from jobs where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
