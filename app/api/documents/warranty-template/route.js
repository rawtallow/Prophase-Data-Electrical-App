import { NextResponse } from 'next/server';
import { getSession, CAN } from '../../../../lib/auth';
import { buildWarrantyDocx } from '../../../../lib/documents';

export const runtime = 'nodejs';

// Blank Workmanship Warranty template. The per-job version (auto-filled with
// client/completion/expiry details) is at /api/jobs/[id]/warranty.
export async function GET() {
  const session = await getSession();
  if (!session || !CAN.editQuotes(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const buffer = await buildWarrantyDocx();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="Prophase Data and Electrical - Workmanship Warranty.docx"'
    }
  });
}
