// Receives feedback and bug reports from the site and emails them through Resend. It stores nothing and logs no personal data.
// Environment: RESEND_API_KEY and PILOT_TO_EMAIL are required; PILOT_FROM_EMAIL is optional.
const MAX_BODY = 20_000;
const KINDS = ['bug', 'idea', 'other'];
const MESSAGE_LIMIT = 4000;

const clean = value => (typeof value === 'string' ? value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim() : '');
const oneLine = value => clean(value).replace(/\s+/g, ' ');

// Returns the cleaned report, or null if anything is missing or out of range.
export function validate(data) {
  if (!data || typeof data !== 'object' || !KINDS.includes(data.kind)) return null;
  const message = clean(data.message);
  if (!message || message.length > MESSAGE_LIMIT) return null;
  const device = oneLine(data.device);
  if (device.length > 200) return null;
  const email = oneLine(data.email);
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return null;
  return { kind: data.kind, message, device, email, page: ['en', 'es', 'pt'].includes(data.page) ? data.page : 'en' };
}

export function emailText(r) {
  return [
    `Type: ${r.kind}`,
    `Computer or phone: ${r.device || '(not given)'}`,
    `Email: ${r.email || '(not given)'}`,
    `Page language: ${r.page}`,
    '',
    'Message:',
    r.message,
  ].join('\n');
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json(405, { ok: false });
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json(413, { ok: false });
    let data;
    try { data = JSON.parse(raw); } catch { return json(400, { ok: false }); }
    // A filled honeypot gets the same answer as a real report, so bots learn nothing.
    if (clean(data?.website)) return json(200, { ok: true });
    const report = validate(data);
    if (!report) return json(400, { ok: false });

    const { RESEND_API_KEY: key, PILOT_TO_EMAIL: to, PILOT_FROM_EMAIL: from = 'Amara <onboarding@resend.dev>' } = process.env;
    if (!key || !to) {
      console.error('feedback: email is not configured');
      return json(500, { ok: false });
    }
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        ...(report.email ? { reply_to: report.email } : {}),
        subject: `Amara feedback: ${report.kind}`,
        text: emailText(report),
      }),
    }).catch(() => null);
    if (!sent?.ok) {
      console.error(`feedback: Resend answered ${sent?.status ?? 'nothing'}`);
      return json(502, { ok: false });
    }
    return json(200, { ok: true });
  },
};
