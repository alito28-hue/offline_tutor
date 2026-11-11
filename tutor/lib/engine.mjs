// QVAC-backed engine. Models load from local files, so the SDK never needs its model registry.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cancel, close, completion, embed, loadModel } from '@qvac/sdk';
import { loadIndex } from './searchindex.mjs';
import { topMatches, unit } from './vectors.mjs';

const MODEL_DIR = process.env.TUTOR_MODEL_DIR || path.join(os.homedir(), '.qvac/models');
const EMBED_BATCH = 16;

export const LLM_NAME = process.env.TUTOR_LLM || 'Qwen3-4B-Q4_K_M';
const EMBED_NAME = 'embeddinggemma-300M-Q8_0';
// Unset, the SDK picks the GPU. Set to cpu or gpu to compare them on a given machine.
const DEVICE = process.env.TUTOR_DEVICE ? { device: process.env.TUTOR_DEVICE } : {};

export function findModel(name) {
  const file = fs.existsSync(MODEL_DIR) && fs.readdirSync(MODEL_DIR).find(f => f.includes(name) && f.endsWith('.gguf'));
  if (!file) throw new Error(`Model "${name}" not found in ${MODEL_DIR}`);
  return path.join(MODEL_DIR, file);
}

export const EMBED_MODEL = EMBED_NAME;

export async function createEngine(documents, cards = [], indexDir = null) {
  const embedId = await loadModel({ modelSrc: findModel(EMBED_NAME), modelType: 'llamacpp-embedding', modelConfig: { ...DEVICE } });
  const llmId = await loadModel({ modelSrc: findModel(LLM_NAME), modelType: 'llamacpp-completion', modelConfig: { ctx_size: 4096, ...DEVICE } });
  // Use the index built ahead of time when it matches this content. If it does not, for instance during
  // development, everything is embedded here, so that an edit applies and an old passage can never be cited.
  const texts = [...documents, ...cards];
  let vectors = indexDir && loadIndex(indexDir, texts, EMBED_NAME);
  if (!vectors) {
    vectors = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const { embedding } = await embed({ modelId: embedId, text: texts.slice(i, i + EMBED_BATCH) });
      for (const v of embedding) vectors.push(unit(v));
    }
  }
  const documentVectors = vectors.slice(0, documents.length);
  const cardVectors = vectors.slice(documents.length);
  const forLang = lang => lang ? c => c.startsWith(`[${lang}/`) : () => true;
  // A question is embedded once, however many searches it needs.
  let lastQuery = null;
  let lastVector = null;
  const embedQuery = async query => {
    if (query !== lastQuery) { lastVector = (await embed({ modelId: embedId, text: query })).embedding; lastQuery = query; }
    return lastVector;
  };

  return {
    async search(query, topK, lang) {
      return topMatches(await embedQuery(query), documents, documentVectors, topK, forLang(lang));
    },
    async searchCards(query, topK, lang) {
      return topMatches(await embedQuery(query), cards, cardVectors, topK, forLang(lang));
    },
    async *generate(history, generationParams) {
      const run = await completion({ modelId: llmId, history, stream: true, generationParams });
      yield* run.tokenStream;
    },
    // One tiny inference touches the model's weights, so that macOS keeps them in RAM under memory pressure.
    async warm() {
      await embed({ modelId: embedId, text: 'hola' });
      const run = await completion({ modelId: llmId, stream: true, history: [{ role: 'user', content: 'Hola /no_think' }], generationParams: { temp: 0, seed: 7, predict: 1 } });
      for await (const _ of run.tokenStream) { /* the output is not used */ }
    },
    cancel: () => cancel({ modelId: llmId, kind: 'completion' }),
    close: () => close(),
  };
}
