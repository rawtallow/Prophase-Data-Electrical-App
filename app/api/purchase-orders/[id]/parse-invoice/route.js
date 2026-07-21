import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const EXTRACTION_SYSTEM_PROMPT = `You are reading a supplier invoice (a photo or PDF) for an Australian electrical contracting business. Extract the invoice data and respond with ONLY a single JSON object — no markdown, no code fences, no commentary before or after — matching exactly this shape:

{
  "supplierName": string,
  "invoiceNumber": string,
  "invoiceDate": "YYYY-MM-DD",
  "poNumberReferenced": string or null,
  "lineItems": [{ "description": string, "supplierProductCode": string, "qty": number, "unitCost": number }],
  "subtotal": number,
  "gst": number,
  "discount": number,
  "deliveryCharge": number,
  "total": number,
  "notes": string
}

unitCost is the price PER UNIT (not the line's extended total) — divide if the invoice only shows a line total. If a field genuinely is not present on the invoice, use an empty string "" for text fields, null for poNumberReferenced, and 0 for numbers — never omit a key. If the invoice date isn't in ISO format, convert it. If GST/discount/delivery aren't itemized separately, use 0 for those and fold them into what's visible in subtotal/total as printed.`;

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Loose, rule-based matching only — good enough for a review-before-save
// screen where a human confirms everything anyway, not a claim of true
// fuzzy matching. Prefers supplier_product_code (exact, when both sides
// have one) and falls back to substring containment on the description.
function matchLineItem(extracted, poLines) {
  const extCode = normalize(extracted.supplierProductCode);
  if (extCode) {
    const byCode = poLines.find((l) => normalize(l.supplier_product_code) === extCode);
    if (byCode) return byCode;
  }
  const extDesc = normalize(extracted.description);
  if (!extDesc) return null;
  return poLines.find((l) => {
    const poDesc = normalize(l.description);
    return poDesc && (extDesc.includes(poDesc) || poDesc.includes(extDesc));
  }) || null;
}

// Reads an uploaded PDF/photo of a supplier invoice with Claude's vision
// capability and returns structured, human-reviewable data — this route
// never writes to the database itself. The caller reviews/edits the result
// client-side, then submits it through the existing receive endpoint
// (POST .../receive with an `invoice` block, source: 'ai_import') exactly
// like a manually-typed invoice would be. Also flags likely duplicates
// (same supplier + invoice number already on file, anywhere) and a PO-number
// mismatch (the invoice references a different PO than the one it was
// uploaded against) so the review screen can surface a warning instead of
// silently importing into the wrong order.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewFinancials(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI invoice import is not configured yet — add ANTHROPIC_API_KEY to this project\'s environment variables.' },
      { status: 501 }
    );
  }

  const poRows = await sql`select * from purchase_orders where id = ${params.id}`;
  const po = poRows[0];
  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'A file is required' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File must be a JPEG, PNG, WebP, or PDF' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const contentBlock = file.type === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } };

  let extracted;
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Extract this invoice as the JSON object described in your instructions.' }] }]
      })
    });
    if (!aiRes.ok) {
      const errBody = await aiRes.text().catch(() => '');
      console.error('Anthropic API error:', aiRes.status, errBody);
      return NextResponse.json({ error: 'Could not read the invoice — the AI service returned an error' }, { status: 502 });
    }
    const aiJson = await aiRes.json();
    const text = aiJson.content?.[0]?.text || '';
    extracted = JSON.parse(text);
  } catch (err) {
    console.error('Invoice parse error:', err);
    return NextResponse.json({ error: 'Could not read the invoice — try a clearer photo or a different file' }, { status: 502 });
  }

  // Kept for audit regardless of whether the review is ultimately confirmed
  // or discarded — same cost/benefit tradeoff as other upload flows in this
  // app that don't clean up an orphaned blob if the user backs out.
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const blob = await put(`purchase-orders/${params.id}/invoices/${Date.now()}-${session.id}.${ext}`, buffer, {
    access: 'public',
    contentType: file.type,
    addRandomSuffix: true
  });

  // Duplicate check — same supplier + invoice number already logged anywhere,
  // not just on this PO (catches uploading the same invoice twice by mistake
  // against different POs, or re-uploading against the same one).
  const dupeRows = await sql`
    select pi.id, pi.invoice_number, po2.po_number
    from purchase_order_invoices pi
    join purchase_orders po2 on po2.id = pi.purchase_order_id
    where lower(pi.invoice_number) = lower(${extracted.invoiceNumber || ''}) and po2.supplier_name = ${po.supplier_name}
  `;
  const duplicateWarning = dupeRows[0]
    ? `An invoice numbered "${dupeRows[0].invoice_number}" from ${po.supplier_name} is already logged against ${dupeRows[0].po_number}.`
    : null;

  const poMismatchWarning = extracted.poNumberReferenced && normalize(extracted.poNumberReferenced) !== normalize(po.po_number)
    ? `This invoice references "${extracted.poNumberReferenced}", but you're uploading it against ${po.po_number} — double-check this is the right purchase order.`
    : null;

  const poLines = await sql`select * from purchase_order_line_items where purchase_order_id = ${params.id}`;
  const lineItems = (extracted.lineItems || []).map((li) => {
    const matched = matchLineItem(li, poLines);
    return {
      ...li,
      matchedLineItemId: matched?.id || null,
      poUnitCost: matched ? Number(matched.unit_cost) : null,
      poQty: matched ? Number(matched.qty) : null,
      priceMismatch: matched ? Number(li.unitCost) !== Number(matched.unit_cost) : false,
      qtyMismatch: matched ? Number(li.qty) !== Number(matched.qty) - Number(matched.qty_received) : false
    };
  });

  return NextResponse.json({
    ...extracted,
    lineItems,
    sourceFileUrl: blob.url,
    duplicateWarning,
    poMismatchWarning
  });
}
