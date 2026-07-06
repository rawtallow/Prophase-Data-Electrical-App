import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import { RECEIPT_CATEGORIES } from '../../../../lib/receipt-categories';

export const runtime = 'nodejs';

export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageReceipts(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const { vendor, date, amount, gst, category, description } = await req.json();
  const rows = await sql`
    update receipts set
      vendor = ${vendor || ''},
      purchase_date = ${date || null},
      amount = ${Number(amount) || 0},
      gst_amount = ${Number(gst) || 0},
      category = ${RECEIPT_CATEGORIES.includes(category) ? category : 'Other'},
      description = ${description || ''}
    where id = ${params.id}
    returning *
  `;
  return NextResponse.json(rows[0]);
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageReceipts(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const rows = await sql`delete from receipts where id = ${params.id} returning image_url`;
  const imageUrl = rows[0]?.image_url;
  if (imageUrl) {
    await del(imageUrl).catch((err) => console.error('Failed to delete receipt blob:', err));
  }
  return NextResponse.json({ ok: true });
}
