// Languages. The chat follows the person's language; documents for court or officials are always in English.
const { callModel } = require('./llm');
const { LANGS } = require('../../public/fields.js');

// How the reply should be written, by the language chosen on the page. Every official written language works.
const LANG_RULE = {
  auto: 'the same language the person writes in (any South African language; if they mix languages, mirror their mix). Keep it simple and everyday',
  en: 'natural South African English',
};
for (const l of LANGS) if (!LANG_RULE[l.id]) {
  LANG_RULE[l.id] = `${l.name}, simple and everyday as it is spoken in South Africa (not formal or literary), even if the person writes in English. Keep phone numbers and names as they are. If you are not sure of a word in ${l.name}, use the word people commonly say, or the English word`;
}

function looksEnglish(text) {
  const t = ' ' + String(text).toLowerCase().replace(/[^a-z' ]+/g, ' ') + ' ';
  const en = (t.match(/ (the|and|i|me|my|he|she|was|to|of|in|on|at|a|it|with|not|for|is|have|has|respondent) /g) || []).length;
  const words = t.split(/\s+/).filter(Boolean).length || 1;
  return en / words > 0.12;
}

// Every form update goes through a separate translation step before it reaches the form, whenever the
// conversation is not in English or a value does not look English. The tool says what the document is.
async function ensureEnglish(tool, updates, convLang, uiLang) {
  if (!updates.length) return updates;
  const nonEnglishChat = (convLang && convLang !== 'en') || (uiLang && uiLang !== 'en' && uiLang !== 'auto');
  const suspect = updates.some(u => u.value && u.value.trim().split(/\s+/).length >= 4 && !looksEnglish(u.value));
  if (!nonEnglishChat && !suspect) return updates;
  const schema = {
    type: 'object', additionalProperties: false, required: ['updates'],
    properties: { updates: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'value'],
      properties: { field: { type: 'string', enum: tool.fieldIds }, value: { type: 'string' } } } } },
  };
  try {
    const out = await callModel([{ role: 'user', content: JSON.stringify(updates) }], tool.englishRules, schema, 'english_form_text', 0);
    const fixed = (out.updates || []).filter(u => tool.fieldIds.includes(u.field));
    if (fixed.length !== updates.length) return updates;
    return fixed.map(u => ({ field: u.field, value: String(u.value).slice(0, 8000) }));
  } catch (e) {
    console.error('English step error:', e.message);
    return updates;
  }
}

// "Hear my form" in any language other than English: a faithful translation, only so the person understands
// what they will sign. The document itself always stays in English.
const TR_LANG = Object.fromEntries(LANGS.filter(l => l.id !== 'auto' && l.id !== 'en').map(l => [l.id, l.name]));
const TR_SCHEMA = { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } };
async function translateForListening(tool, text, lang) {
  const name = TR_LANG[lang]; if (!name) return String(text);
  const rules = `Translate this ${tool.listenLabel} from English into ${name}, so the applicant can hear and understand exactly what it says before swearing to it. Translate faithfully and completely. Do not add, remove, soften, explain or summarise anything. Keep people's names, dates, times, addresses, phone and ID numbers exactly as written. Write it as plain sentences that sound natural when read aloud. Return only the translation in "text".`;
  const out = await callModel([{ role: 'user', content: String(text).slice(0, 20000) }], rules, TR_SCHEMA, 'listen_translation', 0.2);
  return String(out.text || '');
}

module.exports = { LANG_RULE, TR_LANG, looksEnglish, ensureEnglish, translateForListening };
