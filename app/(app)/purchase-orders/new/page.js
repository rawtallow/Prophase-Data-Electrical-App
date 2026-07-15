import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import PoForm from '../po-form';

export default async function NewPurchaseOrderPage() {
  const session = await getSession();
  const [suppliers, parts, jobs] = await Promise.all([
    sql`select id, name from suppliers order by name asc`,
    sql`select id, name, unit_cost from parts order by name asc`,
    sql`select id, job_number, client_name from jobs where status != 'Complete' order by created_date desc`
  ]);
  return <PoForm existing={null} suppliers={suppliers} parts={parts} jobs={jobs} fullAccess={CAN.editPurchaseOrders(session.role)} />;
}
