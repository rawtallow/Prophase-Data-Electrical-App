import { sql } from '../../../../../lib/db';
import QuoteForm from '../../quote-form';
import { notFound } from 'next/navigation';

export default async function EditQuotePage({ params }) {
  // lineItems/clients don't depend on the quote row itself (just params.id),
  // so there's no need to wait for the notFound() check before firing them.
  const [quotes, lineItems, clients] = await Promise.all([
    sql`select * from quotes where id = ${params.id}`,
    sql`select * from quote_line_items where quote_id = ${params.id} order by sort_order asc`,
    sql`select id, name from clients order by name asc`
  ]);
  if (!quotes[0]) notFound();
  return <QuoteForm existing={{ ...quotes[0], lineItems }} clients={clients} />;
}
