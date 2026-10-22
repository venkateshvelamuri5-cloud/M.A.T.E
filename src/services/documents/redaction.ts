/**
 * PII redaction for user documents before they are stored as chunks or sent to any LLM.
 * When REDACTION_SERVICE_URL is set, text goes to the self-hosted Presidio service
 * (services/redactor), which also detects names and addresses. Otherwise, and as a safety net
 * on top of it, local patterns redact structured identifiers. Text never leaves our servers here.
 */

const LOCAL_PATTERNS: Array<[RegExp, string]> = [
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]'],
  // Indian passport (e.g. K1234567) and Continuous Discharge Certificate numbers (e.g. MUM 123456)
  [/\b[A-PR-WY][0-9]{7}\b/g, '[PASSPORT_REDACTED]'],
  [/\b(?:MUM|CAL|KOL|CHN|MAA|DEL|KOC|GOA|VSK)\s?-?\s?\d{5,7}\b/g, '[CDC_REDACTED]'],
  // Aadhaar (12 digits, often grouped 4-4-4) and PAN
  [/\b\d{4}\s?\d{4}\s?\d{4}\b/g, '[ID_REDACTED]'],
  [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[ID_REDACTED]'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[ID_REDACTED]'],
  // Phone numbers: with a country code, 10-digit Indian mobiles, and (555) 123-4567 style
  [/\+\d{1,3}(?:[\s.-]?\d){7,12}\b/g, '[PHONE_REDACTED]'],
  [/\b[6-9]\d{4}[\s-]?\d{5}\b/g, '[PHONE_REDACTED]'],
  [/\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[PHONE_REDACTED]'],
];

export function redactLocal(text: string): string {
  return LOCAL_PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

export function isRedactionServiceConfigured(): boolean {
  return Boolean(process.env.REDACTION_SERVICE_URL);
}

/**
 * Redacts a list of texts. Throws if the configured service fails, so callers never store
 * unredacted text by accident.
 */
export async function redactTexts(texts: string[]): Promise<string[]> {
  let redacted = texts;
  const serviceUrl = process.env.REDACTION_SERVICE_URL;
  if (serviceUrl) {
    const BATCH = 50;
    const out: string[] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const res = await fetch(`${serviceUrl.replace(/\/$/, '')}/redact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.REDACTION_SERVICE_TOKEN ? { Authorization: `Bearer ${process.env.REDACTION_SERVICE_TOKEN}` } : {}),
        },
        body: JSON.stringify({ texts: texts.slice(i, i + BATCH) }),
      });
      if (!res.ok) throw new Error(`Redaction service error (Status ${res.status}): ${await res.text()}`);
      const data = await res.json();
      if (!Array.isArray(data.texts) || data.texts.length !== Math.min(BATCH, texts.length - i)) {
        throw new Error('Redaction service returned an unexpected response');
      }
      out.push(...data.texts);
    }
    redacted = out;
  }
  return redacted.map(redactLocal);
}
