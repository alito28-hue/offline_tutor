// Watches this process and all of its descendants (the QVAC SDK runs inference in a Bare worker child)
// and reports every internet socket they hold that is not on loopback.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function descendants(root) {
  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,ppid=']);
  if (!stdout.trim().split('\n').some(l => Number(l.trim().split(/\s+/)[0]) === root)) throw new Error(`process ${root} is not visible`);
  const children = new Map();
  for (const line of stdout.trim().split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(pid);
  }
  const out = [root];
  for (let i = 0; i < out.length; i++) out.push(...(children.get(out[i]) || []));
  return out;
}

const LOOPBACK = /^(\[?::1\]?|127\.\d+\.\d+\.\d+|localhost)(:|$)/;

// True for a socket that stays on this machine. A wildcard bind (*:port) counts as not local.
export function isLocalSocket(name) {
  const [local, remote] = name.split('->');
  if (remote) return LOOPBACK.test(remote) && LOOPBACK.test(local);
  return LOOPBACK.test(local);
}

export function parseLsof(stdout) {
  return stdout.split('\n').slice(1).filter(Boolean).map(line => {
    const cols = line.trim().split(/\s+/);
    const proto = cols[7];
    const name = cols.slice(8).join(' ').replace(/\s*\(.*\)$/, '');
    return { command: cols[0], pid: Number(cols[1]), proto, name };
  });
}

export async function snapshot(root = process.pid) {
  const pids = await descendants(root);
  let stdout = '';
  try {
    ({ stdout } = await run('/usr/sbin/lsof', ['-nP', '-a', '-i', '-p', pids.join(',')]));
  } catch (e) {
    // lsof exits 1 when nothing matches, which is the expected clean case.
    if (e.code !== 1) throw e;
    stdout = e.stdout || '';
  }
  const sockets = parseLsof(stdout);
  return { pids, sockets, external: sockets.filter(s => !isLocalSocket(s.name)) };
}

// True when the machine has a default route, meaning it could reach a network at all.
export async function machineHasRoute() {
  try {
    const { stdout } = await run('/sbin/route', ['-n', 'get', 'default']);
    return /interface:\s*\S+/.test(stdout);
  } catch {
    return false;
  }
}
