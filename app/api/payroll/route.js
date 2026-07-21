import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import { gateOrExecute } from '../../../lib/approvals';

export const runtime = 'nodejs';

async function nextPayNumber() {
  const rows = await sql`update counters set value = value + 1 where key = 'pay' returning value`;
  return 'PR-' + String(rows[0].value).padStart(4, '0');
}

export async function GET() {
  const session = await getSession();
  if (!session || !CAN.viewPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const entries = await sql`select * from payroll_entries order by date_paid desc nulls last`;
  const allocs = await sql`select * from payroll_allocations`;
  const withAllocs = entries.map((e) => ({
    ...e,
    allocations: allocs.filter((a) => a.payroll_entry_id === e.id)
  }));
  return NextResponse.json(withAllocs);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.editPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const { employeeId, hourlyRate, datePaid, periodStart, periodEnd, allocations, netPay, notes } = await req.json();
  if (!employeeId) return NextResponse.json({ error: 'Select an employee' }, { status: 400 });
  if (periodStart && periodEnd && periodStart > periodEnd) {
    return NextResponse.json({ error: 'Pay period start must be on or before the end date' }, { status: 400 });
  }

  const emps = await sql`select * from employees where id = ${employeeId}`;
  const emp = emps[0];
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  const { pending, request, result } = await gateOrExecute({
    session,
    actionType: 'create_payroll_entry',
    targetId: null,
    targetLabel: `Pay run for ${emp.name}`,
    payload: { employeeId, hourlyRate, datePaid, periodStart, periodEnd, allocations, netPay, notes },
    execute: async () => {
      const rate = Number(hourlyRate) || 0;
      const cleanAllocs = (allocations || []).filter((a) => (Number(a.regHours) || 0) > 0 || (Number(a.otHours) || 0) > 0);
      const gross = cleanAllocs.reduce((s, a) => s + (Number(a.regHours) || 0) * rate + (Number(a.otHours) || 0) * rate * 1.5, 0);

      const payNumber = await nextPayNumber();
      const rows = await sql`
        insert into payroll_entries (pay_number, employee_id, employee_name, hourly_rate, date_paid, period_start, period_end, gross_pay, net_pay, notes)
        values (${payNumber}, ${emp.id}, ${emp.name}, ${rate}, ${datePaid || null}, ${periodStart || null}, ${periodEnd || null}, ${gross}, ${Number(netPay) || 0}, ${notes || ''})
        returning *
      `;
      const entry = rows[0];
      for (const a of cleanAllocs) {
        await sql`
          insert into payroll_allocations (payroll_entry_id, job_id, reg_hours, ot_hours)
          values (${entry.id}, ${a.jobId || null}, ${Number(a.regHours) || 0}, ${Number(a.otHours) || 0})
        `;
      }
      return entry;
    }
  });
  return NextResponse.json(pending ? { pending: true, request } : result);
}
