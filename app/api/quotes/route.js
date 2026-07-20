import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import { sydneyToday, serializeDates } from '../../../lib/format';

export const runtime = 'nodejs';

// The neon driver parses `date` columns using local-time components; once a
// raw Date crosses NextResponse.json() (JSON.stringify -> UTC toJSON), it can
// land on the wrong calendar day for servers running outside UTC. See
// lib/format.js's serializeDates for the full explanation.
const QUOTE_DATE_FIELDS = ['date'];

async function nextQuoteNumber() {
  const rows = await sql`update counters set value = value + 1 where key = 'quote' returning value`;
  return 'Q-' + String(rows[0].value).padStart(4, '0');
}

function computeTotals(lineItems, taxRate, discount) {
  const subtotal = lineItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.price) || 0), 0);
  const taxable = Math.max(subtotal - (Number(discount) || 0), 0);
  const tax = taxable * ((Number(taxRate) || 0) / 100);
  const total = taxable + tax;
  return { subtotal, tax, total };
}

export async function GET() {
  const session = await getSession();
  if (!session || !CAN.viewQuotes(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const rows = await sql`select * from quotes order by created_at desc`;
  return NextResponse.json(rows.map((r) => serializeDates(r, QUOTE_DATE_FIELDS)));
}

export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { clientId, clientName, clientPhone, clientEmail, clientAddress, jobDescription, lineItems, taxRate, discount, status, notes } = body;

  if (!clientName || !clientName.trim()) return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
  const cleanItems = (lineItems || []).filter((li) => (li.description || '').trim() !== '' || (Number(li.qty) || 0) * (Number(li.price) || 0) !== 0);
  if (cleanItems.length === 0) return NextResponse.json({ error: 'Add at least one line item' }, { status: 400 });

  const { subtotal, tax, total } = computeTotals(cleanItems, taxRate, discount);
  const quoteNumber = await nextQuoteNumber();

  // Employees can draft, but their quotes need manager/admin sign-off
  // before they can be sent — a manager/admin's own quote is auto-approved
  // since they already have full authority over quotes.
  const isEmployee = session.role === 'employee';
  const finalStatus = isEmployee ? 'Draft' : (status || 'Draft');
  const approvalStatus = isEmployee ? 'Pending Approval' : 'Approved';

  const rows = await sql`
    insert into quotes (quote_number, date, client_id, client_name, client_phone, client_email, client_address, job_description,
      tax_rate, discount, subtotal, tax, total, status, notes, approval_status, created_by_id, created_by)
    values (${quoteNumber}, ${sydneyToday()}, ${clientId || null}, ${clientName.trim()}, ${clientPhone || ''}, ${clientEmail || ''}, ${clientAddress || ''},
      ${jobDescription || ''}, ${Number(taxRate) || 0}, ${Number(discount) || 0}, ${subtotal}, ${tax}, ${total}, ${finalStatus}, ${notes || ''},
      ${approvalStatus}, ${session.id}, ${session.name})
    returning *
  `;
  const quote = rows[0];

  for (let i = 0; i < cleanItems.length; i++) {
    const li = cleanItems[i];
    await sql`
      insert into quote_line_items (quote_id, description, qty, price, sort_order)
      values (${quote.id}, ${li.description || ''}, ${Number(li.qty) || 0}, ${Number(li.price) || 0}, ${i})
    `;
  }

  return NextResponse.json(serializeDates(quote, QUOTE_DATE_FIELDS));
}
