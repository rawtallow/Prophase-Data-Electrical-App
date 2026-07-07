import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

// Full destructive restore: wipes every operational table (NOT the users/accounts
// table) and reloads it from a previously exported backup file. Confirmation
// happens client-side before this is ever called.
//
// The whole restore runs inside a single database transaction — either every
// delete and insert succeeds, or none of them do and the existing data is
// left exactly as it was.
export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.backup(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const data = await req.json();
  const need = ['clients', 'assets', 'quotes', 'quoteLineItems', 'jobs', 'employees', 'payrollEntries', 'payrollAllocations', 'ownerDraws', 'parts'];
  for (const k of need) {
    if (!Array.isArray(data[k])) return NextResponse.json({ error: `Backup file is missing "${k}"` }, { status: 400 });
  }

  // Build the full list of queries without executing them (the neon driver's
  // tagged calls are lazy until awaited), then run them atomically.
  const queries = [
    // Delete children first to satisfy foreign keys.
    sql`delete from payroll_allocations`,
    sql`delete from payroll_entries`,
    sql`delete from quote_line_items`,
    sql`delete from jobs`,
    sql`delete from quotes`,
    sql`delete from assets`,
    sql`delete from employees`,
    sql`delete from owner_draws`,
    sql`delete from parts`,
    sql`delete from clients`,
    sql`delete from receipts`
  ];

  for (const c of data.clients) {
    queries.push(sql`insert into clients (id, name, phone, email, address, created_at) values (${c.id}, ${c.name}, ${c.phone}, ${c.email}, ${c.address}, ${c.created_at})`);
  }
  for (const e of data.employees) {
    queries.push(sql`insert into employees (id, name, phone, hourly_rate, status) values (${e.id}, ${e.name}, ${e.phone}, ${e.hourly_rate}, ${e.status})`);
  }
  for (const q of data.quotes) {
    queries.push(sql`
      insert into quotes (id, quote_number, date, client_id, client_name, client_phone, client_email, client_address,
        job_description, tax_rate, discount, subtotal, tax, total, status, notes, created_at)
      values (${q.id}, ${q.quote_number}, ${q.date}, ${q.client_id}, ${q.client_name}, ${q.client_phone}, ${q.client_email},
        ${q.client_address}, ${q.job_description}, ${q.tax_rate}, ${q.discount}, ${q.subtotal}, ${q.tax}, ${q.total}, ${q.status}, ${q.notes}, ${q.created_at})
    `);
  }
  for (const a of data.assets) {
    queries.push(sql`
      insert into assets (id, client_id, name, model, serial, install_date, warranty_expiry, notes, created_at)
      values (${a.id}, ${a.client_id}, ${a.name}, ${a.model}, ${a.serial}, ${a.install_date}, ${a.warranty_expiry}, ${a.notes}, ${a.created_at})
    `);
  }
  for (const li of data.quoteLineItems) {
    queries.push(sql`
      insert into quote_line_items (id, quote_id, description, qty, price, sort_order)
      values (${li.id}, ${li.quote_id}, ${li.description}, ${li.qty}, ${li.price}, ${li.sort_order})
    `);
  }
  for (const j of data.jobs) {
    queries.push(sql`
      insert into jobs (id, job_number, quote_id, client_id, client_name, job_description, scheduled_date, status,
        priority, job_type, amount_invoiced, amount_paid, notes, created_date)
      values (${j.id}, ${j.job_number}, ${j.quote_id}, ${j.client_id}, ${j.client_name}, ${j.job_description}, ${j.scheduled_date},
        ${j.status}, ${j.priority || 'Medium'}, ${j.job_type || 'Quoted Job'}, ${j.amount_invoiced}, ${j.amount_paid}, ${j.notes}, ${j.created_date})
    `);
  }
  for (const pe of data.payrollEntries) {
    queries.push(sql`
      insert into payroll_entries (id, pay_number, employee_id, employee_name, hourly_rate, date_paid, period_start, period_end, gross_pay, net_pay, notes)
      values (${pe.id}, ${pe.pay_number}, ${pe.employee_id}, ${pe.employee_name}, ${pe.hourly_rate}, ${pe.date_paid}, ${pe.period_start}, ${pe.period_end}, ${pe.gross_pay}, ${pe.net_pay}, ${pe.notes})
    `);
  }
  for (const pa of data.payrollAllocations) {
    queries.push(sql`
      insert into payroll_allocations (id, payroll_entry_id, job_id, reg_hours, ot_hours)
      values (${pa.id}, ${pa.payroll_entry_id}, ${pa.job_id}, ${pa.reg_hours}, ${pa.ot_hours})
    `);
  }
  for (const d of data.ownerDraws) {
    queries.push(sql`insert into owner_draws (id, date, amount, note) values (${d.id}, ${d.date}, ${d.amount}, ${d.note})`);
  }
  for (const p of data.parts) {
    queries.push(sql`
      insert into parts (id, name, sku, category, supplier, unit_cost, qty_on_hand, reorder_threshold, notes)
      values (${p.id}, ${p.name}, ${p.sku}, ${p.category}, ${p.supplier}, ${p.unit_cost}, ${p.qty_on_hand}, ${p.reorder_threshold}, ${p.notes})
    `);
  }
  if (Array.isArray(data.counters)) {
    for (const c of data.counters) {
      queries.push(sql`insert into counters (key, value) values (${c.key}, ${c.value}) on conflict (key) do update set value = ${c.value}`);
    }
  }
  if (Array.isArray(data.receipts)) {
    for (const r of data.receipts) {
      queries.push(sql`
        insert into receipts (id, vendor, purchase_date, amount, gst_amount, category, description, image_url, uploaded_by, created_at)
        values (${r.id}, ${r.vendor}, ${r.purchase_date}, ${r.amount}, ${r.gst_amount}, ${r.category}, ${r.description}, ${r.image_url}, ${r.uploaded_by}, ${r.created_at})
      `);
    }
  }

  try {
    await sql.transaction(queries);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Restore error:', err);
    return NextResponse.json(
      { error: 'Restore failed — no changes were made. Check the backup file and try again.' },
      { status: 500 }
    );
  }
}
