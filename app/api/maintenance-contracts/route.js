import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import { serializeDates } from '../../../lib/format';

export const runtime = 'nodejs';

const DATE_FIELDS = ['start_date', 'next_due_date'];

export async function GET() {
  const session = await getSession();
  if (!session || !CAN.manageContracts(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const rows = await sql`select * from maintenance_contracts order by next_due_date asc`;
  return NextResponse.json(rows.map((r) => serializeDates(r, DATE_FIELDS)));
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.manageContracts(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const { clientId, clientName, title, description, frequency, startDate, amount, notes } = await req.json();
  if (!clientName || !clientName.trim()) return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
  if (!title || !title.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const rows = await sql`
    insert into maintenance_contracts
      (client_id, client_name, title, description, frequency, start_date, next_due_date, amount, notes, created_by)
    values (${clientId || null}, ${clientName.trim()}, ${title.trim()}, ${description || ''}, ${frequency || 'Quarterly'},
      ${startDate || null}, ${startDate || null}, ${Number(amount) || 0}, ${notes || ''}, ${session.name})
    returning *
  `;
  return NextResponse.json(serializeDates(rows[0], DATE_FIELDS));
}
