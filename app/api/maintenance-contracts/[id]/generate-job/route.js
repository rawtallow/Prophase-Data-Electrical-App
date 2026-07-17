import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { advanceDate } from '../../../../../lib/maintenance-frequency';
import { toDateInputValue, serializeDates } from '../../../../../lib/format';

export const runtime = 'nodejs';

// Turns a due maintenance contract into an actual Job on the Job Log, then
// advances the contract's next_due_date by one frequency cycle so it's
// ready to generate the following visit.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageContracts(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const contracts = await sql`select * from maintenance_contracts where id = ${params.id}`;
  const contract = contracts[0];
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (contract.status !== 'Active') {
    return NextResponse.json({ error: 'Only an active contract can generate a job' }, { status: 400 });
  }

  const numRows = await sql`update counters set value = value + 1 where key = 'job' returning value`;
  const jobNumber = 'J-' + String(numRows[0].value).padStart(4, '0');

  // next_due_date comes back from the driver as a native Date object —
  // toDateInputValue() reads it with local getters to recover the correct
  // calendar day (see lib/format.js; String(date) would produce a
  // non-ISO string and silently corrupt this).
  const dueDate = toDateInputValue(contract.next_due_date);
  const jobDescription = contract.title + (contract.description ? ' — ' + contract.description : '');

  const jobRows = await sql`
    insert into jobs (job_number, client_id, client_name, job_description, scheduled_date, status, priority, job_type, amount_invoiced, amount_paid, notes)
    values (${jobNumber}, ${contract.client_id}, ${contract.client_name}, ${jobDescription},
      ${dueDate}, 'Scheduled', 'Medium', 'Scheduled / Preventative Maintenance', ${contract.amount}, 0,
      ${'Generated from maintenance contract: ' + contract.title})
    returning *
  `;

  const newDue = advanceDate(dueDate, contract.frequency);
  const updatedRows = await sql`
    update maintenance_contracts set next_due_date = ${newDue} where id = ${params.id} returning *
  `;

  return NextResponse.json({
    job: serializeDates(jobRows[0], ['scheduled_date', 'created_date']),
    contract: serializeDates(updatedRows[0], ['start_date', 'next_due_date'])
  });
}
