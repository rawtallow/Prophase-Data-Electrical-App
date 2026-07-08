import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import ComplianceApp from './compliance-app';

export default async function CompliancePage() {
  const session = await getSession();

  const [records, jobs, clients, employees, businessSettingsRows] = await Promise.all([
    sql`
      select cr.*, j.job_number, c.name as client_name, e.name as employee_name
      from compliance_records cr
      left join jobs j on j.id = cr.job_id
      left join clients c on c.id = cr.client_id
      left join employees e on e.id = cr.employee_id
      order by cr.record_date desc, cr.created_at desc
    `,
    sql`select id, job_number, client_id, client_name from jobs order by created_date desc`,
    sql`select id, name from clients order by name asc`,
    // Safe columns only — this page is visible to every role, and hourly_rate
    // is financial info that shouldn't leak to non-manager/admin sessions.
    sql`select id, name, status, license_number, license_expiry from employees where status = 'Active' order by name asc`,
    sql`select * from business_settings where id = 1`
  ]);

  return (
    <ComplianceApp
      initialRecords={records}
      jobs={jobs}
      clients={clients}
      employees={employees}
      initialBusinessSettings={businessSettingsRows[0]}
      canManage={CAN.manageCompliance(session.role)}
    />
  );
}
