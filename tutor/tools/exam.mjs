// Runs the curriculum exam against the real models. Retrieval only by default; with --answers, also generates every answer.
//   node tutor/tools/exam.mjs curriculum/examen-tanda1.txt [--answers report.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asksOf, loadPack, toCards, toDocuments } from '../lib/content.mjs';
import { createEngine } from '../lib/engine.mjs';
import { detectLanguage } from '../lib/guardrails.mjs';
import { createTutor } from '../lib/tutor.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const examFile = path.join(here, '..', process.argv[2]);
const answersAt = process.argv.indexOf('--answers');
const files = loadPack(path.join(here, '../content'));
const engine = await createEngine(toDocuments(files), toCards(files), path.join(here, '../content'));
const fileOf = new Map(files.flatMap(f => [[`${f.meta.lang}|${f.meta.topic}`, f.file], [f.file.slice(0, -3), f.file]]));
const rows = fs.readFileSync(examFile, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => {
  const [lang, tema, ...q] = l.split('|');
  return { lang, want: tema === 'FUERA' ? null : fileOf.get(`${lang}|${tema}`) || fileOf.get(`${lang}/${tema}`), tema, q: q.join('|') };
});
const missing = rows.filter(r => r.tema !== 'FUERA' && !r.want);
if (missing.length) throw new Error(`Unknown topics: ${missing.map(r => r.tema).join(', ')}`);
const askedInArticle = new Set(files.flatMap(asksOf));
console.log(JSON.stringify({ articles: files.length, questions: rows.length, reused: rows.filter(r => askedInArticle.has(r.q)).length }));

for (const lang of ['es', 'en', 'pt']) {
  const all = rows.filter(r => r.lang === lang);
  const wrong = all.filter(r => detectLanguage(r.q) !== lang);
  console.log(lang, 'language detected', all.length - wrong.length, '/', all.length, wrong.map(r => r.q).join(' ; '));
}

if (answersAt > 0) {
  const tutor = createTutor({ engine, files });
  const out = [];
  for (const r of rows) {
    tutor.reset();
    let text = ''; let done = null;
    for await (const ev of tutor.ask(r.q)) {
      if (ev.type === 'token') text += ev.text;
      if (ev.type === 'replace') text = ev.text;
      if (ev.type === 'done') done = ev;
    }
    out.push({ lang: r.lang, tema: r.tema, q: r.q, route: done.route, answerLang: done.lang, first: done.firstTokenMs, total: done.totalMs, sources: done.sources.map(s => s.file), right: r.want ? done.route === 'teach' && done.sources.some(s => s.file === r.want) : done.route === 'unknown', text });
    fs.writeFileSync(process.argv[answersAt + 1], JSON.stringify(out, null, 1));
  }
  for (const lang of ['es', 'en', 'pt']) {
    const all = out.filter(o => o.lang === lang);
    const inside = all.filter(o => o.tema !== 'FUERA');
    const outside = all.filter(o => o.tema === 'FUERA');
    const firsts = all.filter(o => o.route === 'teach').map(o => o.first).sort((a, b) => a - b);
    console.log(JSON.stringify({ lang, right: inside.filter(o => o.right).length, of: inside.length, wrongSource: inside.filter(o => o.route === 'teach' && !o.right).length, declinedByMistake: inside.filter(o => o.route === 'unknown').length, blocked: inside.filter(o => !['teach', 'unknown'].includes(o.route)).length, outsideDeclined: outside.filter(o => o.right).length, outsideOf: outside.length, firstMedianMs: firsts[firsts.length >> 1] }));
  }
}
await engine.close();
process.exit(0);
