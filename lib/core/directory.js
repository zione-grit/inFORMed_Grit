// The service directory: courts, police stations, Thuthuzela Care Centres, shelters, helplines and support
// services, shared with Zuzi. One record per service. inFORMed does not use it in conversations yet; this
// file defines what a record holds and checks it, so the directory is built once, the same way for both.
//
// Field names follow Zuzi's knowledge base: referral_tier (1 survivor-led support, offered first;
// 2 legal and statutory routes; 3 emergency services) and contact_status (verified, partially_verified,
// not_verified). Only records that are active, verified and checked in the last CHECK_MONTHS months are
// ready to be shown to anyone.
const { LANGS } = require('../../public/fields.js');
const { PROVINCES } = require('./counters');

const CHECK_MONTHS = 6;
const FIELDS = [
  'service_id', 'name', 'type', 'referral_tier', 'province', 'town', 'address', 'phone', 'phone_alt', 'whatsapp', 'email',
  'website', 'hours', 'after_hours', 'languages', 'services', 'cost', 'who_can_use', 'source', 'contact_status',
  'last_checked', 'checked_by', 'active', 'internal_note',
];
const REQUIRED = ['service_id', 'name', 'type', 'referral_tier', 'province', 'contact_status', 'last_checked', 'checked_by', 'source', 'active'];
const TYPES = ['magistrates_court', 'police_station', 'thuthuzela_care_centre', 'shelter', 'counselling', 'legal_aid', 'helpline',
  'health', 'social_development', 'child_protection', 'advocacy', 'other'];
const CONTACT = ['verified', 'partially_verified', 'not_verified'];
const YES_NO = ['yes', 'no', 'unknown'];
const COST = ['free', 'fee', 'unknown'];
const CODES = LANGS.map(l => l.id).filter(id => id !== 'auto');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^(\+27|0)[0-9 ]{8,13}$|^1\d{4}$|^\*\d[\d*#]+$/; // 0XX XXX XXXX, +27..., short codes like 10111, USSD like *134*7355#

function addMonths(day, n) { const d = new Date(day + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); }

// Returns a list of problems with one record (empty when it is fine).
function check(r) {
  const p = [];
  for (const f of REQUIRED) if (!String(r[f] ?? '').trim()) p.push(`${f} is empty`);
  for (const f of Object.keys(r)) if (!FIELDS.includes(f)) p.push(`unknown column ${f}`);
  if (r.service_id && !/^[a-z0-9][a-z0-9-]{2,80}$/.test(r.service_id)) p.push('service_id: lower-case letters, numbers and dashes only, for example gp-protea-magistrates-court');
  if (r.type && !TYPES.includes(r.type)) p.push(`type must be one of ${TYPES.join(', ')}`);
  if (r.referral_tier && !['1', '2', '3'].includes(String(r.referral_tier))) p.push('referral_tier must be 1, 2 or 3');
  if (r.province && !PROVINCES.filter(x => x !== 'unknown').concat('national').includes(r.province)) p.push('province must be EC, FS, GP, KZN, LP, MP, NC, NW, WC or national');
  if (r.contact_status && !CONTACT.includes(r.contact_status)) p.push(`contact_status must be one of ${CONTACT.join(', ')}`);
  if (r.last_checked && !DATE.test(r.last_checked)) p.push('last_checked must be written as YYYY-MM-DD');
  if (r.active && !['yes', 'no'].includes(r.active)) p.push('active must be yes or no');
  if (r.after_hours && !YES_NO.includes(r.after_hours)) p.push('after_hours must be yes, no or unknown');
  if (r.cost && !COST.includes(r.cost)) p.push('cost must be free, fee or unknown');
  for (const f of ['phone', 'phone_alt', 'whatsapp']) if (r[f] && !PHONE.test(String(r[f]).trim())) p.push(`${f} does not look like a South African number`);
  if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) p.push('email does not look right');
  if (r.website && !/^https:\/\//.test(r.website)) p.push('website must start with https://');
  if (r.languages) for (const l of String(r.languages).split(/[;,]\s*/).filter(Boolean)) if (!CODES.includes(l)) p.push(`unknown language code ${l} (use ${CODES.join(', ')})`);
  if (r.contact_status === 'verified' && !(r.phone || r.address)) p.push('a verified record needs at least a phone number or an address');
  return p;
}

// Whether a record can be shown to people, and when it must next be checked.
function readiness(r, today = new Date().toISOString().slice(0, 10)) {
  const next = DATE.test(r.last_checked || '') ? addMonths(r.last_checked, CHECK_MONTHS) : '';
  const due = !next || next <= today;
  const ready = r.active === 'yes' && r.contact_status === 'verified' && !due && check(r).length === 0;
  return { ready, next_check: next, due };
}

module.exports = { FIELDS, REQUIRED, TYPES, CONTACT, CHECK_MONTHS, check, readiness, addMonths };
