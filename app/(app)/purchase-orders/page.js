import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import PurchaseOrdersApp from './purchase-orders-app';

export default async function PurchaseOrdersPage() {
  const session = await getSession();
  const purchaseOrders = await sql`select * from purchase_orders order by created_at desc`;
  return (
    <PurchaseOrdersApp
      initialOrders={purchaseOrders}
      myId={session.id}
      fullAccess={CAN.editPurchaseOrders(session.role)}
    />
  );
}
