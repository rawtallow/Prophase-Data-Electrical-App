import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import { serializeDates } from '../../../lib/format';

export const runtime = 'nodejs';

const DATE_FIELDS = ['contractor_license_expiry', 'public_liability_expiry', 'workers_comp_expiry'];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await sql`select * from business_settings where id = 1`;
  return NextResponse.json(serializeDates(rows[0], DATE_FIELDS));
}

export async function PUT(req) {
  const session = await getSession();
  if (!session || !CAN.manageCompliance(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const {
    contractorLicenseNumber, contractorLicenseExpiry,
    publicLiabilityProvider, publicLiabilityExpiry,
    workersCompProvider, workersCompExpiry
  } = await req.json();

  const rows = await sql`
    update business_settings set
      contractor_license_number = ${contractorLicenseNumber || ''},
      contractor_license_expiry = ${contractorLicenseExpiry || null},
      public_liability_provider = ${publicLiabilityProvider || ''},
      public_liability_expiry = ${publicLiabilityExpiry || null},
      workers_comp_provider = ${workersCompProvider || ''},
      workers_comp_expiry = ${workersCompExpiry || null},
      updated_by = ${session.name},
      updated_at = now()
    where id = 1
    returning *
  `;
  return NextResponse.json(serializeDates(rows[0], DATE_FIELDS));
}
