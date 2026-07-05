import { sql } from '../../../lib/db';
import { getSession } from '../../../lib/auth';
import UsersApp from './users-app';

export default async function UsersPage() {
  const session = await getSession();
  const users = await sql`select id, name, email, role, active, created_at from users order by created_at asc`;
  return <UsersApp initialUsers={users} myId={session.id} />;
}
