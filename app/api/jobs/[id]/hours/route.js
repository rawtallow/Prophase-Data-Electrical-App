import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';

export const runtime = 'nodejs';

// Any signed-in role can log hours they worked on a job — that's the whole
// point of self-service time logging. An employee can only log against
// their own name; admin/manager can log on behalf of any employee (e.g.
// entering a forgotten entry), matching the same fullAccess-vs-self split
// used for job assignment. This is deliberately separate from
// payroll_allocations — see lib/schema.sql's comment on job_hour_logs.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobs = await sql`select id from jobs where id = ${params.id}`;
  if (!jobs[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { employeeId, date, hours, notes } = await req.json();
  const cleanHours = Number(hours) || 0;
  if (cleanHours <= 0) return NextResponse.json({ error: 'Enter hours greater than 0' }, { status: 400 });

  const fullAccess = CAN.viewFinancials(session.role);
  // employees has no reliable link back to the users/session table (its
  // user_id column exists but is unpopulated for the real accounts, and
  // employees.name doesn't match users.name exactly either — e.g. "Justin
  // Savino" the login vs "Justin Savino - Director / Senior Technician" the
  // employee record) — so a self-logged entry just carries the session's own
  // name rather than guessing at an employees.id. Admin/manager picking a
  // specific employee from the dropdown gets a real employees.id, same as
  // job assignment already does.
  let finalEmployeeId = null;
  let finalEmployeeName = session.name;

  if (fullAccess && employeeId) {
    const rows = await sql`select id, name from employees where id = ${employeeId}`;
    if (rows[0]) {
      finalEmployeeId = rows[0].id;
      finalEmployeeName = rows[0].name;
    }
  }

  const result = await sql`
    insert into job_hour_logs (job_id, employee_id, employee_name, date, hours, notes, created_by)
    values (${params.id}, ${finalEmployeeId}, ${finalEmployeeName}, ${date || null}, ${cleanHours}, ${notes || ''}, ${session.name})
    returning *
  `;
  return NextResponse.json(result[0]);
}
