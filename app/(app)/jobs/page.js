import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import JobsApp from './jobs-app';

export default async function JobsPage() {
  const session = await getSession();
  const fullAccess = CAN.viewFinancials(session.role);

  // High-priority jobs first, then Medium, then Low, so urgent work stays
  // visible at the top of the log instead of buried by date.
  const [jobs, clients, assets, laborRows, materialRows] = await Promise.all([
    sql(`select * from jobs order by case priority when 'High' then 0 when 'Medium' then 1 when 'Low' then 2 else 1 end, created_date desc, job_number desc`),
    sql`select id, name from clients order by name asc`,
    sql`select id, client_id, name from assets order by name asc`,
    fullAccess
      ? sql`
          select pa.job_id, sum(pa.reg_hours * pe.hourly_rate + pa.ot_hours * pe.hourly_rate * 1.5) as cost
          from payroll_allocations pa
          join payroll_entries pe on pe.id = pa.payroll_entry_id
          where pa.job_id is not null
          group by pa.job_id
        `
      : Promise.resolve([]),
    fullAccess
      ? sql`
          select job_id, sum(total) as cost
          from purchase_orders
          where job_id is not null and status != 'Cancelled'
          group by job_id
        `
      : Promise.resolve([])
  ]);
  const laborByJob = Object.fromEntries(laborRows.map((r) => [r.job_id, Number(r.cost) || 0]));
  const materialsByJob = Object.fromEntries(materialRows.map((r) => [r.job_id, Number(r.cost) || 0]));

  return (
    <JobsApp
      initialJobs={jobs}
      clients={clients}
      assets={assets}
      laborByJob={laborByJob}
      materialsByJob={materialsByJob}
      fullAccess={fullAccess}
      canManageJobs={CAN.manageJobs(session.role)}
    />
  );
}
