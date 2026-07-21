import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';

export const runtime = 'nodejs';

// A Director sees every request (the review queue); a Subadmin sees only
// their own submissions (so they can track what's still waiting). Anyone
// else is blocked by middleware before this ever runs.
export async function GET() {
  const session = await getSession();
  if (!session || (!CAN.isDirector(session.role) && !CAN.isSubadmin(session.role))) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const rows = CAN.isDirector(session.role)
    ? await sql`select * from approval_requests order by (status = 'Pending') desc, created_at desc`
    : await sql`select * from approval_requests where requested_by_id = ${session.id} order by created_at desc`;
  return NextResponse.json(rows);
}
