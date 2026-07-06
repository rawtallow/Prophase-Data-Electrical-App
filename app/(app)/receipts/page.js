import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import ReceiptsApp from './receipts-app';

export default async function ReceiptsPage() {
  const session = await getSession();
  const receipts = await sql`select * from receipts order by purchase_date desc nulls last, created_at desc`;
  return <ReceiptsApp initialReceipts={receipts} canManage={CAN.manageReceipts(session.role)} />;
}
