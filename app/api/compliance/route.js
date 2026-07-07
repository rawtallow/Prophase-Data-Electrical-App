import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import { COMPLIANCE_TYPES } from '../../../lib/compliance-types';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await sql`
    select cr.*, j.job_number, c.name as client_name, e.name as employee_name
    from compliance_records cr
    left join jobs j on j.id = cr.job_id
    left join clients c on c.id = cr.client_id
    left join employees e on e.id = cr.employee_id
    order by cr.record_date desc, cr.created_at desc
  `;
  return NextResponse.json(rows);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.addCompliance(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const formData = await req.formData();
  const type = formData.get('type');
  if (!COMPLIANCE_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid record type' }, { status: 400 });
  }

  let fileUrl = null;
  const file = formData.get('file');
  if (file && typeof file !== 'string') {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File must be a JPEG, PNG, WebP, or PDF' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File is too large' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const blob = await put(`compliance/${Date.now()}-${session.id}.${ext}`, buffer, {
      access: 'public',
      contentType: file.type,
      addRandomSuffix: true
    });
    fileUrl = blob.url;
  }

  const jobId = formData.get('jobId') || null;
  const clientId = formData.get('clientId') || null;
  const employeeId = formData.get('employeeId') || null;
  const recordDate = formData.get('recordDate') || null;
  const referenceNumber = formData.get('referenceNumber') || '';
  const result = formData.get('result') || '';
  const retestDue = formData.get('retestDue') || null;
  const description = formData.get('description') || '';
  const notes = formData.get('notes') || '';

  const rows = await sql`
    insert into compliance_records
      (type, job_id, client_id, employee_id, record_date, reference_number, result, retest_due, description, file_url, notes, uploaded_by)
    values
      (${type}, ${jobId}, ${clientId}, ${employeeId}, ${recordDate || new Date().toISOString().slice(0, 10)},
       ${referenceNumber}, ${result}, ${retestDue}, ${description}, ${fileUrl}, ${notes}, ${session.name})
    returning *
  `;
  return NextResponse.json(rows[0]);
}
