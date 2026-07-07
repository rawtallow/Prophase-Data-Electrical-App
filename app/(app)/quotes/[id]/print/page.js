import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { notFound, redirect } from 'next/navigation';
import PrintButton from './print-button';
import { money, toDisplayDate as dstr } from '../../../../../lib/format';

export default async function PrintQuotePage({ params }) {
  const session = await getSession();
  // Middleware already blocks employees from this route; this is the
  // second line of defense plus the actual business rule — nobody can
  // print/send a quote (even a manager) until it's been approved.
  if (!CAN.editQuotes(session.role)) redirect('/quotes?denied=1');

  const [quotes, lineItems] = await Promise.all([
    sql`select * from quotes where id = ${params.id}`,
    sql`select * from quote_line_items where quote_id = ${params.id} order by sort_order asc`
  ]);
  const q = quotes[0];
  if (!q) notFound();
  if (q.approval_status !== 'Approved') {
    return (
      <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
        <h2 className="section-title">Not approved yet</h2>
        <p className="small-note">
          Quote {q.quote_number} must be approved before it can be printed or sent to the customer.
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
          <div className="qnum">Quote {q.quote_number}</div>
          <div>Date: {dstr(q.date)}</div>
          <div>Status: {q.status}</div>
        </div>
      </div>

      <div className="bill-to">
        <div className="lbl">Prepared For</div>
        <div>{q.client_name}</div>
        {q.client_address && <div>{q.client_address}</div>}
        {q.client_phone && <div>{q.client_phone}</div>}
        {q.client_email && <div>{q.client_email}</div>}
      </div>

      {q.job_description && (
        <div style={{ marginBottom: 14 }}>
          <div className="lbl" style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Job Description</div>
          <div>{q.job_description}</div>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th style={{ borderBottom: '2px solid #141414' }}>Description</th>
            <th className="num" style={{ borderBottom: '2px solid #141414' }}>Qty</th>
            <th className="num" style={{ borderBottom: '2px solid #141414' }}>Unit Price</th>
            <th className="num" style={{ borderBottom: '2px solid #141414' }}>Line Total</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((li) => (
            <tr key={li.id}>
              <td>{li.description}</td>
              <td className="num">{li.qty}</td>
              <td className="num">{money(li.price)}</td>
              <td className="num">{money(li.qty * li.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals-box" style={{ marginTop: 14 }}>
        <div className="line"><span>Subtotal</span><span>{money(q.subtotal)}</span></div>
        <div className="line"><span>Discount</span><span>-{money(q.discount)}</span></div>
        <div className="line"><span>GST ({q.tax_rate}%)</span><span>{money(q.tax)}</span></div>
        <div className="line total"><span>Total</span><span>{money(q.total)}</span></div>
      </div>

      {q.notes && (
        <div style={{ marginTop: 20 }}>
          <div className="lbl" style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Notes</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{q.notes}</div>
        </div>
      )}
    </div>
  );
}
