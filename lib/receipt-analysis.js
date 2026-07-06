import { RECEIPT_CATEGORIES } from './receipt-categories';

// Reads a receipt photo with Claude's vision API and returns best-effort
// structured fields. Never throws for "Claude got it wrong" — only for
// "we couldn't reach Claude at all" (missing key, network, bad response),
// so the caller can fall back to an empty form instead of failing the
// whole upload.
export async function analyzeReceiptImage(base64Data, mediaType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set.');
  }

  const prompt = `You are extracting structured data from a photo of a purchase receipt or invoice for an Australian small business's tax records. Look at the image and return ONLY a JSON object (no markdown formatting, no code fences, no explanation before or after) with these exact keys:

{
  "vendor": string (the store/business name, or "" if unreadable),
  "date": string in YYYY-MM-DD format (the purchase date shown on the receipt), or "" if not found,
  "amount": number (the TOTAL amount paid including any tax, as a plain number with no currency symbol or commas; 0 if not found),
  "gst": number (the GST/tax amount shown on the receipt as a plain number; 0 if not shown or not applicable),
  "category": one of exactly ${JSON.stringify(RECEIPT_CATEGORIES)} — pick the single best match for what was purchased,
  "description": string, a short description (under 10 words) of what was purchased
}

If the image is not a receipt or invoice at all, still return the JSON with empty/zero values as appropriate. Return nothing but the JSON object.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: prompt }
          ]
        }
      ]
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Claude API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Could not parse a response from Claude.');
  }

  return {
    vendor: typeof parsed.vendor === 'string' ? parsed.vendor : '',
    date: typeof parsed.date === 'string' ? parsed.date : '',
    amount: Number(parsed.amount) || 0,
    gst: Number(parsed.gst) || 0,
    category: RECEIPT_CATEGORIES.includes(parsed.category) ? parsed.category : 'Other',
    description: typeof parsed.description === 'string' ? parsed.description : ''
  };
}
