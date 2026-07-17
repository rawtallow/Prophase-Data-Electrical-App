import { NextResponse } from 'next/server';
import { sql, isForeignKeyViolation } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const { name, phone, hourlyRate, status, licenseNumber, licenseExpiry } = await req.json();
  if (!name || !name.trim()) return NextResponse.json({ error: 'Employee name is required' }, { status: 400 });
  const rows = await sql`
    update employees set name = ${name}, phone = ${phone || ''}, hourly_rate = ${Number(hourlyRate) || 0}, status = ${status},
      license_number = ${licenseNumber || ''}, license_expiry = ${licenseExpiry || null}
    where id = ${params.id}
    returning *
  `;
  return NextResponse.json(rows[0]);
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  try {
    await sql`delete from employees where id = ${params.id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'This employee has compliance records on file and can\'t be deleted.' }, { status: 409 });
    }
    console.error('Delete employee error:', err);
    return NextResponse.json({ error: 'Could not delete employee' }, { status: 500 });
  }
}
