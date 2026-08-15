import { renderToBuffer } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { loadQuoteDocument } from '../../../../../lib/document-data';
import { QuotePdf } from '../../../../../lib/pdf/quote-pdf';
import { documentError } from '../../../../../lib/pdf/render';
import { sendEmail, textToHtml } from '../../../../../lib/email';

export const runtime = 'nodejs';

// Same gate as the print page and the PDF download route — emailing a
// quote is the same customer-facing action as either of those, just with
// an extra delivery step, so it can't be looser than what already guards
// the document itself.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.editQuotes(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const { to, subject, body } = await req.json();
  if (!to || !to.trim()) return NextResponse.json({ error: 'Enter a recipient email address' }, { status: 400 });
  if (!subject || !subject.trim()) return NextResponse.json({ error: 'Enter a subject' }, { status: 400 });

  const doc = await loadQuoteDocument(params.id);
  const problem = documentError(doc);
  if (problem) return problem;

  const recipient = to.trim();

  try {
    const buffer = await renderToBuffer(<QuotePdf {...doc} />);
    await sendEmail({
      to: recipient,
      subject: subject.trim(),
      text: body || '',
      html: textToHtml(body || ''),
      replyTo: doc.business.email || undefined,
      attachments: [{ filename: doc.filename, buffer }]
    });

    await sql`
      insert into document_sends (document_type, document_id, document_label, recipient_email, recipient_name, subject, body, status, sent_by)
      values ('quote', ${params.id}, ${doc.quote.quote_number}, ${recipient}, ${doc.quote.client_name}, ${subject.trim()}, ${body || ''}, 'Sent', ${session.name})
    `;

    // Emailing is the customer-facing "sending" action for a quote, same as
    // manually flipping status on the Status tab — doing it here saves the
    // extra step and keeps the status honest with what actually happened.
    const rows = await sql`
      update quotes set status = 'Sent', updated_at = now() where id = ${params.id} and status = 'Draft'
      returning *
    `;

    return NextResponse.json({ ok: true, quote: rows[0] || null });
  } catch (err) {
    console.error('Send quote email error:', err);
    // Best-effort: logging the failure must never hide the failure itself
    // (e.g. if document_sends' own migration hasn't landed yet, that
    // insert would throw too) — swallow this one and still return err.
    try {
      await sql`
        insert into document_sends (document_type, document_id, document_label, recipient_email, recipient_name, subject, body, status, error_message, sent_by)
        values ('quote', ${params.id}, ${doc.quote.quote_number}, ${recipient}, ${doc.quote.client_name}, ${subject.trim()}, ${body || ''}, 'Failed', ${err.message || 'Unknown error'}, ${session.name})
      `;
    } catch (logErr) {
      console.error('Could not log failed send:', logErr);
    }
    return NextResponse.json({ error: err.message || 'Could not send email' }, { status: 502 });
  }
}
