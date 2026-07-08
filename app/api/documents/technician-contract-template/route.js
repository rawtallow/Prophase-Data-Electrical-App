import { NextResponse } from 'next/server';
import { getSession, CAN } from '../../../../lib/auth';
import { buildTechnicianContractDocx } from '../../../../lib/documents';

export const runtime = 'nodejs';

// Blank Employment Contract template for an Electrical Technician —
// internal HR document, admin/manager only (same gate as the other
// Documents page templates).
export async function GET() {
  const session = await getSession();
  if (!session || !CAN.editQuotes(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const buffer = await buildTechnicianContractDocx();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="Prophase Data and Electrical - Technician Employment Contract.docx"'
    }
  });
}
