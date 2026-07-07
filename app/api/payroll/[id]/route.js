import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const { employeeId, hourlyRate, datePaid, periodStart, periodEnd, allocations, netPay, notes } = await req.json();
  if (periodStart && periodEnd && periodStart > periodEnd) {
    return NextResponse.json({ error: 'Pay period start must be on or before the end date' }, { status: 400 });
  }
  const emps = await sql`select * from employees where id = ${employeeId}`;
  const emp = emps[0];
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  const rate = Number(hourlyRate) || 0;
  const cleanAllocs = (allocations || []).filter((a) => (Number(a.regHours) || 0) > 0 || (Number(a.otHours) || 0) > 0);
  const gross = cleanAllocs.reduce((s, a) => s + (Number(a.regHours) || 0) * rate + (Number(a.otHours) || 0) * rate * 1.5, 0);

  const rows = await sql`
    update payroll_entries set
      employee_id = ${emp.id}, employee_name = ${emp.name}, hourly_rate = ${rate},
      date_paid = ${datePaid || null}, period_start = ${periodStart || null}, period_end = ${periodEnd || null},
      gross_pay = ${gross}, net_pay = ${Number(netPay) || 0}, notes = ${notes || ''}
    where id = ${params.id}
    returning *
  `;
  await sql`delete from payroll_allocations where payroll_entry_id = ${params.id}`;
  for (const a of cleanAllocs) {
    await sql`
      insert into payroll_allocations (payroll_entry_id, job_id, reg_hours, ot_hours)
      values (${params.id}, ${a.jobId || null}, ${Number(a.regHours) || 0}, ${Number(a.otHours) || 0})
    `;
  }
  return NextResponse.json(rows[0]);
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  await sql`delete from payroll_entries where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
