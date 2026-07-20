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
    // Delete children first to satisfy foreign keys. compliance_records
    // references jobs/clients/employees, so it must go before all three;
    // maintenance_contracts references clients, so before clients too.
    // purchase_order_line_items/purchase_orders reference jobs and suppliers,
    // so both must go before jobs and before suppliers. The three
    // purchase_order_invoice* tables reference purchase_orders (and each
    // other), so they must go before purchase_orders too.
    sql`delete from compliance_records`,
    sql`delete from maintenance_contracts`,
    sql`delete from purchase_order_invoice_payments`,
    sql`delete from purchase_order_invoice_line_items`,
    sql`delete from purchase_order_invoices`,
    sql`delete from purchase_order_line_items`,
    sql`delete from purchase_orders`,
    sql`delete from payroll_allocations`,
    sql`delete from payroll_entries`,
    sql`delete from quote_line_items`,
    sql`delete from job_line_items`,
    sql`delete from job_payments`,
    sql`delete from job_assignees`,
    sql`delete from job_documents`,
    sql`delete from job_activity`,
    sql`delete from jobs`,
    sql`delete from quotes`,
    sql`delete from assets`,
    sql`delete from employees`,
    sql`delete from owner_draws`,
    sql`delete from parts`,
    sql`delete from suppliers`,
    sql`delete from clients`,
    sql`delete from receipts`
  ];

  for (const c of data.clients) {
    queries.push(sql`
      insert into clients (id, name, phone, email, address, lead_source, created_at)
      values (${c.id}, ${c.name}, ${c.phone}, ${c.email}, ${c.address}, ${c.lead_source || ''}, ${c.created_at})
    `);
  }
  for (const e of data.employees) {
    queries.push(sql`
      insert into employees (id, name, phone, hourly_rate, status, license_number, license_expiry)
      values (${e.id}, ${e.name}, ${e.phone}, ${e.hourly_rate}, ${e.status}, ${e.license_number || ''}, ${e.license_expiry || null})
    `);
  }
  for (const q of data.quotes) {
    queries.push(sql`
      insert into quotes (id, quote_number, date, client_id, client_name, client_phone, client_email, client_address,
        job_description, tax_rate, discount, subtotal, tax, total, status, notes, created_at,
        approval_status, created_by_id, created_by, approval_note, reviewed_by)
      values (${q.id}, ${q.quote_number}, ${q.date}, ${q.client_id}, ${q.client_name}, ${q.client_phone}, ${q.client_email},
        ${q.client_address}, ${q.job_description}, ${q.tax_rate}, ${q.discount}, ${q.subtotal}, ${q.tax}, ${q.total}, ${q.status}, ${q.notes}, ${q.created_at},
        ${q.approval_status || 'Approved'}, ${q.created_by_id || null}, ${q.created_by || ''}, ${q.approval_note || ''}, ${q.reviewed_by || ''})
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
      insert into jobs (id, job_number, quote_id, client_id, asset_id, client_name, job_title, job_description, site_address,
        scheduled_date, start_date, estimated_hours, status, priority, job_type, assigned_to_id, assigned_to_name,
        amount_invoiced, amount_paid, notes, customer_notes, created_date, updated_at, completed_date)
      values (${j.id}, ${j.job_number}, ${j.quote_id}, ${j.client_id}, ${j.asset_id || null}, ${j.client_name}, ${j.job_title || ''}, ${j.job_description}, ${j.site_address || ''},
        ${j.scheduled_date}, ${j.start_date || null}, ${j.estimated_hours || null}, ${j.status}, ${j.priority || 'Medium'}, ${j.job_type || 'Quoted Job'}, ${j.assigned_to_id || null}, ${j.assigned_to_name || ''},
        ${j.amount_invoiced}, ${j.amount_paid}, ${j.notes}, ${j.customer_notes || ''}, ${j.created_date}, ${j.updated_at || null}, ${j.completed_date || null})
    `);
  }
  // Optional — older backups won't have these; all four need the jobs loop
  // above to have run first (FK on job_id).
  if (Array.isArray(data.jobLineItems)) {
    for (const li of data.jobLineItems) {
      queries.push(sql`
        insert into job_line_items (id, job_id, description, qty, price, sort_order)
        values (${li.id}, ${li.job_id}, ${li.description}, ${li.qty}, ${li.price}, ${li.sort_order})
      `);
    }
  }
  if (Array.isArray(data.jobPayments)) {
    for (const p of data.jobPayments) {
      queries.push(sql`
        insert into job_payments (id, job_id, date, amount, method, note, created_by, created_at)
        values (${p.id}, ${p.job_id}, ${p.date}, ${p.amount}, ${p.method || ''}, ${p.note || ''}, ${p.created_by || ''}, ${p.created_at})
      `);
    }
  }
  if (Array.isArray(data.jobAssignees)) {
    for (const a of data.jobAssignees) {
      queries.push(sql`
        insert into job_assignees (id, job_id, employee_id, employee_name)
        values (${a.id}, ${a.job_id}, ${a.employee_id}, ${a.employee_name || ''})
      `);
    }
  }
  if (Array.isArray(data.jobDocuments)) {
    for (const d of data.jobDocuments) {
      queries.push(sql`
        insert into job_documents (id, job_id, label, category, file_url, uploaded_by, created_at)
        values (${d.id}, ${d.job_id}, ${d.label || ''}, ${d.category || 'Photo'}, ${d.file_url}, ${d.uploaded_by || ''}, ${d.created_at})
      `);
    }
  }
  if (Array.isArray(data.jobActivity)) {
    for (const a of data.jobActivity) {
      queries.push(sql`
        insert into job_activity (id, job_id, type, message, created_by, created_at)
        values (${a.id}, ${a.job_id}, ${a.type || 'note'}, ${a.message || ''}, ${a.created_by || ''}, ${a.created_at})
      `);
    }
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
  if (Array.isArray(data.complianceRecords)) {
    for (const cr of data.complianceRecords) {
      queries.push(sql`
        insert into compliance_records (id, type, job_id, client_id, employee_id, record_date, reference_number, result, retest_due, description, file_url, notes, uploaded_by, created_at)
        values (${cr.id}, ${cr.type}, ${cr.job_id}, ${cr.client_id}, ${cr.employee_id}, ${cr.record_date}, ${cr.reference_number}, ${cr.result}, ${cr.retest_due}, ${cr.description}, ${cr.file_url}, ${cr.notes}, ${cr.uploaded_by}, ${cr.created_at})
      `);
    }
  }
  if (Array.isArray(data.maintenanceContracts)) {
    for (const mc of data.maintenanceContracts) {
      queries.push(sql`
        insert into maintenance_contracts (id, client_id, client_name, title, description, frequency, start_date, next_due_date, amount, status, notes, created_by, created_at)
        values (${mc.id}, ${mc.client_id}, ${mc.client_name}, ${mc.title}, ${mc.description || ''}, ${mc.frequency || 'Quarterly'},
          ${mc.start_date}, ${mc.next_due_date}, ${mc.amount || 0}, ${mc.status || 'Active'}, ${mc.notes || ''}, ${mc.created_by || ''}, ${mc.created_at})
      `);
    }
  }
  if (Array.isArray(data.suppliers)) {
    for (const s of data.suppliers) {
      queries.push(sql`
        insert into suppliers (id, name, account_number, contact_name, phone, email, address, payment_terms, portal_url, notes, created_at)
        values (${s.id}, ${s.name}, ${s.account_number || ''}, ${s.contact_name || ''}, ${s.phone || ''}, ${s.email || ''}, ${s.address || ''}, ${s.payment_terms || ''}, ${s.portal_url || ''}, ${s.notes || ''}, ${s.created_at})
      `);
    }
  }
  // Needs suppliers and jobs already inserted (both loops run earlier above).
  if (Array.isArray(data.purchaseOrders)) {
    for (const po of data.purchaseOrders) {
      queries.push(sql`
        insert into purchase_orders (id, po_number, date, supplier_id, supplier_name, job_id, job_number, status,
          subtotal, tax_rate, tax, total, notes, created_at, approval_status, created_by_id, created_by, approval_note, reviewed_by)
        values (${po.id}, ${po.po_number}, ${po.date}, ${po.supplier_id || null}, ${po.supplier_name}, ${po.job_id || null}, ${po.job_number || ''}, ${po.status},
          ${po.subtotal}, ${po.tax_rate}, ${po.tax}, ${po.total}, ${po.notes}, ${po.created_at},
          ${po.approval_status || 'Approved'}, ${po.created_by_id || null}, ${po.created_by || ''}, ${po.approval_note || ''}, ${po.reviewed_by || ''})
      `);
    }
  }
  if (Array.isArray(data.purchaseOrderLineItems)) {
    for (const li of data.purchaseOrderLineItems) {
      queries.push(sql`
        insert into purchase_order_line_items (id, purchase_order_id, part_id, description, qty, unit_cost, qty_received, sort_order)
        values (${li.id}, ${li.purchase_order_id}, ${li.part_id || null}, ${li.description}, ${li.qty}, ${li.unit_cost}, ${li.qty_received}, ${li.sort_order})
      `);
    }
  }
  // Needs purchase_orders already inserted (loop above). Line items/payments
  // need purchase_order_invoices inserted first, hence the ordering here.
  if (Array.isArray(data.purchaseOrderInvoices)) {
    for (const pi of data.purchaseOrderInvoices) {
      queries.push(sql`
        insert into purchase_order_invoices (id, purchase_order_id, invoice_number, invoice_date, subtotal, tax, total, amount_paid, status, notes, created_by, created_at)
        values (${pi.id}, ${pi.purchase_order_id}, ${pi.invoice_number || ''}, ${pi.invoice_date}, ${pi.subtotal}, ${pi.tax}, ${pi.total}, ${pi.amount_paid}, ${pi.status || 'Unpaid'}, ${pi.notes || ''}, ${pi.created_by || ''}, ${pi.created_at})
      `);
    }
  }
  if (Array.isArray(data.purchaseOrderInvoiceLineItems)) {
    for (const li of data.purchaseOrderInvoiceLineItems) {
      queries.push(sql`
        insert into purchase_order_invoice_line_items (id, purchase_order_invoice_id, po_line_item_id, description, qty, unit_cost, sort_order)
        values (${li.id}, ${li.purchase_order_invoice_id}, ${li.po_line_item_id || null}, ${li.description || ''}, ${li.qty}, ${li.unit_cost}, ${li.sort_order})
      `);
    }
  }
  if (Array.isArray(data.purchaseOrderInvoicePayments)) {
    for (const p of data.purchaseOrderInvoicePayments) {
      queries.push(sql`
        insert into purchase_order_invoice_payments (id, purchase_order_invoice_id, date, amount, method, note, created_by, created_at)
        values (${p.id}, ${p.purchase_order_invoice_id}, ${p.date}, ${p.amount}, ${p.method || ''}, ${p.note || ''}, ${p.created_by || ''}, ${p.created_at})
      `);
    }
  }
  // Singleton settings row (always id=1, never wiped above) — upsert rather
  // than insert, and only if the backup actually has it (older backups won't).
  if (Array.isArray(data.businessSettings) && data.businessSettings[0]) {
    const bs = data.businessSettings[0];
    queries.push(sql`
      update business_settings set
        contractor_license_number = ${bs.contractor_license_number || ''},
        contractor_license_expiry = ${bs.contractor_license_expiry || null},
        public_liability_provider = ${bs.public_liability_provider || ''},
        public_liability_expiry = ${bs.public_liability_expiry || null},
        workers_comp_provider = ${bs.workers_comp_provider || ''},
        workers_comp_expiry = ${bs.workers_comp_expiry || null},
        updated_by = ${bs.updated_by || ''}
      where id = 1
    `);
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
