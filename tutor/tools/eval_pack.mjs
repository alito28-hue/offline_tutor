// Measures retrieval over the whole pack: each topic is asked as a child might ask it, and out-of-pack questions must be declined.
// Needs a running tutor: ./run.sh --no-browser.
import { ask } from './ask.mjs';

const base = `http://127.0.0.1:${process.env.TUTOR_PORT || 8788}`;
const reset = () => fetch(`${base}/api/reset`, { method: 'POST' });
const TOPICS = {
  'es/lluvia.md': '¿Por qué llueve?', 'es/ciclo-del-agua.md': '¿Qué es el ciclo del agua?', 'es/fracciones.md': '¿Cómo sumo fracciones?',
  'es/fotosintesis.md': '¿Cómo hacen su comida las plantas?', 'es/estados-de-la-materia.md': '¿Cuáles son los estados de la materia?',
  'es/sistema-solar.md': '¿Cuáles son los planetas del sistema solar?', 'es/perimetro.md': '¿Cómo calculo el perímetro de un rectángulo?',
  'es/suma.md': '¿Cómo sumo números con llevada?', 'es/resta.md': '¿Cómo se hace una resta en columnas?', 'es/multiplicacion.md': '¿Qué es multiplicar?',
  'es/division.md': '¿Cómo reparto 20 manzanas entre 4 personas?', 'es/area.md': '¿Cómo calculo el área de un rectángulo?', 'es/angulos.md': '¿Qué es un ángulo?',
  'es/triangulos.md': '¿Qué tipos de triángulos hay?', 'es/decimales.md': '¿Qué es un número decimal?', 'es/porcentaje.md': '¿Cómo calculo un porcentaje?',
  'es/luna.md': '¿Por qué cambia la forma de la Luna?', 'es/gravedad.md': '¿Por qué las cosas caen al suelo?', 'es/corazon.md': '¿Cómo funciona el corazón?',
  'es/esqueleto.md': '¿Cuántos huesos tiene el cuerpo?', 'es/digestion.md': '¿Cómo se hace la digestión?', 'es/respiracion.md': '¿Cómo respiramos?',
  'es/celula.md': '¿Qué es una célula?', 'es/cadena-alimentaria.md': '¿Qué es una cadena alimentaria?', 'es/volcanes.md': '¿Cómo entra en erupción un volcán?',
  'es/terremotos.md': '¿Por qué hay terremotos?', 'es/electricidad.md': '¿Qué es la corriente eléctrica?', 'es/imanes.md': '¿Por qué los imanes se atraen?',
  'es/sonido.md': '¿Cómo viaja el sonido?', 'es/mamiferos.md': '¿Qué es un mamífero?',
  'en/rain.md': 'Why does it rain?', 'en/water-cycle.md': 'What is the water cycle?', 'en/fractions.md': 'How do I add fractions?',
  'en/photosynthesis.md': 'How do plants make their food?', 'en/states-of-matter.md': 'What are the states of matter?', 'en/solar-system.md': 'What are the planets in the solar system?',
  'en/perimeter.md': 'How do I find the perimeter of a rectangle?', 'en/addition.md': 'How does addition work?', 'en/subtraction.md': 'What is subtraction?',
  'en/multiplication.md': 'What does multiplication mean?', 'en/division.md': 'What is a remainder in division?', 'en/area.md': 'How do I find the area of a rectangle?',
  'en/angles.md': 'What is a right angle?', 'en/triangles.md': 'What types of triangles are there?', 'en/decimals.md': 'What is a decimal?', 'en/percentage.md': 'What does percent mean?',
  'en/moon.md': 'Why does the Moon change shape?', 'en/gravity.md': 'Why do things fall to the ground?', 'en/heart.md': 'How does the heart work?',
  'en/skeleton.md': 'How many bones are in the body?', 'en/digestion.md': 'How does digestion work?', 'en/breathing.md': 'How do we breathe?',
  'en/cell.md': 'What is a cell?', 'en/food-chain.md': 'What is a food chain?', 'en/volcanoes.md': 'How does a volcano erupt?', 'en/earthquakes.md': 'What causes earthquakes?',
  'en/electricity.md': 'What is electric current?', 'en/magnets.md': 'Why do magnets attract?', 'en/sound.md': 'How does sound travel?', 'en/mammals.md': 'What is a mammal?',
};
const OUTSIDE = ['¿Por qué el cielo es azul?', '¿Quién ganó el mundial de 1986?', '¿Cuál es la capital de Francia?', '¿Cómo funciona un motor de avión?', '¿Qué comen los dinosaurios?', '¿Qué es la raíz cuadrada?', '¿Cómo se forma un arcoíris?', '¿Qué es el ADN de un virus?',
  'Why is the sky blue?', 'Who won the World Cup in 1986?', 'What is the capital of France?', 'How does a plane engine work?', 'What did dinosaurs eat?', 'What is a square root?', 'How does a rainbow form?', 'What is the speed of light?', 'How does a shadow form?', '¿Cómo se forma una sombra?'];

let hit = 0, miss = [], wrong = [];
const firsts = [];
for (const [file, q] of Object.entries(TOPICS)) {
  await reset();
  const r = await ask(q, base);
  const files = (r.sources || []).map(s => s.file);
  if (r.route === 'teach' && files.includes(file)) { hit++; firsts.push(r.firstTokenMs); }
  else (r.route === 'teach' ? wrong : miss).push(`${q} [${file}] -> ${r.route} ${files.join(',')} score=${r.score?.toFixed?.(3) ?? '-'}`);
  console.log(`${r.route === 'teach' && files.includes(file) ? 'ok  ' : 'FAIL'} ${q} -> ${r.route} ${files.join(',')} ${r.score?.toFixed?.(3) ?? ''} first=${r.firstTokenMs} words=${r.words}`);
}
let declined = 0, answered = [];
for (const q of OUTSIDE) {
  await reset();
  const r = await ask(q, base);
  if (r.route === 'unknown') declined++;
  else answered.push(`${q} -> ${r.route} ${(r.sources || []).map(s => s.file).join(',')}: ${r.text.slice(0, 120).replace(/\n/g, ' ')}`);
}
const n = Object.keys(TOPICS).length;
console.log(`\nIn the pack: ${hit}/${n} answered with the right source.`);
if (miss.length) console.log(`Declined by mistake:\n  ${miss.join('\n  ')}`);
if (wrong.length) console.log(`Answered from another source:\n  ${wrong.join('\n  ')}`);
console.log(`Outside the pack: ${declined}/${OUTSIDE.length} declined.`);
if (answered.length) console.log(`Answered anyway:\n  ${answered.join('\n  ')}`);
firsts.sort((a, b) => a - b);
console.log(`First word: median ${firsts[firsts.length >> 1]} ms, max ${firsts.at(-1)} ms.`);
