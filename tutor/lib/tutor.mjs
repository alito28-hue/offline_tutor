// The tutor's decision flow. The model engine is injected, so tests can run it with a fake one.
// Citations come from the passages sent to the model, never from the model's own text.
import { checkInput, detectLanguage, isAnswerToCheck, line, OutputGuard } from './guardrails.mjs';
import { asksOf, parseHit, sourceFor } from './content.mjs';
import { groundPassages, wordIndex } from './grounding.mjs';
import { EXAMPLE_TOPIC, feedbackMessages, teachMessages } from './prompts.mjs';

// First filter, calibrated on real questions. Scores overlap near this value, so the model's NO_SE signal is the second filter.
export const SCORE_THRESHOLD = Number(process.env.TUTOR_SCORE_THRESHOLD || 0.5);
// Search covers both languages and results are filtered afterwards, so this is well above MAX_PASSAGES.
const TOP_K = 40;
const MAX_PASSAGES = 3;
const NEAR_BEST = 0.12;
// An article has to match by what it is about, by what it says and, a little, by its exact words, which is what finds
// names like Coubertin that meaning alone misses. Calibrated on the exam in curriculum/.
export const ARTICLE_THRESHOLD = Number(process.env.TUTOR_ARTICLE_THRESHOLD || 0.6);
const WORDS_WEIGHT = Number(process.env.TUTOR_WORDS_WEIGHT || 0.15);
// Below the threshold the tutor does not teach, but it can still point to the closest articles.
const SUGGEST_THRESHOLD = 0.5;
const MAX_SUGGESTIONS = 3;
const TEACH_PARAMS = { temp: 0.2, seed: 7, predict: 280 };
const FEEDBACK_PARAMS = { temp: 0.2, seed: 7, predict: 120 };

const countWords = s => (s.match(/\S+/g) || []).length;
const UNKNOWN = /\bNO_SE\b/;
const lastQuestion = text => text.trim().split('\n').reverse().find(l => l.includes('?')) || '';

export function createTutor({ engine, files, now = () => performance.now() }) {
  let lastTurn = null;
  const articleWords = new Map(['es', 'en', 'pt'].map(lang => [lang, wordIndex(new Map(files.filter(f => f.file.startsWith(`${lang}/`)).map(f => [f.file, `${f.meta.title} ${asksOf(f).join(' ')} ${f.paragraphs.join(' ')}`])))]));
  const suggestionFor = file => {
    const f = files.find(x => x.file === file);
    return f && { file, title: f.meta.title, ask: asksOf(f)[0] || f.meta.title };
  };

  // First the article, then the passages inside it: a word that merely appears in an unrelated article is not enough.
  async function retrieve(question, lang) {
    const hits = (await engine.search(question, TOP_K, lang)).map(parseHit).filter(Boolean)
      .filter(h => h.file.startsWith(`${lang}/`)).sort((a, b) => b.score - a.score);
    if (!engine.searchCards) {
      const best = hits[0]?.score ?? 0;
      if (best < SCORE_THRESHOLD) return { best, passages: [] };
      return { best, passages: groundPassages(question, hits.filter(h => h.score >= best - NEAR_BEST).slice(0, MAX_PASSAGES)) };
    }
    const cards = (await engine.searchCards(question, TOP_K, lang)).map(parseHit).filter(Boolean).filter(h => h.file.startsWith(`${lang}/`));
    const bestPassage = new Map();
    for (const h of hits) if (!bestPassage.has(h.file)) bestPassage.set(h.file, h.score);
    const ranked = cards.map(c => {
      const meaning = 0.5 * c.score + 0.5 * (bestPassage.get(c.file) ?? 0);
      return { file: c.file, score: (1 - WORDS_WEIGHT) * meaning + WORDS_WEIGHT * articleWords.get(lang).coverage(question, c.file) };
    }).sort((a, b) => b.score - a.score);
    const best = ranked[0]?.score ?? 0;
    const suggestions = ranked.filter(r => r.score >= SUGGEST_THRESHOLD).slice(0, MAX_SUGGESTIONS).map(r => suggestionFor(r.file)).filter(Boolean);
    if (best < ARTICLE_THRESHOLD) return { best, passages: [], suggestions };
    return { best, passages: hits.filter(h => h.file === ranked[0].file).slice(0, MAX_PASSAGES), suggestions };
  }

  // A topic chosen from the list needs no search: the child already said which article.
  function openArticle(file) {
    const f = files.find(x => x.file === file);
    if (!f) return null;
    return { best: 1, passages: f.paragraphs.slice(0, MAX_PASSAGES).map(p => ({ file, text: `${f.meta.title}: ${p}`, score: 1 })) };
  }

  async function* fixedReply(route, lang, text, t0, extra = {}) {
    lastTurn = null;
    yield { type: 'meta', route, lang };
    yield { type: 'token', text };
    yield { type: 'done', route, lang, sources: [], firstTokenMs: Math.round(now() - t0), totalMs: Math.round(now() - t0), words: countWords(text), ...extra };
  }

  async function* ask(input, { file = null } = {}) {
    const t0 = now();
    const question = String(input).slice(0, 500).trim();
    const chosen = file && openArticle(file);
    let lang = chosen ? file.slice(0, 2) : detectLanguage(question);
    const safety = checkInput(question);
    const replyLang = lang === 'sw' ? 'en' : lang;
    if (safety.action === 'care') return yield* fixedReply('care', replyLang, line(replyLang, 'care'), t0);
    if (safety.action === 'redirect') return yield* fixedReply('redirect', replyLang, line(replyLang, 'redirect'), t0);
    if (lang === 'sw') return yield* fixedReply('language-unsupported', 'sw', line('sw', 'unsupported'), t0);

    // An answer such as "12 cm" has no language signal, so it continues in the language of the lesson.
    const following = !chosen && lastTurn && isAnswerToCheck(question);
    if (following) lang = lastTurn.lang;
    let route, messages, passages, params, searchScore = null, nearby = [];
    if (following) {
      route = 'feedback';
      passages = lastTurn.passages;
      messages = feedbackMessages(lang, lastTurn.askedBack, question, passages);
      params = FEEDBACK_PARAMS;
    } else {
      const found = chosen || await retrieve(question, lang);
      searchScore = found.best;
      nearby = found.suggestions || [];
      if (!found.passages.length) {
        const suggestions = found.suggestions || [];
        return yield* fixedReply('unknown', lang, line(lang, suggestions.length ? 'maybe' : 'unknown'), t0, { score: found.best, suggestions });
      }
      route = 'teach';
      passages = found.passages;
      messages = teachMessages(lang, question, passages);
      params = TEACH_PARAMS;
    }

    const guard = new OutputGuard();
    let first = null;
    let stopReason = null;
    let announced = false;
    const announce = () => { announced = true; return { type: 'meta', route, lang }; };
    async function* declined() {
      if (!announced) return yield* fixedReply('unknown', lang, line(lang, nearby.length ? 'maybe' : 'unknown'), t0, { score: searchScore, modelSaidUnknown: true, suggestions: nearby });
      lastTurn = null;
      const text = line(lang, 'unknown');
      yield { type: 'replace', text };
      yield { type: 'done', route: 'unknown', lang, sources: [], firstTokenMs: Math.round(first), totalMs: Math.round(now() - t0), words: countWords(text), score: searchScore, modelSaidUnknown: true };
    }
    for await (const token of engine.generate(messages, params)) {
      const out = guard.push(token);
      // The hold-back in OutputGuard keeps the signal itself off the screen. Text that came before it is replaced.
      // Text copied from the prompt's worked example would be cited as if it came from the pack, so it is replaced too.
      if (UNKNOWN.test(guard.text) || EXAMPLE_TOPIC.test(guard.text)) {
        await engine.cancel?.();
        return yield* declined();
      }
      if (out) {
        if (first === null) first = now() - t0;
        if (!announced) yield announce();
        yield { type: 'token', text: out };
      }
      if (guard.tripped) {
        stopReason = 'guardrail';
        await engine.cancel?.();
        break;
      }
    }
    const rest = guard.finish();
    if (rest) {
      if (first === null) first = now() - t0;
      if (!announced) yield announce();
      yield { type: 'token', text: rest };
    }

    if (guard.tripped) {
      lastTurn = null;
      const text = line(lang, 'redirect');
      yield { type: 'replace', text };
      yield { type: 'done', route: 'blocked-output', lang, sources: [], firstTokenMs: Math.round(first ?? now() - t0), totalMs: Math.round(now() - t0), words: countWords(text), stopReason };
      return;
    }

    if (UNKNOWN.test(guard.text) || EXAMPLE_TOPIC.test(guard.text)) return yield* declined();
    let answer = guard.text;
    if (!lastQuestion(answer)) {
      const check = `\n${line(lang, 'check')}`;
      answer += check;
      yield { type: 'token', text: check };
    }
    lastTurn = { lang, passages, askedBack: lastQuestion(answer) };
    const sources = [...new Set(passages.map(p => p.file))].map(f => sourceFor(files, f)).filter(Boolean);
    yield { type: 'done', route, lang, sources, firstTokenMs: Math.round(first ?? now() - t0), totalMs: Math.round(now() - t0), words: countWords(answer), score: searchScore };
  }

  return { ask, reset: () => { lastTurn = null; } };
}
