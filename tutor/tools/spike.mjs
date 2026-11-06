// Measures whether a machine can run the tutor, without the macOS-only launcher or network block.
// Usage: node tutor/tools/spike.mjs [--model Qwen3-1.7B-Q4_0] [--device cpu|gpu]
// It writes a JSON report with no personal data: system specs, timings and the answers.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUESTIONS = ['¿Cómo entra en erupción un volcán?', '¿Cómo sumo fracciones?', '¿Cómo hacen su comida las plantas?', '¿Cómo calculo el área de un rectángulo?', 'How do magnets work?'];
const option = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const model = option('model') || 'Qwen3-4B-Q4_K_M';
const device = option('device') || 'default';
process.env.TUTOR_LLM = model;
if (device !== 'default') process.env.TUTOR_DEVICE = device;

const here = path.dirname(fileURLToPath(import.meta.url));
const report = {
  model, device, date: new Date().toISOString().slice(0, 10),
  system: { platform: process.platform, release: os.release(), arch: process.arch, cpu: os.cpus()[0]?.model, cores: os.cpus().length, ramGB: +(os.totalmem() / 2 ** 30).toFixed(1), freeRamGB: +(os.freemem() / 2 ** 30).toFixed(1), node: process.version },
  answers: [],
};
const outFile = path.resolve(`amara-spike-${model}-${device}.json`);
const save = () => fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
const seconds = ms => (ms / 1000).toFixed(1);

let engine;
try {
  const qvac = await import('@qvac/sdk');
  try { report.system.gpus = (await qvac.getSystemResources()).capabilities?.gpus; } catch (err) { report.system.gpus = `unavailable: ${err.message}`; }
  const { loadPack, toDocuments } = await import('../lib/content.mjs');
  const { createEngine } = await import('../lib/engine.mjs');
  const { createTutor } = await import('../lib/tutor.mjs');
  const files = loadPack(path.join(here, '../content'));

  console.log(`Loading ${model} on ${device}…`);
  const started = performance.now();
  engine = await createEngine(toDocuments(files));
  report.loadMs = Math.round(performance.now() - started);
  console.log(`Ready in ${seconds(report.loadMs)} s`);
  save();

  for (const question of QUESTIONS) {
    let text = '';
    let done = null;
    for await (const event of createTutor({ engine, files }).ask(question)) {
      if (event.type === 'token') text += event.text;
      if (event.type === 'replace') text = event.text;
      if (event.type === 'done') done = event;
    }
    report.answers.push({ question, route: done?.route, firstWordMs: done?.firstTokenMs, totalMs: done?.totalMs, words: done?.words, sources: done?.sources?.map(s => s.file), text });
    console.log(`${seconds(done?.firstTokenMs ?? 0)} s to first word, ${seconds(done?.totalMs ?? 0)} s total: ${question}`);
    save();
  }
  report.ok = true;
} catch (err) {
  report.ok = false;
  report.error = String(err?.stack || err);
  console.error(`FAILED: ${err?.message || err}`);
}
save();
console.log(`Report: ${outFile}`);
await Promise.race([engine?.close(), new Promise(r => setTimeout(r, 3000))]).catch(() => {});
process.exit(report.ok ? 0 : 1);
