import { sql } from '../../../../../lib/db';
import QuoteForm from '../../quote-form';
import { notFound } from 'next/navigation';

export default async function EditQuotePage({ params }) {
  const quotes = await sql`select * from quotes where id = ${params.id}`;
  if (!quotes[0]) notFound();
  const lineItems = await sql`select * from quote_line_items where quote_id = ${params.id} order by sort_order asc`;
  const clients = await sql`select id, name from clients order by name asc`;
  return <QuoteForm existing={{ ...quotes[0], lineItems }} clients={clients} />;
}
