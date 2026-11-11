// Computes the search index for the whole pack. Run it after changing the content, before packaging the app.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { close, embed, loadModel } from '@qvac/sdk';
import { loadPack, toCards, toDocuments } from '../lib/content.mjs';
import { EMBED_MODEL, findModel } from '../lib/engine.mjs';
import { saveIndex } from '../lib/searchindex.mjs';
import { unit } from '../lib/vectors.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../content');
const files = loadPack(dir);
const texts = [...toDocuments(files), ...toCards(files)];
const modelId = await loadModel({ modelSrc: findModel(EMBED_MODEL), modelType: 'llamacpp-embedding', modelConfig: {} });
const started = Date.now();
const vectors = [];
for (let i = 0; i < texts.length; i += 16) {
  const { embedding } = await embed({ modelId, text: texts.slice(i, i + 16) });
  for (const v of embedding) vectors.push(unit(v));
}
saveIndex(dir, texts, EMBED_MODEL, vectors);
console.log(`${files.length} articles, ${texts.length} entries, ${Math.round((Date.now() - started) / 1000)} s`);
await close();
process.exit(0);
