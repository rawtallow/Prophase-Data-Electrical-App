import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '../../../../lib/db';
import { createSession } from '../../../../lib/auth';

export const runtime = 'nodejs';

// Brute-force protection: after MAX_FAILURES consecutive failed attempts for
// an email, logins for that email are locked for LOCK_MINUTES. Tracked in the
// database (login_attempts table) so it holds across serverless instances.
// A successful login clears the counter.
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

async function isLocked(key) {
  const rows = await sql`
    select count, locked_until from login_attempts where key = ${key}
  `;
  const row = rows[0];
  if (!row) return false;
  if (row.locked_until && new Date(row.locked_until) > new Date()) return true;
  return false;
}

async function recordFailure(key) {
  const rows = await sql`
    insert into login_attempts (key, count, first_failed_at)
    values (${key}, 1, now())
    on conflict (key) do update set count = login_attempts.count + 1
    returning count
  `;
  if (rows[0].count >= MAX_FAILURES) {
    await sql`
      update login_attempts
      set locked_until = now() + make_interval(mins => ${LOCK_MINUTES}), count = 0
      where key = ${key}
    `;
  }
}

async function clearFailures(key) {
  await sql`delete from login_attempts where key = ${key}`;
}

export async function POST(req) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const key = email.toLowerCase().trim();

    if (await isLocked(key)) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.` },
        { status: 429 }
      );
    }

    const rows = await sql`
      select id, name, email, role, active, password_hash
      from users where email = ${key}
    `;
    const user = rows[0];
    if (!user || !user.active) {
      await recordFailure(key);
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await recordFailure(key);
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    await clearFailures(key);
    await createSession(user);
    return NextResponse.json({ ok: true, role: user.role });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 });
  }
}
