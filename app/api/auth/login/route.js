import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '../../../../lib/db';
import { createSession } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const rows = await sql`
      select id, name, email, role, active, password_hash
      from users where email = ${email.toLowerCase()}
    `;
    const user = rows[0];
    if (!user || !user.active) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    await createSession(user);
    return NextResponse.json({ ok: true, role: user.role });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Login failed.' }, { status: 500 });
  }
}
