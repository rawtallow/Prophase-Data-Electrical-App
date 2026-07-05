import { sql } from '../../../lib/db';
import PayrollApp from './payroll-app';

export default async function PayrollPage() {
  const employees = await sql`select * from employees order by name asc`;
  const entries = await sql`select * from payroll_entries order by date_paid desc nulls last`;
  const allocs = await sql`select * from payroll_allocations`;
  const draws = await sql`select * from owner_draws order by date desc`;
  const jobs = await sql`select id, job_number, client_name, job_description from jobs order by job_number desc`;

  const entriesWithAllocs = entries.map((e) => ({
    ...e,
    allocations: allocs.filter((a) => a.payroll_entry_id === e.id)
  }));

  return (
    <PayrollApp
      initialEmployees={employees}
      initialEntries={entriesWithAllocs}
      initialDraws={draws}
      jobs={jobs}
    />
  );
}
