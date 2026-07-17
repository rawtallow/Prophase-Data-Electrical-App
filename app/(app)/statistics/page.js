import { sql } from '../../../lib/db';
import { money } from '../../../lib/format';
import { fyBounds, fyMonths, fyRangeFromEarliest, fyLabel, currentFYStartYear } from '../../../lib/financial-year';
import StatisticsNav from './statistics-nav';
import FySwitcher from './fy-switcher';
import StatBars from './stat-bars';

function monthKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${dt.getMonth()}`;
}

export default async function StatisticsPage({ searchParams }) {
  const fy = searchParams.fy ? Number(searchParams.fy) : currentFYStartYear();
  const { start, end } = fyBounds(fy);
  // clients.created_at is a timestamp (not a plain date like the other
  // tables here), so comparing it to `end` directly would clip out any
  // client created later on the last day — use the next FY's start as an
  // exclusive upper bound instead.
  const nextFYStart = fyBounds(fy + 1).start;

  const [earliestRows, quotes, jobs, payrollEntries, draws, laborRows, materialRows, newClients] = await Promise.all([
    sql`
      select min(d) as d from (
        select date as d from quotes
        union all select created_date from jobs
        union all select date_paid from payroll_entries
        union all select date from owner_draws
      ) x
    `,
    sql`select date, status, approval_status, total from quotes where date >= ${start} and date <= ${end}`,
    sql`select created_date, status, amount_invoiced, amount_paid, id from jobs where created_date >= ${start} and created_date <= ${end}`,
    sql`select date_paid, gross_pay, net_pay from payroll_entries where date_paid >= ${start} and date_paid <= ${end}`,
    sql`select date, amount from owner_draws where date >= ${start} and date <= ${end}`,
    sql`
      select pa.job_id, sum(pa.reg_hours * pe.hourly_rate + pa.ot_hours * pe.hourly_rate * 1.5) as cost
      from payroll_allocations pa
      join payroll_entries pe on pe.id = pa.payroll_entry_id
      where pa.job_id is not null
      group by pa.job_id
    `,
    sql`
      select job_id, sum(total) as cost
      from purchase_orders
      where job_id is not null and status != 'Cancelled'
      group by job_id
    `,
    sql`select lead_source from clients where created_at >= ${start} and created_at < ${nextFYStart}`
  ]);
  const years = fyRangeFromEarliest(earliestRows[0]?.d);
  const laborByJob = Object.fromEntries(laborRows.map((r) => [r.job_id, Number(r.cost) || 0]));
  const materialsByJob = Object.fromEntries(materialRows.map((r) => [r.job_id, Number(r.cost) || 0]));

  const totalInvoiced = jobs.reduce((s, j) => s + Number(j.amount_invoiced), 0);
  const totalCollected = jobs.reduce((s, j) => s + Number(j.amount_paid), 0);
  const outstanding = jobs.reduce((s, j) => s + Math.max(Number(j.amount_invoiced) - Number(j.amount_paid), 0), 0);
  const totalLabor = jobs.reduce((s, j) => s + (laborByJob[j.id] || 0), 0);
  const totalMaterials = jobs.reduce((s, j) => s + (materialsByJob[j.id] || 0), 0);
  const margin = totalInvoiced - totalLabor - totalMaterials;
  const completedJobs = jobs.filter((j) => j.status === 'Complete').length;

  const accepted = quotes.filter((q) => q.status === 'Accepted').length;
  const declined = quotes.filter((q) => q.status === 'Declined').length;
  const acceptanceRate = accepted + declined > 0 ? (accepted / (accepted + declined)) * 100 : null;

  const totalGrossPay = payrollEntries.reduce((s, p) => s + Number(p.gross_pay), 0);
  const totalDraws = draws.reduce((s, d) => s + Number(d.amount), 0);

  const sourceCounts = {};
  for (const c of newClients) {
    const k = c.lead_source || 'Not set';
    sourceCounts[k] = (sourceCounts[k] || 0) + 1;
  }
  const bySource = Object.keys(sourceCounts)
    .map((k) => ({ label: k, count: sourceCounts[k] }))
    .sort((a, b) => b.count - a.count);

  const months = fyMonths(fy);
  const monthly = months.map((m) => {
    const key = `${m.year}-${m.month}`;
    const monthJobs = jobs.filter((j) => monthKey(j.created_date) === key);
    const monthQuotes = quotes.filter((q) => monthKey(q.date) === key);
    return {
      label: m.label,
      jobCount: monthJobs.length,
      quoteCount: monthQuotes.length,
      invoiced: monthJobs.reduce((s, j) => s + Number(j.amount_invoiced), 0),
      collected: monthJobs.reduce((s, j) => s + Number(j.amount_paid), 0)
    };
  });

  return (
    <>
      <h2 className="section-title">Statistics — {fyLabel(fy)}</h2>
      <StatisticsNav />
      <FySwitcher pathname="/statistics" years={years} current={fy} />

      <div className="cards">
        <div className="card"><div className="label">Revenue Invoiced</div><div className="value">{money(totalInvoiced)}</div></div>
        <div className="card good"><div className="label">Revenue Collected</div><div className="value">{money(totalCollected)}</div></div>
        <div className="card warn"><div className="label">Outstanding</div><div className="value">{money(outstanding)}</div></div>
        <div className="card"><div className="label">Net Margin</div><div className="value">{money(margin)}</div></div>
        <div className="card"><div className="label">Jobs Created</div><div className="value">{jobs.length}</div></div>
        <div className="card good"><div className="label">Jobs Completed</div><div className="value">{completedJobs}</div></div>
        <div className="card"><div className="label">Quotes Created</div><div className="value">{quotes.length}</div></div>
        <div className="card"><div className="label">Quote Acceptance Rate</div><div className="value">{acceptanceRate === null ? '—' : `${acceptanceRate.toFixed(0)}%`}</div></div>
        <div className="card"><div className="label">Labor Cost (Payroll)</div><div className="value">{money(totalGrossPay)}</div></div>
        <div className="card"><div className="label">Materials Cost (POs)</div><div className="value">{money(totalMaterials)}</div></div>
        <div className="card"><div className="label">Owner Draws</div><div className="value">{money(totalDraws)}</div></div>
        <div className="card"><div className="label">New Clients</div><div className="value">{newClients.length}</div></div>
      </div>

      <div className="panel">
        <h2 className="section-title">Monthly Trend</h2>
        <table>
          <thead>
            <tr>
              <th>Month</th><th className="num">Jobs</th><th className="num">Quotes</th>
              <th className="num">Invoiced</th><th className="num">Collected</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.label}>
                <td>{m.label}</td>
                <td className="num">{m.jobCount}</td>
                <td className="num">{m.quoteCount}</td>
                <td className="num">{money(m.invoiced)}</td>
                <td className="num">{money(m.collected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2 className="section-title">New Clients by Lead Source</h2>
        <StatBars rows={bySource} />
      </div>
    </>
  );
}
