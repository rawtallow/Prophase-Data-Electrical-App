import { renderToBuffer } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';
import { getSession, CAN } from '../../../../../lib/auth';
import { loadInvoiceDocument } from '../../../../../lib/document-data';
import { InvoicePdf } from '../../../../../lib/pdf/invoice-pdf';
import { documentError } from '../../../../../lib/pdf/render';
import { sendEmail, textToHtml } from '../../../../../lib/email';

export const runtime = 'nodejs';

// Named send-invoice, not send, to match invoice-pdf's naming — a job can
// grow other emailable documents later. Same gate as the invoice PDF/print
// routes: this is a financial document, so it follows viewFinancials.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session || !CAN.viewFinancials(session.role)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const { to, subject, body } = await req.json();
  if (!to || !to.trim()) return NextResponse.json({ error: 'Enter a recipient email address' }, { status: 400 });
  if (!subject || !subject.trim()) return NextResponse.json({ error: 'Enter a subject' }, { status: 400 });

  const doc = await loadInvoiceDocument(params.id);
  const problem = documentError(doc);
  if (problem) return problem;

  const recipient = to.trim();

  try {
    const buffer = await renderToBuffer(<InvoicePdf {...doc} />);
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
      values ('invoice', ${params.id}, ${doc.job.job_number}, ${recipient}, ${doc.job.client_name}, ${subject.trim()}, ${body || ''}, 'Sent', ${session.name})
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Send invoice email error:', err);
    // Best-effort: logging the failure must never hide the failure itself
    // (e.g. if document_sends' own migration hasn't landed yet, that
    // insert would throw too) — swallow this one and still return err.
    try {
      await sql`
        insert into document_sends (document_type, document_id, document_label, recipient_email, recipient_name, subject, body, status, error_message, sent_by)
        values ('invoice', ${params.id}, ${doc.job.job_number}, ${recipient}, ${doc.job.client_name}, ${subject.trim()}, ${body || ''}, 'Failed', ${err.message || 'Unknown error'}, ${session.name})
      `;
    } catch (logErr) {
      console.error('Could not log failed send:', logErr);
    }
    return NextResponse.json({ error: err.message || 'Could not send email' }, { status: 502 });
  }
}
