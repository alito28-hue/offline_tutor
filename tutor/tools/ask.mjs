// Sends questions to a running tutor and prints the real answers as JSON lines.
const port = process.env.TUTOR_PORT || 8788;
export async function ask(question, base = `http://127.0.0.1:${port}`) {
  const res = await fetch(`${base}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.text();
  let text = '';
  let done = null;
  for (const block of raw.split('\n\n')) {
    if (!block.startsWith('data: ')) continue;
    const ev = JSON.parse(block.slice(6));
    if (ev.type === 'token') text += ev.text;
    if (ev.type === 'replace') text = ev.text;
    if (ev.type === 'done') done = ev;
  }
  return { question, text, ...done };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const q of process.argv.slice(2)) {
    const r = await ask(q);
    console.log(`\n### ${q}\nroute=${r.route} lang=${r.lang} first=${r.firstTokenMs}ms total=${r.totalMs}ms words=${r.words} score=${r.score?.toFixed?.(3) ?? '-'} sources=${(r.sources || []).map(s => s.file).join(',')}\n${r.text}`);
  }
}
