// Amara tutor server. It only listens on loopback and serves the UI with a CSP that blocks outside requests.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, toDocuments } from './lib/content.mjs';
import { createEngine, LLM_NAME } from './lib/engine.mjs';
import { createTutor } from './lib/tutor.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TUTOR_PORT || 8788);
const HOST = '127.0.0.1';
const STATUS_FILE = process.env.TUTOR_STATUS_FILE;
const STALE_MS = 3000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Only runs when the sandbox should be active, so it cannot itself become a network call.
function sandboxBlocksNetwork() {
  return new Promise(resolve => {
    const socket = net.connect({ host: '1.1.1.1', port: 53, timeout: 1500 });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', e => resolve(e.code === 'EPERM' || e.code === 'EACCES'));
  });
}

const sandboxed = process.env.TUTOR_SANDBOX === '1';
if (sandboxed && !(await sandboxBlocksNetwork())) {
  console.error('FATAL: the network sandbox is not blocking traffic. Stopping.');
  process.exit(3);
}

function netState() {
  // The desktop app shows only what the window itself can see: whether the computer is connected.
  if (process.env.TUTOR_DESKTOP === '1') return { state: 'desktop' };
  let watch = null;
  try { watch = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch { /* the monitor is not running */ }
  if (!watch || !(watch.samples > 0) || Date.now() - watch.at > STALE_MS) return { state: 'unverified', sandboxed };
  if (watch.external.length) return { state: 'external', sandboxed, samples: watch.samples, external: watch.external };
  return { state: watch.machineOnline ? 'no-calls' : 'offline', sandboxed, samples: watch.samples, machineOnline: watch.machineOnline };
}

let tutor = null;
let busy = false;
let warming = Promise.resolve();
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'";

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

async function handleAsk(req, res) {
  if (!tutor) return json(res, 503, { error: 'loading' });
  if (busy) return json(res, 429, { error: 'busy' });
  if (netState().state === 'external') return json(res, 503, { error: 'external-network-activity' });
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8192) return json(res, 413, { error: 'too large' });
  }
  const question = String(JSON.parse(body || '{}').question || '').trim();
  if (!question) return json(res, 400, { error: 'question is required' });
  busy = true;
  await warming;
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
  try {
    for await (const event of tutor.ask(question)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'done') log(`ask route=${event.route} lang=${event.lang} first=${event.firstTokenMs}ms total=${event.totalMs}ms words=${event.words} score=${event.score ?? '-'}`);
    }
  } catch (e) {
    log('ask failed:', e.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'internal error' })}\n\n`);
  } finally {
    busy = false;
    res.end();
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}`);
    // Rejects requests from other sites and DNS-rebinding hosts.
    if (req.headers.host !== `${HOST}:${PORT}` && req.headers.host !== `localhost:${PORT}`) return json(res, 403, { error: 'forbidden' });
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return json(res, 200, { ready: Boolean(tutor), busy, model: LLM_NAME, net: netState() });
    }
    if (req.method === 'POST' && url.pathname === '/api/ask') {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${HOST}:${PORT}` && origin !== `http://localhost:${PORT}`) return json(res, 403, { error: 'forbidden' });
      return await handleAsk(req, res);
    }
    if (req.method === 'POST' && url.pathname === '/api/reset') {
      tutor?.reset();
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET') {
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[a-z]+\.(html|css|js)$/.test(name)) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(name)], 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(path.join(here, 'public', name)));
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    log('request failed:', e.message);
    if (!res.headersSent) json(res, 500, { error: 'internal error' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => log(`listening on http://${HOST}:${PORT} (sandbox ${sandboxed ? 'on' : 'off'})`));

const files = loadPack(path.join(here, 'content'));
const started = performance.now();
const engine = await createEngine(toDocuments(files));
tutor = createTutor({ engine, files });
await engine.warm();

const KEEP_WARM_MS = Number(process.env.TUTOR_KEEP_WARM_MS ?? 15000);
if (KEEP_WARM_MS > 0) {
  setInterval(() => {
    if (busy) return;
    warming = engine.warm().catch(e => log('warm failed:', e.message));
  }, KEEP_WARM_MS).unref();
}
log(`ready in ${Math.round(performance.now() - started)} ms, ${files.length} files, model ${LLM_NAME}`);

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close();
  await Promise.race([engine.close(), new Promise(r => setTimeout(r, 3000))]).catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
