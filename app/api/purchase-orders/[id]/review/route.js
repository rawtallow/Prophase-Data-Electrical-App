import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';

export const runtime = 'nodejs';

// Manager/admin sign-off on an employee-drafted PO. Approving unlocks
// sending it to the supplier; rejecting sends it back to the employee
// (still editable) with an optional note explaining what to fix. Direct
// mirror of app/api/quotes/[id]/review/route.js.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editPurchaseOrders(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const { decision, note } = await req.json();
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json({ error: 'Decision must be "approved" or "rejected"' }, { status: 400 });
  }

  const rows = await sql`
    update purchase_orders set
      approval_status = ${decision === 'approved' ? 'Approved' : 'Rejected'},
      approval_note = ${note || ''},
      reviewed_by = ${session.name}
    where id = ${params.id}
    returning *
  `;
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}
