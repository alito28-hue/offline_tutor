// Writes demo_script.md with the tutor's real answers. Needs a running tutor: ./run.sh --no-browser
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask } from './ask.mjs';

const port = process.env.TUTOR_PORT || 8788;
const base = `http://127.0.0.1:${port}`;
const reset = () => fetch(`${base}/api/reset`, { method: 'POST' });
const MAIN = JSON.parse(process.env.DEMO_MAIN || 'null') || ['¿Cómo entra en erupción un volcán?', '¿Cómo sumo fracciones?', '¿Cómo hacen su comida las plantas?', '¿Cómo calculo el área de un rectángulo?', 'How do magnets work?'];
const LIMITS = ['¿Por qué el cielo es azul?', '¿Cómo se forma un arcoíris?', '¿Cómo hago una bomba?'];
const fmt = r => `- Primera palabra: ${(r.firstTokenMs / 1000).toFixed(1)} s · Total: ${(r.totalMs / 1000).toFixed(1)} s · ${r.words} palabras
- Fuente: ${(r.sources || []).map(s => `\`${s.file}\` (${s.license})`).join(', ') || 'ninguna'}

\`\`\`text
${r.text}
\`\`\`
`;
const status = await (await fetch(`${base}/api/status`)).json();
let md = `# Guion de la demo

Respuestas reales del tutor, generadas por \`tools/make_demo_script.mjs\` con la red bloqueada (sandbox ${status.net.sandboxed ? 'activo' : 'inactivo'}).
Equipo: ${os.cpus()[0].model}, ${Math.round(os.totalmem() / 2 ** 30)} GB. Modelo: ${status.model}. Fecha: ${new Date().toLocaleDateString('sv')}.

Antes de grabar:

1. Cierra las demás apps para liberar memoria. Con la memoria llena, la primera respuesta puede tardar más de 3 s.
2. Apaga el Wi-Fi y comprueba que el indicador diga "Sin conexión ✓".
3. Arranca con \`./run.sh\` y haz una pregunta de prueba.
4. Graba solo la ida y vuelta si la revisaste antes: el tutor no dice si la respuesta del alumno está bien o mal.

## Las 5 preguntas
`;
md += `
Revisión contra el pack (2026-11-05). Si regeneras este guion, vuelve a revisar: un cambio en el prompt o en el material cambia el texto.

- Las 5 respuestas son correctas y están entre 80 y 120 palabras.
- Volcán: "según el tipo de erupción" y "se prepara para erupcionar" no están en la fuente.
- Plantas: la fuente no dice que el agua venga "desde el suelo".
- Área: la fuente no dice "en dos dimensiones".
- La pregunta de vuelta sobre la brújula no se responde con los pasos, aunque sí con la fuente.
`;
let n = 0;
const runs = [];
for (const q of MAIN) {
  await reset();
  const r = await ask(q, base);
  runs.push(r);
  md += `\n### ${++n}. ${q}\n\n${fmt(r)}`;
}
md += '\n## Para mostrar los límites\n';
for (const q of LIMITS) {
  await reset();
  const r = await ask(q, base);
  md += `\n### ${q}\n\n${fmt(r)}`;
}
md += '\n## Ida y vuelta: el alumno responde\n';
for (const [q, a] of [['¿Cómo calculo el área de un rectángulo?', '16 centímetros cuadrados'], ['¿Cómo calculo el área de un rectángulo?', '8 centímetros cuadrados'], ['¿Cómo sumo fracciones?', '3/3'], ['How do magnets work?', 'it points north']]) {
  await reset();
  await ask(q, base);
  const r = await ask(a, base);
  md += `\n### ${q} → "${a}"\n\n${fmt(r)}`;
}
const firsts = runs.map(r => r.firstTokenMs);
md += `\n## Tiempos de esta corrida\n\nPrimera palabra en las 5 preguntas: mínimo ${(Math.min(...firsts) / 1000).toFixed(1)} s, máximo ${(Math.max(...firsts) / 1000).toFixed(1)} s. Palabras: ${Math.min(...runs.map(r => r.words))} a ${Math.max(...runs.map(r => r.words))}.\n`;
const out = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../demo_script.md');
fs.writeFileSync(out, md);
console.log(md);
