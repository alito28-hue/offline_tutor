// Regenerates content/LICENSES.md from the front matter of every file in the pack.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack } from '../lib/content.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../content');
const rows = loadPack(dir).sort((a, b) => a.file.localeCompare(b.file)).map(({ file, meta: m }) =>
  `| \`${file}\` | [${m.source_title}](${m.source_url}) (${m.source_site}, rev. ${m.source_revision}) | ${m.authors} | [${m.license}](${m.license_url}) | ${m.changes} | ${m.retrieved} |`);
fs.writeFileSync(path.join(dir, 'LICENSES.md'), `# Licencias del pack de contenidos

Cada archivo es una adaptación de un artículo de Wikipedia. El texto de este pack se distribuye bajo la misma licencia, CC BY-SA 4.0.
Se verificó la licencia con la API de Wikipedia el 2026-11-05. Los ejemplos agregados siguen el método descrito en la fuente.

| Archivo | Fuente | Autores | Licencia | Cambios | Obtenido |
|---|---|---|---|---|---|
${rows.join('\n')}
`);
