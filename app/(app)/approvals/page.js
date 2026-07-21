import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import ApprovalsApp from './approvals-app';

export default async function ApprovalsPage() {
  const session = await getSession();
  const isDirector = CAN.isDirector(session.role);

  const requests = isDirector
    ? await sql`select * from approval_requests order by (status = 'Pending') desc, created_at desc`
    : await sql`select * from approval_requests where requested_by_id = ${session.id} order by created_at desc`;

  return <ApprovalsApp initialRequests={requests} isDirector={isDirector} myId={session.id} />;
}
