// Deterministic safety checks. They catch common wording in Spanish and English; they are not a guarantee.
const normalize = s => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

const CARE = /\b(suicid\w*|matarme|me quiero matar|quiero morir\w*|hacerme dano|lastimarme|cortarme|kill myself|want to die|hurt myself|self.?harm|me (pegan|golpean|acosan|manosean)|someone (hits|touches|touched) me|me hacen bullying|abus[oa]\w* de mi)\b/;
const UNSAFE = /\b(sexo|sexual\w*|sexy|sex|porn\w*|desnud\w*|nude\w*|naked|xxx|tetas|pene|vagina|boobs|penis|drogas?|cocaina|marihuana|porro|cocaine|weed|meth|heroin|vape|armas?|pistolas?|bombas?|explosiv\w*|guns?|weapons?|bombs?|matar|kill\w*|murder\w*|asesin\w*)\b/;
const INJECTION = /\b(ignora\w*|olvida\w*|ignore|forget|disregard)\b.{0,30}\b(instruccion\w*|reglas?|instructions?|rules?|prompt)\b|\bjailbreak\b|\bsystem prompt\b|\bdan mode\b/;
const OUTPUT_UNSAFE = new RegExp(`${UNSAFE.source}|https?://|www\\.`);

const LINES = {
  es: {
    care: 'Gracias por contármelo. Esto es importante y no tienes que resolverlo sin ayuda. Por favor, habla ahora con un adulto de confianza, como tu mamá, tu papá, un familiar o un docente. Ellos pueden ayudarte de verdad.',
    redirect: 'Eso no es un tema para nuestra clase, así que mejor pregúntale a un adulto de confianza. ¿Seguimos con matemática o ciencias? Por ejemplo: ¿cómo calculo el área de un rectángulo?',
    unknown: 'No lo sé: eso no está en mis materiales y no quiero inventar. Puedo ayudarte con matemática y ciencias. Por ejemplo: ¿cómo sumo fracciones?',
    check: '¿Puedes explicarlo con tus propias palabras?',
  },
  en: {
    care: 'Thank you for telling me. This is important and you do not have to handle it alone. Please talk to a trusted adult right now, like a parent, a relative or a teacher. They can really help you.',
    redirect: 'That is not a topic for our class, so please ask a trusted adult. Shall we go back to math or science? For example: how do magnets work?',
    unknown: 'I do not know: that is not in my materials and I do not want to make things up. I can help with math and science. For example: how do I add fractions?',
    check: 'Can you explain it in your own words?',
  },
  sw: {
    unsupported: 'Samahani, bado siwezi kufundisha vizuri kwa Kiswahili. Tafadhali uliza kwa Kihispania au Kiingereza.',
  },
};
export const line = (lang, key) => LINES[lang]?.[key] ?? LINES.en[key];

const SW = /\b(kwa nini|nini|vipi|jinsi|ninawezaje|mvua|sayari|hesabu|sehemu|tafadhali|habari|gani|inanyesha|mimea|kuongeza)\b/;
const ES = /[¿¡ñ]|\b(por que|como|que|cual|cuantos?|cuantas?|donde|cuando|quien|el|la|los|las|un|una|de|del|y|es|son|sumo|sumar|llueve|plantas?|fracciones|hola|si|no|porque|para)\b/g;
const EN = /\b(why|how|what|which|where|when|who|the|a|an|of|and|is|are|do|does|i|plants?|rain|add|fractions?|hello|yes|because|to|in)\b/g;

export function detectLanguage(text) {
  if (SW.test(normalize(text))) return 'sw';
  const raw = text.toLowerCase();
  const n = normalize(text);
  const es = (n.match(ES) || []).length + (/[áéíóúüñ¿¡]/.test(raw) ? 2 : 0);
  const en = (n.match(EN) || []).length;
  return en > es ? 'en' : 'es';
}

export function checkInput(text) {
  const n = normalize(text);
  if (CARE.test(n)) return { action: 'care' };
  if (UNSAFE.test(n) || INJECTION.test(n)) return { action: 'redirect' };
  return { action: 'ok' };
}

// A reply that continues the tutor's check question, rather than asking something new.
export function isAnswerToCheck(text) {
  const n = normalize(text).trim();
  if (n.includes('?') || n.includes('¿')) return false;
  return !/^(por que|como|que|cual|cuant\w+|donde|cuando|quien|explica\w*|why|how|what|which|where|when|who|explain|tell me)\b/.test(n);
}

const THINK_DONE = /<think>[\s\S]*?<\/think>/g;
const THINK_OPEN = /<think>[\s\S]*$/;
const clean = raw => raw.replace(THINK_DONE, '').replace(THINK_OPEN, '').replace(/^\s+/, '');

// Filters a live token stream. The last HOLD characters stay unreleased until they have been checked,
// so a flagged phrase or a partial <think> tag is caught before it reaches the screen, while text still appears live.
export class OutputGuard {
  static HOLD = 16;

  constructor() {
    this.raw = '';
    this.sent = 0;
    this.tripped = false;
  }

  push(token) {
    if (this.tripped) return '';
    this.raw += token;
    const visible = clean(this.raw);
    if (OUTPUT_UNSAFE.test(normalize(visible))) { this.tripped = true; return ''; }
    const safeEnd = Math.max(this.sent, visible.length - OutputGuard.HOLD);
    return this.#release(visible, safeEnd);
  }

  finish() {
    if (this.tripped) return '';
    const visible = clean(this.raw).trimEnd();
    if (OUTPUT_UNSAFE.test(normalize(visible))) { this.tripped = true; return ''; }
    return this.#release(visible, visible.length);
  }

  #release(visible, end) {
    const out = visible.slice(this.sent, end);
    this.sent = Math.max(this.sent, end);
    return out;
  }

  get text() {
    return clean(this.raw).trimEnd();
  }
}
