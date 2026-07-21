import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { notFound, redirect } from 'next/navigation';
import PrintButton from './print-button';
import { money, toDisplayDate as dstr } from '../../../../../lib/format';

export default async function PrintPurchaseOrderPage({ params }) {
  const session = await getSession();
  // Middleware already blocks employees from this route; this is the
  // second line of defense plus the actual business rule — nobody can
  // print/send a PO (even a manager) until it's been approved.
  if (!CAN.editPurchaseOrders(session.role)) redirect('/purchase-orders?denied=1');

  const [pos, lineItems] = await Promise.all([
    sql`select * from purchase_orders where id = ${params.id}`,
    sql`select * from purchase_order_line_items where purchase_order_id = ${params.id} order by sort_order asc`
  ]);
  const po = pos[0];
  if (!po) notFound();
  if (po.approval_status !== 'Approved') {
    return (
      <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
        <h2 className="section-title">Not approved yet</h2>
        <p className="small-note">
          Purchase order {po.po_number} must be approved before it can be printed or sent to the supplier.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="no-print" style={{ margin: '16px 0' }}>
        <PrintButton />
      </div>
      <div className="print-header">
        <div className="company">
          Prophase Data and Electrical
          <div className="tag">Electrical Contracting Services</div>
        </div>
        <div className="print-meta">
          <div className="qnum">Purchase Order {po.po_number}</div>
          <div>Date: {dstr(po.date)}</div>
          <div>Status: {po.status}</div>
        </div>
      </div>

      <div className="bill-to">
        <div className="lbl">To Supplier</div>
        <div>{po.supplier_name}</div>
      </div>

      {po.job_number && (
        <div style={{ marginBottom: 14 }}>
          <div className="lbl" style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>For Job</div>
          <div>{po.job_number}</div>
        </div>
      )}

      {(po.delivery_address || po.expected_delivery_date) && (
        <div style={{ marginBottom: 14 }}>
          <div className="lbl" style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Deliver To</div>
          {po.delivery_address && <div>{po.delivery_address}</div>}
          {po.expected_delivery_date && <div>Expected: {dstr(po.expected_delivery_date)}</div>}
          {po.delivery_method && <div>{po.delivery_method}</div>}
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th style={{ borderBottom: '2px solid #141414' }}>Description</th>
            <th style={{ borderBottom: '2px solid #141414' }}>Supplier Code</th>
            <th className="num" style={{ borderBottom: '2px solid #141414' }}>Qty</th>
            <th className="num" style={{ borderBottom: '2px solid #141414' }}>Unit Cost</th>
            <th className="num" style={{ borderBottom: '2px solid #141414' }}>Line Total</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((li) => (
            <tr key={li.id}>
              <td>{li.description}</td>
              <td>{li.supplier_product_code || '—'}</td>
              <td className="num">{li.qty}</td>
              <td className="num">{money(li.unit_cost)}</td>
              <td className="num">{money(li.qty * li.unit_cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals-box" style={{ marginTop: 14 }}>
        <div className="line"><span>Subtotal</span><span>{money(po.subtotal)}</span></div>
        <div className="line"><span>GST ({po.tax_rate}%)</span><span>{money(po.tax)}</span></div>
        <div className="line total"><span>Total</span><span>{money(po.total)}</span></div>
      </div>

      {po.notes && (
        <div style={{ marginTop: 20 }}>
          <div className="lbl" style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Notes</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{po.notes}</div>
        </div>
      )}
    </div>
  );
}
