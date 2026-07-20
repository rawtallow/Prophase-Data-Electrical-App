import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { sql } from '../../../../../../lib/db';
import { getSession, CAN } from '../../../../../../lib/auth';

export const runtime = 'nodejs';

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageJobs(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const rows = await sql`delete from job_documents where id = ${params.docId} and job_id = ${params.id} returning file_url`;
  const fileUrl = rows[0]?.file_url;
  if (fileUrl) {
    await del(fileUrl).catch((err) => console.error('Failed to delete job document blob:', err));
  }
  return NextResponse.json({ ok: true });
}
