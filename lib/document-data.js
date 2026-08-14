import { sql } from './db';
import { safeFilename } from './documents';

// Single source of truth for the data behind the three business-facing
// documents — the quote, the job tax invoice, and the purchase order.
// (Distinct from ./documents.js, which *builds* the Word documents; this
// module only loads and normalizes data.)
//
// Each document has two presentations: the on-screen print page under
// app/(app)/.../print (kept so the browser-print workflow still works) and
// the generated PDF under lib/pdf. Both call the loader below, so the
// figures on screen and the figures in the PDF can never disagree even if
// the two layouts drift apart visually. Every derived number (validity
// window, GST split, balance due, the synthesized line for an un-itemized
// invoice) lives here rather than being recomputed per presentation.
//
// A loader returns either { error: { title, message } } — a business-rule
// refusal the caller renders as a panel or returns as a 409 — or the
// document data. A genuinely missing record returns null so the caller can
// 404 instead.

const TRADING_NAME_FALLBACK = 'PROPHASE Data and Electrical';
const TRADING_TAG = 'Electrical Contracting Services';

// Standard trade-quote practice: pricing is only held for a limited window,
// so a supplier cost swing months later doesn't leave the business stuck
// honouring a stale number. Business-wide policy, so it's a constant here
// rather than a per-quote stored column.
const QUOTE_VALID_DAYS = 30;

// A GST-inclusive total divided by 11 is its GST component — the standard
// ATO calculation, used when a job was invoiced as a single typed figure
// rather than built up from line items.
const GST_INCLUSIVE_DIVISOR = 11;

async function loadBusiness() {
  const rows = await sql`select * from business_settings where id = 1`;
  const b = rows[0] || {};
  return {
    name: b.legal_name || TRADING_NAME_FALLBACK,
    tag: TRADING_TAG,
    abn: b.abn || '',
    address: b.address || '',
    phone: b.phone || '',
    email: b.email || '',
    website: b.website || '',
    licenseNumber: b.contractor_license_number || '',
    bankName: b.bank_name || '',
    bankBsb: b.bank_bsb || '',
    bankAccount: b.bank_account || '',
    paymentTerms: b.payment_terms || '',
    // Drives whether the PDF renders a "how to pay" block at all — an
    // invoice with no remittance details on file should omit the section
    // rather than print an empty box full of dashes.
    hasBankDetails: !!(b.bank_bsb || b.bank_account)
  };
}

export async function loadQuoteDocument(id) {
  const [business, quotes, lineItems] = await Promise.all([
    loadBusiness(),
    sql`select * from quotes where id = ${id}`,
    sql`select * from quote_line_items where quote_id = ${id} order by sort_order asc`
  ]);
  const quote = quotes[0];
  if (!quote) return null;

  if (quote.approval_status !== 'Approved') {
    return {
      error: {
        title: 'Not approved yet',
        message: `Quote ${quote.quote_number} must be approved before it can be printed or sent to the customer.`
      }
    };
  }

  const validUntil = new Date(quote.date);
  validUntil.setDate(validUntil.getDate() + QUOTE_VALID_DAYS);

  return {
    business,
    quote,
    validUntil,
    lineItems: lineItems.map((li) => ({ ...li, lineTotal: Number(li.qty) * Number(li.price) })),
    filename: safeFilename(`Quote-${quote.quote_number}.pdf`)
  };
}

export async function loadInvoiceDocument(id) {
  const [business, jobs, lineItems, payments] = await Promise.all([
    loadBusiness(),
    sql`select * from jobs where id = ${id}`,
    sql`select * from job_line_items where job_id = ${id} order by sort_order asc`,
    sql`select * from job_payments where job_id = ${id} order by date asc, created_at asc`
  ]);
  const job = jobs[0];
  if (!job) return null;

  const invoiced = Number(job.amount_invoiced);
  if (invoiced <= 0) {
    return {
      error: {
        title: 'Not invoiced yet',
        message: `Job ${job.job_number} hasn't been invoiced yet — add a total or line items on the Edit form first.`
      }
    };
  }

  const client = job.client_id ? (await sql`select * from clients where id = ${job.client_id}`)[0] : null;
  const paid = Number(job.amount_paid);

  // Every invoiced job produces a valid document regardless of whether it
  // was itemized — a job with just a typed total falls back to one
  // synthesized line rather than an empty items table.
  const itemized = lineItems.length > 0;
  const displayItems = (itemized
    ? lineItems
    : [{ id: 'synthesized', description: job.job_description || job.job_number, qty: 1, price: invoiced }]
  ).map((li) => ({ ...li, lineTotal: Number(li.qty) * Number(li.price) }));

  // An itemized job has a real ex-GST subtotal to split from (the API
  // builds amount_invoiced as subtotal + 10%). A typed total was never
  // taxed-and-summed, so rather than fabricate a subtotal we treat the
  // figure as GST-inclusive and state the GST component — which is what
  // the ATO accepts for an invoice built that way.
  const itemsSubtotal = lineItems.reduce((s, li) => s + Number(li.qty) * Number(li.price), 0);
  const totals = itemized
    ? { subtotal: itemsSubtotal, gst: itemsSubtotal * 0.1, total: itemsSubtotal * 1.1, gstInclusive: false }
    : { subtotal: null, gst: invoiced / GST_INCLUSIVE_DIVISOR, total: invoiced, gstInclusive: true };

  return {
    business,
    job,
    client,
    lineItems,
    displayItems,
    payments,
    totals,
    invoiced,
    paid,
    balance: invoiced - paid,
    paidLabel: paid >= invoiced ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Unpaid',
    filename: safeFilename(`Tax-Invoice-${job.job_number}.pdf`)
  };
}

export async function loadPurchaseOrderDocument(id) {
  const [business, pos, lineItems] = await Promise.all([
    loadBusiness(),
    sql`select * from purchase_orders where id = ${id}`,
    sql`select * from purchase_order_line_items where purchase_order_id = ${id} order by sort_order asc`
  ]);
  const po = pos[0];
  if (!po) return null;

  if (po.approval_status !== 'Approved') {
    return {
      error: {
        title: 'Not approved yet',
        message: `Purchase order ${po.po_number} must be approved before it can be printed or sent to the supplier.`
      }
    };
  }

  return {
    business,
    po,
    lineItems: lineItems.map((li) => ({ ...li, lineTotal: Number(li.qty) * Number(li.unit_cost) })),
    filename: safeFilename(`Purchase-Order-${po.po_number}.pdf`)
  };
}
