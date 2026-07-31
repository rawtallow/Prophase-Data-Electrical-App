import { NextResponse } from 'next/server';
import { getSession, CAN } from '../../../../../lib/auth';
import { loadPurchaseOrderDocument } from '../../../../../lib/document-data';
import { PurchaseOrderPdf } from '../../../../../lib/pdf/purchase-order-pdf';
import { pdfResponse, documentError } from '../../../../../lib/pdf/render';

export const runtime = 'nodejs';

// Same gate as the print page at app/(app)/purchase-orders/[id]/print, and
// the "must be approved before it goes to a supplier" rule lives in
// loadPurchaseOrderDocument alongside the data it guards.
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editPurchaseOrders(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const doc = await loadPurchaseOrderDocument(params.id);
  const problem = documentError(doc);
  if (problem) return problem;

  const inline = new URL(req.url).searchParams.get('inline') === '1';
  return pdfResponse(<PurchaseOrderPdf {...doc} />, doc.filename, { inline });
}
