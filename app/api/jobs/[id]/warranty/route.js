import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { buildWarrantyDocx, safeFilename } from '../../../../../lib/documents';

export const runtime = 'nodejs';

// Same access level as the quote agreement/print — only admin/manager, and
// only for jobs that have actually reached Complete (completed_date is
// stamped by app/api/jobs/[id]/route.js when that happens), since the
// warranty's completion/expiry dates depend on it.
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editQuotes(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const jobs = await sql`select * from jobs where id = ${params.id}`;
  const job = jobs[0];
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (job.status !== 'Complete' || !job.completed_date) {
    return NextResponse.json({ error: 'This job must be marked Complete before generating a warranty' }, { status: 400 });
  }

  const clients = job.client_id ? await sql`select * from clients where id = ${job.client_id}` : [];
  const client = clients[0] || null;

  const complianceRows = await sql`
    select reference_number from compliance_records
    where job_id = ${job.id} and type = 'Certificate of Compliance'
    order by record_date desc limit 1
  `;
  const complianceRef = complianceRows[0]?.reference_number || '';

  const buffer = await buildWarrantyDocx(job, client, complianceRef);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Warranty - ${safeFilename(job.job_number)} - ${safeFilename(job.client_name)}.docx"`
    }
  });
}
