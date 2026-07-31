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
    workersCompProvider, workersCompExpiry,
    legalName, abn, address, phone, email, website,
    bankName, bankBsb, bankAccount, paymentTerms
  } = await req.json();

  // The company-identity block is only sent by the Business Details form;
  // the licence/insurance form doesn't include it. Falling back to the
  // stored value (rather than '') stops one form from silently wiping the
  // other's fields — the ABN and bank details on every issued invoice.
  const existing = (await sql`select * from business_settings where id = 1`)[0] || {};
  const keep = (submitted, current) => (submitted === undefined ? (current || '') : (submitted || ''));

  const rows = await sql`
    update business_settings set
      contractor_license_number = ${keep(contractorLicenseNumber, existing.contractor_license_number)},
      contractor_license_expiry = ${contractorLicenseExpiry === undefined ? existing.contractor_license_expiry : (contractorLicenseExpiry || null)},
      public_liability_provider = ${keep(publicLiabilityProvider, existing.public_liability_provider)},
      public_liability_expiry = ${publicLiabilityExpiry === undefined ? existing.public_liability_expiry : (publicLiabilityExpiry || null)},
      workers_comp_provider = ${keep(workersCompProvider, existing.workers_comp_provider)},
      workers_comp_expiry = ${workersCompExpiry === undefined ? existing.workers_comp_expiry : (workersCompExpiry || null)},
      legal_name = ${keep(legalName, existing.legal_name)},
      abn = ${keep(abn, existing.abn)},
      address = ${keep(address, existing.address)},
      phone = ${keep(phone, existing.phone)},
      email = ${keep(email, existing.email)},
      website = ${keep(website, existing.website)},
      bank_name = ${keep(bankName, existing.bank_name)},
      bank_bsb = ${keep(bankBsb, existing.bank_bsb)},
      bank_account = ${keep(bankAccount, existing.bank_account)},
      payment_terms = ${keep(paymentTerms, existing.payment_terms)},
      updated_by = ${session.name},
      updated_at = now()
    where id = 1
    returning *
  `;
  return NextResponse.json(serializeDates(rows[0], DATE_FIELDS));
}
