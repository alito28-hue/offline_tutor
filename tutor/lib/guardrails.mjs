// Deterministic safety checks. They catch common wording in Spanish, English and Portuguese; they are not a guarantee.
const normalize = s => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

const CARE = /\b(suicid\w*|matarme|me quiero matar|quiero morir\w*|hacerme dano|lastimarme|cortarme|kill myself|want to die|hurt myself|self.?harm|me matar|quero morrer|me machucar|me cortar|me (batem|bateram)|abusa\w* de mim|sofro bullying|me (pegan|golpean|acosan|manosean)|someone (hits|touches|touched) me|me hacen bullying|abus[oa]\w* de mi)\b/;
const UNSAFE = /\b(maconha|cocaina|peitos|pelad[oa]s?|sexo|sexual\w*|sexy|sex|porn\w*|desnud\w*|nude\w*|naked|xxx|tetas|pene|vagina|boobs|penis|drogas?|cocaina|marihuana|porro|cocaine|weed|meth|heroin|vape|armas?|pistolas?|bombas?|explosiv\w*|guns?|weapons?|bombs?|matar|kill\w*|murder\w*|asesin\w*)\b/;
const INJECTION = /\b(ignora\w*|olvida\w*|ignore|esqueca\w*|forget|disregard)\b.{0,30}\b(instruccion\w*|instruc\w*|regras?|reglas?|instructions?|rules?|prompt)\b|\bjailbreak\b|\bsystem prompt\b|\bdan mode\b/;
const OUTPUT_UNSAFE = new RegExp(`${UNSAFE.source}|https?://|www\\.`);

const LINES = {
  es: {
    care: 'Gracias por contármelo. Esto es importante y no tienes que resolverlo sin ayuda. Por favor, habla ahora con un adulto de confianza, como tu mamá, tu papá, un familiar o un docente. Ellos pueden ayudarte de verdad.',
    redirect: 'Eso no es un tema para nuestra clase, así que mejor pregúntale a un adulto de confianza. ¿Seguimos con otra pregunta de la escuela? Por ejemplo: ¿cómo calculo el área de un rectángulo?',
    unknown: 'No lo sé: eso no está en mis materiales y no quiero inventar. Puedes explorar las materias en la pantalla de inicio o preguntarme, por ejemplo: ¿cómo sumo fracciones?',
    check: '¿Puedes explicarlo con tus propias palabras?',
  },
  en: {
    care: 'Thank you for telling me. This is important and you do not have to handle it alone. Please talk to a trusted adult right now, like a parent, a relative or a teacher. They can really help you.',
    redirect: 'That is not a topic for our class, so please ask a trusted adult. Shall we go back to a school question? For example: how do magnets work?',
    unknown: 'I do not know: that is not in my materials and I do not want to make things up. You can explore the subjects on the home screen or ask me, for example: how do I add fractions?',
    check: 'Can you explain it in your own words?',
  },
  pt: {
    care: 'Obrigado por me contar. Isso é importante e você não precisa resolver sozinho. Por favor, fale agora com um adulto de confiança, como sua mãe, seu pai, um parente ou um professor. Eles podem ajudar de verdade.',
    redirect: 'Esse não é um assunto para a nossa aula, então é melhor perguntar a um adulto de confiança. Vamos voltar para outra pergunta da escola? Por exemplo: como calculo a área de um retângulo?',
    unknown: 'Não sei: isso não está nos meus materiais e não quero inventar. Você pode explorar as matérias na tela inicial ou me perguntar, por exemplo: como somo frações?',
    check: 'Você consegue explicar com as suas palavras?',
  },
  sw: {
    unsupported: 'Samahani, bado siwezi kufundisha vizuri kwa Kiswahili. Tafadhali uliza kwa Kihispania au Kiingereza.',
  },
};
export const line = (lang, key) => LINES[lang]?.[key] ?? LINES.en[key];

const SW = /\b(kwa nini|nini|vipi|jinsi|ninawezaje|mvua|sayari|hesabu|sehemu|tafadhali|habari|gani|inanyesha|mimea|kuongeza)\b/;
const ES = /[¿¡ñ]|\b(por que|como|que|cual|cuantos?|cuantas?|donde|cuando|quien|el|la|los|las|un|una|de|del|y|es|son|sumo|sumar|llueve|plantas?|fracciones|hola|si|no|porque|para)\b/g;
// Words Spanish does not use, so that a question shared by both languages, such as "como", stays Spanish.
const PT = /[ãõç]|\b(o que|voce|nao|sao|uma|um|os|as|do|na|nas|em|qual|quais|quem|onde|quantos?|quantas?|chove|fracoes|isso|pelo|tem|foi|ao|fica|fazem|ossos|por que o|por que a|eu|ele|vem|chuva|ceu|cidades?|fico|dobro|mesmo|depois|tambem|muito)\b/g;
const EN = /\b(why|how|what|which|where|when|who|the|a|an|of|and|is|are|do|does|i|plants?|rain|add|fractions?|hello|yes|because|to|in)\b/g;

export function detectLanguage(text) {
  if (SW.test(normalize(text))) return 'sw';
  const raw = text.toLowerCase();
  const n = normalize(text);
  const es = (n.match(ES) || []).length + (/[áéíóúüñ¿¡]/.test(raw) ? 2 : 0);
  const en = (n.match(EN) || []).length;
  const pt = (n.match(PT) || []).length + (raw.match(/[ãõç]/g) || []).length;
  const spanishOnly = /[¿¡ñ]|\b(el|los|las|del|una|un|quien|cuantos?|cuantas?|donde|cuando|que es|hay|y)\b/.test(n);
  const clearlyEnglish = /\b(the|why|how|what|who|which|where|when|does|is|are|and|of|from|can|i)\b/.test(n);
  if (pt > 0 && !/[¿¡ñ]/.test(raw) && !clearlyEnglish && pt >= (spanishOnly ? 2 : 1)) return 'pt';
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
  return !/^(por que|como|que|o que|qual|quais|quem|onde|quando|quant\w+|cual|cuant\w+|donde|cuando|quien|explica\w*|why|how|what|which|where|when|who|explain|tell me)\b/.test(n);
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
