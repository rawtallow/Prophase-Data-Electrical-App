// Thin wrapper around Resend's REST API — called directly via fetch rather
// than pulling in the `resend` package, since the whole integration is one
// POST with a JSON body. Needs RESEND_API_KEY set in the environment (and,
// once the sending domain is verified, EMAIL_FROM) or every send throws
// before making a network call, so a missing key fails loudly in the API
// route's catch block instead of silently going nowhere.

const RESEND_API_URL = 'https://api.resend.com/emails';

// resend.dev is Resend's shared sandbox sender — works out of the box with
// no domain verification, but Resend only actually delivers mail sent from
// it to the account's own verified address. It's a safe zero-config default
// for wiring things up locally; production sending to real customers needs
// a verified domain in EMAIL_FROM (see the Compliance page's Business
// Details panel for the reply-to address customers see instead).
const DEFAULT_FROM = 'PROPHASE Data and Electrical <onboarding@resend.dev>';

// `attachments` is an array of { filename, buffer } — converted to
// Resend's base64 `content` field here so callers just hand over a Buffer
// straight from @react-pdf/renderer's renderToBuffer().
export async function sendEmail({ to, subject, text, html, replyTo, attachments = [] }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Email sending isn\'t configured yet — RESEND_API_KEY is missing.');
  }

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [to],
      reply_to: replyTo || undefined,
      subject,
      text,
      html,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: a.buffer.toString('base64')
      }))
    })
  });

  if (!res.ok) {
    // Resend returns a JSON body describing what went wrong (bad address,
    // unverified domain, etc.) — surface that instead of a bare status
    // code so the toast the user sees is actually actionable.
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Email provider returned ${res.status}`);
  }

  return res.json();
}

// Turns plain-text body into a minimal HTML version (paragraphs from blank
// lines, line breaks preserved) so the email doesn't arrive as a single
// unformatted wall of text in clients that prefer HTML — without needing a
// templating dependency for what's a short, simple message.
export function textToHtml(text) {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = escaped.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`);
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #161616; line-height: 1.5;">${paragraphs.join('')}</div>`;
}
