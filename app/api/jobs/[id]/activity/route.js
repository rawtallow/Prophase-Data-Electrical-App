import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession } from '../../../../../lib/auth';

export const runtime = 'nodejs';

// Any signed-in role can post a progress update — field staff logging what
// happened on-site is the whole point, same openness as addReceipts/
// addCompliance. Status/priority-change rows are logged automatically by
// the PUT handler in app/api/jobs/[id]/route.js, not through this route.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobs = await sql`select id from jobs where id = ${params.id}`;
  if (!jobs[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { message } = await req.json();
  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'A message is required' }, { status: 400 });
  }

  const rows = await sql`
    insert into job_activity (job_id, type, message, created_by)
    values (${params.id}, 'note', ${message.trim()}, ${session.name})
    returning *
  `;
  return NextResponse.json(rows[0]);
}
