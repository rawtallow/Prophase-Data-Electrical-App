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

export default async function PayrollStatisticsPage({ searchParams }) {
  const fy = searchParams.fy ? Number(searchParams.fy) : currentFYStartYear();
  const { start, end } = fyBounds(fy);

  const [earliestRows, entries, allocations, draws] = await Promise.all([
    sql`
      select min(d) as d from (
        select date as d from quotes
        union all select created_date from jobs
        union all select date_paid from payroll_entries
        union all select date from owner_draws
      ) x
    `,
    sql`select id, date_paid, employee_name, gross_pay, net_pay from payroll_entries where date_paid >= ${start} and date_paid <= ${end}`,
    sql`
      select pa.payroll_entry_id, pa.reg_hours, pa.ot_hours, pe.employee_name, pe.hourly_rate, pe.date_paid
      from payroll_allocations pa
      join payroll_entries pe on pe.id = pa.payroll_entry_id
      where pe.date_paid >= ${start} and pe.date_paid <= ${end}
    `,
    sql`select date, amount from owner_draws where date >= ${start} and date <= ${end}`
  ]);
  const years = fyRangeFromEarliest(earliestRows[0]?.d);

  const totalGross = entries.reduce((s, e) => s + Number(e.gross_pay), 0);
  const totalNet = entries.reduce((s, e) => s + Number(e.net_pay), 0);
  const totalDraws = draws.reduce((s, d) => s + Number(d.amount), 0);
  const totalReg = allocations.reduce((s, a) => s + Number(a.reg_hours), 0);
  const totalOt = allocations.reduce((s, a) => s + Number(a.ot_hours), 0);

  const months = fyMonths(fy);
  const monthly = months.map((m) => {
    const key = `${m.year}-${m.month}`;
    const monthEntries = entries.filter((e) => monthKey(e.date_paid) === key);
    const monthDraws = draws.filter((d) => monthKey(d.date) === key);
    return {
      label: m.label,
      gross: monthEntries.reduce((s, e) => s + Number(e.gross_pay), 0),
      net: monthEntries.reduce((s, e) => s + Number(e.net_pay), 0),
      draws: monthDraws.reduce((s, d) => s + Number(d.amount), 0)
    };
  });

  const byEmployee = {};
  for (const a of allocations) {
    const cost = Number(a.reg_hours) * Number(a.hourly_rate) + Number(a.ot_hours) * Number(a.hourly_rate) * 1.5;
    if (!byEmployee[a.employee_name]) byEmployee[a.employee_name] = { label: a.employee_name, count: 0, hours: 0 };
    byEmployee[a.employee_name].count += cost;
    byEmployee[a.employee_name].hours += Number(a.reg_hours) + Number(a.ot_hours);
  }
  const employeeRows = Object.values(byEmployee).sort((a, b) => b.count - a.count);

  const hoursRows = [
    { label: 'Regular Hours', count: totalReg },
    { label: 'Overtime Hours', count: totalOt }
  ];

  return (
    <>
      <h2 className="section-title">Payroll Statistics — {fyLabel(fy)}</h2>
      <StatisticsNav />
      <FySwitcher pathname="/statistics/payroll" years={years} current={fy} />

      <div className="cards">
        <div className="card"><div className="label">Total Gross Pay</div><div className="value">{money(totalGross)}</div></div>
        <div className="card"><div className="label">Total Net Pay</div><div className="value">{money(totalNet)}</div></div>
        <div className="card"><div className="label">Owner Draws</div><div className="value">{money(totalDraws)}</div></div>
        <div className="card"><div className="label">Regular Hours</div><div className="value">{totalReg.toFixed(1)}</div></div>
        <div className="card"><div className="label">Overtime Hours</div><div className="value">{totalOt.toFixed(1)}</div></div>
      </div>

      <div className="panel">
        <h2 className="section-title">Payroll by Month</h2>
        <table>
          <thead><tr><th>Month</th><th className="num">Gross Pay</th><th className="num">Net Pay</th><th className="num">Owner Draws</th></tr></thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.label}>
                <td>{m.label}</td>
                <td className="num">{money(m.gross)}</td>
                <td className="num">{money(m.net)}</td>
                <td className="num">{money(m.draws)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2 className="section-title">Labor Cost by Employee</h2>
          <StatBars rows={employeeRows.map((r) => ({ label: r.label, count: r.count }))} formatValue={(r) => money(r.count)} />
        </div>
        <div className="panel">
          <h2 className="section-title">Regular vs Overtime Hours</h2>
          <StatBars rows={hoursRows} formatValue={(r) => `${r.count.toFixed(1)} hrs`} />
        </div>
      </div>
    </>
  );
}
