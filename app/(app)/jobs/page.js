import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import JobsApp from './jobs-app';

export default async function JobsPage() {
  const session = await getSession();

  // High-priority jobs first, then Medium, then Low, so urgent work stays
  // visible at the top of the log instead of buried by date. The Job Log is
  // now just a scannable index — full detail (financials, materials,
  // documents, etc.) lives on each job's own page, so this only fetches
  // what the summary row/filters need.
  const [jobs, clients, employees] = await Promise.all([
    sql`
      select j.*, coalesce(string_agg(distinct ja.employee_name, ', ' order by ja.employee_name), '') as assigned_names
      from jobs j
      left join job_assignees ja on ja.job_id = j.id
      group by j.id
      order by case j.priority when 'High' then 0 when 'Medium' then 1 when 'Low' then 2 when 'Urgent' then -1 else 1 end, j.created_date desc, j.job_number desc
    `,
    sql`select id, name from clients order by name asc`,
    // Fetched server-side (not a client-side /api/employees call) since
    // that endpoint is middleware-blocked for employee-role sessions, but
    // everyone needs this list to see/filter the Assigned column.
    sql`select id, name from employees where status = 'Active' order by name asc`
  ]);

  return (
    <JobsApp
      initialJobs={jobs}
      clients={clients}
      employees={employees}
      canManageJobs={CAN.manageJobs(session.role)}
    />
  );
}
