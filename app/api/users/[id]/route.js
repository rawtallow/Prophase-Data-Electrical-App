import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql, isForeignKeyViolation } from '../../../../lib/db';
import { getSession, CAN, ROLES } from '../../../../lib/auth';
import { gateOrExecute } from '../../../../lib/approvals';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageUsers(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const { name, email, role, active, newPassword } = await req.json();
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });

  if (params.id === session.id && (!CAN.manageUsers(role) || active === false)) {
    return NextResponse.json({ error: "You can't remove your own user-management access or deactivate yourself." }, { status: 400 });
  }

  if (newPassword && newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 });
  }
  const newPasswordHash = newPassword ? await bcrypt.hash(newPassword, 10) : null;

  const existing = await sql`select id from users where id = ${params.id}`;
  if (!existing[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { pending, request, result } = await gateOrExecute({
    session,
    actionType: 'edit_user',
    targetId: params.id,
    targetLabel: `${name} (${email.toLowerCase()})`,
    payload: { name, email: email.toLowerCase(), role, active, newPasswordHash },
    execute: async () => {
      if (newPasswordHash) await sql`update users set password_hash = ${newPasswordHash} where id = ${params.id}`;
      const rows = await sql`
        update users set name = ${name}, email = ${email.toLowerCase()}, role = ${role}, active = ${active}
        where id = ${params.id}
        returning id, name, email, role, active, created_at
      `;
      return rows[0];
    }
  });
  return NextResponse.json(pending ? { pending: true, request } : result);
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageUsers(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  if (params.id === session.id) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }
  const rows = await sql`select name, email from users where id = ${params.id}`;
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const { pending, request, result } = await gateOrExecute({
      session,
      actionType: 'delete_user',
      targetId: params.id,
      targetLabel: `${rows[0].name} (${rows[0].email})`,
      payload: {},
      execute: async () => {
        await sql`delete from users where id = ${params.id}`;
        return { ok: true };
      }
    });
    return NextResponse.json(pending ? { pending: true, request } : result);
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'This account is linked to other records and can\'t be deleted.' }, { status: 409 });
    }
    console.error('Delete user error:', err);
    return NextResponse.json({ error: 'Could not delete user' }, { status: 500 });
  }
}
