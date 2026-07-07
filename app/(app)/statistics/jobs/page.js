import { sql } from '../../../../lib/db';
import { money } from '../../../../lib/format';
import { fyBounds, fyMonths, fyRangeFromEarliest, fyLabel, currentFYStartYear } from '../../../../lib/financial-year';
import StatisticsNav from '../statistics-nav';
import FySwitcher from '../fy-switcher';
import StatBars from '../stat-bars';

function monthKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${dt.getMonth()}`;
}
function groupBy(list, key) {
  const counts = {};
  const values = {};
  for (const item of list) {
    const k = item[key];
    counts[k] = (counts[k] || 0) + 1;
    values[k] = (values[k] || 0) + Number(item.amount_invoiced);
  }
  return Object.keys(counts)
    .map((k) => ({ label: k, count: counts[k], value: values[k] }))
    .sort((a, b) => b.count - a.count);
}

export default async function JobsStatisticsPage({ searchParams }) {
  const fy = searchParams.fy ? Number(searchParams.fy) : currentFYStartYear();
  const { start, end } = fyBounds(fy);

  const [earliestRows, jobs, laborRows, quotes] = await Promise.all([
    sql`
      select min(d) as d from (
        select date as d from quotes
        union all select created_date from jobs
        union all select date_paid from payroll_entries
        union all select date from owner_draws
      ) x
    `,
    sql`select id, created_date, status, priority, job_type, amount_invoiced, amount_paid, quote_id from jobs where created_date >= ${start} and created_date <= ${end}`,
    sql`
      select pa.job_id, sum(pa.reg_hours * pe.hourly_rate + pa.ot_hours * pe.hourly_rate * 1.5) as cost
      from payroll_allocations pa
      join payroll_entries pe on pe.id = pa.payroll_entry_id
      where pa.job_id is not null
      group by pa.job_id
    `,
    sql`select status from quotes where date >= ${start} and date <= ${end}`
  ]);
  const years = fyRangeFromEarliest(earliestRows[0]?.d);
  const laborByJob = Object.fromEntries(laborRows.map((r) => [r.job_id, Number(r.cost) || 0]));

  const totalInvoiced = jobs.reduce((s, j) => s + Number(j.amount_invoiced), 0);
  const totalLabor = jobs.reduce((s, j) => s + (laborByJob[j.id] || 0), 0);
  const margin = totalInvoiced - totalLabor;
  const completed = jobs.filter((j) => j.status === 'Complete').length;
  const completionRate = jobs.length > 0 ? (completed / jobs.length) * 100 : null;
  const fromQuote = jobs.filter((j) => j.quote_id).length;
  const sentOrBeyond = quotes.filter((q) => q.status !== 'Draft').length;

  const months = fyMonths(fy);
  const monthly = months.map((m) => {
    const key = `${m.year}-${m.month}`;
    const monthJobs = jobs.filter((j) => monthKey(j.created_date) === key);
    return {
      label: m.label,
      count: monthJobs.length,
      invoiced: monthJobs.reduce((s, j) => s + Number(j.amount_invoiced), 0),
      completed: monthJobs.filter((j) => j.status === 'Complete').length
    };
  });

  const byStatus = groupBy(jobs, 'status');
  const byPriority = groupBy(jobs, 'priority');
  const byType = groupBy(jobs, 'job_type');

  return (
    <>
      <h2 className="section-title">Jobs Statistics — {fyLabel(fy)}</h2>
      <StatisticsNav />
      <FySwitcher pathname="/statistics/jobs" years={years} current={fy} />

      <div className="cards">
        <div className="card"><div className="label">Total Jobs</div><div className="value">{jobs.length}</div></div>
        <div className="card good"><div className="label">Completed</div><div className="value">{completed}</div></div>
        <div className="card"><div className="label">Completion Rate</div><div className="value">{completionRate === null ? '—' : `${completionRate.toFixed(0)}%`}</div></div>
        <div className="card"><div className="label">Invoiced Value</div><div className="value">{money(totalInvoiced)}</div></div>
        <div className="card"><div className="label">Labor Cost</div><div className="value">{money(totalLabor)}</div></div>
        <div className="card"><div className="label">Net Margin</div><div className="value">{money(margin)}</div></div>
        <div className="card"><div className="label">From a Quote</div><div className="value">{fromQuote} / {jobs.length}</div></div>
      </div>

      <div className="panel">
        <h2 className="section-title">Jobs by Month</h2>
        <table>
          <thead><tr><th>Month</th><th className="num">Jobs</th><th className="num">Completed</th><th className="num">Invoiced</th></tr></thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.label}>
                <td>{m.label}</td>
                <td className="num">{m.count}</td>
                <td className="num">{m.completed}</td>
                <td className="num">{money(m.invoiced)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2 className="section-title">By Status</h2>
          <StatBars rows={byStatus} />
        </div>
        <div className="panel">
          <h2 className="section-title">By Priority</h2>
          <StatBars rows={byPriority} />
        </div>
      </div>

      <div className="panel">
        <h2 className="section-title">By Job Type / Service</h2>
        <StatBars rows={byType} formatValue={(r) => `${r.count} · ${money(r.value)}`} />
      </div>

      <div className="panel">
        <h2 className="section-title">Quotes This Year</h2>
        <p className="small-note">
          {quotes.length} quotes created this financial year ({sentOrBeyond} sent or further along) — {fromQuote} job{fromQuote === 1 ? '' : 's'} this year originated from a quote.
        </p>
      </div>
    </>
  );
}
