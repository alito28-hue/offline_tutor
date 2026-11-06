// Proves both protections with real sockets: that the sandbox blocks, and that the monitor can see a socket.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { isLocalSocket, parseLsof, snapshot } from '../lib/netwatch.mjs';

const run = promisify(execFile);
const profile = path.join(path.dirname(fileURLToPath(import.meta.url)), '../tools/sandbox.sb');
const inSandbox = async code => (await run('/usr/bin/sandbox-exec', ['-f', profile, process.execPath, '--input-type=module', '-e', code])).stdout.trim();

test('sandbox blocks TCP to an IP address', async () => {
  const out = await inSandbox(`import net from 'node:net'; const s = net.connect({host:'1.1.1.1',port:53,timeout:4000}); s.once('connect',()=>{console.log('CONNECTED');s.destroy()}); s.once('timeout',()=>{console.log('TIMEOUT');s.destroy()}); s.once('error',e=>console.log(e.code));`);
  assert.equal(out, 'EPERM');
});
test('sandbox blocks TCP over IPv6', async () => {
  const out = await inSandbox(`import net from 'node:net'; const s = net.connect({host:'2606:4700:4700::1111',port:53,timeout:4000}); s.once('connect',()=>{console.log('CONNECTED');s.destroy()}); s.once('timeout',()=>{console.log('TIMEOUT');s.destroy()}); s.once('error',e=>console.log(e.code));`);
  assert.match(out, /^(EPERM|ENETUNREACH|EHOSTUNREACH)$/);
});
test('sandbox blocks UDP', async () => {
  const out = await inSandbox(`import dgram from 'node:dgram'; const s = dgram.createSocket('udp4'); s.send('x',53,'1.1.1.1',e=>{console.log(e?e.code:'SENT');s.close()});`);
  assert.equal(out, 'EPERM');
});
test('sandbox blocks DNS lookups', async () => {
  const out = await inSandbox(`import dns from 'node:dns/promises'; try { await dns.lookup('example.com'); console.log('RESOLVED') } catch (e) { console.log(e.code) }`);
  assert.notEqual(out, 'RESOLVED');
});
test('sandbox blocks a full HTTPS request', async () => {
  const out = await inSandbox(`try { const r = await fetch('https://example.com',{signal:AbortSignal.timeout(4000)}); console.log('REACHED',r.status) } catch { console.log('blocked') }`);
  assert.equal(out, 'blocked');
});
test('sandbox still allows the local UI on loopback', async () => {
  const out = await inSandbox(`import http from 'node:http'; const s = http.createServer((q,r)=>r.end('ok')).listen(0,'127.0.0.1',async()=>{const r = await fetch('http://127.0.0.1:'+s.address().port); console.log(await r.text()); s.close()});`);
  assert.equal(out, 'ok');
});

test('socket classification', () => {
  assert.equal(isLocalSocket('127.0.0.1:8788'), true);
  assert.equal(isLocalSocket('127.0.0.1:50000->127.0.0.1:8788'), true);
  assert.equal(isLocalSocket('[::1]:8788'), true);
  assert.equal(isLocalSocket('*:8788'), false);
  assert.equal(isLocalSocket('192.168.0.5:5000->1.1.1.1:443'), false);
  assert.equal(isLocalSocket('127.0.0.1:50000->1.1.1.1:443'), false);
});
test('lsof output parsing', () => {
  const rows = parseLsof('COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nnode 12 me 3u IPv4 0x1 0t0 TCP 10.0.0.2:5000->1.1.1.1:443 (ESTABLISHED)\n');
  assert.deepEqual(rows, [{ command: 'node', pid: 12, proto: 'TCP', name: '10.0.0.2:5000->1.1.1.1:443' }]);
});

function childWith(code) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.once('data', () => resolve(child));
    child.once('error', reject);
  });
}
test('monitor detects an external socket in a process tree (positive control)', async () => {
  const child = await childWith(`require('node:dgram').createSocket('udp4').bind(0,'0.0.0.0',()=>console.log('up')); setInterval(()=>{},1000)`);
  try {
    const snap = await snapshot(process.pid);
    assert.ok(snap.pids.includes(child.pid), 'the child should be in the tree');
    assert.ok(snap.external.some(s => s.pid === child.pid), JSON.stringify(snap.sockets));
  } finally { child.kill(); }
});
test('monitor does not flag a loopback server', async () => {
  const child = await childWith(`require('node:http').createServer().listen(0,'127.0.0.1',()=>console.log('up'))`);
  try {
    const snap = await snapshot(child.pid);
    assert.ok(snap.sockets.length >= 1);
    assert.deepEqual(snap.external, []);
  } finally { child.kill(); }
});
test('a blind monitor fails instead of reporting clean', async () => {
  await assert.rejects(snapshot(999999));
});
