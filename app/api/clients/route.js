import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await sql`select * from clients order by name asc`;
  return NextResponse.json(rows);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.manageClients(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const { name, phone, email, address } = await req.json();
  if (!name || !name.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const rows = await sql`
    insert into clients (name, phone, email, address)
    values (${name.trim()}, ${phone || ''}, ${email || ''}, ${address || ''})
    returning *
  `;
  return NextResponse.json(rows[0]);
}
