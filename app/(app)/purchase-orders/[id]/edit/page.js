import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import PoForm from '../../po-form';
import { notFound, redirect } from 'next/navigation';

export default async function EditPurchaseOrderPage({ params }) {
  const session = await getSession();
  const [pos, lineItems, suppliers, parts, jobs] = await Promise.all([
    sql`select * from purchase_orders where id = ${params.id}`,
    sql`select * from purchase_order_line_items where purchase_order_id = ${params.id} order by sort_order asc`,
    sql`select id, name from suppliers order by name asc`,
    sql`select id, name, unit_cost from parts order by name asc`,
    sql`select id, job_number, client_name from jobs where status != 'Complete' order by created_date desc`
  ]);
  const po = pos[0];
  if (!po) notFound();

  const fullAccess = CAN.editPurchaseOrders(session.role);
  // Employees can only reach the edit form for their own PO, and only while
  // it hasn't been approved yet — once approved it's out of their hands.
  if (!fullAccess && (po.created_by_id !== session.id || po.approval_status === 'Approved')) {
    redirect('/purchase-orders?denied=1');
  }

  return <PoForm existing={{ ...po, lineItems }} suppliers={suppliers} parts={parts} jobs={jobs} fullAccess={fullAccess} />;
}
