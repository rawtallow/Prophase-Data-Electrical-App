import { notFound } from 'next/navigation';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import PoDetailApp from './po-detail-app';

export default async function PurchaseOrderDetailPage({ params }) {
  const session = await getSession();
  const pos = await sql`select * from purchase_orders where id = ${params.id}`;
  const po = pos[0];
  if (!po) notFound();

  const fullAccess = CAN.editPurchaseOrders(session.role);

  const [
    lineItems, invoices, documents, activity,
    suppliers, parts, jobs, clients, assets, quotes, employees
  ] = await Promise.all([
    sql`select * from purchase_order_line_items where purchase_order_id = ${params.id} order by sort_order asc`,
    sql`select * from purchase_order_invoices where purchase_order_id = ${params.id} order by invoice_date desc, created_at desc`,
    sql`select * from po_documents where purchase_order_id = ${params.id} order by created_at desc`,
    sql`select * from po_activity where purchase_order_id = ${params.id} order by created_at desc`,
    sql`select * from suppliers order by name asc`,
    sql`select id, name, unit_cost, track_serials from parts order by name asc`,
    sql`select id, job_number, client_name from jobs where status != 'Complete' order by created_date desc`,
    sql`select id, name, phone, email, address from clients order by name asc`,
    sql`select id, client_id, name from assets order by name asc`,
    sql`select id, quote_number, client_name from quotes order by date desc`,
    sql`select id, name from employees where status = 'Active' order by name asc`
  ]);

  return (
    <PoDetailApp
      initialPo={po}
      initialLineItems={lineItems}
      initialInvoices={invoices}
      initialDocuments={documents}
      initialActivity={activity}
      suppliers={suppliers}
      parts={parts}
      jobs={jobs}
      clients={clients}
      assets={assets}
      quotes={quotes}
      employees={employees}
      myId={session.id}
      fullAccess={fullAccess}
    />
  );
}
