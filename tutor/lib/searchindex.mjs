// The search index, computed ahead of time so that the app opens quickly however many articles it carries.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const fingerprint = (texts, model) => crypto.createHash('sha256').update(model).update('\0').update(texts.join('\0')).digest('hex');

export function saveIndex(dir, texts, model, vectors) {
  const dim = vectors[0].length;
  const all = new Float32Array(vectors.length * dim);
  vectors.forEach((v, i) => all.set(v, i * dim));
  fs.writeFileSync(path.join(dir, 'index.bin'), Buffer.from(all.buffer));
  fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify({ fingerprint: fingerprint(texts, model), dim, count: vectors.length })}\n`);
}

// Null when there is no index or it was built from different content.
export function loadIndex(dir, texts, model) {
  try {
    const { fingerprint: saved, dim, count } = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
    if (saved !== fingerprint(texts, model) || count !== texts.length) return null;
    const raw = fs.readFileSync(path.join(dir, 'index.bin'));
    const all = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    return Array.from({ length: count }, (_, i) => all.subarray(i * dim, (i + 1) * dim));
  } catch {
    return null;
  }
}
