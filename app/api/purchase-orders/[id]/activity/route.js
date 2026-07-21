import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';

export const runtime = 'nodejs';

// Any role that can view/draft POs can post a note — status/priority/
// approval-change rows are logged automatically elsewhere (see [id]/route.js,
// review/route.js, receive/route.js), not through this route.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewPurchaseOrders(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const pos = await sql`select id from purchase_orders where id = ${params.id}`;
  if (!pos[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { message } = await req.json();
  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'A message is required' }, { status: 400 });
  }

  const rows = await sql`
    insert into po_activity (purchase_order_id, type, message, created_by)
    values (${params.id}, 'note', ${message.trim()}, ${session.name})
    returning *
  `;
  return NextResponse.json(rows[0]);
}
