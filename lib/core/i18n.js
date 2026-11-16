// Fixed wording in every language, on the server (emergency replies, the support line, WhatsApp messages).
// The English wording stays in the code where it is used. Translations are in public/i18n/<code>.json,
// the same files the website uses (see translations/README.md).
//
// say(key, lang, english) returns the translation when it is safe to use, and the English otherwise:
//   - the translation was made from the English as it is now (if the English changed, it is out of date);
//   - every phone number, web address and {placeholder} in the English is also in the translation.
// So a wrong or missing number can never reach someone: they get GRIT's English wording instead.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { LANGS } = require('../../public/fields.js');

const DIR = () => process.env.I18N_DIR || path.join(__dirname, '..', '..', 'public', 'i18n'); // I18N_DIR: used by the automatic checks
const CODES = LANGS.map(l => l.id).filter(id => id !== 'auto');
const NAME = Object.fromEntries(LANGS.map(l => [l.id, l.name]));
const LABEL = Object.fromEntries(LANGS.map(l => [l.id, l.label]));

const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex').slice(0, 10);

// Phone numbers, web addresses, {placeholders} and command words: what a translation must keep exactly.
function keepers(text, caps = true) {
  const s = String(text);
  const nums = (s.match(/\+?\d[\d ]{1,14}\d/g) || []).map(n => n.replace(/\s+/g, ''));
  const urls = (s.match(/https?:\/\/[^\s)]+/g) || []).map(u => u.replace(/[.,;:]+$/, ''));
  const ph = s.match(/\{[a-z]+\}/g) || [];
  // Command words and names in capitals (ASK, FILL, DELETE, GBV, GRIT, SADAG): checked for the server's wording.
  // Website text is not checked for them, because a button name like QUICK EXIT is translated with the button.
  const words = caps ? (s.match(/\b[A-Z]{3,}\b/g) || []) : [];
  return [...nums, ...urls, ...ph, ...words];
}
function keepsAll(english, translation, caps = true) {
  const t = String(translation), flat = t.replace(/\s+/g, '');
  return keepers(english, caps).every(k => /^\d|^\+/.test(k) ? flat.includes(k) : t.includes(k));
}

const cache = new Map();
function file(lang) {
  if (!CODES.includes(lang) || lang === 'en') return null;
  if (cache.has(lang)) return cache.get(lang);
  let f = null;
  try { f = JSON.parse(fs.readFileSync(path.join(DIR(), lang + '.json'), 'utf8')); } catch (e) { f = null; }
  cache.set(lang, f);
  return f;
}

function say(key, lang, english) {
  const f = file(lang);
  const tr = f && f.strings && f.strings[key];
  if (!tr) return english;
  if (f.from && f.from[key] && f.from[key] !== hash(english)) return english; // out of date
  if (!keepsAll(english, tr)) return english;
  return tr;
}

// The language to use for fixed wording: what the person wrote in, else the language chosen, else English.
function pick(...langs) {
  for (const l of langs) if (l && l !== 'auto' && CODES.includes(l)) return l;
  return 'en';
}

module.exports = { say, pick, hash, keepers, keepsAll, CODES, NAME, LABEL, DIR, _clear: () => cache.clear() };
