import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import { RECEIPT_CATEGORIES } from '../../../lib/receipt-categories';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await sql`select * from receipts order by purchase_date desc nulls last, created_at desc`;
  return NextResponse.json(rows);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.addReceipts(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const { vendor, date, amount, gst, category, description, imageUrl } = await req.json();
  if (!imageUrl) return NextResponse.json({ error: 'Missing receipt image' }, { status: 400 });

  const rows = await sql`
    insert into receipts (vendor, purchase_date, amount, gst_amount, category, description, image_url, uploaded_by)
    values (
      ${vendor || ''},
      ${date || null},
      ${Number(amount) || 0},
      ${Number(gst) || 0},
      ${RECEIPT_CATEGORIES.includes(category) ? category : 'Other'},
      ${description || ''},
      ${imageUrl},
      ${session.name}
    )
    returning *
  `;
  return NextResponse.json(rows[0]);
}
