import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import { serializeDates } from '../../../../lib/format';

export const runtime = 'nodejs';

const DATE_FIELDS = ['start_date', 'next_due_date'];

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageContracts(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const { clientId, clientName, title, description, frequency, nextDueDate, amount, status, notes } = await req.json();
  if (!clientName || !clientName.trim()) return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
  if (!title || !title.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const rows = await sql`
    update maintenance_contracts set
      client_id = ${clientId || null}, client_name = ${clientName.trim()}, title = ${title.trim()},
      description = ${description || ''}, frequency = ${frequency || 'Quarterly'},
      next_due_date = ${nextDueDate || null}, amount = ${Number(amount) || 0},
      status = ${status || 'Active'}, notes = ${notes || ''}
    where id = ${params.id}
    returning *
  `;
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(serializeDates(rows[0], DATE_FIELDS));
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageContracts(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  await sql`delete from maintenance_contracts where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
