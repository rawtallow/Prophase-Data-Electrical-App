import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '../../../lib/db';
import { getSession, CAN, ROLES } from '../../../lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session || !CAN.manageUsers(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const rows = await sql`select id, name, email, role, active, created_at from users order by created_at asc`;
  return NextResponse.json(rows);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.manageUsers(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const { name, email, password, role } = await req.json();
  if (!name || !email || !password || password.length < 8) {
    return NextResponse.json({ error: 'Name, email, and a password of at least 8 characters are required.' }, { status: 400 });
  }
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });

  const existing = await sql`select id from users where email = ${email.toLowerCase()}`;
  if (existing[0]) return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });

  const hash = await bcrypt.hash(password, 10);
  const rows = await sql`
    insert into users (name, email, password_hash, role, active)
    values (${name.trim()}, ${email.toLowerCase()}, ${hash}, ${role}, true)
    returning id, name, email, role, active, created_at
  `;
  return NextResponse.json(rows[0]);
}
