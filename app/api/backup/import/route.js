import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

// Full destructive restore: wipes every operational table (NOT the users/accounts
// table) and reloads it from a previously exported backup file. Confirmation
// happens client-side before this is ever called.
export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.backup(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const data = await req.json();
  const need = ['clients', 'assets', 'quotes', 'quoteLineItems', 'jobs', 'employees', 'payrollEntries', 'payrollAllocations', 'ownerDraws', 'parts'];
  for (const k of need) {
    if (!Array.isArray(data[k])) return NextResponse.json({ error: `Backup file is missing "${k}"` }, { status: 400 });
  }

  try {
    // Delete children first to satisfy foreign keys.
    await sql`delete from payroll_allocations`;
    await sql`delete from payroll_entries`;
    await sql`delete from quote_line_items`;
    await sql`delete from jobs`;
    await sql`delete from quotes`;
    await sql`delete from assets`;
    await sql`delete from employees`;
    await sql`delete from owner_draws`;
    await sql`delete from parts`;
    await sql`delete from clients`;

    for (const c of data.clients) {
      await sql`insert into clients (id, name, phone, email, address, created_at) values (${c.id}, ${c.name}, ${c.phone}, ${c.email}, ${c.address}, ${c.created_at})`;
    }
    for (const e of data.employees) {
      await sql`insert into employees (id, name, phone, hourly_rate, status) values (${e.id}, ${e.name}, ${e.phone}, ${e.hourly_rate}, ${e.status})`;
    }
    for (const q of data.quotes) {
      await sql`
        insert into quotes (id, quote_number, date, client_id, client_name, client_phone, client_email, client_address,
          job_description, tax_rate, discount, subtotal, tax, total, status, notes, created_at)
        values (${q.id}, ${q.quote_number}, ${q.date}, ${q.client_id}, ${q.client_name}, ${q.client_phone}, ${q.client_email},
          ${q.client_address}, ${q.job_description}, ${q.tax_rate}, ${q.discount}, ${q.subtotal}, ${q.tax}, ${q.total}, ${q.status}, ${q.notes}, ${q.created_at})
      `;
    }
    for (const a of data.assets) {
      await sql`
        insert into assets (id, client_id, name, model, serial, install_date, warranty_expiry, notes, created_at)
        values (${a.id}, ${a.client_id}, ${a.name}, ${a.model}, ${a.serial}, ${a.install_date}, ${a.warranty_expiry}, ${a.notes}, ${a.created_at})
      `;
    }
    for (const li of data.quoteLineItems) {
      await sql`
        insert into quote_line_items (id, quote_id, description, qty, price, sort_order)
        values (${li.id}, ${li.quote_id}, ${li.description}, ${li.qty}, ${li.price}, ${li.sort_order})
      `;
    }
    for (const j of data.jobs) {
      await sql`
        insert into jobs (id, job_number, quote_id, client_id, client_name, job_description, scheduled_date, status,
          amount_invoiced, amount_paid, notes, created_date)
        values (${j.id}, ${j.job_number}, ${j.quote_id}, ${j.client_id}, ${j.client_name}, ${j.job_description}, ${j.scheduled_date},
          ${j.status}, ${j.amount_invoiced}, ${j.amount_paid}, ${j.notes}, ${j.created_date})
      `;
    }
    for (const pe of data.payrollEntries) {
      await sql`
        insert into payroll_entries (id, pay_number, employee_id, employee_name, hourly_rate, date_paid, period_start, period_end, gross_pay, net_pay, notes)
        values (${pe.id}, ${pe.pay_number}, ${pe.employee_id}, ${pe.employee_name}, ${pe.hourly_rate}, ${pe.date_paid}, ${pe.period_start}, ${pe.period_end}, ${pe.gross_pay}, ${pe.net_pay}, ${pe.notes})
      `;
    }
    for (const pa of data.payrollAllocations) {
      await sql`
        insert into payroll_allocations (id, payroll_entry_id, job_id, reg_hours, ot_hours)
        values (${pa.id}, ${pa.payroll_entry_id}, ${pa.job_id}, ${pa.reg_hours}, ${pa.ot_hours})
      `;
    }
    for (const d of data.ownerDraws) {
      await sql`insert into owner_draws (id, date, amount, note) values (${d.id}, ${d.date}, ${d.amount}, ${d.note})`;
    }
    for (const p of data.parts) {
      await sql`
        insert into parts (id, name, sku, category, supplier, unit_cost, qty_on_hand, reorder_threshold, notes)
        values (${p.id}, ${p.name}, ${p.sku}, ${p.category}, ${p.supplier}, ${p.unit_cost}, ${p.qty_on_hand}, ${p.reorder_threshold}, ${p.notes})
      `;
    }
    if (Array.isArray(data.counters)) {
      for (const c of data.counters) {
        await sql`insert into counters (key, value) values (${c.key}, ${c.value}) on conflict (key) do update set value = ${c.value}`;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Restore failed partway through — data may be partially restored.' }, { status: 500 });
  }
}
