import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { sydneyToday } from '../../../../../lib/format';

export const runtime = 'nodejs';

// Logs materials arriving against a PO: bumps each line's qty_received (never
// past its ordered qty), bumps parts.qty_on_hand for lines linked to Spare
// Parts inventory, updates that part's last/average purchase cost and last
// supplier, optionally records per-unit serial/batch numbers for parts
// flagged track_serials, and recomputes the PO's overall status from every
// line's received total. Optionally also logs the supplier's invoice for
// this same delivery — combined into one action since the goods and the
// paperwork usually arrive together. When the invoice is logged in the same
// action as the final receive (nothing left outstanding), the PO status
// becomes 'Invoiced' instead of just 'Received', since the whole point of
// pairing them is that this order is now both fully delivered and billed.
// Invoice logging is gated separately (CAN.viewFinancials, it's money) from
// the quantity receiving itself, which any role can do. Runs as one
// transaction (same atomic pattern as app/api/backup/import/route.js) so a
// receive action, with or without an invoice, can't half-apply.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.receivePurchaseOrders(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const poRows = await sql`select * from purchase_orders where id = ${params.id}`;
  const po = poRows[0];
  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (po.approval_status !== 'Approved') {
    return NextResponse.json({ error: 'This purchase order has not been approved yet' }, { status: 400 });
  }
  if (po.status === 'Cancelled') {
    return NextResponse.json({ error: 'This purchase order was cancelled' }, { status: 400 });
  }

  const { lines, invoice } = await req.json();
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'No items to receive' }, { status: 400 });
  }
  if (invoice && !CAN.viewFinancials(session.role)) {
    return NextResponse.json({ error: 'Not allowed to log supplier invoices' }, { status: 403 });
  }
  if (invoice && !String(invoice.invoiceNumber || '').trim()) {
    return NextResponse.json({ error: "Enter the supplier's invoice number" }, { status: 400 });
  }

  const existingLines = await sql`select * from purchase_order_line_items where purchase_order_id = ${params.id}`;
  const lineMap = Object.fromEntries(existingLines.map((l) => [l.id, l]));
  const invoiceCostById = Object.fromEntries((invoice?.lines || []).map((l) => [l.lineItemId, Number(l.unitCost)]));

  // Fetched up front (not inside the query loop) since the weighted-average
  // cost formula needs each part's qty_on_hand/avg_purchase_cost as they
  // stood BEFORE this receive — the update queries below are lazy and don't
  // run until the final sql.transaction(), so a read at that point would see
  // stale pre-transaction values anyway.
  const partIds = [...new Set(lines.map((l) => lineMap[l.lineItemId]?.part_id).filter(Boolean))];
  const partsById = partIds.length
    ? Object.fromEntries((await sql`select * from parts where id = any(${partIds})`).map((p) => [p.id, p]))
    : {};

  const queries = [];
  const newQtyReceivedById = {};
  const invoiceLineItems = [];
  const activityMessages = [];

  for (const { lineItemId, qtyNow, batchNumber, serialNumbers } of lines) {
    const line = lineMap[lineItemId];
    const requested = Number(qtyNow) || 0;
    if (!line || requested <= 0) continue;
    const remaining = Number(line.qty) - Number(line.qty_received);
    const clamped = Math.min(requested, Math.max(remaining, 0));
    if (clamped <= 0) continue;

    const updatedQty = Number(line.qty_received) + clamped;
    newQtyReceivedById[lineItemId] = updatedQty;
    queries.push(sql`update purchase_order_line_items set qty_received = ${updatedQty} where id = ${lineItemId}`);

    if (line.part_id) {
      const part = partsById[line.part_id];
      const unitCost = invoice ? (invoiceCostById[lineItemId] ?? (Number(line.unit_cost) || 0)) : (Number(line.unit_cost) || 0);
      if (part) {
        const priorQty = Number(part.qty_on_hand) || 0;
        const priorAvg = part.avg_purchase_cost != null ? Number(part.avg_purchase_cost) : Number(part.unit_cost) || 0;
        const newAvg = priorQty + clamped > 0 ? (priorAvg * priorQty + unitCost * clamped) / (priorQty + clamped) : unitCost;
        queries.push(sql`
          update parts set
            qty_on_hand = qty_on_hand + ${clamped},
            last_purchase_cost = ${unitCost},
            avg_purchase_cost = ${newAvg},
            last_purchase_supplier_id = ${po.supplier_id},
            last_purchase_supplier_name = ${po.supplier_name}
          where id = ${line.part_id}
        `);

        if (part.track_serials) {
          const serials = (serialNumbers || []).map((s) => String(s).trim()).filter(Boolean);
          if (serials.length > 0) {
            for (const serial of serials) {
              queries.push(sql`
                insert into part_serials (part_id, purchase_order_id, serial_number, batch_number, received_date)
                values (${line.part_id}, ${params.id}, ${serial}, ${batchNumber || ''}, ${sydneyToday()})
              `);
            }
          } else if (batchNumber) {
            queries.push(sql`
              insert into part_serials (part_id, purchase_order_id, serial_number, batch_number, received_date, notes)
              values (${line.part_id}, ${params.id}, '', ${batchNumber}, ${sydneyToday()}, ${'Batch of ' + clamped + ', no individual serials captured'})
            `);
          }
        }
      }
    }

    activityMessages.push(`Received ${clamped} × ${line.description}`);

    if (invoice) {
      const rawCost = invoiceCostById[lineItemId];
      const unitCost = rawCost !== undefined && !Number.isNaN(rawCost) ? rawCost : Number(line.unit_cost) || 0;
      invoiceLineItems.push({ poLineItemId: lineItemId, description: line.description, qty: clamped, unitCost, supplierProductCode: line.supplier_product_code || '' });
    }
  }

  if (queries.length === 0) {
    return NextResponse.json({ error: 'Nothing to receive — check the quantities entered' }, { status: 400 });
  }

  const effectiveQty = (l) => (newQtyReceivedById[l.id] !== undefined ? newQtyReceivedById[l.id] : Number(l.qty_received));
  const allFullyReceived = existingLines.every((l) => effectiveQty(l) >= Number(l.qty));
  const anyReceived = existingLines.some((l) => effectiveQty(l) > 0);
  let newStatus = allFullyReceived ? 'Received' : anyReceived ? 'Partially Received' : po.status;

  let invoiceId = null;
  if (invoice && invoiceLineItems.length > 0) {
    invoiceId = randomUUID();
    const subtotal = invoiceLineItems.reduce((s, li) => s + li.qty * li.unitCost, 0);
    const deliveryCharge = Number(invoice.deliveryCharge) || 0;
    const discount = Number(invoice.discount) || 0;
    const taxRate = Number(po.tax_rate) || 0;
    const tax = (subtotal - discount + deliveryCharge) * (taxRate / 100);
    const total = subtotal - discount + deliveryCharge + tax;
    queries.push(sql`
      insert into purchase_order_invoices (id, purchase_order_id, invoice_number, invoice_date, subtotal, tax, total, delivery_charge, discount, source, source_file_url, created_by)
      values (${invoiceId}, ${params.id}, ${invoice.invoiceNumber.trim()}, ${invoice.invoiceDate || sydneyToday()}, ${subtotal}, ${tax}, ${total},
        ${deliveryCharge}, ${discount}, ${invoice.source || 'manual'}, ${invoice.sourceFileUrl || null}, ${session.name})
    `);
    invoiceLineItems.forEach((li, i) => {
      queries.push(sql`
        insert into purchase_order_invoice_line_items (purchase_order_invoice_id, po_line_item_id, description, qty, unit_cost, supplier_product_code, sort_order)
        values (${invoiceId}, ${li.poLineItemId}, ${li.description}, ${li.qty}, ${li.unitCost}, ${li.supplierProductCode}, ${i})
      `);
    });
    activityMessages.push(`Logged invoice ${invoice.invoiceNumber.trim()} (${invoice.source === 'ai_import' ? 'AI-imported' : 'manual entry'})`);
    if (allFullyReceived) newStatus = 'Invoiced';
  }

  if (newStatus !== po.status) {
    queries.push(sql`update purchase_orders set status = ${newStatus}, updated_at = now() where id = ${params.id}`);
  } else {
    queries.push(sql`update purchase_orders set updated_at = now() where id = ${params.id}`);
  }
  activityMessages.forEach((msg) => {
    queries.push(sql`insert into po_activity (purchase_order_id, type, message, created_by) values (${params.id}, 'note', ${msg}, ${session.name})`);
  });
  if (newStatus !== po.status) {
    queries.push(sql`insert into po_activity (purchase_order_id, type, message, created_by) values (${params.id}, 'status_change', ${'Status changed from ' + po.status + ' to ' + newStatus}, ${session.name})`);
  }

  await sql.transaction(queries);

  const [updatedPo, updatedLines] = await Promise.all([
    sql`select * from purchase_orders where id = ${params.id}`,
    sql`select * from purchase_order_line_items where purchase_order_id = ${params.id} order by sort_order asc`
  ]);
  return NextResponse.json({ ...updatedPo[0], lineItems: updatedLines, invoiceId });
}
