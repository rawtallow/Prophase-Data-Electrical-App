import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '../../../lib/db';
import { createSession } from '../../../lib/auth';

export const runtime = 'nodejs';

// One-time bootstrap: only works while the users table is empty. Creates the
// first account as Admin. After that, this route always refuses — further
// accounts are created from the Admin > Users page.
export async function POST(req) {
  try {
    const existing = await sql`select count(*)::int as n from users`;
    if (existing[0].n > 0) {
      return NextResponse.json(
        { error: 'Setup already completed. Ask an admin to create your account from Users.' },
        { status: 403 }
      );
    }

    const { name, email, password } = await req.json();
    if (!name || !email || !password || password.length < 8) {
      return NextResponse.json(
        { error: 'Name, email, and a password of at least 8 characters are required.' },
        { status: 400 }
      );
    }

    const hash = await bcrypt.hash(password, 10);
    const rows = await sql`
      insert into users (name, email, password_hash, role, active)
      values (${name}, ${email.toLowerCase()}, ${hash}, 'admin', true)
      returning id, name, role, email
    `;
    const user = rows[0];
    await createSession(user);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Setup failed.' }, { status: 500 });
  }
}
