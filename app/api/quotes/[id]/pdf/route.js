import { NextResponse } from 'next/server';
import { getSession, CAN } from '../../../../../lib/auth';
import { loadQuoteDocument } from '../../../../../lib/document-data';
import { QuotePdf } from '../../../../../lib/pdf/quote-pdf';
import { pdfResponse, documentError } from '../../../../../lib/pdf/render';

export const runtime = 'nodejs';

// Same gate as the print page at app/(app)/quotes/[id]/print — this route
// hands out the identical document, so it can't be the softer of the two.
// The "must be approved" rule lives in loadQuoteDocument alongside the data
// it guards, rather than being restated here and in the print page.
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editQuotes(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const doc = await loadQuoteDocument(params.id);
  const problem = documentError(doc);
  if (problem) return problem;

  const inline = new URL(req.url).searchParams.get('inline') === '1';
  return pdfResponse(<QuotePdf {...doc} />, doc.filename, { inline });
}
