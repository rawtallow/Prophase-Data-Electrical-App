import { NextResponse } from 'next/server';
import { sql } from '../../../../../../lib/db';
import { getSession, CAN } from '../../../../../../lib/auth';

export const runtime = 'nodejs';

// Removing a logged entry is admin/manager only — same oversight level as
// voiding a payment, since hour logs can factor into how a manager decides
// to allocate paid hours during payroll.
export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewFinancials(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  // A Paid entry has already been pulled into a saved pay run and carries
  // that run's payroll_entry_id — deleting it would leave the run's hours
  // unaccounted for. The UI hides the button for these, but the rule is
  // enforced here too in case the endpoint is hit directly.
  const rows = await sql`select status from job_hour_logs where id = ${params.logId} and job_id = ${params.id}`;
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (rows[0].status === 'Paid') {
    return NextResponse.json(
      { error: 'These hours have already been paid through a pay run and can\'t be deleted.' },
      { status: 409 }
    );
  }

  await sql`delete from job_hour_logs where id = ${params.logId} and job_id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
