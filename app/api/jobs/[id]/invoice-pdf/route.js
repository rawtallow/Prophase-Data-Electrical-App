import { NextResponse } from 'next/server';
import { getSession, CAN } from '../../../../../lib/auth';
import { loadInvoiceDocument } from '../../../../../lib/document-data';
import { InvoicePdf } from '../../../../../lib/pdf/invoice-pdf';
import { pdfResponse, documentError } from '../../../../../lib/pdf/render';

export const runtime = 'nodejs';

// Named invoice-pdf rather than just /pdf because a job can grow other
// documents (it already has /warranty) — a bare /pdf would get ambiguous.
// Gated on viewFinancials to match the invoice print page: this is a
// financial document, so it follows the financial permission rather than
// the looser manageJobs one the warranty uses.
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewFinancials(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const doc = await loadInvoiceDocument(params.id);
  const problem = documentError(doc);
  if (problem) return problem;

  const inline = new URL(req.url).searchParams.get('inline') === '1';
  return pdfResponse(<InvoicePdf {...doc} />, doc.filename, { inline });
}
