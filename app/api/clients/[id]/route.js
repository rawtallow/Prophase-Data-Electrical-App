import { NextResponse } from 'next/server';
import { sql, isForeignKeyViolation } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageClients(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const { name, phone, email, address, leadSource } = await req.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  const rows = await sql`
    update clients set name = ${name}, phone = ${phone || ''}, email = ${email || ''}, address = ${address || ''}, lead_source = ${leadSource || ''}
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
  try {
    await sql`delete from clients where id = ${params.id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'This client has compliance records on file and can\'t be deleted.' }, { status: 409 });
    }
    console.error('Delete client error:', err);
    return NextResponse.json({ error: 'Could not delete client' }, { status: 500 });
  }
}
