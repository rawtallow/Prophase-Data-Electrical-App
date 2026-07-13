import Link from 'next/link';
import { getSession, CAN } from '../../../lib/auth';
import { sql } from '../../../lib/db';
import { money, slug, toDisplayDate as fmtDate } from '../../../lib/format';
import { NavIcon } from '../nav-items';

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

// Quick-action tiles — shortcuts to the flows used most often, handy one-thumb
// on a phone. Available to every role.
function QuickActions() {
  const actions = [
    { href: '/quotes/new', label: 'New Quote', icon: 'quote' },
    { href: '/jobs', label: 'Job Log', icon: 'jobs' },
    { href: '/receipts', label: 'Log Receipt', icon: 'receipts' },
    { href: '/clients', label: 'Clients', icon: 'clients' }
  ];
  return (
    <div className="quick-actions">
      {actions.map((a) => (
        <Link key={a.href} href={a.href} className="qa">
          <span className="qa-ic"><NavIcon name={a.icon} /></span>
          {a.label}
        </Link>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getSession();
  const fullAccess = CAN.viewFinancials(session.role);

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
        <div className="page-head">
          <div className="titles">
            <h1>Dashboard</h1>
            <div className="sub">Welcome back{firstName(session.name) ? `, ${firstName(session.name)}` : ''}.</div>
          </div>
        </div>

        <QuickActions />

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

        <div className="panel card-table">
          <h2 className="section-title">Your Active Jobs</h2>
          <table>
            <thead>
              <tr><th>Job #</th><th>Priority</th><th>Customer</th><th>Scheduled</th><th>Status</th></tr>
            </thead>
            <tbody>
              {activeJobs.map((j) => (
                <tr key={j.id}>
                  <td data-label="Job #">{j.job_number}</td>
                  <td data-label="Priority"><span className={`badge ${slug(j.priority)}`}>{j.priority}</span></td>
                  <td data-label="Customer">{j.client_name}</td>
                  <td data-label="Scheduled">{fmtDate(j.scheduled_date)}</td>
                  <td data-label="Status"><span className={`badge ${slug(j.status)}`}>{j.status}</span></td>
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
      <div className="page-head">
        <div className="titles">
          <h1>Dashboard</h1>
          <div className="sub">Welcome back{firstName(session.name) ? `, ${firstName(session.name)}` : ''}. Here's where the business stands.</div>
        </div>
      </div>

      <QuickActions />

      <div className="cards">
        <div className="card"><div className="label">Open Quotes</div><div className="value">{openQuotes}</div></div>
        <div className="card"><div className="label">Active Jobs</div><div className="value">{activeJobs.length}</div></div>
        <div className="card warn"><div className="label">Outstanding Balance</div><div className="value">{money(outstanding)}</div></div>
        <div className="card good"><div className="label">Collected This Month</div><div className="value">{money(paidThisMonth)}</div></div>
        <div className="card warn"><div className="label">Payroll + Draws This Month</div><div className="value">{money(payrollThisMonth)}</div></div>
        <div className={`card${lowStock.length ? ' warn' : ''}`}><div className="label">Low Stock Parts</div><div className="value">{lowStock.length}</div></div>
      </div>

      <div className="panel card-table">
        <h2 className="section-title">Recent Quotes</h2>
        <table>
          <thead><tr><th>Quote #</th><th>Customer</th><th>Date</th><th>Status</th><th className="num">Total</th></tr></thead>
          <tbody>
            {recentQuotes.map((q) => (
              <tr key={q.id}>
                <td data-label="Quote #">{q.quote_number}</td>
                <td data-label="Customer">{q.client_name}</td>
                <td data-label="Date">{fmtDate(q.date)}</td>
                <td data-label="Status"><span className={`badge ${slug(q.status)}`}>{q.status}</span></td>
                <td className="num" data-label="Total">{money(q.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {recentQuotes.length === 0 && <div className="empty">No quotes yet.</div>}
      </div>

      <div className="panel card-table">
        <h2 className="section-title">Active Jobs</h2>
        <table>
          <thead><tr><th>Job #</th><th>Priority</th><th>Customer</th><th>Scheduled</th><th>Status</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {activeJobsList.map((j) => (
              <tr key={j.id}>
                <td data-label="Job #">{j.job_number}</td>
                <td data-label="Priority"><span className={`badge ${slug(j.priority)}`}>{j.priority}</span></td>
                <td data-label="Customer">{j.client_name}</td>
                <td data-label="Scheduled">{fmtDate(j.scheduled_date)}</td>
                <td data-label="Status"><span className={`badge ${slug(j.status)}`}>{j.status}</span></td>
                <td className="num" data-label="Balance">{money(Number(j.amount_invoiced) - Number(j.amount_paid))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {activeJobsList.length === 0 && <div className="empty">No active jobs.</div>}
      </div>
    </>
  );
}
