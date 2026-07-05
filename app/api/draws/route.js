import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session || !CAN.viewPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const rows = await sql`select * from owner_draws order by date desc`;
  return NextResponse.json(rows);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.editPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const { date, amount, note } = await req.json();
  if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  if (!(Number(amount) > 0)) return NextResponse.json({ error: 'Enter an amount greater than 0' }, { status: 400 });
  const rows = await sql`
    insert into owner_draws (date, amount, note) values (${date}, ${Number(amount)}, ${note || ''}) returning *
  `;
  return NextResponse.json(rows[0]);
}
