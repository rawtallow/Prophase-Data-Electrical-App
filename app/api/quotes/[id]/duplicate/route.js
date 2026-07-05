import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editQuotes(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const quotes = await sql`select * from quotes where id = ${params.id}`;
  const q = quotes[0];
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const lineItems = await sql`select * from quote_line_items where quote_id = ${params.id} order by sort_order asc`;

  const numRows = await sql`update counters set value = value + 1 where key = 'quote' returning value`;
  const quoteNumber = 'Q-' + String(numRows[0].value).padStart(4, '0');

  const newRows = await sql`
    insert into quotes (quote_number, client_id, client_name, client_phone, client_email, client_address, job_description,
      tax_rate, discount, subtotal, tax, total, status, notes)
    values (${quoteNumber}, ${q.client_id}, ${q.client_name}, ${q.client_phone}, ${q.client_email}, ${q.client_address},
      ${q.job_description}, ${q.tax_rate}, ${q.discount}, ${q.subtotal}, ${q.tax}, ${q.total}, 'Draft', ${q.notes})
    returning *
  `;
  const newQuote = newRows[0];
  for (const li of lineItems) {
    await sql`
      insert into quote_line_items (quote_id, description, qty, price, sort_order)
      values (${newQuote.id}, ${li.description}, ${li.qty}, ${li.price}, ${li.sort_order})
    `;
  }
  return NextResponse.json(newQuote);
}
