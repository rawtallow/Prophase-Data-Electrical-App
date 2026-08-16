import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import { serializeDates, toDateInputValue } from '../../../lib/format';

export const runtime = 'nodejs';

const DATE_FIELDS = ['date'];

// Cross-job listing of self-logged hours, filtered by query params — the
// Payroll page's Hours sub-tab uses ?status=Pending for the review queue,
// and the New Pay Run modal uses ?employeeId=&status=Approved&from=&to= to
// pull an employee's already-reviewed hours into a pay run. Same
// viewPayroll gate as the rest of Payroll, since this is effectively part
// of that workflow even though the underlying rows live on jobs.
//
// Filtered in JS rather than building a conditional SQL WHERE, matching
// this codebase's convention elsewhere (see payroll-app.js's own
// payFilter) — the table stays small for a business this size, so there's
// no real cost to fetching the join once and narrowing it here.
export async function GET(req) {
  const session = await getSession();
  if (!session || !CAN.viewPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const employeeId = searchParams.get('employeeId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const rows = await sql`
    select h.*, j.job_number, j.client_name
    from job_hour_logs h
    join jobs j on j.id = h.job_id
    order by h.date desc, h.created_at desc
  `;

  const filtered = rows.filter((r) => {
    if (status && r.status !== status) return false;
    if (employeeId && r.employee_id !== employeeId) return false;
    // r.date arrives as a raw Date object from the driver (not yet run
    // through serializeDates below) — normalize to yyyy-mm-dd before
    // comparing against the from/to query strings, since a raw Date
    // compared to a string via </> silently coerces to NaN instead of
    // throwing, which would make these filters no-ops.
    const d = toDateInputValue(r.date);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });

  return NextResponse.json(filtered.map((r) => serializeDates(r, DATE_FIELDS)));
}
