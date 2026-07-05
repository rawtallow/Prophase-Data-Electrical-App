import { sql } from '../../../../lib/db';
import QuoteForm from '../quote-form';

export default async function NewQuotePage() {
  const clients = await sql`select id, name from clients order by name asc`;
  return <QuoteForm existing={null} clients={clients} />;
}
