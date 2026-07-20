import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { sydneyToday } from '../../../../../lib/format';

export const runtime = 'nodejs';

// Logs materials arriving against a PO: bumps each line's qty_received (never
// past its ordered qty), bumps parts.qty_on_hand for lines linked to Spare
// Parts inventory, and recomputes the PO's overall status from every line's
// received total. Optionally also logs the supplier's invoice for this same
// delivery — invoice number/date plus a per-line cost (pre-filled from the
// PO but the caller may have adjusted it to match what was actually billed)
// — combined into one action since the goods and the paperwork usually
// arrive together. Invoice logging is gated separately (CAN.viewFinancials,
// it's money) from the quantity receiving itself, which any role can do.
// Runs as one transaction (same atomic pattern as app/api/backup/import/
// route.js) so a receive action, with or without an invoice, can't half-apply.
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

  const queries = [];
  const newQtyReceivedById = {};
  const invoiceLineItems = [];

  for (const { lineItemId, qtyNow } of lines) {
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
      queries.push(sql`update parts set qty_on_hand = qty_on_hand + ${clamped} where id = ${line.part_id}`);
    }
    if (invoice) {
      const rawCost = invoiceCostById[lineItemId];
      const unitCost = rawCost !== undefined && !Number.isNaN(rawCost) ? rawCost : Number(line.unit_cost) || 0;
      invoiceLineItems.push({ poLineItemId: lineItemId, description: line.description, qty: clamped, unitCost });
    }
  }

  if (queries.length === 0) {
    return NextResponse.json({ error: 'Nothing to receive — check the quantities entered' }, { status: 400 });
  }

  const effectiveQty = (l) => (newQtyReceivedById[l.id] !== undefined ? newQtyReceivedById[l.id] : Number(l.qty_received));
  const allFullyReceived = existingLines.every((l) => effectiveQty(l) >= Number(l.qty));
  const anyReceived = existingLines.some((l) => effectiveQty(l) > 0);
  const newStatus = allFullyReceived ? 'Received' : anyReceived ? 'Partially Received' : po.status;
  queries.push(sql`update purchase_orders set status = ${newStatus} where id = ${params.id}`);

  let invoiceId = null;
  if (invoice && invoiceLineItems.length > 0) {
    invoiceId = randomUUID();
    const subtotal = invoiceLineItems.reduce((s, li) => s + li.qty * li.unitCost, 0);
    const taxRate = Number(po.tax_rate) || 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;
    queries.push(sql`
      insert into purchase_order_invoices (id, purchase_order_id, invoice_number, invoice_date, subtotal, tax, total, created_by)
      values (${invoiceId}, ${params.id}, ${invoice.invoiceNumber.trim()}, ${invoice.invoiceDate || sydneyToday()}, ${subtotal}, ${tax}, ${total}, ${session.name})
    `);
    invoiceLineItems.forEach((li, i) => {
      queries.push(sql`
        insert into purchase_order_invoice_line_items (purchase_order_invoice_id, po_line_item_id, description, qty, unit_cost, sort_order)
        values (${invoiceId}, ${li.poLineItemId}, ${li.description}, ${li.qty}, ${li.unitCost}, ${i})
      `);
    });
  }

  await sql.transaction(queries);

  const [updatedPo, updatedLines] = await Promise.all([
    sql`select * from purchase_orders where id = ${params.id}`,
    sql`select * from purchase_order_line_items where purchase_order_id = ${params.id} order by sort_order asc`
  ]);
  return NextResponse.json({ ...updatedPo[0], lineItems: updatedLines, invoiceId });
}
