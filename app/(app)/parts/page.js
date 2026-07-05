import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import PartsApp from './parts-app';

export default async function PartsPage() {
  const session = await getSession();
  const parts = await sql`select * from parts order by name asc`;
  return <PartsApp initialParts={parts} canManage={CAN.manageParts(session.role)} />;
}
