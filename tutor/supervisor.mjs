// Starts the tutor inside the kernel network sandbox and watches it from outside.
// The watcher has to live out here: inside the sandbox, ps and lsof cannot see other processes.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineHasRoute, snapshot } from './lib/netwatch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const statusFile = process.env.TUTOR_STATUS_FILE || path.join(here, '.run/net-status.json');
const sandbox = process.env.TUTOR_NO_SANDBOX !== '1';
fs.mkdirSync(path.dirname(statusFile), { recursive: true });

const server = path.join(here, 'server.mjs');
const env = { ...process.env, TUTOR_STATUS_FILE: statusFile, TUTOR_SANDBOX: sandbox ? '1' : '0' };
const cmd = sandbox ? ['/usr/bin/sandbox-exec', '-f', path.join(here, 'tools/sandbox.sb'), process.execPath, server] : [process.execPath, server];
const child = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', env });

const seen = new Map();
let samples = 0;
let busy = false;

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const [snap, online] = await Promise.all([snapshot(child.pid), machineHasRoute()]);
    samples++;
    for (const s of snap.external) {
      const key = `${s.command}|${s.proto}|${s.name}`;
      if (!seen.has(key)) {
        seen.set(key, s);
        console.error('[netwatch] EXTERNAL SOCKET', JSON.stringify(s));
      }
    }
    const tmp = `${statusFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({
      at: Date.now(), samples, processes: snap.pids.length, machineOnline: online, external: [...seen.values()],
    }));
    fs.renameSync(tmp, statusFile);
  } catch (e) {
    console.error('[netwatch] sample failed:', e.message);
  }
  busy = false;
}

const timer = setInterval(tick, 500);
tick();

const stop = signal => child.kill(signal);
process.on('SIGINT', () => stop('SIGTERM'));
process.on('SIGTERM', () => stop('SIGTERM'));
child.on('exit', code => {
  clearInterval(timer);
  fs.rmSync(statusFile, { force: true });
  process.exit(code ?? 0);
});
