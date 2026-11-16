// Content-free usage counters. They count how inFORMed is used and never hold what anyone wrote:
// no names, no messages, no form content, no phone numbers or internet addresses.
// Every count is made of a few fixed labels (tool, channel, language, mode, step reached...), and
// any label that is not on the allowed list below is replaced by "other", so content can never slip in.
//
// Counting can never change or block a reply. A reply waits at most COUNT_WAIT_MS for its count to be
// saved, and emergency replies do not wait at all (wait: false). A count that is not saved is dropped,
// and that is noted in the log (the note never includes content).
//
// Where counts go:
//   On Firebase: Firestore (the project's default database, in Johannesburg), one document per day in
//   the "usage_daily" collection, e.g. usage_daily/2026-11-16 { counts: { "document|protection-order|pdf|GP": 12 } }.
//   COUNTERS=memory keeps them in memory (used by the automatic checks). COUNTERS=off turns counting off.
//   On your own computer counting is off unless COUNTERS is set.
const COUNT_WAIT_MS = 500;
const { onFirebase, firestore, FieldValue } = require('./db');

// South Africa's written official languages, plus "auto" (the page follows the person's language).
const LANGS = ['auto', 'en', 'zu', 'xh', 'af', 'nso', 'tn', 'st', 'ts', 'ss', 've', 'nr'];
// Province only, never a town or an address. "unknown" until the person names a court, police station or place.
const PROVINCES = ['EC', 'FS', 'GP', 'KZN', 'LP', 'MP', 'NC', 'NW', 'WC', 'unknown'];

const ALLOWED = {
  event: ['turn', 'form_started', 'document', 'voice_in', 'listen', 'hear_form', 'tokens', 'listen_chars', 'voice_bytes'],
  tool: ['protection-order'],
  channel: ['web', 'whatsapp'],
  lang: LANGS,                               // the language chosen on the page
  wrote: LANGS.filter(l => l !== 'auto'),    // the language the person actually wrote in
  mode: ['fill', 'ask'],
  input: ['text', 'voice'],
  result: ['reply', 'support', 'safety', 'error'],
  format: ['pdf', 'docx'],
  section: ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'],
  province: PROVINCES,
  kind: ['input', 'cached', 'output'],
};
// The order of labels in each count's name. "model" is checked against MODEL_NAME instead of a list.
const SHAPE = {
  turn: ['tool', 'channel', 'lang', 'wrote', 'mode', 'input', 'result', 'section', 'province'],
  form_started: ['tool', 'channel', 'lang'],   // the first answer that put something on the form
  document: ['tool', 'format', 'province'],    // a form generated (PDF or Word)
  voice_in: ['lang'],
  listen: ['lang'],
  hear_form: ['lang'],
  tokens: ['model', 'kind'],                   // AI usage, added up: the cost of each form and each month
  listen_chars: ['lang'],                      // characters read aloud, added up
  voice_bytes: ['lang'],                       // size of voice recordings turned into text, added up
};
const MODEL_NAME = /^[a-z0-9][a-z0-9.\-]{0,40}$/;

function key(event, labels) {
  if (!SHAPE[event]) return null;
  return [event, ...SHAPE[event].map(k => {
    const v = String(labels[k]);
    if (k === 'model') return MODEL_NAME.test(v) ? v : 'other';
    return ALLOWED[k].includes(v) ? v : 'other';
  })].join('|');
}

const memory = new Map();
function mode() {
  const m = process.env.COUNTERS;
  if (m === 'off' || m === 'memory' || m === 'firestore') return m;
  return onFirebase() ? 'firestore' : 'off';
}

async function write(k, n) {
  const m = mode();
  if (m === 'memory') { memory.set(k, (memory.get(k) || 0) + n); return; }
  if (m !== 'firestore') return;
  const day = new Date().toISOString().slice(0, 10);
  await firestore().collection('usage_daily').doc(day).set({ day, counts: { [k]: FieldValue().increment(n) } }, { merge: true });
}

// count('turn', { tool, channel, lang, ... }) adds 1. { n } adds an amount, for example tokens.
// wait: false starts the count and returns at once, for replies that must not be held up.
async function count(event, labels = {}, { wait = true, n = 1 } = {}) {
  try {
    const k = key(event, labels);
    const amount = Math.round(Number(n) || 0);
    if (!k || amount <= 0) return;
    const save = () => write(k, amount).then(() => 'saved', e => { console.error('Counter not saved:', e.message); return 'failed'; }); // the message never includes content
    if (!wait) { setImmediate(save); return; } // saved after the reply has gone out
    const result = await Promise.race([save(), new Promise(r => setTimeout(() => r('late'), COUNT_WAIT_MS))]);
    if (result === 'late') console.error('Counter not saved in time; the reply was not held up.');
  } catch (e) {
    console.error('Counter not saved:', e.message);
  }
}

// The furthest form section that has anything filled in: shows where people stop, without content.
function sectionReached(form, FIELDS) {
  let n = 0;
  for (const f of FIELDS) if (f.s > n && String((form || {})[f.id] || '').trim()) n = f.s;
  return 's' + n;
}

module.exports = { count, key, sectionReached, memory, ALLOWED, SHAPE, LANGS, PROVINCES };
