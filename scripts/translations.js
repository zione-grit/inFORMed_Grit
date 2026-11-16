// Translations for every official written South African language.
//
//   npm run translations                  how far each language is (translated, by the model, checked, missing)
//   npm run translations fill             translates everything missing or out of date, with the AI model
//   npm run translations fill zu xh       the same, for some languages only
//   npm run translations export           writes translations/<code>.csv, to open in Excel or Google Sheets
//   npm run translations import translations/zu.csv   reads a checked spreadsheet back in
//
// The translations themselves are in public/i18n/<code>.json, kept in GitHub. Each line has a status:
//   machine  made by the AI model (npm run translations fill)
//   draft    written earlier, not yet checked by a native speaker
//   checked  checked or written by a native speaker (set when a spreadsheet is imported)
// "fill" needs OPENAI_API_KEY (see translations/README.md). It never changes a checked line, unless the
// English it was made from has changed.
const fs = require('fs');
const path = require('path');
const { LANGS } = require('../public/fields.js');
const I18N = require('../public/i18n.js');
const { hash, keepsAll, DIR, CODES, NAME, LABEL } = require('../lib/core/i18n');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'translations');
const LANGS_TO_DO = CODES.filter(c => c !== 'en');

// Every English text that is translated, by key: the website, the safety replies, the limits, WhatsApp.
function english() {
  const out = {};
  for (const [k, v] of Object.entries(I18N.en)) if (k[0] !== '_') out[k] = String(v);
  Object.assign(out, require('../lib/core/safety').TEXTS());
  const { LIMIT_REPLY } = require('../lib/core/guard');
  for (const [k, v] of Object.entries(LIMIT_REPLY)) out['limit.' + k] = v;
  Object.assign(out, require('../lib/core/bot').texts());
  return out;
}

function read(lang) {
  const f = path.join(DIR(), lang + '.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return { language: lang, strings: {}, status: {}, from: {} }; }
}
function write(lang, data) {
  const sorted = k => Object.fromEntries(Object.keys(data[k] || {}).sort().map(x => [x, data[k][x]]));
  const out = { language: lang, name: NAME[lang], strings: sorted('strings'), status: sorted('status'), from: sorted('from') };
  fs.mkdirSync(DIR(), { recursive: true });
  fs.writeFileSync(path.join(DIR(), lang + '.json'), JSON.stringify(out, null, 1) + '\n');
}

const tags = t => (String(t).match(/<\/?[a-z][^>]*>/gi) || []).map(x => x.replace(/\s.*>/, '>').toLowerCase()).sort().join('');
// A translation is safe to use when it keeps every number, link, {placeholder}, command word and HTML tag.
// Command words in capitals are only checked for the server's wording (keys with a dot, like safety.death).
const safe = (en, tr, key = '.') => !!tr && keepsAll(en, tr, key.includes('.')) && tags(en) === tags(tr);

// What each key needs: ok, missing, outdated (the English changed) or unsafe.
function state(en, data, key) {
  const tr = data.strings[key];
  if (!tr) return 'missing';
  if (data.from[key] && data.from[key] !== hash(en[key])) return 'outdated';
  if (!safe(en[key], tr, key)) return 'unsafe';
  return 'ok';
}

function status() {
  const en = english(), keys = Object.keys(en);
  console.log(`${keys.length} texts to translate.\n`);
  console.log('language          ready  checked  draft  machine  missing  outdated  unsafe');
  for (const lang of LANGS_TO_DO) {
    const d = read(lang), c = { ok: 0, missing: 0, outdated: 0, unsafe: 0, checked: 0, draft: 0, machine: 0 };
    for (const k of keys) { const s = state(en, d, k); c[s]++; if (s === 'ok') c[d.status[k] || 'draft']++; }
    const pad = (x, n) => String(x).padStart(n);
    console.log(`${(LABEL[lang] + ' (' + lang + ')').padEnd(16)} ${pad(c.ok, 6)} ${pad(c.checked, 8)} ${pad(c.draft, 6)} ${pad(c.machine, 8)} ${pad(c.missing, 8)} ${pad(c.outdated, 9)} ${pad(c.unsafe, 7)}`);
  }
  console.log('\nAnything not ready is shown in English. Run "npm run translations fill" to translate it.');
}

const RULES = lang => `You translate the fixed wording of inFORMed into ${NAME[lang]}, as it is spoken in South Africa.
inFORMed is a free, trauma-informed service of GRIT (Gender Rights in Tech) that helps people experiencing domestic violence apply for a protection order. Many readers are frightened, some read with difficulty, and some will hear the text read aloud.
- Use simple, warm, everyday ${NAME[lang]}: the words people use at home and at the clinic, not formal, literary or church language. Short sentences.
- Translate the meaning faithfully. Do not add, leave out, soften or strengthen anything, especially in safety and emergency messages.
- Keep exactly as they are: every phone number and number, web address, {placeholder} such as {n} or {lang}, HTML tag such as <em> or <strong>, line break (\\n), and every word in capital letters (ASK, FILL, FORM, PDF, WORD, LANGUAGE, DELETE, HELP, GBV, GRIT, SADAG, CAS).
- Keep these names in English: inFORMed, GRIT, Gender Rights in Tech, WhatsApp, GBV Command Centre, SADAG, Form 6, Form 6A, Magistrates' Court, Legal Aid South Africa.
- Legal words (protection order, interim protection order, respondent, applicant, clerk of the court, magistrate, commissioner of oaths, return date): use the term people in South Africa understand. If there is no common word, keep the English word and explain it briefly in ${NAME[lang]} the first time it appears in that text.
- Return every key you were given, with its translation in "text".`;
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'text'], properties: { key: { type: 'string' }, text: { type: 'string' } } } } },
};

async function fill(langs) {
  if (!process.env.OPENAI_API_KEY) { console.error('Set OPENAI_API_KEY first (see translations/README.md).'); process.exit(1); }
  const { callModel } = require('../lib/core/llm');
  const en = english();
  for (const lang of langs) {
    const d = read(lang);
    const todo = Object.keys(en).filter(k => {
      const s = state(en, d, k);
      return s === 'missing' || s === 'unsafe' || s === 'outdated';
    });
    if (!todo.length) { console.log(`${NAME[lang]}: nothing to translate.`); continue; }
    console.log(`${NAME[lang]}: translating ${todo.length} texts...`);
    let done = 0, failed = [];
    for (let i = 0; i < todo.length; i += 25) {
      const batch = todo.slice(i, i + 25);
      let items = [];
      for (let attempt = 0; attempt < 2 && !items.length; attempt++) {
        try {
          const out = await callModel([{ role: 'user', content: JSON.stringify(batch.map(k => ({ key: k, text: en[k] }))) }], RULES(lang), SCHEMA, 'translation', 0.2);
          items = out.items || [];
        } catch (e) { console.error('  model error:', e.message); }
      }
      for (const k of batch) {
        const it = items.find(x => x.key === k);
        if (it && safe(en[k], it.text, k)) {
          d.strings[k] = it.text; d.status[k] = 'machine'; d.from[k] = hash(en[k]); done++;
        } else failed.push(k);
      }
      write(lang, d); // saved after every batch, so an interrupted run keeps what it did
      process.stdout.write(`  ${Math.min(i + 25, todo.length)}/${todo.length}\r`);
    }
    console.log(`  ${done} translated` + (failed.length ? `; ${failed.length} not safe to use, shown in English: ${failed.join(', ')}` : '') + '   ');
  }
}

// Spreadsheets: one row per text. Translators change the "translation" column and set "status" to checked.
function csvCell(v) { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x !== ''));
}

function exportCsv(langs, outDir = OUT) {
  const en = english();
  fs.mkdirSync(outDir, { recursive: true });
  for (const lang of langs) {
    const d = read(lang);
    const lines = [['key', 'english', 'translation', 'status', 'note'].join(',')];
    for (const k of Object.keys(en)) {
      const s = state(en, d, k);
      const note = s === 'ok' ? '' : s === 'missing' ? 'not translated yet' : s === 'outdated' ? 'the English changed: check the translation' : 'a number, link, command word or tag is missing';
      lines.push([k, en[k], d.strings[k] || '', s === 'ok' ? (d.status[k] || 'draft') : '', note].map(csvCell).join(','));
    }
    const f = path.join(outDir, lang + '.csv');
    fs.writeFileSync(f, '﻿' + lines.join('\r\n') + '\r\n'); // the mark at the start makes Excel read the accents correctly
    console.log('Wrote ' + path.relative(ROOT, f));
  }
}

function importCsv(files) {
  const en = english();
  for (const f of files) {
    const lang = path.basename(f).replace(/\.csv$/i, '').toLowerCase();
    if (!LANGS_TO_DO.includes(lang)) { console.error(`${f}: the file name must be a language code, for example zu.csv`); continue; }
    const rows = parseCsv(fs.readFileSync(f, 'utf8'));
    const head = rows.shift().map(h => h.trim().toLowerCase());
    const col = n => head.indexOf(n);
    const d = read(lang); let changed = 0; const refused = [];
    for (const r of rows) {
      const k = r[col('key')], tr = (r[col('translation')] || '').trim(), st = (r[col('status')] || '').trim().toLowerCase();
      if (!k || !en[k] || !tr) continue;
      if (!safe(en[k], tr, k)) { refused.push(k); continue; }
      const textChanged = tr !== d.strings[k];
      const newStatus = ['machine', 'draft', 'checked'].includes(st) ? st : (textChanged ? 'checked' : (d.status[k] || 'draft'));
      if (textChanged || newStatus !== d.status[k] || d.from[k] !== hash(en[k])) {
        d.strings[k] = tr; d.status[k] = newStatus; d.from[k] = hash(en[k]); changed++;
      }
    }
    write(lang, d);
    console.log(`${NAME[lang]}: ${changed} lines updated.` + (refused.length ? ` Not taken, because a number, link, command word or tag is missing: ${refused.join(', ')}` : ''));
  }
}

module.exports = { english, read, state, safe, parseCsv, fill, exportCsv, importCsv };

if (require.main === module) {
  const [cmd = 'status', ...args] = process.argv.slice(2);
  const langs = args.length ? args.filter(a => LANGS_TO_DO.includes(a)) : LANGS_TO_DO;
  if (cmd === 'status') status();
  else if (cmd === 'fill') fill(langs).catch(e => { console.error(e.message); process.exit(1); });
  else if (cmd === 'export') exportCsv(langs);
  else if (cmd === 'import') importCsv(args);
  else { console.error('Use: status, fill, export or import (see translations/README.md).'); process.exit(1); }
}
