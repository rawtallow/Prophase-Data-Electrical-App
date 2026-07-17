import { NextResponse } from 'next/server';
import { sql, isForeignKeyViolation } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageParts(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const { name, sku, category, supplier, unitCost, qtyOnHand, reorderThreshold, notes } = await req.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  const rows = await sql`
    update parts set name = ${name}, sku = ${sku || ''}, category = ${category || ''}, supplier = ${supplier || ''},
      unit_cost = ${Number(unitCost) || 0}, qty_on_hand = ${Number(qtyOnHand) || 0}, reorder_threshold = ${Number(reorderThreshold) || 0},
      notes = ${notes || ''}
    where id = ${params.id}
    returning *
  `;
  return NextResponse.json(rows[0]);
}

// Quick +1/-1 style stock adjustments — available to every role (Justin's spec:
// employees can "use" parts, i.e. deduct stock, without full inventory edit rights).
export async function PATCH(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { delta } = await req.json();
  const rows = await sql`
    update parts set qty_on_hand = greatest(0, qty_on_hand + ${Number(delta) || 0})
    where id = ${params.id}
    returning *
  `;
  return NextResponse.json(rows[0]);
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageParts(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  try {
    await sql`delete from parts where id = ${params.id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'This part is referenced by a purchase order and can\'t be deleted.' }, { status: 409 });
    }
    console.error('Delete part error:', err);
    return NextResponse.json({ error: 'Could not delete part' }, { status: 500 });
  }
}
