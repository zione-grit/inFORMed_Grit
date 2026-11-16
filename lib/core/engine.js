// One conversational turn, for any inFORMed tool: safety check, model call, structured result.
// Shared by the website (api/chat.js) and WhatsApp (lib/core/bot.js).
//
// A tool (see lib/tools) supplies what is specific to it: its instructions and knowledge, its answer
// schema, its form fields, and how its extra answer fields are shaped. Everything else is shared here,
// so every tool gets the same safety layer, languages and voice handling.
const { callModel, cleanMessages } = require('./llm');
const { REPLIES, CRISIS, checkTriggers, supportShownRecently, reply: fixedReply, fallback, support } = require('./safety');
const { pick } = require('./i18n');
const { ensureEnglish, translateForListening: translate } = require('./language');
const tools = require('../tools');
const counters = require('./counters');
const { FIELDS } = require('../../public/fields.js');

// Spoken messages are turned into text automatically, so names, dates, places and numbers can be misheard.
const VOICE_RULE = `

SPOKEN MESSAGE: the person's latest message was spoken and turned into text automatically. Some words may be wrong, especially names, dates, times, places, addresses, ID and phone numbers, weapons (for example gun, knife, panga) and children (how many, their names, whether they were there or hurt). The person may not be able to read well, so do not ask them to check the text. If the message gives an important detail of that kind, or a word seems out of place, gently say it back in your reply and ask if it is right (for example: "Did I hear correctly that this happened on Friday 2 October?"). Confirm at most two details per reply, and only details that matter for the form or the answer. If what they said does not make sense, kindly ask them to say it again.`;

// Returns { reply, updates, abuse_types, sources, safety, ready, fixed, crisis, degraded, ... }
// One turn, then one content-free count of it (lib/core/counters.js). The count never changes the reply.
async function turn(args) {
  const out = await turnOnce(args);
  const result = out.degraded ? 'error' : out.fixed ? 'safety' : out.support ? 'support' : 'reply';
  const tool = tools.get(args.tool).id, channel = args.channel || 'web', lang = args.lang || 'auto', mode = args.mode === 'ask' ? 'ask' : 'fill';
  const before = counters.sectionReached(args.form, FIELDS), after = counters.sectionReached(applyUpdates(args.form, out.updates), FIELDS);
  const wait = result !== 'safety'; // an emergency reply never waits for its count
  if (mode === 'fill' && before === 's0' && after !== 's0') await counters.count('form_started', { tool, channel, lang }, { wait });
  await counters.count('turn', {
    tool, channel, lang, wrote: out.language, mode, input: args.voice ? 'voice' : 'text', result, section: after, province: out.province || 'unknown',
  }, { wait });
  return out;
}

async function turnOnce({ tool: toolId, messages, form = {}, abuse = [], lang = 'auto', channel = 'web', mode = 'fill', voice = false }) {
  const tool = tools.get(toolId);
  mode = mode === 'ask' ? 'ask' : 'fill';
  const msgs = cleanMessages(messages);
  const last = [...msgs].reverse().find(m => m.role === 'user');

  // Layer 1: GRIT trigger phrases, before any model call.
  const hit = last && checkTriggers(last.content);
  if (hit) {
    // Before the model is called, the language is the one chosen on the page (English if "match my language").
    return { reply: fixedReply(hit, pick(lang)), updates: [], abuse_types: abuse, sources: [], safety: hit, ready: false, fixed: true, crisis: CRISIS.has(hit) };
  }
  if (!process.env.OPENAI_API_KEY) {
    return { reply: 'The server is missing OPENAI_API_KEY.', updates: [], abuse_types: abuse, sources: [], safety: 'none', ready: false, degraded: true };
  }
  try {
    const out = await callModel(msgs, tool.instructions({ lang, channel, form, abuse, mode }) + (voice ? VOICE_RULE : ''), tool.schema);
    let updates = (out.updates || []).filter(u => tool.fieldIds.includes(u.field)).map(u => ({ field: u.field, value: String(u.value).slice(0, 8000) }));
    if (mode === 'fill') updates = await ensureEnglish(tool, updates, out.language, lang);
    // Layer 2: the model's safety flag replaces its reply with the fixed message.
    if (out.safety && out.safety !== 'none' && REPLIES[out.safety]) {
      return { ...out, updates, reply: fixedReply(out.safety, pick(out.language, lang)), fixed: true, crisis: CRISIS.has(out.safety) };
    }
    let reply = out.reply, supported = false;
    if (out.distress && !supportShownRecently(msgs)) {
      reply = reply.trim() + '\n\n' + support(pick(out.language, lang)); supported = true;
    }
    return tool.shape({ ...out, reply, support: supported, updates: mode === 'ask' ? [] : updates, fixed: false, crisis: false }, mode);
  } catch (e) {
    console.error('Model error:', e.message); // never logs what the person wrote
    return { reply: fallback(pick(lang)), updates: [], abuse_types: abuse, sources: [], safety: 'none', ready: false, degraded: true };
  }
}

function applyUpdates(form, updates) {
  const f = { ...(form || {}) };
  for (const u of updates || []) f[u.field] = u.value;
  return f;
}

const ensureEnglishFor = (toolId, updates, convLang, uiLang) => ensureEnglish(tools.get(toolId), updates, convLang, uiLang);
const translateForListening = (text, lang, toolId) => translate(tools.get(toolId), text, lang);

module.exports = { turn, applyUpdates, ensureEnglish: ensureEnglishFor, translateForListening, FALLBACK: require('./safety').FALLBACK };
