// QVAC-backed engine. Models load from local files, so the SDK never needs its model registry.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cancel, close, completion, embed, loadModel } from '@qvac/sdk';
import { topMatches } from './vectors.mjs';

const MODEL_DIR = process.env.TUTOR_MODEL_DIR || path.join(os.homedir(), '.qvac/models');
const EMBED_BATCH = 16;

export const LLM_NAME = process.env.TUTOR_LLM || 'Qwen3-4B-Q4_K_M';
const EMBED_NAME = 'embeddinggemma-300M-Q8_0';

export function findModel(name) {
  const file = fs.existsSync(MODEL_DIR) && fs.readdirSync(MODEL_DIR).find(f => f.includes(name) && f.endsWith('.gguf'));
  if (!file) throw new Error(`Model "${name}" not found in ${MODEL_DIR}`);
  return path.join(MODEL_DIR, file);
}

export async function createEngine(documents) {
  const embedId = await loadModel({ modelSrc: findModel(EMBED_NAME), modelType: 'llamacpp-embedding' });
  const llmId = await loadModel({ modelSrc: findModel(LLM_NAME), modelType: 'llamacpp-completion', modelConfig: { ctx_size: 4096 } });
  // Embedded on each start so that edits to the pack apply and old passages cannot be cited.
  const vectors = [];
  for (let i = 0; i < documents.length; i += EMBED_BATCH) {
    const { embedding } = await embed({ modelId: embedId, text: documents.slice(i, i + EMBED_BATCH) });
    vectors.push(...embedding);
  }

  return {
    async search(query, topK) {
      const { embedding } = await embed({ modelId: embedId, text: query });
      return topMatches(embedding, documents, vectors, topK);
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
