import { NextResponse } from 'next/server';
import { sql, isForeignKeyViolation } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { performRestore } from '../../../backup/import/route';
import { markHourLogsPaid } from '../../../payroll/route';

export const runtime = 'nodejs';

function statusForPayment(total, paid) {
  if (paid <= 0) return 'Unpaid';
  if (paid >= total) return 'Paid';
  return 'Partially Paid';
}
async function nextPayNumber() {
  const rows = await sql`update counters set value = value + 1 where key = 'pay' returning value`;
  return 'PR-' + String(rows[0].value).padStart(4, '0');
}

// One case per GATED_ACTIONS entry — re-performs the exact mutation the
// original route would have run immediately for a Director/Manager,
// reconstructed from the request's stored target_id/payload alone (the
// original request's in-memory closure is long gone by the time this runs).
// Kept as simple, self-contained SQL per case rather than importing each
// route's internals, except restore_backup — that one's large enough that
// duplicating it would be a real drift risk, so it's imported directly.
async function performApprovedAction(request, reviewer) {
  const { action_type, target_id, payload } = request;

  switch (action_type) {
    case 'delete_client': {
      await sql`delete from clients where id = ${target_id}`;
      return { ok: true };
    }
    case 'delete_job': {
      await sql`delete from jobs where id = ${target_id}`;
      return { ok: true };
    }
    case 'delete_quote': {
      await sql`delete from quotes where id = ${target_id}`;
      return { ok: true };
    }
    case 'delete_asset': {
      await sql`delete from assets where id = ${target_id}`;
      return { ok: true };
    }
    case 'delete_part': {
      await sql`delete from parts where id = ${target_id}`;
      return { ok: true };
    }
    case 'delete_purchase_order': {
      const rows = await sql`select po_number from purchase_orders where id = ${target_id}`;
      const existing = rows[0];
      if (!existing) throw new Error('This purchase order no longer exists');
      const queries = [sql`delete from purchase_orders where id = ${target_id}`];
      if (!existing.po_number.endsWith(' (Cancelled)')) {
        queries.unshift(sql`insert into po_number_pool (po_number) values (${existing.po_number}) on conflict do nothing`);
      }
      await sql.transaction(queries);
      return { ok: true };
    }
    case 'void_job_payment': {
      const payments = await sql`select * from job_payments where id = ${target_id}`;
      const payment = payments[0];
      if (!payment) throw new Error('This payment no longer exists');
      await sql.transaction([
        sql`delete from job_payments where id = ${target_id}`,
        sql`update jobs set amount_paid = greatest(0, amount_paid - ${payment.amount}) where id = ${payment.job_id}`
      ]);
      return { ok: true };
    }
    case 'void_po_invoice_payment': {
      const payments = await sql`select * from purchase_order_invoice_payments where id = ${target_id}`;
      const payment = payments[0];
      if (!payment) throw new Error('This payment no longer exists');
      const invoices = await sql`select * from purchase_order_invoices where id = ${payment.purchase_order_invoice_id}`;
      const invoice = invoices[0];
      const newPaid = Math.max(0, Number(invoice.amount_paid) - Number(payment.amount));
      const newStatus = statusForPayment(Number(invoice.total), newPaid);
      await sql.transaction([
        sql`delete from purchase_order_invoice_payments where id = ${target_id}`,
        sql`update purchase_order_invoices set amount_paid = ${newPaid}, status = ${newStatus} where id = ${invoice.id}`
      ]);
      return { ok: true };
    }
    case 'review_quote': {
      const rows = await sql`
        update quotes set approval_status = ${payload.decision === 'approved' ? 'Approved' : 'Rejected'},
          approval_note = ${payload.note || ''}, reviewed_by = ${request.requested_by}
        where id = ${target_id}
        returning *
      `;
      if (!rows[0]) throw new Error('This quote no longer exists');
      return rows[0];
    }
    case 'review_purchase_order': {
      const rows = await sql`
        update purchase_orders set approval_status = ${payload.decision === 'approved' ? 'Approved' : 'Rejected'},
          approval_note = ${payload.note || ''}, reviewed_by = ${request.requested_by}, updated_at = now()
        where id = ${target_id}
        returning *
      `;
      if (!rows[0]) throw new Error('This purchase order no longer exists');
      await sql`insert into po_activity (purchase_order_id, type, message, created_by) values (${target_id}, 'approval', ${payload.decision === 'approved' ? 'Approved' : `Rejected${payload.note ? ': ' + payload.note : ''}`}, ${request.requested_by})`;
      return rows[0];
    }
    case 'create_payroll_entry': {
      const { employeeId, hourlyRate, datePaid, periodStart, periodEnd, allocations, netPay, notes, hourLogIds } = payload;
      const emps = await sql`select * from employees where id = ${employeeId}`;
      const emp = emps[0];
      if (!emp) throw new Error('Employee not found');
      const rate = Number(hourlyRate) || 0;
      const cleanAllocs = (allocations || []).filter((a) => (Number(a.regHours) || 0) > 0 || (Number(a.otHours) || 0) > 0);
      const gross = cleanAllocs.reduce((s, a) => s + (Number(a.regHours) || 0) * rate + (Number(a.otHours) || 0) * rate * 1.5, 0);
      const payNumber = await nextPayNumber();
      const rows = await sql`
        insert into payroll_entries (pay_number, employee_id, employee_name, hourly_rate, date_paid, period_start, period_end, gross_pay, net_pay, notes)
        values (${payNumber}, ${emp.id}, ${emp.name}, ${rate}, ${datePaid || null}, ${periodStart || null}, ${periodEnd || null}, ${gross}, ${Number(netPay) || 0}, ${notes || ''})
        returning *
      `;
      const entry = rows[0];
      for (const a of cleanAllocs) {
        await sql`insert into payroll_allocations (payroll_entry_id, job_id, reg_hours, ot_hours) values (${entry.id}, ${a.jobId || null}, ${Number(a.regHours) || 0}, ${Number(a.otHours) || 0})`;
      }
      // Imported rather than reimplemented: this one needs status/employee
      // guards that must not drift from the direct path, and a queued
      // request may sit here for days before approval, so an hour log
      // could have changed state in the meantime.
      await markHourLogsPaid(hourLogIds, entry.id, emp.id);
      return entry;
    }
    case 'create_owner_draw': {
      const { date, amount, note } = payload;
      const rows = await sql`insert into owner_draws (date, amount, note) values (${date}, ${Number(amount)}, ${note || ''}) returning *`;
      return rows[0];
    }
    case 'restore_backup': {
      await performRestore(payload);
      return { ok: true };
    }
    case 'create_user': {
      const { name, email, passwordHash, role } = payload;
      const existing = await sql`select id from users where email = ${email}`;
      if (existing[0]) throw new Error('An account with that email already exists');
      const rows = await sql`
        insert into users (name, email, password_hash, role, active)
        values (${name}, ${email}, ${passwordHash}, ${role}, true)
        returning id, name, email, role, active, created_at
      `;
      return rows[0];
    }
    case 'edit_user': {
      const { name, email, role, active, newPasswordHash } = payload;
      if (newPasswordHash) await sql`update users set password_hash = ${newPasswordHash} where id = ${target_id}`;
      const rows = await sql`
        update users set name = ${name}, email = ${email}, role = ${role}, active = ${active}
        where id = ${target_id}
        returning id, name, email, role, active, created_at
      `;
      return rows[0];
    }
    case 'delete_user': {
      await sql`delete from users where id = ${target_id}`;
      return { ok: true };
    }
    default:
      throw new Error(`Unknown action type "${action_type}"`);
  }
}

export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.isDirector(session.role)) {
    return NextResponse.json({ error: 'Only a director can review requests' }, { status: 403 });
  }

  const { decision, note } = await req.json();
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json({ error: 'Decision must be "approved" or "rejected"' }, { status: 400 });
  }

  const rows = await sql`select * from approval_requests where id = ${params.id}`;
  const request = rows[0];
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (request.status !== 'Pending') return NextResponse.json({ error: 'This request has already been reviewed' }, { status: 400 });

  if (decision === 'rejected') {
    const updated = await sql`
      update approval_requests set status = 'Rejected', reviewed_by = ${session.name}, review_note = ${note || ''}, reviewed_at = now()
      where id = ${params.id}
      returning *
    `;
    return NextResponse.json(updated[0]);
  }

  try {
    await performApprovedAction(request, session);
  } catch (err) {
    console.error('Approval execution error:', err);
    return NextResponse.json({ error: err.message || 'Could not carry out this action' }, { status: isForeignKeyViolation(err) ? 409 : 500 });
  }

  const updated = await sql`
    update approval_requests set status = 'Approved', reviewed_by = ${session.name}, review_note = ${note || ''}, reviewed_at = now()
    where id = ${params.id}
    returning *
  `;
  return NextResponse.json(updated[0]);
}
