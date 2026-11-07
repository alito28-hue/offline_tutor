// Generates the static pages in web/ from the templates and translations. Run: node web-src/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '../web');
const read = name => fs.readFileSync(path.join(here, name), 'utf8');
const site = JSON.parse(read('site.json'));
const langs = Object.keys(site.locales);
const texts = Object.fromEntries(langs.map(l => [l, JSON.parse(read(`i18n/${l}.json`))]));

const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) =>
  (typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]));
const flat = Object.fromEntries(langs.map(l => [l, Object.fromEntries(flatten(texts[l]))]));

for (const l of langs) {
  const missing = Object.keys(flat.en).filter(k => !(k in flat[l]));
  const extra = Object.keys(flat[l]).filter(k => !(k in flat.en));
  if (missing.length || extra.length) throw new Error(`${l}: missing ${missing} extra ${extra}`);
}

function nav(lang, kind) {
  const links = langs.map(l => {
    const current = l === lang ? ' aria-current="page"' : '';
    return `<a href="${site.locales[l][kind]}" lang="${l}" hreflang="${l}"${current}>${site.locales[l].name}</a>`;
  }).join('');
  return `<nav class="lang" aria-label="${flat[lang]['nav.language']}">${links}</nav>`;
}

function alternates(kind) {
  const lines = langs.map(l => `<link rel="alternate" hreflang="${l}" href="${site.origin}${site.locales[l][kind]}">`);
  lines.push(`<link rel="alternate" hreflang="x-default" href="${site.origin}${site.locales.en[kind]}">`);
  return lines.join('\n');
}

function render(template, lang, kind) {
  const values = {
    ...flat[lang],
    lang,
    head: read('head.html').trim(),
    origin: site.origin,
    github: site.github,
    linkedin: site.linkedin,
    ogLocale: site.locales[lang].ogLocale,
    canonical: site.origin + site.locales[lang][kind],
    alternates: alternates(kind),
    langNav: nav(lang, kind),
    homePath: site.locales[lang].home,
    privacyPath: site.locales[lang].privacy,
    feedbackPath: site.locales[lang].feedback,
    notice: flat[lang]['notice.text'] ? `<div class="notice"><div class="wrap"><p>${flat[lang]['notice.text']}</p></div></div>` : '',
  };
  return template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`${lang}: no text for ${key}`);
    return values[key];
  });
}

const pages = { home: read('home.html'), privacy: read('privacy.html'), feedback: read('feedback.html') };
export function build(write = true) {
  const result = {};
  for (const l of langs) {
    for (const [kind, template] of Object.entries(pages)) {
      const file = path.join(site.locales[l][kind], 'index.html');
      result[file] = render(template, l, kind);
      if (write) {
        fs.mkdirSync(path.join(out, path.dirname(file)), { recursive: true });
        fs.writeFileSync(path.join(out, file), result[file]);
      }
    }
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(Object.keys(build()).join('\n'));
