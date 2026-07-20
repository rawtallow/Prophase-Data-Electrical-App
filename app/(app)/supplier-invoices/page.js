import { sql } from '../../../lib/db';
import { serializeDates } from '../../../lib/format';
import SupplierInvoicesApp from './supplier-invoices-app';

const DATE_FIELDS = ['invoice_date'];

export default async function SupplierInvoicesPage() {
  const rows = await sql`
    select pi.*, po.po_number, po.supplier_name, po.job_number
    from purchase_order_invoices pi
    join purchase_orders po on po.id = pi.purchase_order_id
    order by pi.invoice_date desc nulls last, pi.created_at desc
  `;
  return <SupplierInvoicesApp initialInvoices={rows.map((r) => serializeDates(r, DATE_FIELDS))} />;
}
