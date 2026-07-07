import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '../../../../lib/db';
import { getSession } from '../../../../lib/auth';

export const runtime = 'nodejs';

// Lets any signed-in user change their own password (admin-only reset via
// the Users page requires knowing/sharing a temp password — this covers the
// normal case of a user just wanting to set their own).
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Current and new password are required.' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 });
  }

  const rows = await sql`select password_hash from users where id = ${session.id}`;
  const user = rows[0];
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });

  const hash = await bcrypt.hash(newPassword, 10);
  await sql`update users set password_hash = ${hash} where id = ${session.id}`;
  return NextResponse.json({ ok: true });
}
