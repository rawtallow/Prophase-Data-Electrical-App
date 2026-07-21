import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { sydneyToday } from '../../../../../lib/format';

export const runtime = 'nodejs';

async function nextPoNumber() {
  const released = await sql`
    delete from po_number_pool
    where po_number = (select po_number from po_number_pool order by po_number asc limit 1)
    returning po_number
  `;
  if (released[0]) return released[0].po_number;
  const rows = await sql`update counters set value = value + 1 where key = 'po' returning value`;
  return 'PO-' + String(rows[0].value).padStart(4, '0');
}

export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editPurchaseOrders(session.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const rows = await sql`select * from purchase_orders where id = ${params.id}`;
  const po = rows[0];
  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const lineItems = await sql`select * from purchase_order_line_items where purchase_order_id = ${params.id} order by sort_order asc`;

  const poNumber = await nextPoNumber();

  // Fresh copy sheds anything that only makes sense for a specific past
  // order — status resets to Draft, receiving/invoicing progress and
  // documents/history don't carry over.
  const newRows = await sql`
    insert into purchase_orders (
      po_number, date, supplier_id, supplier_name, job_id, job_number, client_id, client_name, asset_id, quote_id,
      assigned_to_id, assigned_to_name, delivery_method, delivery_address, delivery_notes,
      status, tax_rate, subtotal, tax, total, notes, approval_status, created_by_id, created_by, updated_at
    )
    values (
      ${poNumber}, ${sydneyToday()}, ${po.supplier_id}, ${po.supplier_name}, ${po.job_id}, ${po.job_number}, ${po.client_id}, ${po.client_name}, ${po.asset_id}, ${po.quote_id},
      ${po.assigned_to_id}, ${po.assigned_to_name}, ${po.delivery_method}, ${po.delivery_address}, ${po.delivery_notes},
      'Draft', ${po.tax_rate}, ${po.subtotal}, ${po.tax}, ${po.total}, ${po.notes}, 'Approved', ${session.id}, ${session.name}, now()
    )
    returning *
  `;
  const newPo = newRows[0];
  for (const li of lineItems) {
    await sql`
      insert into purchase_order_line_items (purchase_order_id, part_id, description, supplier_product_code, qty, unit_cost, sort_order)
      values (${newPo.id}, ${li.part_id}, ${li.description}, ${li.supplier_product_code}, ${li.qty}, ${li.unit_cost}, ${li.sort_order})
    `;
  }
  await sql`insert into po_activity (purchase_order_id, type, message, created_by) values (${newPo.id}, 'note', ${'Duplicated from ' + po.po_number}, ${session.name})`;
  return NextResponse.json(newPo);
}
