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
    values[k] = (values[k] || 0) + Number(item.total);
  }
  return Object.keys(counts)
    .map((k) => ({ label: k, count: counts[k], value: values[k] }))
    .sort((a, b) => b.count - a.count);
}

export default async function QuotesStatisticsPage({ searchParams }) {
  const fy = searchParams.fy ? Number(searchParams.fy) : currentFYStartYear();
  const { start, end } = fyBounds(fy);

  const [earliestRows, quotes, jobsFromQuotes] = await Promise.all([
    sql`
      select min(d) as d from (
        select date as d from quotes
        union all select created_date from jobs
        union all select date_paid from payroll_entries
        union all select date from owner_draws
      ) x
    `,
    sql`select date, status, approval_status, total from quotes where date >= ${start} and date <= ${end}`,
    sql`select quote_id from jobs where quote_id is not null and created_date >= ${start} and created_date <= ${end}`
  ]);
  const years = fyRangeFromEarliest(earliestRows[0]?.d);

  const totalValue = quotes.reduce((s, q) => s + Number(q.total), 0);
  const accepted = quotes.filter((q) => q.status === 'Accepted');
  const declined = quotes.filter((q) => q.status === 'Declined').length;
  const sent = quotes.filter((q) => q.status !== 'Draft').length;
  const acceptedValue = accepted.reduce((s, q) => s + Number(q.total), 0);
  const acceptanceRate = accepted.length + declined > 0 ? (accepted.length / (accepted.length + declined)) * 100 : null;
  const avgValue = quotes.length > 0 ? totalValue / quotes.length : 0;
  const pendingApproval = quotes.filter((q) => q.approval_status === 'Pending Approval').length;
  const convertedToJob = new Set(jobsFromQuotes.map((j) => j.quote_id)).size;

  const months = fyMonths(fy);
  const monthly = months.map((m) => {
    const key = `${m.year}-${m.month}`;
    const monthQuotes = quotes.filter((q) => monthKey(q.date) === key);
    return {
      label: m.label,
      count: monthQuotes.length,
      value: monthQuotes.reduce((s, q) => s + Number(q.total), 0)
    };
  });

  const byStatus = groupBy(quotes, 'status');
  const byApproval = groupBy(quotes, 'approval_status');

  const funnel = [
    { label: 'Draft', count: quotes.filter((q) => q.status === 'Draft').length },
    { label: 'Sent', count: sent },
    { label: 'Accepted', count: accepted.length },
    { label: 'Converted to Job', count: convertedToJob }
  ];

  return (
    <>
      <h2 className="section-title">Quotes Statistics — {fyLabel(fy)}</h2>
      <StatisticsNav />
      <FySwitcher pathname="/statistics/quotes" years={years} current={fy} />

      <div className="cards">
        <div className="card"><div className="label">Total Quotes</div><div className="value">{quotes.length}</div></div>
        <div className="card"><div className="label">Total Quoted Value</div><div className="value">{money(totalValue)}</div></div>
        <div className="card good"><div className="label">Accepted Value</div><div className="value">{money(acceptedValue)}</div></div>
        <div className="card"><div className="label">Acceptance Rate</div><div className="value">{acceptanceRate === null ? '—' : `${acceptanceRate.toFixed(0)}%`}</div></div>
        <div className="card"><div className="label">Average Quote Value</div><div className="value">{money(avgValue)}</div></div>
        <div className={`card${pendingApproval ? ' warn' : ''}`}><div className="label">Pending Approval Now</div><div className="value">{pendingApproval}</div></div>
      </div>

      <div className="panel">
        <h2 className="section-title">Quotes by Month</h2>
        <table>
          <thead><tr><th>Month</th><th className="num">Quotes</th><th className="num">Total Value</th></tr></thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.label}>
                <td>{m.label}</td>
                <td className="num">{m.count}</td>
                <td className="num">{money(m.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2 className="section-title">By Status</h2>
          <StatBars rows={byStatus} formatValue={(r) => `${r.count} · ${money(r.value)}`} />
        </div>
        <div className="panel">
          <h2 className="section-title">By Approval</h2>
          <StatBars rows={byApproval} />
        </div>
      </div>

      <div className="panel">
        <h2 className="section-title">Conversion Funnel</h2>
        <StatBars rows={funnel} />
      </div>
    </>
  );
}
