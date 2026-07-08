import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { buildAgreementDocx, safeFilename } from '../../../../../lib/documents';

export const runtime = 'nodejs';

// Same gating as the printed quote (/quotes/[id]/print): only admin/manager,
// and only once the quote is Approved, since this is the customer-facing
// deliverable sent alongside it.
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editQuotes(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const quotes = await sql`select * from quotes where id = ${params.id}`;
  const quote = quotes[0];
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (quote.approval_status !== 'Approved') {
    return NextResponse.json({ error: 'Only approved quotes can generate a client agreement' }, { status: 400 });
  }

  const buffer = await buildAgreementDocx(quote);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Work Agreement - ${safeFilename(quote.quote_number)} - ${safeFilename(quote.client_name)}.docx"`
    }
  });
}
