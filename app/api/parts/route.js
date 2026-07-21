import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await sql`select * from parts order by name asc`;
  return NextResponse.json(rows);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.manageParts(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const { name, sku, category, supplier, unitCost, qtyOnHand, reorderThreshold, notes, trackSerials } = await req.json();
  if (!name || !name.trim()) return NextResponse.json({ error: 'Part name is required' }, { status: 400 });
  const rows = await sql`
    insert into parts (name, sku, category, supplier, unit_cost, qty_on_hand, reorder_threshold, notes, track_serials)
    values (${name.trim()}, ${sku || ''}, ${category || ''}, ${supplier || ''}, ${Number(unitCost) || 0}, ${Number(qtyOnHand) || 0}, ${Number(reorderThreshold) || 0}, ${notes || ''}, ${!!trackSerials})
    returning *
  `;
  return NextResponse.json(rows[0]);
}
