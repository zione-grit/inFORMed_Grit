// Conversation logic for chat channels (WhatsApp). The website keeps its state in the browser instead.
// Returns a list of things to send: { text, buttons? } or { doc: 'pdf' | 'docx' }.
const { turn, applyUpdates } = require('./engine');
const store = require('./store');
const { codeOk, overLimit, LIMIT_REPLY } = require('./guard');
const tools = require('../tools');

// Tick lists as numbers: "Reply with the numbers, for example 1, 3".
// The tool's suggested options come first, then the rest, and "Something else" last.
function choiceList(tool, group, first) {
  const opts = tool.choices[group];
  const fixedTop = (tool.choiceTopFirst || {})[group];
  const top = fixedTop ? new Set([...fixedTop, ...(first || [])]) : new Set(opts.map(o => o.id));
  const shown = [...opts.filter(o => top.has(o.id) && o.id !== 'other'), ...opts.filter(o => !top.has(o.id) && o.id !== 'other'), ...opts.filter(o => o.id === 'other')];
  return { ids: shown.map(o => o.id), text: shown.map((o, i) => `${i + 1}. ${o.label}`).join('\n') + '\n\nReply with the numbers you want, for example: 1, 3' + (fixedTop && tool.chat.notSure ? '\n' + tool.chat.notSure : '') };
}

const LANG_BUTTONS = ['English', 'isiZulu', 'Afrikaans'];
const LANG_IDS = { english: 'en', isizulu: 'zu', afrikaans: 'af' };
const MODE_BUTTONS = ['Ask a question', 'Fill in my form'];
const K = { ask: 'ASK', fill: 'FILL', form: 'FORM', pdf: 'PDF', word: 'WORD', lang: 'LANGUAGE', del: 'DELETE' };

function help(tool) {
  return `You can type or send a voice note at any time. You can also send:\n${K.ask} ${tool.chat.about}\n${K.fill} to get help filling in your application\n${K.form} to see your application so far\n${K.pdf} or ${K.word} to get it as a document\n${K.lang} to change language\n${K.del} to delete this conversation\n\nIf you are in danger right now, call the police on 10111 or the GBV Command Centre on 0800 428 428 (free, 24 hours).`;
}

function command(text) {
  const t = String(text || '').trim().toLowerCase();
  if (t === 'ask a question') return 'ask';
  if (t === 'fill in my form') return 'fill';
  const map = { start: 'start', ask: 'ask', fill: 'fill', form: 'form', pdf: 'pdf', word: 'docx', language: 'language', delete: 'delete', help: 'help' };
  return map[t] || null;
}

function opening(tool, mode) {
  return mode === 'fill' ? tool.openings.fill.replace('{del}', K.del) + '\n\n' + tool.chat.fillStart
    : tool.openings.ask + `\n\nYou can type, or send a voice note. When you want help with your application, send ${K.fill}.`;
}

// voice: true when the text came from a voice note (we show what we heard, so they can correct it)
async function handle({ channel, userKey, text, msgId, voice = false }) {
  if (msgId && !(await store.firstTime(channel + ':' + msgId))) return [];
  const key = `chat:${channel}:${userKey}`;
  let s = (await store.get(key)) || { authed: !process.env.DEMO_PASSCODE, lang: 'auto', mode: null, tool: tools.DEFAULT, messages: [], form: {}, abuse: [] };
  const tool = tools.get(s.tool);
  const cmd = voice ? null : command(text);

  if (cmd === 'delete') {
    await store.del(key);
    return [{ text: tool.chat.deleted }];
  }

  if (!s.authed) {
    if (!voice && codeOk(text)) {
      s.authed = true; s.started = true;
      await store.set(key, s);
      return [{ text: 'Thank you. Which language would you like to use?', buttons: LANG_BUTTONS }];
    }
    await store.set(key, s);
    return [{ text: 'Welcome to inFORMed, powered by GRIT (Gender Rights in Tech). Please send the access code you were given.' }];
  }

  const langPick = voice ? null : LANG_IDS[String(text || '').trim().toLowerCase()];
  if (langPick) {
    s.lang = langPick; s.started = true;
    await store.set(key, s);
    if (!s.mode) return [{ text: 'Thank you. What would you like to do?', buttons: MODE_BUTTONS }];
    return [{ text: `Okay, I will reply in ${text.trim()} from now on.` }];
  }

  if (cmd === 'start' || !s.started) {
    s = { ...s, started: true, mode: null, messages: [], form: {}, abuse: [] };
    await store.set(key, s);
    return [{ text: tool.chat.welcome, buttons: LANG_BUTTONS }];
  }
  if (cmd === 'ask' || cmd === 'fill') {
    s.mode = cmd;
    const o = opening(tool, cmd);
    s.messages.push({ role: 'assistant', content: o });
    await store.set(key, s);
    return [{ text: o }];
  }
  if (cmd === 'language') return [{ text: 'Which language would you like to use?', buttons: LANG_BUTTONS }];
  if (cmd === 'help') return [{ text: help(tool) }];
  if (cmd === 'form') return [{ text: tool.documents.text(s.form, s.abuse).slice(0, 3900) }];
  if (cmd === 'pdf' || cmd === 'docx') {
    if (!Object.values(s.form).some(Boolean)) return [{ text: tool.chat.empty(K) }];
    return [{ text: tool.chat.ready }, { doc: cmd }];
  }

  const over = await overLimit(channel + ':' + userKey);
  if (over) return [{ text: LIMIT_REPLY[over] }];
  if (!s.mode) { s.mode = 'ask'; s.messages.push({ role: 'assistant', content: tool.openings.ask }); }
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
  if (s.mode === 'fill' && r.offer && r.offer !== 'none' && tool.choices[r.offer]) { const l = choiceList(tool, r.offer, r.offer_first); s.offer = { group: r.offer, ids: l.ids }; listText = l.text; }
  s.messages.push({ role: 'assistant', content: r.reply });
  s.messages = s.messages.slice(-40);
  await store.set(key, s);

  let reply = r.reply;
  if (!r.fixed) {
    const names = [...new Set((r.sources || []).map(x => (tool.sources.find(d => d.id === x.doc) || {}).short).filter(Boolean))];
    if (r.grounding === 'general') reply += '\n\n— General information, not from GRIT’s guides. Please check with the court clerk.';
    else if (names.length && process.env.SHOW_SOURCES === '1') reply += `\n\n— Based on: ${names.join(', ')}`; // developer setting
  }
  const out = [];
  if (voice) out.push({ text: `\u{1F399} I heard: “${String(text).slice(0, 600)}”` });
  out.push({ text: reply + (listText ? '\n\n' + listText : '') });
  return out;
}

module.exports = { handle, help };
