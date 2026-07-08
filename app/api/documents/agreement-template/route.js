import { NextResponse } from 'next/server';
import { getSession, CAN } from '../../../../lib/auth';
import { buildAgreementDocx } from '../../../../lib/documents';

export const runtime = 'nodejs';

// Blank Client Work Agreement template, for handing out before a quote
// exists. The per-quote version (auto-filled with client/quote details) is
// at /api/quotes/[id]/agreement.
export async function GET() {
  const session = await getSession();
  if (!session || !CAN.editQuotes(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const buffer = await buildAgreementDocx();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="Prophase Data and Electrical - Client Work Agreement.docx"'
    }
  });
}
