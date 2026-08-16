import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';

export const runtime = 'nodejs';

// Approving an hour log is also the moment its employee_id gets resolved.
// Self-logged entries very often arrive with employee_id null (see
// app/api/jobs/[id]/hours/route.js's comment — there's no reliable link
// from a session to an employees row), so rather than guess at payroll
// time, the reviewer explicitly confirms which employee it belongs to
// here. That guarantees every Approved row has a real employee_id by the
// time the New Pay Run modal goes looking for hours to pull in.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editPayroll(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const { decision, employeeId, note } = await req.json();
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json({ error: 'Decision must be "approved" or "rejected"' }, { status: 400 });
  }

  const rows = await sql`select * from job_hour_logs where id = ${params.id}`;
  const log = rows[0];
  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (log.status !== 'Pending') {
    return NextResponse.json({ error: `This entry has already been ${log.status.toLowerCase()}` }, { status: 400 });
  }

  if (decision === 'rejected') {
    const updated = await sql`
      update job_hour_logs set status = 'Rejected', reviewed_by = ${session.name}, reviewed_at = now(), review_note = ${note || ''}
      where id = ${params.id}
      returning *
    `;
    return NextResponse.json(updated[0]);
  }

  if (!employeeId) return NextResponse.json({ error: 'Select which employee these hours belong to' }, { status: 400 });
  const emps = await sql`select id, name from employees where id = ${employeeId}`;
  if (!emps[0]) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  const updated = await sql`
    update job_hour_logs set
      status = 'Approved', employee_id = ${emps[0].id}, employee_name = ${emps[0].name},
      reviewed_by = ${session.name}, reviewed_at = now(), review_note = ${note || ''}
    where id = ${params.id}
    returning *
  `;
  return NextResponse.json(updated[0]);
}
