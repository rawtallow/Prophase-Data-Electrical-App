import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

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
  const lineItems = await sql`select * from quote_line_items where quote_id = ${params.id} order by sort_order asc`;
  return NextResponse.json({ ...quotes[0], lineItems });
}

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editQuotes(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const body = await req.json();
  const { clientId, clientName, clientPhone, clientEmail, clientAddress, jobDescription, lineItems, taxRate, discount, status, notes } = body;
  const cleanItems = (lineItems || []).filter((li) => (li.description || '').trim() !== '' || (Number(li.qty) || 0) * (Number(li.price) || 0) !== 0);
  if (cleanItems.length === 0) return NextResponse.json({ error: 'Add at least one line item' }, { status: 400 });

  const { subtotal, tax, total } = computeTotals(cleanItems, taxRate, discount);

  const rows = await sql`
    update quotes set
      client_id = ${clientId || null}, client_name = ${clientName}, client_phone = ${clientPhone || ''},
      client_email = ${clientEmail || ''}, client_address = ${clientAddress || ''}, job_description = ${jobDescription || ''},
      tax_rate = ${Number(taxRate) || 0}, discount = ${Number(discount) || 0}, subtotal = ${subtotal}, tax = ${tax}, total = ${total},
      status = ${status}, notes = ${notes || ''}
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

  return NextResponse.json(rows[0]);
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editQuotes(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  await sql`delete from quotes where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
