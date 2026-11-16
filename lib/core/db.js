// Firestore, shared by message limits, WhatsApp conversations and usage counters.
// On Firebase it is the project's own database in Johannesburg, reached with the function's own
// service account (no key needed). Elsewhere (your own computer, the automatic checks) it is off,
// unless STORE=firestore is set.
// firebase-admin 14 only has the modular form (firebase-admin/app, firebase-admin/firestore).
let db = null;

function onFirebase() { return !!(process.env.K_SERVICE && process.env.GCLOUD_PROJECT); }

function firestore() {
  if (db) return db;
  const { getApps, initializeApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  if (!getApps().length) initializeApp();
  db = getFirestore();
  return db;
}

function FieldValue() { return require('firebase-admin/firestore').FieldValue; }

// Document ids never contain a phone number or address: keys are turned into a one-way code first.
function docId(key) { return require('crypto').createHash('sha256').update(String(key)).digest('hex').slice(0, 40); }

module.exports = { onFirebase, firestore, FieldValue, docId };
