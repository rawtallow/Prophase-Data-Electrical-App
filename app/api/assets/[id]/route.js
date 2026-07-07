import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

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
  await sql`delete from assets where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
