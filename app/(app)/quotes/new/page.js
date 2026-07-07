import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import QuoteForm from '../quote-form';

export default async function NewQuotePage() {
  const session = await getSession();
  const clients = await sql`select id, name from clients order by name asc`;
  return <QuoteForm existing={null} clients={clients} fullAccess={CAN.editQuotes(session.role)} />;
}
