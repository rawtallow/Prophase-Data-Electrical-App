import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { sql } from '../../../../../lib/db';
import { getSession } from '../../../../../lib/auth';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const CATEGORIES = ['Photo', 'Document', 'Permit', 'Other'];

// Any signed-in role can attach a file — field staff need to upload site
// photos/permits from the job itself, same openness as addReceipts/
// addCompliance. Deleting is more restricted, see [docId]/route.js.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobs = await sql`select id from jobs where id = ${params.id}`;
  if (!jobs[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
  const category = CATEGORIES.includes(formData.get('category')) ? formData.get('category') : 'Photo';
  const label = formData.get('label') || file.name || '';

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const blob = await put(`jobs/${params.id}/${Date.now()}-${session.id}.${ext}`, buffer, {
    access: 'public',
    contentType: file.type,
    addRandomSuffix: true
  });

  const rows = await sql`
    insert into job_documents (job_id, label, category, file_url, uploaded_by)
    values (${params.id}, ${label}, ${category}, ${blob.url}, ${session.name})
    returning *
  `;
  return NextResponse.json(rows[0]);
}
