import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

// Lets the original requester withdraw their own still-pending request —
// e.g. they changed their mind, or realized it was a mistake. A Director
// can also cancel any request without reviewing it (distinct from
// rejecting — cancelling leaves no reviewed_by/review_note trail, it's a
// withdrawal, not a decision).
export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || (!CAN.isDirector(session.role) && !CAN.isSubadmin(session.role))) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const rows = await sql`select * from approval_requests where id = ${params.id}`;
  const request = rows[0];
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (request.status !== 'Pending') return NextResponse.json({ error: 'This request has already been reviewed' }, { status: 400 });
  if (!CAN.isDirector(session.role) && request.requested_by_id !== session.id) {
    return NextResponse.json({ error: 'You can only cancel your own requests' }, { status: 403 });
  }

  await sql`update approval_requests set status = 'Cancelled' where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
