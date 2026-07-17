import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql, isForeignKeyViolation } from '../../../../lib/db';
import { getSession, CAN, ROLES } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageUsers(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const { name, email, role, active, newPassword } = await req.json();
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });

  if (params.id === session.id && (role !== 'admin' || active === false)) {
    return NextResponse.json({ error: "You can't remove your own admin access or deactivate yourself." }, { status: 400 });
  }

  if (newPassword) {
    if (newPassword.length < 8) return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 });
    const hash = await bcrypt.hash(newPassword, 10);
    await sql`update users set password_hash = ${hash} where id = ${params.id}`;
  }

  const rows = await sql`
    update users set name = ${name}, email = ${email.toLowerCase()}, role = ${role}, active = ${active}
    where id = ${params.id}
    returning id, name, email, role, active, created_at
  `;
  return NextResponse.json(rows[0]);
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageUsers(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  if (params.id === session.id) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }
  try {
    await sql`delete from users where id = ${params.id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'This account is linked to other records and can\'t be deleted.' }, { status: 409 });
    }
    console.error('Delete user error:', err);
    return NextResponse.json({ error: 'Could not delete user' }, { status: 500 });
  }
}
