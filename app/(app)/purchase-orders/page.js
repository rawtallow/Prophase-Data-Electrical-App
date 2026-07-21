import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import PurchaseOrdersApp from './purchase-orders-app';

export default async function PurchaseOrdersPage() {
  const session = await getSession();
  // Aggregated (not a single status string) since a PO can have more than
  // one invoice across partial deliveries.
  const purchaseOrders = await sql`
    select po.*, coalesce(count(pi.id), 0)::int as invoice_count,
           coalesce(sum(pi.total), 0) as invoiced_total, coalesce(sum(pi.amount_paid), 0) as invoice_paid_total
    from purchase_orders po
    left join purchase_order_invoices pi on pi.purchase_order_id = po.id
    group by po.id
    order by po.created_at desc
  `;
  return (
    <PurchaseOrdersApp
      initialOrders={purchaseOrders}
      myId={session.id}
      fullAccess={CAN.editPurchaseOrders(session.role)}
    />
  );
}
