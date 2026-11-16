// Conversation logic for chat channels (WhatsApp). The website keeps its state in the browser instead.
// Returns a list of things to send: { text, buttons? } or { doc: 'pdf' | 'docx' }.
const { turn, applyUpdates } = require('./engine');
const store = require('./store');
const { codeOk, overLimit, limitReply } = require('./guard');
const { say, CODES, LABEL } = require('./i18n');
const tools = require('../tools');

// Fixed WhatsApp wording, in English. It is sent in the person's language when a checked-safe translation
// exists (lib/core/i18n.js, public/i18n/<code>.json); otherwise in English. Command words (ASK, FILL, ...)
// stay in English in every language, so they always work.
const TEXT = {
  'wa.code': 'Welcome to inFORMed, powered by GRIT (Gender Rights in Tech). Please send the access code you were given.',
  'wa.whatToDo': 'Thank you. What would you like to do?',
  'wa.replyIn': 'Okay, I will reply in {lang} from now on.',
  'wa.pickNumbers': 'Reply with the numbers you want, for example: 1, 3',
  'wa.heard': 'I heard: “{t}”',
  'wa.general': '— General information, not from GRIT’s guides. Please check with the court clerk.',
  'wa.askMore': 'You can type, or send a voice note. When you want help with your application, send FILL.',
  'wa.help': 'You can type or send a voice note at any time. You can also send:\nASK {about}\nFILL to get help filling in your application\nFORM to see your application so far\nPDF or WORD to get it as a document\nLANGUAGE to change language\nDELETE to delete this conversation\n\nIf you are in danger right now, call the police on 10111 or the GBV Command Centre on 0800 428 428 (free, 24 hours).',
  'wa.voiceFail': 'Sorry, I could not hear that voice note clearly. Please try again, or type your message.',
  'wa.textOnly': 'I can read text messages and voice notes. Please type, or send a voice note.',
  'wa.docFail': 'Sorry, I could not send the document just now. Please try again.',
  'wa.modeAsk': 'Ask a question',
  'wa.modeFill': 'Fill in my form',
};
const tr = (key, lang, vars) => {
  let v = say(key, lang, TEXT[key]);
  for (const k in vars || {}) v = v.split('{' + k + '}').join(vars[k]);
  return v;
};
// A tool's own wording (tool.chat, tool.openings), under keys like "protection-order.ready".
const toolText = (tool, lang, name, english) => say(tool.id + '.' + name, lang, english);
// Button titles must be 20 characters at most on WhatsApp; a longer translation falls back to English.
const button = (key, lang) => { const v = tr(key, lang); return v.length <= 20 ? v : TEXT[key]; };
const modeButtons = lang => [button('wa.modeAsk', lang), button('wa.modeFill', lang)];

// The language list: every official written language, as numbers (WhatsApp buttons allow only three).
const LANG_LIST = CODES.map((c, i) => `${i + 1}. ${LABEL[c]}`).join('\n');
const LANG_QUESTION = 'Which language would you like to use? Reply with the number.\n\n' + LANG_LIST;
function langFrom(text, menu) {
  const t = String(text || '').trim().toLowerCase().replace(/[.)]$/, '');
  if (menu && /^\d{1,2}$/.test(t) && CODES[+t - 1]) return CODES[+t - 1];
  const byName = CODES.find(c => LABEL[c].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u1e13/g, 'd') === t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  if (byName) return byName;
  return ({ english: 'en', zulu: 'zu', xhosa: 'xh', sepedi: 'nso', 'northern sotho': 'nso', tswana: 'tn', sotho: 'st', 'southern sotho': 'st', tsonga: 'ts', swati: 'ss', swazi: 'ss', venda: 've', ndebele: 'nr', tshivenda: 've' })[t] || null;
}

// Tick lists as numbers: "Reply with the numbers, for example 1, 3".
// The tool's suggested options come first, then the rest, and "Something else" last.
function choiceList(tool, group, first, lang) {
  const opts = tool.choices[group];
  const fixedTop = (tool.choiceTopFirst || {})[group];
  const top = fixedTop ? new Set([...fixedTop, ...(first || [])]) : new Set(opts.map(o => o.id));
  const shown = [...opts.filter(o => top.has(o.id) && o.id !== 'other'), ...opts.filter(o => !top.has(o.id) && o.id !== 'other'), ...opts.filter(o => o.id === 'other')];
  return { ids: shown.map(o => o.id), text: shown.map((o, i) => `${i + 1}. ${o.label}`).join('\n') + '\n\n' + tr('wa.pickNumbers', lang) + (fixedTop && tool.chat.notSure ? '\n' + toolText(tool, lang, 'notSure', tool.chat.notSure) : '') };
}

const K = { ask: 'ASK', fill: 'FILL', form: 'FORM', pdf: 'PDF', word: 'WORD', lang: 'LANGUAGE', del: 'DELETE' };

function help(tool, lang = 'en') {
  return tr('wa.help', lang, { about: toolText(tool, lang, 'about', tool.chat.about) });
}

function command(text, lang = 'en') {
  const t = String(text || '').trim().toLowerCase();
  if (t === 'ask a question' || t === button('wa.modeAsk', lang).toLowerCase()) return 'ask';
  if (t === 'fill in my form' || t === button('wa.modeFill', lang).toLowerCase()) return 'fill';
  const map = { start: 'start', ask: 'ask', fill: 'fill', form: 'form', pdf: 'pdf', word: 'docx', language: 'language', delete: 'delete', help: 'help' };
  return map[t] || null;
}

function opening(tool, mode, lang = 'en') {
  return mode === 'fill' ? toolText(tool, lang, 'openingFill', tool.openings.fill).replace('{del}', K.del) + '\n\n' + toolText(tool, lang, 'fillStart', tool.chat.fillStart)
    : toolText(tool, lang, 'openingAsk', tool.openings.ask) + '\n\n' + tr('wa.askMore', lang);
}

// Every fixed WhatsApp text with its key, for the translation files (scripts/translations.js).
function texts() {
  const out = { ...TEXT };
  for (const tool of tools.all()) {
    out[tool.id + '.openingFill'] = tool.openings.fill;
    out[tool.id + '.openingAsk'] = tool.openings.ask;
    for (const [k, v] of Object.entries(tool.chat)) out[tool.id + '.' + k] = typeof v === 'function' ? v(K) : v;
  }
  return out;
}

// voice: true when the text came from a voice note (we show what we heard, so they can correct it)
async function handle({ channel, userKey, text, msgId, voice = false }) {
  if (msgId && !(await store.firstTime(channel + ':' + msgId))) return [];
  const key = `chat:${channel}:${userKey}`;
  let s = (await store.get(key)) || { authed: !process.env.DEMO_PASSCODE, lang: 'auto', mode: null, tool: tools.DEFAULT, messages: [], form: {}, abuse: [] };
  const tool = tools.get(s.tool);
  const L = s.lang;
  const cmd = voice ? null : command(text, L);

  if (cmd === 'delete') {
    await store.del(key);
    return [{ text: toolText(tool, L, 'deleted', tool.chat.deleted) }];
  }

  if (!s.authed) {
    if (!voice && codeOk(text)) {
      s.authed = true; s.started = true;
      await store.set(key, s);
      s.langMenu = true;
      await store.set(key, s);
      return [{ text: 'Thank you. ' + LANG_QUESTION }];
    }
    await store.set(key, s);
    return [{ text: TEXT['wa.code'] }];
  }

  const langPick = voice ? null : langFrom(text, s.langMenu);
  if (langPick) {
    s.lang = langPick; s.started = true; s.langMenu = false;
    await store.set(key, s);
    if (!s.mode) return [{ text: tr('wa.whatToDo', langPick), buttons: modeButtons(langPick) }];
    return [{ text: tr('wa.replyIn', langPick, { lang: LABEL[langPick] }) }];
  }
  if (s.langMenu) { s.langMenu = false; await store.set(key, s); }

  if (cmd === 'start' || !s.started) {
    s = { ...s, started: true, mode: null, messages: [], form: {}, abuse: [], langMenu: true };
    await store.set(key, s);
    return [{ text: tool.chat.welcome.replace(/\s*Which language would you like to use\?\s*$/, '') + '\n\n' + LANG_QUESTION }];
  }
  if (cmd === 'ask' || cmd === 'fill') {
    s.mode = cmd;
    const o = opening(tool, cmd, L);
    s.messages.push({ role: 'assistant', content: o });
    await store.set(key, s);
    return [{ text: o }];
  }
  if (cmd === 'language') { s.langMenu = true; await store.set(key, s); return [{ text: LANG_QUESTION }]; }
  if (cmd === 'help') return [{ text: help(tool, L) }];
  if (cmd === 'form') return [{ text: tool.documents.text(s.form, s.abuse).slice(0, 3900) }];
  if (cmd === 'pdf' || cmd === 'docx') {
    if (!Object.values(s.form).some(Boolean)) return [{ text: toolText(tool, L, 'empty', tool.chat.empty(K)) }];
    return [{ text: toolText(tool, L, 'ready', tool.chat.ready) }, { doc: cmd }];
  }

  const over = await overLimit(channel + ':' + userKey);
  if (over) return [{ text: limitReply(over, L) }];
  if (!s.mode) { s.mode = 'ask'; s.messages.push({ role: 'assistant', content: toolText(tool, L, 'openingAsk', tool.openings.ask) }); }
  // A reply to a numbered tick list: tick the boxes, then tell inFORMed what was chosen.
  if (s.offer && /^\s*\d+([\s,;.]+\d+)*\s*$/.test(String(text))) {
    const opts = tool.choices[s.offer.group];
    const picked = [...new Set(String(text).match(/\d+/g).map(Number))].map(n => opts.find(o => o.id === s.offer.ids[n - 1])).filter(Boolean);
    if (picked.length) {
      tool.applyChoices(s, s.offer.group, picked);
      text = picked.some(o => o.none) ? 'None of these happened to me.' : 'I chose: ' + picked.map(o => o.label).join('; ');
    }
  }
  s.offer = null;
  s.messages.push({ role: 'user', content: String(text).slice(0, 4000) });
  const r = await turn({ tool: tool.id, messages: s.messages, form: s.form, abuse: s.abuse, lang: s.lang, channel, mode: s.mode, voice });
  s.form = applyUpdates(s.form, r.updates);
  if (Array.isArray(r.abuse_types) && s.mode === 'fill') s.abuse = r.abuse_types;
  if (Array.isArray(r.bring) && r.bring.length && s.mode === 'fill') s.form._bring = r.bring.join('\n');
  let listText = '';
  if (s.mode === 'fill' && r.offer && r.offer !== 'none' && tool.choices[r.offer]) { const l = choiceList(tool, r.offer, r.offer_first, L); s.offer = { group: r.offer, ids: l.ids }; listText = l.text; }
  s.messages.push({ role: 'assistant', content: r.reply });
  s.messages = s.messages.slice(-40);
  await store.set(key, s);

  let reply = r.reply;
  if (!r.fixed) {
    const names = [...new Set((r.sources || []).map(x => (tool.sources.find(d => d.id === x.doc) || {}).short).filter(Boolean))];
    if (r.grounding === 'general') reply += '\n\n' + tr('wa.general', L);
    else if (names.length && process.env.SHOW_SOURCES === '1') reply += `\n\n— Based on: ${names.join(', ')}`; // developer setting
  }
  const out = [];
  if (voice) out.push({ text: '\u{1F399} ' + tr('wa.heard', L, { t: String(text).slice(0, 600) }) });
  out.push({ text: reply + (listText ? '\n\n' + listText : '') });
  return out;
}

module.exports = { handle, help, texts, tr, LANG_QUESTION };
