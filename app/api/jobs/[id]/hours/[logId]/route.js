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
  await sql`delete from job_hour_logs where id = ${params.logId} and job_id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
