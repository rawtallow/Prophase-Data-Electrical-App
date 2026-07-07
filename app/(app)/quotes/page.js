import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import QuotesApp from './quotes-app';

export default async function QuotesPage() {
  const session = await getSession();
  const quotes = await sql`select * from quotes order by created_at desc`;
  return (
    <QuotesApp
      initialQuotes={quotes}
      myId={session.id}
      fullAccess={CAN.editQuotes(session.role)}
    />
  );
}
