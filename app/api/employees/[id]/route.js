import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const { name, phone, hourlyRate, status } = await req.json();
  const rows = await sql`
    update employees set name = ${name}, phone = ${phone || ''}, hourly_rate = ${Number(hourlyRate) || 0}, status = ${status}
    where id = ${params.id}
    returning *
  `;
  return NextResponse.json(rows[0]);
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  await sql`delete from employees where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
