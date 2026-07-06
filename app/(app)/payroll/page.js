import { sql } from '../../../lib/db';
import PayrollApp from './payroll-app';

export default async function PayrollPage() {
  // All five tables are independent of each other — allocations are joined
  // to entries in JS below, not in SQL — so there's no reason to wait on
  // each query in turn.
  const [employees, entries, allocs, draws, jobs] = await Promise.all([
    sql`select * from employees order by name asc`,
    sql`select * from payroll_entries order by date_paid desc nulls last`,
    sql`select * from payroll_allocations`,
    sql`select * from owner_draws order by date desc`,
    sql`select id, job_number, client_name, job_description from jobs order by job_number desc`
  ]);

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
