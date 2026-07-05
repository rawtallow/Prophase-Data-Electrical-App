import { redirect } from 'next/navigation';
import { getSession } from '../lib/auth';
import { sql } from '../lib/db';

export default async function RootPage() {
  try {
    const existing = await sql`select count(*)::int as n from users`;
    if (existing[0].n === 0) redirect('/setup');
  } catch {
    // DB not configured yet — send to login, which will surface the real error on submit.
  }
  const session = await getSession();
  redirect(session ? '/dashboard' : '/login');
}
