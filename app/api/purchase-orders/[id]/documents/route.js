import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const CATEGORIES = ['Document', 'Invoice', 'Delivery Docket', 'Other'];

// Any role that can view/draft POs can attach a file — same openness as
// job document uploads. Deleting is more restricted, see [docId]/route.js.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewPurchaseOrders(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const pos = await sql`select id from purchase_orders where id = ${params.id}`;
  if (!pos[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'A file is required' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File must be a JPEG, PNG, WebP, or PDF' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large' }, { status: 400 });
  }
  const category = CATEGORIES.includes(formData.get('category')) ? formData.get('category') : 'Document';
  const label = formData.get('label') || file.name || '';

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const blob = await put(`purchase-orders/${params.id}/${Date.now()}-${session.id}.${ext}`, buffer, {
    access: 'public',
    contentType: file.type,
    addRandomSuffix: true
  });

  const rows = await sql`
    insert into po_documents (purchase_order_id, label, category, file_url, uploaded_by)
    values (${params.id}, ${label}, ${category}, ${blob.url}, ${session.name})
    returning *
  `;
  return NextResponse.json(rows[0]);
}
