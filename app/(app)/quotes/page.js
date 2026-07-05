import { sql } from '../../../lib/db';
import QuotesApp from './quotes-app';

export default async function QuotesPage() {
  const quotes = await sql`select * from quotes order by created_at desc`;
  return <QuotesApp initialQuotes={quotes} />;
}
