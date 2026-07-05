import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';

export const runtime = 'nodejs';

export async function GET(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get('clientId');
  const rows = clientId
    ? await sql`select * from assets where client_id = ${clientId} order by name asc`
    : await sql`select * from assets order by name asc`;
  return NextResponse.json(rows);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.manageClients(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const { clientId, name, model, serial, installDate, warrantyExpiry, notes } = await req.json();
  if (!clientId || !name || !name.trim()) {
    return NextResponse.json({ error: 'Client and asset name are required' }, { status: 400 });
  }
  const rows = await sql`
    insert into assets (client_id, name, model, serial, install_date, warranty_expiry, notes)
    values (${clientId}, ${name.trim()}, ${model || ''}, ${serial || ''}, ${installDate || null}, ${warrantyExpiry || null}, ${notes || ''})
    returning *
  `;
  return NextResponse.json(rows[0]);
}
