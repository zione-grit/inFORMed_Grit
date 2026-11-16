// WhatsApp conversation state (the website keeps its state in the person's browser).
// A conversation is kept for CHAT_TTL_HOURS (default 24) after the last message, only so the chat can
// continue, and DELETE removes it at once. Nothing is kept after that: no chat logs, no copies of forms.
//
// Where it is kept:
//   On Firebase: Firestore in Johannesburg, collection "wa_chats". The document id is a one-way code of
//   the chat, so no phone number appears in the database. Each document has an "expireAt" time; inFORMed
//   ignores anything past it, and a Firestore TTL policy on "expireAt" deletes it (see README).
//   With UPSTASH_REDIS_REST_URL set and STORE=upstash: Upstash Redis.
//   Otherwise: memory, which is lost whenever the server starts a new copy (your own computer, checks).
const { onFirebase, firestore, docId } = require('./db');

const TTL_MS = Number(process.env.CHAT_TTL_HOURS || 24) * 3600 * 1000;
const UP_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

function backend() {
  const s = process.env.STORE;
  if (s === 'memory' || s === 'firestore' || s === 'upstash') return s;
  if (onFirebase()) return 'firestore';
  return UP_URL ? 'upstash' : 'memory';
}

const mem = new Map();
async function up(args) {
  const r = await fetch(UP_URL, { method: 'POST', headers: { Authorization: `Bearer ${UP_TOKEN}` }, body: JSON.stringify(args) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const chats = () => firestore().collection('wa_chats');
const seen = () => firestore().collection('wa_seen');

async function get(key) {
  const b = backend();
  if (b === 'memory') { const e = mem.get(key); return e && e.until > Date.now() ? e.value : null; }
  if (b === 'upstash') { const v = await up(['GET', key]); return v ? JSON.parse(v) : null; }
  const snap = await chats().doc(docId(key)).get();
  if (!snap.exists) return null;
  const d = snap.data();
  if (!d.expireAt || d.expireAt.toMillis() < Date.now()) return null;
  return JSON.parse(d.state);
}
async function set(key, value) {
  const b = backend();
  if (b === 'memory') { mem.set(key, { value, until: Date.now() + TTL_MS }); return; }
  if (b === 'upstash') { await up(['SET', key, JSON.stringify(value), 'EX', String(Math.round(TTL_MS / 1000))]); return; }
  const { Timestamp } = require('firebase-admin/firestore');
  await chats().doc(docId(key)).set({ state: JSON.stringify(value), expireAt: Timestamp.fromMillis(Date.now() + TTL_MS) });
}
async function del(key) {
  const b = backend();
  if (b === 'memory') { mem.delete(key); return; }
  if (b === 'upstash') { await up(['DEL', key]); return; }
  await chats().doc(docId(key)).delete();
}
// Returns true the first time a message id is seen (WhatsApp can deliver the same message twice).
async function firstTime(id) {
  const b = backend();
  if (b === 'memory') { if (mem.has('seen:' + id)) return false; mem.set('seen:' + id, { value: 1, until: Date.now() + 3600000 }); return true; }
  if (b === 'upstash') return (await up(['SET', 'seen:' + id, '1', 'NX', 'EX', '3600'])) === 'OK';
  const { Timestamp } = require('firebase-admin/firestore');
  try { await seen().doc(docId(id)).create({ expireAt: Timestamp.fromMillis(Date.now() + 3600000) }); return true; }
  catch (e) { if (e.code === 6 || /already exists/i.test(e.message)) return false; throw e; }
}

module.exports = { get, set, del, firstTime, backend };
