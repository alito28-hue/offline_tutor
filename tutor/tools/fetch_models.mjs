// Downloads the two models once, with internet, using the SDK. After this the tutor runs offline.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { close, downloadAsset, EMBEDDINGGEMMA_300M_Q8_0, QWEN3_4B_INST_Q4_K_M } from '@qvac/sdk';

const dir = path.join(os.homedir(), '.qvac/models'); // Where the SDK stores downloads and the tutor looks by default.

function present(model) {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some(f => f.endsWith(`_${model.modelId}`) && fs.statSync(path.join(dir, f)).size === model.expectedSize);
}

const gb = bytes => (bytes / 1e9).toFixed(1);
let failed = false;
for (const model of [QWEN3_4B_INST_Q4_K_M, EMBEDDINGGEMMA_300M_Q8_0]) {
  if (present(model)) { console.log(`${model.modelId}: already in ${dir}`); continue; }
  console.log(`${model.modelId}: downloading ${gb(model.expectedSize)} GB…`);
  let last = -10;
  try {
    await downloadAsset({
      assetSrc: model,
      onProgress: ({ percentage }) => {
        if (percentage >= last + 10) { last = Math.floor(percentage); console.log(`  ${last}%`); }
      },
    });
    console.log(`${model.modelId}: done`);
  } catch (err) {
    failed = true;
    console.error(`${model.modelId}: failed: ${err.message}`);
  }
}
await close();
process.exit(failed ? 1 : 0);
