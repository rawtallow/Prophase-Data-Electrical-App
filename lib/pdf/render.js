import { renderToBuffer } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';

// Shared tail end of every PDF route: turn the element into bytes and hand
// it back with headers that make a browser download it under a readable
// name. `inline` opens it in the browser's PDF viewer instead — used by the
// preview links, so a quote can be eyeballed before it goes out.
export async function pdfResponse(element, filename, { inline = false } = {}) {
  const buffer = await renderToBuffer(element);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      // These are generated per-request from live data (a payment logged a
      // minute ago must show up), so never let a proxy or the browser
      // serve a stale copy.
      'Cache-Control': 'no-store'
    }
  });
}

// A loader returning null means the record doesn't exist; returning
// { error } means it exists but a business rule refuses the document (an
// unapproved quote, an uninvoiced job). 409 rather than 400 because the
// request was well-formed — it's the record's state that's wrong.
export function documentError(doc) {
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (doc.error) return NextResponse.json({ error: doc.error.message }, { status: 409 });
  return null;
}
