import { notFound } from 'next/navigation';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import JobDetailApp from './job-detail-app';

export default async function JobDetailPage({ params }) {
  const session = await getSession();
  const jobs = await sql`select * from jobs where id = ${params.id}`;
  const job = jobs[0];
  if (!job) notFound();

  const fullAccess = CAN.viewFinancials(session.role);

  const [
    lineItems, payments, assignees, documents, activity, hourLogs, sends,
    clients, employees, assets, quoteRows, laborRows, materialRows
  ] = await Promise.all([
    sql`select * from job_line_items where job_id = ${params.id} order by sort_order asc`,
    sql`select * from job_payments where job_id = ${params.id} order by date desc, created_at desc`,
    sql`select employee_id, employee_name from job_assignees where job_id = ${params.id} order by employee_name asc`,
    sql`select * from job_documents where job_id = ${params.id} order by created_at desc`,
    sql`select * from job_activity where job_id = ${params.id} order by created_at desc`,
    sql`select * from job_hour_logs where job_id = ${params.id} order by date desc, created_at desc`,
    // Falls back to [] rather than letting a missing/not-yet-migrated
    // document_sends table 500 out the whole page.
    sql`select * from document_sends where document_type = 'invoice' and document_id = ${params.id} order by created_at desc`.catch(() => []),
    sql`select id, name, phone, email, address from clients order by name asc`,
    sql`select id, name from employees where status = 'Active' order by name asc`,
    sql`select id, client_id, name from assets order by name asc`,
    job.quote_id ? sql`select id, quote_number, status from quotes where id = ${job.quote_id}` : Promise.resolve([]),
    fullAccess
      ? sql`
          select sum(pa.reg_hours * pe.hourly_rate + pa.ot_hours * pe.hourly_rate * 1.5) as cost,
                 sum(pa.reg_hours) as reg_hours, sum(pa.ot_hours) as ot_hours
          from payroll_allocations pa
          join payroll_entries pe on pe.id = pa.payroll_entry_id
          where pa.job_id = ${params.id}
        `
      : Promise.resolve([]),
    fullAccess
      ? sql`select sum(total) as cost from purchase_orders where job_id = ${params.id} and status != 'Cancelled'`
      : Promise.resolve([])
  ]);

  const laborCost = Number(laborRows[0]?.cost) || 0;
  const actualHours = (Number(laborRows[0]?.reg_hours) || 0) + (Number(laborRows[0]?.ot_hours) || 0);
  const materialsCost = Number(materialRows[0]?.cost) || 0;

  return (
    <JobDetailApp
      initialJob={job}
      initialLineItems={lineItems}
      initialPayments={payments}
      initialAssignees={assignees}
      initialDocuments={documents}
      initialActivity={activity}
      initialHourLogs={hourLogs}
      initialSends={sends}
      clients={clients}
      employees={employees}
      assets={assets}
      linkedQuote={quoteRows[0] || null}
      laborCost={laborCost}
      actualHours={actualHours}
      materialsCost={materialsCost}
      fullAccess={fullAccess}
      canManageJobs={CAN.manageJobs(session.role)}
    />
  );
}
