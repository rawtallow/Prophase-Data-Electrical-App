import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { gateOrExecute } from '../../../../../lib/approvals';

export const runtime = 'nodejs';

// Manager/admin sign-off on an employee-drafted quote. Approving unlocks
// sending it to the customer; rejecting sends it back to the employee
// (still editable) with an optional note explaining what to fix.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editQuotes(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const { decision, note } = await req.json();
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json({ error: 'Decision must be "approved" or "rejected"' }, { status: 400 });
  }

  const existing = await sql`select quote_number, client_name from quotes where id = ${params.id}`;
  if (!existing[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { pending, request, result } = await gateOrExecute({
    session,
    actionType: 'review_quote',
    targetId: params.id,
    targetLabel: `${existing[0].quote_number} — ${existing[0].client_name}`,
    payload: { decision, note: note || '' },
    execute: async () => {
      const rows = await sql`
        update quotes set
          approval_status = ${decision === 'approved' ? 'Approved' : 'Rejected'},
          approval_note = ${note || ''},
          reviewed_by = ${session.name}
        where id = ${params.id}
        returning *
      `;
      return rows[0];
    }
  });
  return NextResponse.json(pending ? { pending: true, request } : result);
}
