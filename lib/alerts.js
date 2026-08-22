import { sql } from './db';
import { money, sydneyToday } from './format';

// Everything in the database that has a date attached and needs chasing,
// collected into one list for the dashboard's Needs Attention panel and the
// nav badge count.
//
// The app already stored all of this — compliance retest dates, licence and
// insurance expiries, unpaid balances, quotes going cold — but nothing ever
// surfaced it, so it only got noticed when someone happened to open the
// right page. This module is the "chase me" layer over the existing data;
// it adds no new tables and writes nothing.
//
// Each alert is { id, severity, category, title, detail, href, date }.
// severity is 'overdue' (already lapsed — red) or 'soon' (approaching —
// amber), which is what the panel sorts and colours by.

// Windows chosen to match what the Compliance page already warns at, so a
// date flagged there and a date flagged here never disagree.
const RETEST_SOON_DAYS = 30;
const LICENCE_SOON_DAYS = 60;
// A quote sitting in Draft/Sent this long without an answer, matching
// quotes-app.js's own STALE_DAYS.
const QUOTE_STALE_DAYS = 10;
// Invoice aging. No payment-terms number is stored (business_settings keeps
// terms as free text for printing), so these are the conventional trade
// buckets rather than something read from settings.
const INVOICE_SOON_DAYS = 14;
const INVOICE_OVERDUE_DAYS = 30;

function daysUntil(date, todayStr) {
  if (!date) return null;
  const d = String(date).slice(0, 10);
  return Math.round((new Date(d + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000);
}

// "in 12 days" / "14 days ago" / "today" — the panel leads with this because
// it's the part that actually tells you how urgent something is.
function relative(days) {
  if (days === null) return '';
  if (days === 0) return 'today';
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`;
  const n = Math.abs(days);
  return `${n} day${n === 1 ? '' : 's'} ago`;
}

function expiryAlert({ id, category, title, date, href, soonDays, todayStr, overdueWord = 'expired', soonWord = 'expires' }) {
  const days = daysUntil(date, todayStr);
  if (days === null) return null;
  if (days < 0) return { id, severity: 'overdue', category, title, detail: `${overdueWord} ${relative(days)}`, href, date };
  if (days <= soonDays) return { id, severity: 'soon', category, title, detail: `${soonWord} ${relative(days)}`, href, date };
  return null;
}

// `fullAccess` gates the money-related alerts the same way the rest of the
// app does — an employee sees compliance and licence items (which live on
// pages already open to them) but never balances or quote values.
export async function loadAlerts({ fullAccess }) {
  const todayStr = sydneyToday();

  const [compliance, employees, businessRows, jobs, quotes, contracts, pendingHours] = await Promise.all([
    sql`select id, type, reference_number, retest_due, client_id from compliance_records where retest_due is not null`,
    sql`select id, name, license_number, license_expiry from employees where status != 'Inactive' and license_expiry is not null`,
    sql`select * from business_settings where id = 1`,
    fullAccess
      ? sql`select id, job_number, client_name, amount_invoiced, amount_paid, status, completed_date, created_date from jobs where amount_invoiced > amount_paid`
      : Promise.resolve([]),
    fullAccess
      ? sql`select id, quote_number, client_name, date, status, total from quotes where status in ('Draft', 'Sent')`
      : Promise.resolve([]),
    fullAccess
      ? sql`select id, title, client_name, next_due_date from maintenance_contracts where status = 'Active'`
      : Promise.resolve([]),
    // Surfaces the review step added by the hours-to-payroll bridge, so a
    // crew member's logged hours can't sit unreviewed indefinitely.
    // Tolerates the column not existing yet (see the same guard on
    // document_sends reads) so an un-migrated database still loads.
    fullAccess
      ? sql`select count(*)::int as n from job_hour_logs where status = 'Pending'`.catch(() => [{ n: 0 }])
      : Promise.resolve([{ n: 0 }])
  ]);

  const alerts = [];
  const business = businessRows[0] || {};

  for (const c of compliance) {
    const a = expiryAlert({
      id: `compliance-${c.id}`,
      category: 'Compliance',
      title: `${c.type}${c.reference_number ? ` ${c.reference_number}` : ''} retest`,
      date: c.retest_due,
      href: '/compliance',
      soonDays: RETEST_SOON_DAYS,
      todayStr,
      overdueWord: 'was due',
      soonWord: 'due'
    });
    if (a) alerts.push(a);
  }

  for (const e of employees) {
    const a = expiryAlert({
      id: `employee-licence-${e.id}`,
      category: 'Licence',
      title: `${e.name} — electrical licence`,
      date: e.license_expiry,
      href: '/compliance',
      soonDays: LICENCE_SOON_DAYS,
      todayStr
    });
    if (a) alerts.push(a);
  }

  const businessExpiries = [
    { key: 'contractor_license_expiry', title: 'Contractor licence' },
    { key: 'public_liability_expiry', title: 'Public liability insurance' },
    { key: 'workers_comp_expiry', title: 'Workers comp insurance' }
  ];
  for (const b of businessExpiries) {
    const a = expiryAlert({
      id: `business-${b.key}`,
      category: 'Business',
      title: b.title,
      date: business[b.key],
      href: '/compliance',
      soonDays: LICENCE_SOON_DAYS,
      todayStr
    });
    if (a) alerts.push(a);
  }

  // Aged from completion where there is one, since that's when the customer
  // actually became liable to pay; otherwise from when the job was raised.
  for (const j of jobs) {
    const balance = Number(j.amount_invoiced) - Number(j.amount_paid);
    if (balance <= 0) continue;
    const since = j.completed_date || j.created_date;
    const age = -(daysUntil(since, todayStr) ?? 0);
    if (age < INVOICE_SOON_DAYS) continue;
    alerts.push({
      id: `invoice-${j.id}`,
      severity: age >= INVOICE_OVERDUE_DAYS ? 'overdue' : 'soon',
      category: 'Unpaid',
      title: `${j.job_number} — ${j.client_name}`,
      detail: `${money(balance)} outstanding, invoiced ${relative(-age)}`,
      href: `/jobs/${j.id}`,
      date: since
    });
  }

  for (const q of quotes) {
    const age = -(daysUntil(q.date, todayStr) ?? 0);
    if (age < QUOTE_STALE_DAYS) continue;
    alerts.push({
      id: `quote-${q.id}`,
      severity: 'soon',
      category: 'Follow-up',
      title: `${q.quote_number} — ${q.client_name}`,
      detail: `${q.status} with no response, sent ${relative(-age)}`,
      href: `/quotes/${q.id}`,
      date: q.date
    });
  }

  for (const c of contracts) {
    const a = expiryAlert({
      id: `contract-${c.id}`,
      category: 'Maintenance',
      title: `${c.title || 'Service'} — ${c.client_name}`,
      date: c.next_due_date,
      href: '/maintenance',
      soonDays: RETEST_SOON_DAYS,
      todayStr,
      overdueWord: 'was due',
      soonWord: 'due'
    });
    if (a) alerts.push(a);
  }

  const hoursWaiting = pendingHours[0]?.n || 0;
  if (hoursWaiting > 0) {
    alerts.push({
      id: 'hours-pending',
      severity: 'soon',
      category: 'Payroll',
      title: `${hoursWaiting} hour ${hoursWaiting === 1 ? 'entry' : 'entries'} awaiting review`,
      detail: 'Approve them to pull into a pay run',
      href: '/payroll',
      date: null
    });
  }

  // Overdue first, then whatever is closest to its date.
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'overdue' ? -1 : 1;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return String(a.date).localeCompare(String(b.date));
  });

  return alerts;
}

// Just the overdue count, for the nav badge.
//
// Deliberately a separate one-round-trip query rather than
// `(await loadAlerts(...)).filter(...)`: the badge renders in the app
// layout, so it runs on *every* page navigation, and loadAlerts costs seven
// round trips to the database. The thresholds below are the 'overdue' half
// of the rules above — the 'soon' amber cases are intentionally not counted,
// since a badge should mean "something has actually lapsed", not "something
// is coming up".
export async function countOverdueAlerts(todayStr = sydneyToday()) {
  const rows = await sql`
    select (
        (select count(*) from compliance_records where retest_due is not null and retest_due < ${todayStr})
      + (select count(*) from employees where status != 'Inactive' and license_expiry is not null and license_expiry < ${todayStr})
      + (select count(*) from business_settings where id = 1 and contractor_license_expiry is not null and contractor_license_expiry < ${todayStr})
      + (select count(*) from business_settings where id = 1 and public_liability_expiry is not null and public_liability_expiry < ${todayStr})
      + (select count(*) from business_settings where id = 1 and workers_comp_expiry is not null and workers_comp_expiry < ${todayStr})
      + (select count(*) from jobs where amount_invoiced > amount_paid
           and coalesce(completed_date, created_date) < ${todayStr}::date - ${INVOICE_OVERDUE_DAYS})
      + (select count(*) from maintenance_contracts where status = 'Active' and next_due_date < ${todayStr})
    )::int as n
  `;
  return rows[0]?.n || 0;
}
