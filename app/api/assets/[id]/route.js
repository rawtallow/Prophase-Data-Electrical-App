import { NextResponse } from 'next/server';
import { sql, isForeignKeyViolation } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import { gateOrExecute } from '../../../../lib/approvals';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageClients(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const { name, model, serial, installDate, warrantyExpiry, notes } = await req.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Name / type is required' }, { status: 400 });
  }
  const rows = await sql`
    update assets set name = ${name}, model = ${model || ''}, serial = ${serial || ''},
      install_date = ${installDate || null}, warranty_expiry = ${warrantyExpiry || null}, notes = ${notes || ''}
    where id = ${params.id}
    returning *
  `;
  return NextResponse.json(rows[0]);
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageClients(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const rows = await sql`select name from assets where id = ${params.id}`;
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const { pending, request, result } = await gateOrExecute({
      session,
      actionType: 'delete_asset',
      targetId: params.id,
      targetLabel: rows[0].name,
      payload: {},
      execute: async () => {
        await sql`delete from assets where id = ${params.id}`;
        return { ok: true };
      }
    });
    return NextResponse.json(pending ? { pending: true, request } : result);
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'This asset has jobs linked to it and can\'t be deleted.' }, { status: 409 });
    }
    console.error('Delete asset error:', err);
    return NextResponse.json({ error: 'Could not delete asset' }, { status: 500 });
  }
}
