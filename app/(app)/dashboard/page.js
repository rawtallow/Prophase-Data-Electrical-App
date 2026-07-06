import { getSession, CAN } from '../../../lib/auth';
import { sql } from '../../../lib/db';

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function slug(s) {
  return String(s).toLowerCase().replace(/\s+/g, '');
}

export default async function DashboardPage() {
  const session = await getSession();
  const fullAccess = CAN.viewFinancials(session.role);

  // All independent — fire together instead of waiting on each in turn.
  // The financial queries are skipped entirely for employee-role sessions,
  // which don't use them.
  const [jobs, parts, quotes, payrollEntries, draws] = await Promise.all([
    sql`select * from jobs order by created_date desc limit 200`,
    sql`select * from parts`,
    fullAccess ? sql`select * from quotes order by created_at desc limit 200` : Promise.resolve([]),
    fullAccess ? sql`select * from payroll_entries` : Promise.resolve([]),
    fullAccess ? sql`select * from owner_draws` : Promise.resolve([])
  ]);
  const lowStock = parts.filter((p) => Number(p.reorder_threshold) > 0 && Number(p.qty_on_hand) <= Number(p.reorder_threshold));

  if (!fullAccess) {
    const activeJobs = jobs.filter((j) => j.status !== 'Complete').slice(0, 10);
    return (
      <>
        <div className="cards">
          <div className="card">
            <div className="label">Active Jobs</div>
            <div className="value">{jobs.filter((j) => j.status !== 'Complete').length}</div>
          </div>
          <div className={`card${lowStock.length ? ' warn' : ''}`}>
            <div className="label">Low Stock Parts</div>
            <div className="value">{lowStock.length}</div>
          </div>
        </div>
        <div className="panel">
          <h2 className="section-title">Your Active Jobs</h2>
          <table>
            <thead>
              <tr><th>Job #</th><th>Customer</th><th>Scheduled</th><th>Status</th></tr>
            </thead>
            <tbody>
              {activeJobs.map((j) => (
                <tr key={j.id}>
                  <td>{j.job_number}</td>
                  <td>{j.client_name}</td>
                  <td>{fmtDate(j.scheduled_date)}</td>
                  <td><span className={`badge ${slug(j.status)}`}>{j.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {activeJobs.length === 0 && <div className="empty">No active jobs right now.</div>}
        </div>
      </>
    );
  }

  const openQuotes = quotes.filter((q) => q.status === 'Draft' || q.status === 'Sent').length;
  const activeJobs = jobs.filter((j) => j.status !== 'Complete');
  const outstanding = jobs.reduce((s, j) => s + Math.max(Number(j.amount_invoiced) - Number(j.amount_paid), 0), 0);

  const now = new Date();
  const inThisMonth = (d) => {
    if (!d) return false;
    const dt = new Date(d);
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  };
  const paidThisMonth = jobs.reduce((s, j) => (inThisMonth(j.created_date) ? s + Number(j.amount_paid) : s), 0);
  const payrollThisMonth =
    payrollEntries.reduce((s, p) => (inThisMonth(p.date_paid) ? s + Number(p.net_pay) : s), 0) +
    draws.reduce((s, d) => (inThisMonth(d.date) ? s + Number(d.amount) : s), 0);

  const recentQuotes = quotes.slice(0, 5);
  const activeJobsList = activeJobs.slice(0, 5);

  return (
    <>
      <div className="cards">
        <div className="card"><div className="label">Open Quotes</div><div className="value">{openQuotes}</div></div>
        <div className="card"><div className="label">Active Jobs</div><div className="value">{activeJobs.length}</div></div>
        <div className="card warn"><div className="label">Outstanding Balance</div><div className="value">{money(outstanding)}</div></div>
        <div className="card good"><div className="label">Collected This Month</div><div className="value">{money(paidThisMonth)}</div></div>
        <div className="card warn"><div className="label">Payroll + Draws This Month</div><div className="value">{money(payrollThisMonth)}</div></div>
        <div className={`card${lowStock.length ? ' warn' : ''}`}><div className="label">Low Stock Parts</div><div className="value">{lowStock.length}</div></div>
      </div>

      <div className="panel">
        <h2 className="section-title">Recent Quotes</h2>
        <table>
          <thead><tr><th>Quote #</th><th>Customer</th><th>Date</th><th>Status</th><th className="num">Total</th></tr></thead>
          <tbody>
            {recentQuotes.map((q) => (
              <tr key={q.id}>
                <td>{q.quote_number}</td>
                <td>{q.client_name}</td>
                <td>{fmtDate(q.date)}</td>
                <td><span className={`badge ${slug(q.status)}`}>{q.status}</span></td>
                <td className="num">{money(q.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {recentQuotes.length === 0 && <div className="empty">No quotes yet.</div>}
      </div>

      <div className="panel">
        <h2 className="section-title">Active Jobs</h2>
        <table>
          <thead><tr><th>Job #</th><th>Customer</th><th>Scheduled</th><th>Status</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {activeJobsList.map((j) => (
              <tr key={j.id}>
                <td>{j.job_number}</td>
                <td>{j.client_name}</td>
                <td>{fmtDate(j.scheduled_date)}</td>
                <td><span className={`badge ${slug(j.status)}`}>{j.status}</span></td>
                <td className="num">{money(Number(j.amount_invoiced) - Number(j.amount_paid))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {activeJobsList.length === 0 && <div className="empty">No active jobs.</div>}
      </div>
    </>
  );
}
