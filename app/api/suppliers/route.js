import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await sql`select * from suppliers order by name asc`;
  return NextResponse.json(rows);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.manageSuppliers(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const { name, accountNumber, contactName, phone, email, address, paymentTerms, portalUrl, notes } = await req.json();
  if (!name || !name.trim()) return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 });

  const rows = await sql`
    insert into suppliers (name, account_number, contact_name, phone, email, address, payment_terms, portal_url, notes)
    values (${name.trim()}, ${accountNumber || ''}, ${contactName || ''}, ${phone || ''}, ${email || ''}, ${address || ''}, ${paymentTerms || ''}, ${portalUrl || ''}, ${notes || ''})
    returning *
  `;
  return NextResponse.json(rows[0]);
}
