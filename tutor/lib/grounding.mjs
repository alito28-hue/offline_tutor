// Deterministic check that retrieved passages are really about the question. Embedding scores cannot do this
// alone: "why is the sky blue?" scores above "what is a solid?" against a passage about rain.
const STOP = new Set(`
a al algo algun alguna como con cual cuales cuando cuanta cuantas cuanto cuantos de del donde el ella ellas ellos en entre era es esa ese eso esta este esto estos fue ha hace hacen hacer hay la las le lo los me mi muy no o para pero por porque puede pueden que quien se si sin sobre son su sus te tiene tienen tu un una uno unos y ya yo
about am an and are as at be been but by can could did do does for from get give had has have he her his how i if in into is it its me my of on or our she so tell than that the their them then there these they this to us was we were what when where which who whom why will with would you your
explica explicame explain favor please dime
funciona funcionan tipo tipos causa causas significa work works type types cause causes mean means many
`.trim().split(/\s+/));

const normalize = s => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const stem = w => w.replace(/(es|s)$/, '').replace(/(ar|er|ir|an|en|ing|ed|[aeiou])$/, '');

export function contentWords(text) {
  const words = normalize(text).match(/[a-z]{3,}/g) || [];
  return [...new Set(words.filter(w => !STOP.has(w)).map(stem).filter(w => w.length >= 3))];
}

// Prefix matching only applies from 4 letters up, so that "solid" does not match "sol". What follows the prefix
// must look like a word ending, so that "rainbow" does not match "rain" while "multiplic" still matches "multiplicacion".
const ENDING = /^(?:[aeiou]|[sdrnt]$|cion|tion|ment|ndo)/;
const extends_ = (long, short) => short.length >= 4 && long.startsWith(short) && ENDING.test(long.slice(short.length));
const matches = (word, vocabulary) => vocabulary.some(v => v === word || extends_(v, word) || extends_(word, v));

// Share of the question's content words found in a text. A question with no such words (only numbers) counts as covered.
export function coverage(question, text) {
  const asked = contentWords(question);
  if (!asked.length) return 1;
  const vocabulary = contentWords(text);
  return asked.filter(w => matches(w, vocabulary)).length / asked.length;
}

export const MIN_COVERAGE = 0.67;

// An answer must come from one article that covers the question: words scattered across articles do not count.
// Only the article or articles with the best coverage are kept, so that every citation is about the question.
export function groundPassages(question, passages) {
  const byFile = new Map();
  for (const p of passages) byFile.set(p.file, [...(byFile.get(p.file) || []), p]);
  const scored = [...byFile.values()].map(group => ({ group, score: coverage(question, group.map(p => p.text).join(' ')) }));
  const best = Math.max(0, ...scored.map(s => s.score));
  if (best < MIN_COVERAGE) return [];
  return passages.filter(p => scored.some(s => s.score === best && s.group.includes(p)));
}

// How much of a question an article covers, counting rare words for more. A name like Coubertin, which appears in only
// one article, says far more about what is being asked than a word that is everywhere, and meaning alone tends to miss it.
export function wordIndex(texts) {
  const vocabularies = new Map([...texts].map(([key, text]) => [key, contentWords(text)]));
  const appearsIn = new Map();
  for (const words of vocabularies.values()) for (const w of words) appearsIn.set(w, (appearsIn.get(w) || 0) + 1);
  const total = Math.max(vocabularies.size, 1);
  const weight = w => Math.log(1 + total / (appearsIn.get(w) || 1));
  return {
    coverage(question, key) {
      const asked = contentWords(question);
      if (!asked.length) return 0;
      const vocabulary = vocabularies.get(key) || [];
      const found = asked.filter(w => matches(w, vocabulary));
      return found.reduce((sum, w) => sum + weight(w), 0) / asked.reduce((sum, w) => sum + weight(w), 0);
    },
  };
}
