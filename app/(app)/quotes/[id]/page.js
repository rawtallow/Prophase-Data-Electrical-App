import { notFound } from 'next/navigation';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import QuoteDetailApp from './quote-detail-app';

export default async function QuoteDetailPage({ params }) {
  const session = await getSession();
  const quotes = await sql`select * from quotes where id = ${params.id}`;
  const quote = quotes[0];
  if (!quote) notFound();

  const [lineItems, clients, jobs, sends] = await Promise.all([
    sql`select * from quote_line_items where quote_id = ${params.id} order by sort_order asc`,
    sql`select id, name from clients order by name asc`,
    sql`select id, job_number, status, amount_invoiced, amount_paid from jobs where quote_id = ${params.id}`,
    // Falls back to [] rather than letting a missing/not-yet-migrated
    // document_sends table 500 out the whole page.
    sql`select * from document_sends where document_type = 'quote' and document_id = ${params.id} order by created_at desc`.catch(() => [])
  ]);

  const fullAccess = CAN.editQuotes(session.role);
  // Any role can VIEW any quote (mirrors viewQuotes: () => true and the
  // Client Details precedent) — editing is what's restricted, matching the
  // exact ownership rule the old standalone edit page enforced.
  const canEdit = fullAccess || (quote.created_by_id === session.id && quote.approval_status !== 'Approved');

  return (
    <QuoteDetailApp
      initialQuote={quote}
      initialLineItems={lineItems}
      initialSends={sends}
      clients={clients}
      linkedJob={jobs[0] || null}
      myId={session.id}
      fullAccess={fullAccess}
      canEdit={canEdit}
    />
  );
}
