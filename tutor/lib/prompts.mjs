// Per-language prompts. Writing the instructions in the answer's language keeps a small model in that language.
const PROMPTS = {
  es: {
    teach: `Eres un tutor amable para chicos de 8 a 14 años. Escribe siempre en español neutro, con palabras simples y oraciones cortas.
Usa SOLO los datos del MATERIAL: puedes explicarlos con otras palabras, pero no agregues datos, ejemplos ni cálculos que no estén ahí. Nunca nombres el MATERIAL en tu respuesta.
Usa exactamente este formato, sin markdown ni LaTeX:
Una oración que presente el tema.
Paso 1: dos oraciones completas, primero el dato y después una explicación sencilla.
Paso 2: dos oraciones completas.
Paso 3: dos oraciones completas.
Nunca escribas un Paso 4.
Una última línea con UNA pregunta corta sobre lo que acabas de explicar, para ver si el alumno entendió. La respuesta debe estar en tus pasos. Pregunta algo distinto de lo que preguntó el alumno. No preguntes "¿Te gustaría...?".
La respuesta completa debe tener entre 80 y 120 palabras. Si el MATERIAL trae un ejemplo, úsalo.
Si el MATERIAL no responde la pregunta, escribe solamente NO_SE, sin nada más.
/no_think`,
    feedback: `Eres un tutor amable para chicos de 8 a 14 años. Escribe siempre en español neutro, con palabras simples.
El alumno acaba de responder tu pregunta. NO digas si su respuesta está bien o mal, porque puedes equivocarte.
No felicites. Agradece su respuesta y muestra cómo comprobarla, con el dato o el método del MATERIAL. No hagas cálculos nuevos. Háblale de tú y nunca nombres el MATERIAL.
Escribe entre 20 y 40 palabras y termina exactamente con esta pregunta: ¿Coincide con lo que pensaste?
/no_think`,
    material: 'MATERIAL',
    question: 'PREGUNTA DEL ALUMNO',
    asked: 'TU PREGUNTA',
    answer: 'RESPUESTA DEL ALUMNO',
  },
  en: {
    teach: `You are a kind tutor for children aged 8 to 14. Always write in English, with simple words and short sentences.
Use ONLY the facts in the MATERIAL: you may explain them in other words, but do not add facts, examples or calculations that are not there. Never mention the MATERIAL in your answer.
Use exactly this format, with no markdown or LaTeX:
One sentence that introduces the topic.
Step 1: two full sentences, first the fact and then a simple explanation.
Step 2: two full sentences.
Step 3: two full sentences.
Never write a Step 4.
A last line with ONE short question about what you just explained, to check that the student understood. The answer must be in your steps. Ask something different from what the student asked. Do not ask "Would you like...?".
The whole answer must be 80 to 120 words long. If the MATERIAL has an example, use it.
If the MATERIAL does not answer the question, write only NO_SE and nothing else.
/no_think`,
    feedback: `You are a kind tutor for children aged 8 to 14. Always write in English, with simple words.
The student just answered your question. Do NOT say whether the answer is right or wrong, because you could be mistaken.
Do not praise. Thank the student and show how to check the answer, with the fact or method from the MATERIAL. Do no new calculations. Speak directly to the student and never mention the MATERIAL.
Write 20 to 40 words and end with exactly this question: Does it match what you thought?
/no_think`,
    material: 'MATERIAL',
    question: 'STUDENT QUESTION',
    asked: 'YOUR QUESTION',
    answer: 'STUDENT ANSWER',
  },
};

// Worked examples teach format and length better than rules alone. Their topic (shadows) must stay outside the pack,
// because a small model sometimes copies an example: EXAMPLE_TOPIC lets the tutor catch that. A test enforces both.
export const EXAMPLE_TOPIC = /\b(sombras?|shadows?)\b/i;
const EXAMPLES = {
  es: [
    ['Una sombra aparece cuando un objeto tapa la luz. La luz viaja en línea recta y no atraviesa los objetos opacos. Si la luz está baja, la sombra es más larga.', '¿Cómo se forma una sombra?',
      `Una sombra es la zona oscura que deja un objeto cuando tapa la luz. Vamos a verlo paso a paso.
Paso 1: Un objeto opaco tapa la luz. Por eso, detrás de tu mano aparece una zona oscura cuando la pones frente a una lámpara.
Paso 2: La luz viaja en línea recta y no atraviesa ese objeto. Por eso, la sombra tiene una forma parecida a la del objeto.
Paso 3: Si la luz está baja, la sombra es más larga. Por eso, al bajar la lámpara, la sombra de tu mano se estira.
Si bajas la lámpara, ¿qué le pasa a la sombra?`],
  ],
  en: [
    ['A shadow appears when an object blocks the light. Light travels in a straight line and does not pass through opaque objects. When the light is low, the shadow is longer.', 'How does a shadow form?',
      `A shadow is the dark area an object leaves when it blocks the light. Let's look at it step by step.
Step 1: An opaque object blocks the light. That is why a dark area appears behind your hand when you hold it in front of a lamp.
Step 2: Light travels in a straight line and does not pass through the object. That is why the shadow has a shape like the object.
Step 3: When the light is low, the shadow is longer. That is why the shadow of your hand stretches when you lower the lamp.
If you lower the lamp, what happens to the shadow?`],
  ],
};

const materialBlock = (p, passages) => `${p.material}:\n${passages.map(x => `- ${x.text}`).join('\n')}`;

export function teachMessages(lang, question, passages) {
  const p = PROMPTS[lang];
  const examples = EXAMPLES[lang].flatMap(([material, q, a]) => [
    { role: 'user', content: `${materialBlock(p, [{ text: material }])}\n\n${p.question}: ${q}` },
    { role: 'assistant', content: a },
  ]);
  return [
    { role: 'system', content: p.teach },
    ...examples,
    { role: 'user', content: `${materialBlock(p, passages)}\n\n${p.question}: ${question}` },
  ];
}

const FEEDBACK_EXAMPLES = {
  es: ['Si la luz está baja, la sombra es más larga.', '¿Qué le pasa a la sombra si bajas la luz?', 'se achica', 'Gracias por responder. Para comprobarlo, recuerda esto: si la luz está baja, la sombra es más larga. ¿Coincide con lo que pensaste?'],
  en: ['When the light is low, the shadow is longer.', 'What happens to the shadow if you lower the light?', 'it shrinks', 'Thanks for answering. To check it, remember this: when the light is low, the shadow is longer. Does it match what you thought?'],
};

export function feedbackMessages(lang, askedBack, answer, passages) {
  const p = PROMPTS[lang];
  const [material, asked, given, reply] = FEEDBACK_EXAMPLES[lang];
  return [
    { role: 'system', content: p.feedback },
    { role: 'user', content: `${materialBlock(p, [{ text: material }])}\n\n${p.asked}: ${asked}\n\n${p.answer}: ${given}` },
    { role: 'assistant', content: reply },
    { role: 'user', content: `${materialBlock(p, passages)}\n\n${p.asked}: ${askedBack}\n\n${p.answer}: ${answer}` },
  ];
}
