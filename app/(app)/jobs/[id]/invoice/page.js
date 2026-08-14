import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { notFound, redirect } from 'next/navigation';
import PrintButton from './print-button';
import { money, toDisplayDate as dstr } from '../../../../../lib/format';

export default async function JobInvoicePage({ params }) {
  const session = await getSession();
  // Middleware already blocks employees from this route; this is the
  // second line of defense plus the actual business rule — invoicing is a
  // financial document, gated on the financial permission (not the looser
  // manageJobs precedent the Warranty document uses).
  if (!CAN.viewFinancials(session.role)) redirect('/jobs?denied=1');

  const [jobs, lineItems, payments] = await Promise.all([
    sql`select * from jobs where id = ${params.id}`,
    sql`select * from job_line_items where job_id = ${params.id} order by sort_order asc`,
    sql`select * from job_payments where job_id = ${params.id} order by date asc, created_at asc`
  ]);
  const job = jobs[0];
  if (!job) notFound();

  if (Number(job.amount_invoiced) <= 0) {
    return (
      <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
        <h2 className="section-title">Not invoiced yet</h2>
        <p className="small-note">
          Job {job.job_number} hasn&apos;t been invoiced yet — add a total or line items on the Edit form first.
        </p>
      </div>
    );
  }

  const client = job.client_id ? (await sql`select * from clients where id = ${job.client_id}`)[0] : null;

  const invoiced = Number(job.amount_invoiced);
  const paid = Number(job.amount_paid);
  const balance = invoiced - paid;
  const paidLabel = paid >= invoiced ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Unpaid';

  // Every invoiced job prints a valid document regardless of whether it
  // used itemization — a job with just a typed total falls back to one
  // synthesized line rather than showing an empty items table.
  const displayItems = lineItems.length > 0
    ? lineItems
    : [{ id: 'synthesized', description: job.job_description || job.job_number, qty: 1, price: invoiced }];
  const itemsSubtotal = lineItems.reduce((s, li) => s + Number(li.qty) * Number(li.price), 0);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="no-print" style={{ margin: '16px 0' }}>
        <PrintButton />
      </div>
      <div className="print-header">
        <div className="company">
          PROPHASE Data and Electrical
          <div className="tag">Electrical Contracting Services</div>
        </div>
        <div className="print-meta">
          <div className="qnum">Invoice — {job.job_number}</div>
          <div>Date: {dstr(job.created_date)}</div>
          <div>Status: {paidLabel}</div>
        </div>
      </div>

      <div className="bill-to">
        <div className="lbl">Bill To</div>
        <div>{job.client_name}</div>
        {client?.address && <div>{client.address}</div>}
        {client?.phone && <div>{client.phone}</div>}
        {client?.email && <div>{client.email}</div>}
      </div>

      {job.job_description && (
        <div style={{ marginBottom: 14 }}>
          <div className="lbl" style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Job Description</div>
          <div>{job.job_description}</div>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th style={{ borderBottom: '2px solid #141414' }}>Description</th>
            <th className="num" style={{ borderBottom: '2px solid #141414' }}>Qty</th>
            <th className="num" style={{ borderBottom: '2px solid #141414' }}>Price</th>
            <th className="num" style={{ borderBottom: '2px solid #141414' }}>Line Total</th>
          </tr>
        </thead>
        <tbody>
          {displayItems.map((li) => (
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
        {lineItems.length > 0 ? (
          <>
            <div className="line"><span>Subtotal</span><span>{money(itemsSubtotal)}</span></div>
            <div className="line"><span>GST (10%)</span><span>{money(itemsSubtotal * 0.1)}</span></div>
            <div className="line total"><span>Total</span><span>{money(itemsSubtotal * 1.1)}</span></div>
          </>
        ) : (
          <div className="line total"><span>Total</span><span>{money(invoiced)}</span></div>
        )}
      </div>

      <div className="lbl" style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748b', fontWeight: 700, marginTop: 20 }}>Payments</div>
      {payments.length > 0 ? (
        <table style={{ marginTop: 6 }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '2px solid #141414' }}>Date</th>
              <th style={{ borderBottom: '2px solid #141414' }}>Method</th>
              <th className="num" style={{ borderBottom: '2px solid #141414' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{dstr(p.date)}</td>
                <td>{p.method || '—'}</td>
                <td className="num">{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="small-note" style={{ marginTop: 6 }}>No payments recorded yet.</div>
      )}

      <div className="totals-box" style={{ marginTop: 14 }}>
        <div className="line total"><span>Balance Due</span><span style={{ color: balance > 0 ? 'var(--red)' : 'var(--green)' }}>{money(balance)}</span></div>
      </div>

      {job.notes && (
        <div style={{ marginTop: 20 }}>
          <div className="lbl" style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Notes</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{job.notes}</div>
        </div>
      )}
    </div>
  );
}
