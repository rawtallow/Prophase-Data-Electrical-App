import Link from 'next/link';
import { getSession } from '../../../../lib/auth';
import { sql } from '../../../../lib/db';
import { toDateInputValue, slug } from '../../../../lib/format';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_RE = /^\d{4}-\d{2}$/;

function pad2(n) { return String(n).padStart(2, '0'); }
function monthKey(year, month1based) { return `${year}-${pad2(month1based)}`; }
function shiftMonth(year, month1based, delta) {
  const d = new Date(year, month1based - 1 + delta, 1);
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}

export default async function JobCalendarPage({ searchParams }) {
  const session = await getSession();

  const requested = searchParams?.month;
  const [year, month] = MONTH_RE.test(requested)
    ? requested.split('-').map(Number)
    : [new Date().getFullYear(), new Date().getMonth() + 1];

  // Jobs without a scheduled_date never appear on a calendar — fetching only
  // the ones that do keeps this small regardless of how the Job Log grows.
  const jobs = await sql`
    select job_number, client_name, priority, status, scheduled_date
    from jobs
    where scheduled_date is not null
    order by scheduled_date asc, job_number asc
  `;

  const jobsByDay = {};
  for (const j of jobs) {
    const key = toDateInputValue(j.scheduled_date);
    (jobsByDay[key] ||= []).push(j);
  }

  // Always a 6-week (42-cell) grid so the layout height doesn't jump between
  // months — the first cell is the Monday on/before the 1st of the month.
  const firstOfMonth = new Date(year, month - 1, 1);
  const leadingDays = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month - 1, 1 - leadingDays);
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const todayKey = toDateInputValue(new Date());
  const monthLabel = firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const thisMonthKey = monthKey(new Date().getFullYear(), new Date().getMonth() + 1);
  const currentKey = monthKey(year, month);

  return (
    <>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Job Calendar</h2>
        <div className="filters">
          <Link className="btn ghost sm" href={`/jobs/calendar?month=${shiftMonth(year, month, -1)}`}>&larr; Prev</Link>
          <span style={{ fontWeight: 700, minWidth: 150, textAlign: 'center' }}>{monthLabel}</span>
          <Link className="btn ghost sm" href={`/jobs/calendar?month=${shiftMonth(year, month, 1)}`}>Next &rarr;</Link>
          {currentKey !== thisMonthKey && <Link className="btn ghost sm" href="/jobs/calendar">Today</Link>}
          <Link className="btn amber sm" href="/jobs">List View</Link>
        </div>
      </div>

      <div className="panel cal-panel">
        <div className="cal-weekdays">
          {WEEKDAYS.map((w) => <div key={w} className="cal-weekday">{w}</div>)}
        </div>
        <div className="cal-grid">
          {days.map((d) => {
            const key = toDateInputValue(d);
            const inMonth = d.getMonth() === month - 1;
            const dayJobs = jobsByDay[key] || [];
            return (
              <div key={key} className={`cal-cell${inMonth ? '' : ' out'}${key === todayKey ? ' today' : ''}`}>
                <div className="cal-cell-head">
                  <span className="cal-daynum">{d.getDate()}</span>
                  <span className="cal-daynum-weekday">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                </div>
                <div className="cal-jobs">
                  {dayJobs.map((j) => (
                    <div key={j.job_number} className={`cal-job cal-job-${slug(j.priority)}`} title={`${j.job_number} — ${j.client_name} (${j.status})`}>
                      <span className="cal-job-num">{j.job_number}</span> {j.client_name}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {jobs.length === 0 && <div className="empty">No jobs have a scheduled date yet.</div>}
      </div>
    </>
  );
}
