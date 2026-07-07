import { sql } from '../../../../lib/db';
import { money } from '../../../../lib/format';
import { fyBounds, fyMonths, fyRangeFromEarliest, fyLabel, currentFYStartYear } from '../../../../lib/financial-year';
import StatisticsNav from '../statistics-nav';
import FySwitcher from '../fy-switcher';

function monthKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${dt.getMonth()}`;
}

export default async function RevenueStatisticsPage({ searchParams }) {
  const fy = searchParams.fy ? Number(searchParams.fy) : currentFYStartYear();
  const { start, end } = fyBounds(fy);

  const [earliestRows, jobs, laborRows] = await Promise.all([
    sql`
      select min(d) as d from (
        select date as d from quotes
        union all select created_date from jobs
        union all select date_paid from payroll_entries
        union all select date from owner_draws
      ) x
    `,
    sql`select id, created_date, amount_invoiced, amount_paid from jobs where created_date >= ${start} and created_date <= ${end}`,
    sql`
      select pa.job_id, sum(pa.reg_hours * pe.hourly_rate + pa.ot_hours * pe.hourly_rate * 1.5) as cost
      from payroll_allocations pa
      join payroll_entries pe on pe.id = pa.payroll_entry_id
      where pa.job_id is not null
      group by pa.job_id
    `
  ]);
  const years = fyRangeFromEarliest(earliestRows[0]?.d);
  const laborByJob = Object.fromEntries(laborRows.map((r) => [r.job_id, Number(r.cost) || 0]));

  const totalInvoiced = jobs.reduce((s, j) => s + Number(j.amount_invoiced), 0);
  const totalCollected = jobs.reduce((s, j) => s + Number(j.amount_paid), 0);
  const outstanding = jobs.reduce((s, j) => s + Math.max(Number(j.amount_invoiced) - Number(j.amount_paid), 0), 0);
  const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : null;
  const totalLabor = jobs.reduce((s, j) => s + (laborByJob[j.id] || 0), 0);
  const margin = totalInvoiced - totalLabor;

  const months = fyMonths(fy);
  const monthly = months.map((m) => {
    const key = `${m.year}-${m.month}`;
    const monthJobs = jobs.filter((j) => monthKey(j.created_date) === key);
    const invoiced = monthJobs.reduce((s, j) => s + Number(j.amount_invoiced), 0);
    const collected = monthJobs.reduce((s, j) => s + Number(j.amount_paid), 0);
    const labor = monthJobs.reduce((s, j) => s + (laborByJob[j.id] || 0), 0);
    return { label: m.label, invoiced, collected, outstanding: invoiced - collected, margin: invoiced - labor };
  });

  return (
    <>
      <h2 className="section-title">Revenue Statistics — {fyLabel(fy)}</h2>
      <StatisticsNav />
      <FySwitcher pathname="/statistics/revenue" years={years} current={fy} />

      <div className="cards">
        <div className="card"><div className="label">Total Invoiced</div><div className="value">{money(totalInvoiced)}</div></div>
        <div className="card good"><div className="label">Total Collected</div><div className="value">{money(totalCollected)}</div></div>
        <div className={`card${outstanding > 0 ? ' warn' : ''}`}><div className="label">Outstanding</div><div className="value">{money(outstanding)}</div></div>
        <div className="card"><div className="label">Collection Rate</div><div className="value">{collectionRate === null ? '—' : `${collectionRate.toFixed(0)}%`}</div></div>
        <div className="card"><div className="label">Net Margin (after labor)</div><div className="value">{money(margin)}</div></div>
      </div>

      <div className="panel">
        <h2 className="section-title">Revenue by Month</h2>
        <table>
          <thead>
            <tr>
              <th>Month</th><th className="num">Invoiced</th><th className="num">Collected</th>
              <th className="num">Outstanding</th><th className="num">Margin</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.label}>
                <td>{m.label}</td>
                <td className="num">{money(m.invoiced)}</td>
                <td className="num">{money(m.collected)}</td>
                <td className="num" style={{ color: m.outstanding > 0 ? 'var(--red)' : 'var(--green)' }}>{money(m.outstanding)}</td>
                <td className="num" style={{ color: m.margin >= 0 ? 'var(--green)' : 'var(--red)' }}>{money(m.margin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
