import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import JobsApp from './jobs-app';

export default async function JobsPage() {
  const session = await getSession();
  const fullAccess = CAN.viewFinancials(session.role);

  const [jobs, clients, laborRows] = await Promise.all([
    sql`select * from jobs order by created_date desc, job_number desc`,
    sql`select id, name from clients order by name asc`,
    fullAccess
      ? sql`
          select pa.job_id, sum(pa.reg_hours * pe.hourly_rate + pa.ot_hours * pe.hourly_rate * 1.5) as cost
          from payroll_allocations pa
          join payroll_entries pe on pe.id = pa.payroll_entry_id
          where pa.job_id is not null
          group by pa.job_id
        `
      : Promise.resolve([])
  ]);
  const laborByJob = Object.fromEntries(laborRows.map((r) => [r.job_id, Number(r.cost) || 0]));

  return (
    <JobsApp
      initialJobs={jobs}
      clients={clients}
      laborByJob={laborByJob}
      fullAccess={fullAccess}
      canManageJobs={CAN.manageJobs(session.role)}
    />
  );
}
