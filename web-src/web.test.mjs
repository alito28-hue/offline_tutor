// Run: node --test web-src/web.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pilot, { emailText, validate } from '../web/api/pilot.mjs';
import { build } from './build.mjs';

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '../web');
const pages = build(false);
const good = {
  organization: 'Escuela 12', country: 'Perú', name: 'Ana', role: 'Directora', email: 'ana@example.org',
  students: '120', teachingLanguage: 'Spanish', connectivity: 'poor', devices: ['windows', 'android'], message: 'Hola', page: 'es',
};
const post = body => pilot.fetch(new Request('http://x/api/pilot', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; delete process.env.RESEND_API_KEY; delete process.env.PILOT_TO_EMAIL; });

function fakeResend(status = 200) {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('{}', { status }); };
  process.env.RESEND_API_KEY = 'test';
  process.env.PILOT_TO_EMAIL = 'to@example.org';
  return calls;
}

test('generated pages are up to date', () => {
  for (const [file, html] of Object.entries(pages)) assert.equal(fs.readFileSync(path.join(web, file), 'utf8'), html, file);
});

test('every page declares its language and all alternates', () => {
  for (const [file, html] of Object.entries(pages)) {
    const lang = file.startsWith('/es/') ? 'es' : file.startsWith('/pt/') ? 'pt' : 'en';
    assert.match(html, new RegExp(`<html lang="${lang}">`), file);
    for (const code of ['en', 'es', 'pt', 'x-default']) assert.match(html, new RegExp(`hreflang="${code}" href="https://`), file);
    assert.ok(!/\{\{/.test(html), file);
    assert.match(html, /class="lang"/, file);
  }
});

test('pages keep the removed language and platform claims out', () => {
  for (const [file, html] of Object.entries(pages)) {
    assert.ok(!/\/sw\/|swahili|suajili|suaíli/i.test(html), file);
    assert.ok(!/gmail\.com|@[a-z]+\.[a-z]/i.test(html), file);
  }
});

test('the form asks nothing about individual students', () => {
  for (const [file, html] of Object.entries(pages)) {
    if (!file.endsWith('privacy/index.html')) assert.deepEqual([...html.matchAll(/ name="(\w+)"/g)].map(m => m[1]).filter((n, i, a) => a.indexOf(n) === i && n !== 'description' && n !== 'viewport' && n !== 'twitter:card'),
      ['organization', 'country', 'name', 'role', 'email', 'students', 'teachingLanguage', 'connectivity', 'devices', 'message', 'website'], file);
  }
});

test('the Portuguese page warns that the tutor does not answer in Portuguese', () => {
  assert.match(pages['/pt/index.html'], /class="notice".*não responde em português/);
  assert.ok(!pages['/es/index.html'].includes('class="notice"'));
});

test('no page depends on anything outside the site', () => {
  for (const [file, html] of Object.entries(pages)) assert.ok(!/(src|href)="https:\/\/fonts|style="|<style|<script>/.test(html), file);
});

test('validate rejects bad requests', () => {
  assert.ok(validate(good));
  for (const change of [{ email: 'nope' }, { email: 'a@b.co\nBcc: x@y.z@' }, { students: '0' }, { students: '1.5' }, { connectivity: 'great' }, { devices: [] },
    { devices: ['none', 'mac'] }, { devices: ['toaster'] }, { organization: '' }, { message: 'x'.repeat(3001) }]) {
    assert.equal(validate({ ...good, ...change }), null, JSON.stringify(change).slice(0, 60));
  }
});

test('a valid request is emailed as plain text, with the sender as reply-to', async () => {
  const calls = fakeResend();
  const res = await post(good);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.to, ['to@example.org']);
  assert.equal(calls[0].body.reply_to, 'ana@example.org');
  assert.equal(calls[0].body.html, undefined);
  assert.match(calls[0].body.text, /Approximate students: 120/);
});

test('line breaks cannot reach the subject', async () => {
  const calls = fakeResend();
  await post({ ...good, organization: 'A\r\nBcc: x@y.z' });
  assert.ok(!/[\r\n]/.test(calls[0].body.subject));
});

test('a filled honeypot looks successful but sends nothing', async () => {
  const calls = fakeResend();
  const res = await post({ ...good, website: 'http://spam' });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

test('failures are reported and never claimed as success', async () => {
  fakeResend(500);
  assert.equal((await post(good)).status, 502);
  delete process.env.RESEND_API_KEY;
  assert.equal((await post(good)).status, 500);
  assert.equal((await post('{bad')).status, 400);
  assert.equal((await post('x'.repeat(20001))).status, 413);
  assert.equal((await pilot.fetch(new Request('http://x/api/pilot'))).status, 405);
});

test('emailText keeps the message', () => { assert.match(emailText(validate(good)), /Message:\nHola/); });
