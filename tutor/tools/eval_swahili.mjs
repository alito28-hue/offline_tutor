// Tests Swahili directly on the model, bypassing the tutor's language gate. Usage: node tools/eval_swahili.mjs [model name]
import { close, completion, loadModel } from '@qvac/sdk';
import { findModel } from '../lib/engine.mjs';

const name = process.argv[2] || 'Qwen3-4B-Q4_K_M';
const llm = await loadModel({ modelSrc: findModel(name), modelType: 'llamacpp-completion', modelConfig: { ctx_size: 4096 } });
const SYSTEM = 'You are a kind tutor for children aged 8 to 14. Answer ONLY in Swahili (Kiswahili), with simple words, in at most 4 sentences. Use the MATERIAL. /no_think';
const RAIN = 'Water evaporates, rises and cools. It becomes tiny droplets that form clouds. When the droplets get heavy they fall as rain.';
const FRACTIONS = 'To add fractions with the same denominator, add the numerators and keep the denominator. Example: 2/7 + 3/7 = 5/7.';
const CASES = [['Kwa nini mvua inanyesha?', RAIN], ['Ninawezaje kujumlisha sehemu?', FRACTIONS], ['Mimea hutengenezaje chakula chake?', 'Plants use sunlight, water and carbon dioxide to make sugar, which is their food.']];
console.log(`# ${name}`);
for (const [q, material] of CASES) {
  const run = await completion({ modelId: llm, stream: true, generationParams: { temp: 0.2, seed: 7, predict: 160 }, history: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `MATERIAL: ${material}\n\nQUESTION: ${q}` }] });
  let out = '';
  for await (const t of run.tokenStream) out += t;
  console.log(`\n## ${q}\n${out.replace(/<think>[\s\S]*?<\/think>/g, '').trim()}`);
}
await close();
process.exit(0);
