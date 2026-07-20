import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { getSession, CAN } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session || !CAN.backup(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const [clients, assets, quotes, quoteLineItems, jobs, jobLineItems, jobPayments, employees, payrollEntries, payrollAllocations, ownerDraws, parts, counters, receipts, complianceRecords, businessSettings, maintenanceContracts, suppliers, purchaseOrders, purchaseOrderLineItems] = await Promise.all([
    sql`select * from clients`,
    sql`select * from assets`,
    sql`select * from quotes`,
    sql`select * from quote_line_items`,
    sql`select * from jobs`,
    sql`select * from job_line_items`,
    sql`select * from job_payments`,
    sql`select * from employees`,
    sql`select * from payroll_entries`,
    sql`select * from payroll_allocations`,
    sql`select * from owner_draws`,
    sql`select * from parts`,
    sql`select * from counters`,
    sql`select * from receipts`,
    sql`select * from compliance_records`,
    sql`select * from business_settings`,
    sql`select * from maintenance_contracts`,
    sql`select * from suppliers`,
    sql`select * from purchase_orders`,
    sql`select * from purchase_order_line_items`
  ]);

  const dump = {
    exportedAt: new Date().toISOString(),
    clients, assets, quotes, quoteLineItems, jobs, jobLineItems, jobPayments, employees, payrollEntries, payrollAllocations, ownerDraws, parts, counters, receipts, complianceRecords, businessSettings, maintenanceContracts, suppliers, purchaseOrders, purchaseOrderLineItems
  };

  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="prophase-backup-${new Date().toISOString().slice(0, 10)}.json"`
    }
  });
}
