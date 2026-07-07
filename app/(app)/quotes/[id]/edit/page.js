import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import QuoteForm from '../../quote-form';
import { notFound, redirect } from 'next/navigation';

export default async function EditQuotePage({ params }) {
  const session = await getSession();
  // lineItems/clients don't depend on the quote row itself (just params.id),
  // so there's no need to wait for the notFound() check before firing them.
  const [quotes, lineItems, clients] = await Promise.all([
    sql`select * from quotes where id = ${params.id}`,
    sql`select * from quote_line_items where quote_id = ${params.id} order by sort_order asc`,
    sql`select id, name from clients order by name asc`
  ]);
  const quote = quotes[0];
  if (!quote) notFound();

  const fullAccess = CAN.editQuotes(session.role);
  // Employees can only reach the edit form for their own quote, and only
  // while it hasn't been approved yet — once approved it's out of their hands.
  if (!fullAccess && (quote.created_by_id !== session.id || quote.approval_status === 'Approved')) {
    redirect('/quotes?denied=1');
  }

  return <QuoteForm existing={{ ...quote, lineItems }} clients={clients} fullAccess={fullAccess} />;
}
