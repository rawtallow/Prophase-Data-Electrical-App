import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';

export const runtime = 'nodejs';

// Logs materials arriving against a PO: bumps each line's qty_received (never
// past its ordered qty), bumps parts.qty_on_hand for lines linked to Spare
// Parts inventory, and recomputes the PO's overall status from every line's
// received total. Runs as one transaction (same atomic pattern as
// app/api/backup/import/route.js) so a receive action can't half-apply.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.receivePurchaseOrders(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const poRows = await sql`select * from purchase_orders where id = ${params.id}`;
  const po = poRows[0];
  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (po.approval_status !== 'Approved') {
    return NextResponse.json({ error: 'This purchase order has not been approved yet' }, { status: 400 });
  }
  if (po.status === 'Cancelled') {
    return NextResponse.json({ error: 'This purchase order was cancelled' }, { status: 400 });
  }

  const { lines } = await req.json();
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'No items to receive' }, { status: 400 });
  }

  const existingLines = await sql`select * from purchase_order_line_items where purchase_order_id = ${params.id}`;
  const lineMap = Object.fromEntries(existingLines.map((l) => [l.id, l]));

  const queries = [];
  const newQtyReceivedById = {};

  for (const { lineItemId, qtyNow } of lines) {
    const line = lineMap[lineItemId];
    const requested = Number(qtyNow) || 0;
    if (!line || requested <= 0) continue;
    const remaining = Number(line.qty) - Number(line.qty_received);
    const clamped = Math.min(requested, Math.max(remaining, 0));
    if (clamped <= 0) continue;

    const updatedQty = Number(line.qty_received) + clamped;
    newQtyReceivedById[lineItemId] = updatedQty;
    queries.push(sql`update purchase_order_line_items set qty_received = ${updatedQty} where id = ${lineItemId}`);
    if (line.part_id) {
      queries.push(sql`update parts set qty_on_hand = qty_on_hand + ${clamped} where id = ${line.part_id}`);
    }
  }

  if (queries.length === 0) {
    return NextResponse.json({ error: 'Nothing to receive — check the quantities entered' }, { status: 400 });
  }

  const effectiveQty = (l) => (newQtyReceivedById[l.id] !== undefined ? newQtyReceivedById[l.id] : Number(l.qty_received));
  const allFullyReceived = existingLines.every((l) => effectiveQty(l) >= Number(l.qty));
  const anyReceived = existingLines.some((l) => effectiveQty(l) > 0);
  const newStatus = allFullyReceived ? 'Received' : anyReceived ? 'Partially Received' : po.status;
  queries.push(sql`update purchase_orders set status = ${newStatus} where id = ${params.id}`);

  await sql.transaction(queries);

  const [updatedPo, updatedLines] = await Promise.all([
    sql`select * from purchase_orders where id = ${params.id}`,
    sql`select * from purchase_order_line_items where purchase_order_id = ${params.id} order by sort_order asc`
  ]);
  return NextResponse.json({ ...updatedPo[0], lineItems: updatedLines });
}
