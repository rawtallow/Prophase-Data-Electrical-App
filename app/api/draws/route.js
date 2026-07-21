import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';
import { getSession, CAN } from '../../../lib/auth';
import { gateOrExecute } from '../../../lib/approvals';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session || !CAN.viewPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const rows = await sql`select * from owner_draws order by date desc`;
  return NextResponse.json(rows);
}

export async function POST(req) {
  const session = await getSession();
  if (!session || !CAN.editPayroll(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const { date, amount, note } = await req.json();
  if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  if (!(Number(amount) > 0)) return NextResponse.json({ error: 'Enter an amount greater than 0' }, { status: 400 });

  const { pending, request, result } = await gateOrExecute({
    session,
    actionType: 'create_owner_draw',
    targetId: null,
    targetLabel: `$${Number(amount).toFixed(2)} owner draw on ${date}`,
    payload: { date, amount, note },
    execute: async () => {
      const rows = await sql`
        insert into owner_draws (date, amount, note) values (${date}, ${Number(amount)}, ${note || ''}) returning *
      `;
      return rows[0];
    }
  });
  return NextResponse.json(pending ? { pending: true, request } : result);
}
