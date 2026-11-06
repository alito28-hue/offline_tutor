// Receives "Request a pilot" and emails it through Resend. It stores nothing and logs no personal data.
// Environment: RESEND_API_KEY and PILOT_TO_EMAIL are required; PILOT_FROM_EMAIL is optional.
const MAX_BODY = 20_000;
const TEXT_LIMITS = { organization: 200, country: 100, name: 120, role: 120, teachingLanguage: 100 };
const CONNECTIVITY = ['none', 'poor', 'good'];
const DEVICES = ['windows', 'mac', 'linux', 'android', 'none'];
const MESSAGE_LIMIT = 3000;

const clean = value => (typeof value === 'string' ? value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim() : '');
const oneLine = value => clean(value).replace(/\s+/g, ' ');

// Returns the cleaned request, or null if anything is missing or out of range.
export function validate(data) {
  if (!data || typeof data !== 'object') return null;
  const out = {};
  for (const [field, limit] of Object.entries(TEXT_LIMITS)) {
    out[field] = oneLine(data[field]);
    if (!out[field] || out[field].length > limit) return null;
  }
  out.email = oneLine(data.email);
  if (out.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return null;
  out.students = Number(data.students);
  if (!Number.isInteger(out.students) || out.students < 1 || out.students > 10_000_000) return null;
  if (!CONNECTIVITY.includes(data.connectivity)) return null;
  out.connectivity = data.connectivity;
  const devices = data.devices;
  if (!Array.isArray(devices) || !devices.length || !devices.every(d => DEVICES.includes(d))) return null;
  if (devices.includes('none') && devices.length > 1) return null;
  out.devices = [...new Set(devices)];
  out.message = clean(data.message);
  if (out.message.length > MESSAGE_LIMIT) return null;
  out.page = ['en', 'es', 'pt'].includes(data.page) ? data.page : 'en';
  return out;
}

export function emailText(r) {
  return [
    `Organization: ${r.organization}`,
    `Country: ${r.country}`,
    `Contact: ${r.name} (${r.role})`,
    `Email: ${r.email}`,
    `Approximate students: ${r.students}`,
    `Connectivity: ${r.connectivity}`,
    `Devices: ${r.devices.join(', ')}`,
    `Teaching language: ${r.teachingLanguage}`,
    `Page language: ${r.page}`,
    '',
    'Message:',
    r.message || '(none)',
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
    // A filled honeypot gets the same answer as a real request, so bots learn nothing.
    if (clean(data?.website)) return json(200, { ok: true });
    const pilot = validate(data);
    if (!pilot) return json(400, { ok: false });

    const { RESEND_API_KEY: key, PILOT_TO_EMAIL: to, PILOT_FROM_EMAIL: from = 'Amara <onboarding@resend.dev>' } = process.env;
    if (!key || !to) {
      console.error('pilot: email is not configured');
      return json(500, { ok: false });
    }
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: pilot.email,
        subject: `Pilot request: ${pilot.organization} (${pilot.country})`,
        text: emailText(pilot),
      }),
    }).catch(() => null);
    if (!sent?.ok) {
      console.error(`pilot: Resend answered ${sent?.status ?? 'nothing'}`);
      return json(502, { ok: false });
    }
    return json(200, { ok: true });
  },
};
