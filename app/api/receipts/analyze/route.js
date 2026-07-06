import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getSession } from '../../../../lib/auth';
import { analyzeReceiptImage } from '../../../../lib/receipt-analysis';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024; // 8MB — client resizes before upload, this is just a backstop.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Uploads the photo to Blob storage (always) and asks Claude to read it
// (best-effort). The image is kept even if analysis fails, so the user
// can still save the receipt with the fields filled in by hand.
export async function POST(req) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('image');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Image must be JPEG, PNG, or WebP' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is too large' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';

  const blob = await put(`receipts/${Date.now()}-${session.id}.${ext}`, buffer, {
    access: 'public',
    contentType: file.type,
    addRandomSuffix: true
  });

  let fields = { vendor: '', date: '', amount: 0, gst: 0, category: 'Other', description: '' };
  let analysisError = null;
  try {
    fields = await analyzeReceiptImage(buffer.toString('base64'), file.type);
  } catch (err) {
    console.error('Receipt analysis failed:', err);
    analysisError = 'Could not auto-read this receipt — enter the details manually.';
  }

  return NextResponse.json({ imageUrl: blob.url, analysisError, ...fields });
}
