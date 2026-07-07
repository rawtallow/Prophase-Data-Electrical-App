import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';
import { COMPLIANCE_TYPES } from '../../../../lib/compliance-types';

export const runtime = 'nodejs';

// Metadata only — the attached file is set at creation and isn't
// replaceable here, same as receipts.
export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageCompliance(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const { type, jobId, clientId, employeeId, recordDate, referenceNumber, result, retestDue, description, notes } = await req.json();
  if (!COMPLIANCE_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid record type' }, { status: 400 });
  }

  const rows = await sql`
    update compliance_records set
      type = ${type},
      job_id = ${jobId || null},
      client_id = ${clientId || null},
      employee_id = ${employeeId || null},
      record_date = ${recordDate || null},
      reference_number = ${referenceNumber || ''},
      result = ${result || ''},
      retest_due = ${retestDue || null},
      description = ${description || ''},
      notes = ${notes || ''}
    where id = ${params.id}
    returning *
  `;
  return NextResponse.json(rows[0]);
}

export async function DELETE(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.manageCompliance(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const rows = await sql`delete from compliance_records where id = ${params.id} returning file_url`;
  const fileUrl = rows[0]?.file_url;
  if (fileUrl) {
    await del(fileUrl).catch((err) => console.error('Failed to delete compliance file blob:', err));
  }
  return NextResponse.json({ ok: true });
}
