import { NextResponse } from 'next/server';
import { sql, isForeignKeyViolation } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import { serializeDates } from '../../../../lib/format';
import { gateOrExecute } from '../../../../lib/approvals';

export const runtime = 'nodejs';

// See app/api/purchase-orders/route.js's copy of this same comment for the
// full explanation — a raw Date column shifts by a day once it crosses
// NextResponse.json() on a server running outside UTC.
const QUOTE_DATE_FIELDS = ['date', 'valid_until'];

function computeTotals(lineItems, taxRate, discount) {
  const subtotal = lineItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.price) || 0), 0);
  const taxable = Math.max(subtotal - (Number(discount) || 0), 0);
  const tax = taxable * ((Number(taxRate) || 0) / 100);
  const total = taxable + tax;
  return { subtotal, tax, total };
}

export async function GET(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewQuotes(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const quotes = await sql`select * from quotes where id = ${params.id}`;
  if (!quotes[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [lineItems, sends] = await Promise.all([
    sql`select * from quote_line_items where quote_id = ${params.id} order by sort_order asc`,
    sql`select * from document_sends where document_type = 'quote' and document_id = ${params.id} order by created_at desc`
  ]);
  return NextResponse.json({ ...serializeDates(quotes[0], QUOTE_DATE_FIELDS), lineItems, sends });
}

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existingRows = await sql`select * from quotes where id = ${params.id}`;
  const existing = existingRows[0];
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isEmployee = session.role === 'employee';
  if (isEmployee) {
    if (existing.created_by_id !== session.id) {
      return NextResponse.json({ error: 'You can only edit your own quotes' }, { status: 403 });
    }
    if (existing.approval_status === 'Approved') {
      return NextResponse.json({ error: 'This quote has already been approved and can no longer be edited' }, { status: 403 });
    }
  }

  const body = await req.json();
  const { clientId, clientName, clientPhone, clientEmail, clientAddress, jobDescription, lineItems, taxRate, discount, status, notes, internalNotes, validUntil } = body;
  const cleanItems = (lineItems || []).filter((li) => (li.description || '').trim() !== '' || (Number(li.qty) || 0) * (Number(li.price) || 0) !== 0);
  if (cleanItems.length === 0) return NextResponse.json({ error: 'Add at least one line item' }, { status: 400 });

  const { subtotal, tax, total } = computeTotals(cleanItems, taxRate, discount);

  // Every tab on the Quote Details page shares this one PUT (it always
  // replaces the whole record), so a save triggered from a tab that doesn't
  // touch status (e.g. Notes) must fall back to the existing value rather
  // than clearing it.
  let finalStatus = status || existing.status;
  let finalApprovalStatus = existing.approval_status;
  let finalApprovalNote = existing.approval_note;
  let finalReviewedBy = existing.reviewed_by;
  if (isEmployee) {
    // Any employee edit (including fixing up a rejected quote) goes back
    // into the review queue — they can't set status themselves, and a
    // resubmission clears the previous review so it doesn't look stale.
    finalStatus = 'Draft';
    finalApprovalStatus = 'Pending Approval';
    finalApprovalNote = '';
    finalReviewedBy = '';
  } else if (['Sent', 'Accepted', 'Declined'].includes(status) && existing.approval_status !== 'Approved') {
    return NextResponse.json({ error: 'Approve this quote before it can be sent' }, { status: 400 });
  }

  const rows = await sql`
    update quotes set
      client_id = ${clientId || null}, client_name = ${clientName}, client_phone = ${clientPhone || ''},
      client_email = ${clientEmail || ''}, client_address = ${clientAddress || ''}, job_description = ${jobDescription || ''},
      tax_rate = ${Number(taxRate) || 0}, discount = ${Number(discount) || 0}, subtotal = ${subtotal}, tax = ${tax}, total = ${total},
      status = ${finalStatus}, notes = ${notes || ''}, internal_notes = ${internalNotes || ''}, valid_until = ${validUntil || existing.valid_until},
      approval_status = ${finalApprovalStatus}, approval_note = ${finalApprovalNote}, reviewed_by = ${finalReviewedBy}, updated_at = now()
    where id = ${params.id}
    returning *
  `;

  await sql`delete from quote_line_items where quote_id = ${params.id}`;
  for (let i = 0; i < cleanItems.length; i++) {
    const li = cleanItems[i];
    await sql`
      insert into quote_line_items (quote_id, description, qty, price, sort_order)
      values (${params.id}, ${li.description || ''}, ${Number(li.qty) || 0}, ${Number(li.price) || 0}, ${i})
    `;
  }

  return NextResponse.json(serializeDates(rows[0], QUOTE_DATE_FIELDS));
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`select quote_number, client_name, created_by_id, approval_status from quotes where id = ${params.id}`;
  const existing = rows[0];
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!CAN.editQuotes(session.role)) {
    // Employees can only remove their own quote while it's still awaiting
    // (or was sent back for) review — not once it's been approved.
    if (existing.created_by_id !== session.id || existing.approval_status === 'Approved') {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }
  }

  try {
    const { pending, request, result } = await gateOrExecute({
      session,
      actionType: 'delete_quote',
      targetId: params.id,
      targetLabel: `${existing.quote_number} — ${existing.client_name}`,
      payload: {},
      execute: async () => {
        await sql`delete from quotes where id = ${params.id}`;
        return { ok: true };
      }
    });
    return NextResponse.json(pending ? { pending: true, request } : result);
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'This quote has already been converted to a job and can\'t be deleted.' }, { status: 409 });
    }
    console.error('Delete quote error:', err);
    return NextResponse.json({ error: 'Could not delete quote' }, { status: 500 });
  }
}
