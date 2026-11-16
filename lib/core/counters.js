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
//   the "usage_daily" collection, e.g. usage_daily/2026-11-16 { counts: { "turn|web|en|fill|text|reply|s5": 12 } }.
//   COUNTERS=memory keeps them in memory (used by the automatic checks). COUNTERS=off turns counting off.
//   On your own computer counting is off unless COUNTERS is set.
const COUNT_WAIT_MS = 500;

const ALLOWED = {
  event: ['turn', 'document', 'voice_in', 'listen', 'hear_form'],
  tool: ['protection-order'],
  channel: ['web', 'whatsapp'],
  lang: ['auto', 'en', 'zu', 'af'],
  mode: ['fill', 'ask'],
  input: ['text', 'voice'],
  result: ['reply', 'support', 'safety', 'error'],
  format: ['pdf', 'docx'],
  section: ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'],
};
// The order of labels in each count's name.
const SHAPE = {
  turn: ['tool', 'channel', 'lang', 'mode', 'input', 'result', 'section'],
  document: ['tool', 'format'],
  voice_in: ['lang'],
  listen: ['lang'],
  hear_form: ['lang'],
};

function key(event, labels) {
  if (!SHAPE[event]) return null;
  return [event, ...SHAPE[event].map(k => (ALLOWED[k].includes(String(labels[k])) ? String(labels[k]) : 'other'))].join('|');
}

const memory = new Map();
let db = null;
function mode() {
  const m = process.env.COUNTERS;
  if (m === 'off' || m === 'memory' || m === 'firestore') return m;
  return process.env.K_SERVICE && process.env.GCLOUD_PROJECT ? 'firestore' : 'off';
}
// firebase-admin 14 only has the modular form (firebase-admin/app, firebase-admin/firestore).
function firestore() {
  if (db) return db;
  const { getApps, initializeApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  if (!getApps().length) initializeApp();
  db = getFirestore();
  return db;
}

async function write(k) {
  const m = mode();
  if (m === 'memory') { memory.set(k, (memory.get(k) || 0) + 1); return; }
  if (m !== 'firestore') return;
  const { FieldValue } = require('firebase-admin/firestore');
  const day = new Date().toISOString().slice(0, 10);
  await firestore().collection('usage_daily').doc(day).set({ day, counts: { [k]: FieldValue.increment(1) } }, { merge: true });
}

// count('turn', { tool, channel, lang, mode, input, result, section })
// wait: false starts the count and returns at once, for replies that must not be held up.
async function count(event, labels = {}, { wait = true } = {}) {
  try {
    const k = key(event, labels);
    if (!k) return;
    const save = () => write(k).then(() => 'saved', e => { console.error('Counter not saved:', e.message); return 'failed'; }); // the message never includes content
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

module.exports = { count, key, sectionReached, memory, ALLOWED, SHAPE };
