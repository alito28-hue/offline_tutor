'use strict';
const $ = id => document.getElementById(id);
const els = {
  net: $('net'), welcome: $('welcome'), lesson: $('lesson'), asked: $('asked'), answer: $('answer'),
  sources: $('sources'), speed: $('speed'), form: $('form'), question: $('question'), send: $('send'),
};
const LABELS = {
  es: { source: 'Fuente:', sources: 'Fuentes:', speed: s => `Empezó a responder en ${s} s` },
  en: { source: 'Source:', sources: 'Sources:', speed: s => `Started answering in ${s} s` },
  sw: { source: 'Source:', sources: 'Sources:', speed: s => `Started answering in ${s} s` },
};
// The screen follows the computer's language: Spanish on a Spanish computer, English everywhere else.
// Answers follow the language of each question, whatever the screen shows.
const UI_LANG = navigator.language.slice(0, 2) === 'es' ? 'es' : 'en';
const UI = {
  en: {
    welcome: 'What do you want to learn today?',
    chips: ['How does a volcano erupt?', 'How do I add fractions?', 'How do plants make their food?', '¿Cómo funcionan los imanes?'],
    placeholder: 'Type your question…', loading: 'Loading the tutor…', question: 'Your question', ask: 'Ask',
    failed: 'Something went wrong. Please try again.',
    net: { offline: 'Offline ✓', 'not-needed': 'Works without internet', 'no-calls': 'No network calls ✓', unverified: 'Checking network…', external: 'Connection detected' },
  },
  es: {
    welcome: '¿Qué quieres aprender hoy?',
    chips: ['¿Cómo entra en erupción un volcán?', '¿Cómo sumo fracciones?', '¿Cómo hacen su comida las plantas?', 'How do magnets work?'],
    placeholder: 'Escribe tu pregunta…', loading: 'Cargando el tutor…', question: 'Tu pregunta', ask: 'Preguntar',
    failed: 'Algo falló. Intenta de nuevo.',
    net: { offline: 'Sin conexión ✓', 'not-needed': 'Funciona sin internet', 'no-calls': 'Sin llamadas de red ✓', unverified: 'Verificando red…', external: 'Conexión detectada' },
  },
}[UI_LANG];
const NET = {
  offline: [UI.net.offline, 'pill-ok'],
  'not-needed': [UI.net['not-needed'], 'pill-info'],
  'no-calls': [UI.net['no-calls'], 'pill-info'],
  unverified: [UI.net.unverified, 'pill-wait'],
  external: [UI.net.external, 'pill-bad'],
};
document.documentElement.lang = UI_LANG;
$('welcomeTitle').textContent = UI.welcome;
$('chips').querySelectorAll('.chip').forEach((chip, i) => { chip.textContent = UI.chips[i]; });
els.question.setAttribute('aria-label', UI.question);
els.send.textContent = UI.ask;
const MIN_SIZE = 2.6;
const MAX_SIZE = 4;
let ready = false;
let asking = false;

function render(text, route, streaming) {
  els.answer.replaceChildren();
  const fixed = ['care', 'redirect', 'unknown', 'language-unsupported', 'blocked-output'].includes(route);
  if (fixed) {
    const p = document.createElement('p');
    p.className = route === 'care' ? 'note care' : 'note';
    p.textContent = text;
    els.answer.append(p);
    return;
  }
  const lines = text.replace(/\*\*|^#+\s*/gm, '').split('\n').map(l => l.trim()).filter(Boolean);
  let last = null;
  lines.forEach((l, i) => {
    const step = l.match(/^(?:Paso|Step)\s*(\d+)\s*[:.)-]\s*(.*)$/i);
    const isLast = i === lines.length - 1;
    if (step) {
      const row = document.createElement('div');
      row.className = 'step';
      const n = document.createElement('span');
      n.className = 'step-n';
      n.textContent = step[1];
      const t = document.createElement('span');
      t.className = 'step-t';
      t.textContent = step[2];
      row.append(n, t);
      els.answer.append(row);
      last = t;
    } else if (l.endsWith('?') && (isLast || i > 0)) {
      const c = document.createElement('div');
      c.className = 'check';
      const t = document.createElement('span');
      t.textContent = l;
      c.append(t);
      els.answer.append(c);
      last = t;
    } else {
      const p = document.createElement('p');
      p.className = 'intro';
      p.textContent = l;
      els.answer.append(p);
      last = p;
    }
  });
  if (streaming && last) {
    const caret = document.createElement('span');
    caret.className = 'caret';
    last.append(caret);
  }
}

// Answers must fit without scrolling, so the text shrinks if a long answer would overflow.
function fit() {
  let size = MAX_SIZE;
  els.answer.style.setProperty('--answer-size', `${size}rem`);
  while (els.answer.scrollHeight > els.answer.clientHeight + 1 && size > MIN_SIZE) {
    size = Math.round((size - 0.1) * 10) / 10;
    els.answer.style.setProperty('--answer-size', `${size}rem`);
  }
}

function showSources(list, lang) {
  els.sources.replaceChildren();
  if (!list.length) return;
  const l = LABELS[lang] || LABELS.es;
  const label = document.createElement('span');
  label.className = 'src-label';
  label.textContent = list.length > 1 ? l.sources : l.source;
  els.sources.append(label);
  for (const s of list) {
    const chip = document.createElement('span');
    chip.className = 'src';
    chip.textContent = `${s.title} · ${s.source_site} · ${s.license}`;
    chip.title = `${s.file} — ${s.source_url} — ${s.authors}. ${s.changes}`;
    els.sources.append(chip);
  }
}

function setBusy(on) {
  asking = on;
  els.send.disabled = on || !ready;
  els.question.disabled = on;
  if (!on) els.question.focus();
}

async function ask(question) {
  if (asking || !ready) return;
  els.welcome.hidden = true;
  els.lesson.hidden = false;
  els.asked.textContent = question;
  els.answer.replaceChildren();
  els.sources.replaceChildren();
  els.speed.textContent = '';
  els.question.value = '';
  setBusy(true);
  let text = '';
  let route = 'teach';
  try {
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        if (!raw.startsWith('data: ')) continue;
        const ev = JSON.parse(raw.slice(6));
        if (ev.type === 'meta') route = ev.route;
        if (ev.type === 'token') { text += ev.text; render(text, route, true); fit(); }
        if (ev.type === 'replace') { text = ev.text; route = 'blocked-output'; render(text, route, false); fit(); }
        if (ev.type === 'error') throw new Error(ev.message);
        if (ev.type === 'done') {
          render(text, ev.route, false);
          showSources(ev.sources, ev.lang);
          fit();
          if (['teach', 'feedback'].includes(ev.route)) {
            els.speed.textContent = (LABELS[ev.lang] || LABELS.es).speed((ev.firstTokenMs / 1000).toFixed(1).replace('.', ev.lang === 'es' ? ',' : '.'));
          }
        }
      }
    }
  } catch {
    els.answer.replaceChildren();
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = UI.failed;
    els.answer.append(p);
  }
  setBusy(false);
}

// Whoever received the app from someone else can still find its author and the project.
const CREDIT = {
  es: {
    feedback: 'Dar feedback o reportar un error', feedbackUrl: 'https://amaratutor.org/es/feedback/',
    line: 'Creada por Alex Smith, con QVAC. ¿Te la compartieron? Conectemos:', open: 'Créditos', close: 'Cerrar',
    author: 'Creada por Alex Smith.',
    tech: 'Funciona en este equipo, sin internet, con QVAC de Tether y los modelos Qwen3 4B y EmbeddingGemma.',
    library: 'Materiales: artículos de Wikipedia, de sus colaboradores, bajo CC BY-SA 4.0.',
    independent: 'Es un prototipo independiente, sin afiliación con Tether ni con ninguna escuela.',
    connect: '¿Te la compartieron? Me encantaría saber de ti:',
  },
  en: {
    feedback: 'Give feedback or report a bug', feedbackUrl: 'https://amaratutor.org/feedback/',
    line: 'Created by Alex Smith, with QVAC. Did someone share it with you? Let\'s connect:', open: 'Credits', close: 'Close',
    author: 'Created by Alex Smith.',
    tech: 'It runs on this computer, without internet, using Tether\'s QVAC and the Qwen3 4B and EmbeddingGemma models.',
    library: 'Learning materials: Wikipedia articles by Wikipedia contributors, under CC BY-SA 4.0.',
    independent: 'It is an independent prototype, not affiliated with Tether or any school.',
    connect: 'Did someone share it with you? I\'d love to hear from you:',
  },
};
const credit = CREDIT[UI_LANG];
$('creditText').textContent = credit.line;
for (const id of ['creditFeedback', 'creditsFeedback']) { $(id).textContent = credit.feedback; $(id).href = credit.feedbackUrl; }
$('creditsOpen').textContent = credit.open;
$('creditsClose').textContent = credit.close;
for (const [id, key] of [['creditsAuthor', 'author'], ['creditsTech', 'tech'], ['creditsLibrary', 'library'], ['creditsIndependent', 'independent'], ['creditsConnect', 'connect']]) $(id).textContent = credit[key];
$('creditsOpen').addEventListener('click', () => $('credits').showModal());

async function refreshStatus() {
  try {
    const s = await (await fetch('/api/status')).json();
    ready = s.ready;
    const state = s.net.state === 'desktop' ? (navigator.onLine ? 'not-needed' : 'offline') : s.net.state;
    const [label, cls] = NET[state] || NET.unverified;
    els.net.textContent = label;
    els.net.className = `pill ${cls}`;
    if (!asking) els.send.disabled = !ready;
    els.question.placeholder = ready ? UI.placeholder : UI.loading;
  } catch {
    els.net.textContent = UI.net.unverified;
    els.net.className = 'pill pill-wait';
  }
}

els.form.addEventListener('submit', e => {
  e.preventDefault();
  const q = els.question.value.trim();
  if (q) ask(q);
});
$('chips').addEventListener('click', e => {
  if (e.target.classList.contains('chip')) ask(e.target.textContent);
});
refreshStatus();
setInterval(refreshStatus, 1000);
