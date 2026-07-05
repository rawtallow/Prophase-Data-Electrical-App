import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session || !CAN.editPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const rows = await sql`select * from employees order by name asc`;
  return NextResponse.json(rows);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.editPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const { name, phone, hourlyRate, status } = await req.json();
  if (!name || !name.trim()) return NextResponse.json({ error: 'Employee name is required' }, { status: 400 });
  const rows = await sql`
    insert into employees (name, phone, hourly_rate, status)
    values (${name.trim()}, ${phone || ''}, ${Number(hourlyRate) || 0}, ${status || 'Active'})
    returning *
  `;
  return NextResponse.json(rows[0]);
}
