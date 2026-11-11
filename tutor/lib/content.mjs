// Loads the content pack: one markdown file per topic, with licence metadata in its front matter.
import fs from 'node:fs';
import path from 'node:path';

const REQUIRED = ['title', 'lang', 'source_title', 'source_url', 'authors', 'license', 'license_url', 'changes', 'retrieved'];

export function parseFile(raw, file) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = Object.fromEntries(m[1].split('\n').map(l => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
  for (const key of REQUIRED) if (!meta[key]) throw new Error(`${file}: missing "${key}"`);
  const paragraphs = m[2].split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return { file, meta, paragraphs };
}

export function loadPack(dir) {
  const files = [];
  for (const lang of fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory())) {
    for (const f of fs.readdirSync(path.join(dir, lang)).filter(n => n.endsWith('.md'))) {
      const rel = `${lang}/${f}`;
      files.push(parseFile(fs.readFileSync(path.join(dir, rel), 'utf8'), rel));
    }
  }
  return files;
}

// A passage starts with its file tag so that a search hit can always be traced back to its source.
export const toDocuments = files =>
  files.flatMap(f => f.paragraphs.map(p => `[${f.file}] ${f.meta.title}: ${p}`));

// What search compares a question with to find the right article: its title, its place in the curriculum and how children ask about it.
export const toCards = files =>
  files.map(f => `[${f.file}] ${[f.meta.title, f.meta.block, ...asksOf(f)].filter(Boolean).join('. ')}`);

export const asksOf = f => (f.meta.asks ? f.meta.asks.split('|').map(q => q.trim()).filter(Boolean) : []);

export const moreOf = f => (f.meta.more ? f.meta.more.split('|').map(q => q.trim()).filter(Boolean) : []);

// The curriculum as the app shows it: one entry per article in the requested language.
export const listTopics = (files, lang) => files
  .filter(f => f.file.startsWith(`${lang}/`) && f.meta.topic)
  .sort((a, b) => Number(a.meta.order || 0) - Number(b.meta.order || 0))
  .map(f => ({ file: f.file, topic: f.meta.topic, title: f.meta.title, subject: f.meta.subject, block: f.meta.block || '', grades: (f.meta.grades || '').split(',').map(g => g.trim()).filter(Boolean), ask: asksOf(f)[0] || f.meta.title }));

const TAG = /^\[([^\]]+)\]\s*/;

export function parseHit(hit) {
  const m = String(hit.content).match(TAG);
  if (!m) return null;
  return { file: m[1], text: String(hit.content).replace(TAG, ''), score: Number(hit.score) };
}

export function sourceFor(files, file) {
  const f = files.find(x => x.file === file);
  if (!f) return null;
  const { title, source_title, source_site, source_url, license, license_url, authors, changes } = f.meta;
  return { file, title, source_title, source_site, source_url, license, license_url, authors, changes };
}
