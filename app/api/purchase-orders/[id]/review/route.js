import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { gateOrExecute } from '../../../../../lib/approvals';

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

  const existing = await sql`select po_number, supplier_name from purchase_orders where id = ${params.id}`;
  if (!existing[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { pending, request, result } = await gateOrExecute({
    session,
    actionType: 'review_purchase_order',
    targetId: params.id,
    targetLabel: `${existing[0].po_number} — ${existing[0].supplier_name}`,
    payload: { decision, note: note || '' },
    execute: async () => {
      const rows = await sql`
        update purchase_orders set
          approval_status = ${decision === 'approved' ? 'Approved' : 'Rejected'},
          approval_note = ${note || ''},
          reviewed_by = ${session.name},
          updated_at = now()
        where id = ${params.id}
        returning *
      `;
      await sql`
        insert into po_activity (purchase_order_id, type, message, created_by)
        values (${params.id}, 'approval', ${decision === 'approved' ? 'Approved' : `Rejected${note ? ': ' + note : ''}`}, ${session.name})
      `;
      return rows[0];
    }
  });
  return NextResponse.json(pending ? { pending: true, request } : result);
}
