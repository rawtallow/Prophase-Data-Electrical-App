import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageSuppliers(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const { name, accountNumber, contactName, phone, email, address, paymentTerms, portalUrl, notes } = await req.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 });
  }
  const rows = await sql`
    update suppliers set
      name = ${name.trim()}, account_number = ${accountNumber || ''}, contact_name = ${contactName || ''},
      phone = ${phone || ''}, email = ${email || ''}, address = ${address || ''},
      payment_terms = ${paymentTerms || ''}, portal_url = ${portalUrl || ''}, notes = ${notes || ''}
    where id = ${params.id}
    returning *
  `;
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageSuppliers(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  await sql`delete from suppliers where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
