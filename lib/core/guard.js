// Optional access code, and message limits shared across every running copy of the function.
// On Firebase the counts live in Firestore (collection "limits", one document per person per hour and one
// per day, deleted by the TTL policy on "expireAt"). The document id is a one-way code, so no internet
// address is stored. With STORE=upstash they use Upstash Redis. Otherwise (your own computer, the checks)
// they are counted in memory, which is only a rough brake.
const { firestore, FieldValue, docId } = require('./db');
const { backend } = require('./store');
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const PER_HOUR = Number(process.env.LIMIT_PER_HOUR || 150);  // messages per person (internet address or chat) per hour
const PER_DAY = Number(process.env.LIMIT_PER_DAY || 3000);   // messages across everyone per day

const mem = new Map();
function memCount(key, ttlMs) {
  const now = Date.now();
  const e = mem.get(key);
  if (!e || e.until < now) { mem.set(key, { n: 1, until: now + ttlMs }); return 1; }
  e.n += 1; return e.n;
}
async function count(key, ttlSec) {
  const b = backend();
  if (b === 'memory') return memCount(key, ttlSec * 1000);
  if (b === 'firestore') {
    try {
      const { Timestamp } = require('firebase-admin/firestore');
      const ref = firestore().collection('limits').doc(docId(key));
      await ref.set({ n: FieldValue().increment(1), expireAt: Timestamp.fromMillis(Date.now() + ttlSec * 1000) }, { merge: true });
      return Number(((await ref.get()).data() || {}).n || 1);
    } catch (e) {
      console.error('Limit store error:', e.message);
      return memCount(key, ttlSec * 1000);
    }
  }
  try {
    const r = await fetch(URL_ + '/pipeline', {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, String(ttlSec), 'NX']]),
    });
    const j = await r.json();
    return Number(j[0].result);
  } catch (e) {
    console.error('Limit store error:', e.message);
    return memCount(key, ttlSec * 1000);
  }
}

// Returns null when allowed, or a reason: 'person' or 'everyone'.
// opts.perHour overrides the per-person limit; opts.global=false skips the daily total.
async function overLimit(who, opts = {}) {
  const hour = Math.floor(Date.now() / 3600000), day = Math.floor(Date.now() / 86400000);
  const mine = await count(`lim:h:${hour}:${who}`, 3700);
  if (mine > (opts.perHour || PER_HOUR)) return 'person';
  if (opts.global === false) return null;
  const all = await count(`lim:d:${day}`, 90000);
  if (all > PER_DAY) return 'everyone';
  return null;
}

const LIMIT_REPLY = {
  person: "You've sent a lot of messages in a short time, so I need to pause for a little while. Please come back in an hour. If you are in danger, call the police on 10111 or the GBV Command Centre on 0800 428 428 (free, 24 hours).",
  everyone: "inFORMed has reached its limit for today. Please try again tomorrow. If you are in danger, call the police on 10111 or the GBV Command Centre on 0800 428 428 (free, 24 hours).",
};

// The person's internet address, used only as a key for the message limits (never stored: the limit
// store keeps a one-way code of it). On Firebase, Google adds the real address as the LAST entry of
// X-Forwarded-For; earlier entries can be typed in by anyone, so they are not trusted. Elsewhere
// (Vercel, your own computer) the first entry is the real one.
let xffNoted = false;
function ip(req) {
  const list = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!list.length) return (req.socket && req.socket.remoteAddress) || 'unknown';
  if (process.env.K_SERVICE) {
    if (!xffNoted) { xffNoted = true; console.log('Limits: X-Forwarded-For has ' + list.length + ' entr' + (list.length === 1 ? 'y' : 'ies') + '.'); } // a count only, never an address
    return list[list.length - 1];
  }
  return list[0];
}
// The access code is optional: leave DEMO_PASSCODE out to open the link to anyone.
function codeOk(given) { const pass = process.env.DEMO_PASSCODE || ''; return !pass || String(given || '').trim() === pass; }
function codeRequired() { return !!process.env.DEMO_PASSCODE; }

module.exports = { overLimit, LIMIT_REPLY, ip, codeOk, codeRequired };
