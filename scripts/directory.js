// The service directory, kept as a spreadsheet (CSV) and loaded into Firestore, shared with Zuzi.
//
//   npm run directory check directory/services.csv     checks every row, and lists what is due to be re-checked
//   npm run directory upload directory/services.csv    checks, then loads the rows into Firestore ("services")
//
// Start from directory/template.csv (the column names). See directory/README.md for what each column means.
// "upload" needs access to the informed-grit project: run it in Google Cloud Shell (see the README).
const fs = require('fs');
const { parseCsv } = require('./translations');
const { check, readiness, FIELDS } = require('../lib/core/directory');

function rows(file) {
  const all = parseCsv(fs.readFileSync(file, 'utf8'));
  const head = all.shift().map(h => h.trim());
  return all.map((r, i) => ({ line: i + 2, rec: Object.fromEntries(head.map((h, j) => [h, String(r[j] ?? '').trim()]).filter(([h, v]) => h && (v !== '' || FIELDS.includes(h)))) }));
}

function report(file) {
  const list = rows(file), ids = new Map();
  let bad = 0, ready = 0; const due = [];
  for (const { line, rec } of list) {
    const p = check(rec);
    if (ids.has(rec.service_id)) p.push(`service_id ${rec.service_id} is also used on line ${ids.get(rec.service_id)}`);
    ids.set(rec.service_id, line);
    if (p.length) { bad++; console.log(`Line ${line} (${rec.name || rec.service_id || 'no name'}): ${p.join('; ')}`); continue; }
    const s = readiness(rec);
    if (s.ready) ready++;
    else if (rec.active === 'yes') due.push(`${rec.name} (${s.due ? 'check is due' : rec.contact_status})`);
  }
  console.log(`\n${list.length} services: ${ready} ready to show, ${bad} with problems, ${due.length} not ready.`);
  if (due.length) console.log('Not ready (not verified, or last checked more than 6 months ago):\n- ' + due.join('\n- '));
  return { list, bad };
}

async function upload(file) {
  const { list, bad } = report(file);
  if (bad) { console.error('\nNothing uploaded: fix the problems above first.'); process.exit(1); }
  const { getApps, initializeApp } = require('firebase-admin/app');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'informed-grit' });
  const db = getFirestore();
  for (let i = 0; i < list.length; i += 400) {
    const batch = db.batch();
    for (const { rec } of list.slice(i, i + 400)) {
      const s = readiness(rec);
      batch.set(db.collection('services').doc(rec.service_id), { ...rec, referral_tier: Number(rec.referral_tier), next_check: s.next_check, ready: s.ready, updated_at: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
  console.log(`Uploaded ${list.length} services to Firestore (collection "services").`);
}

if (require.main === module) {
  const [cmd, file] = process.argv.slice(2);
  if (!file || !['check', 'upload'].includes(cmd)) { console.error('Use: npm run directory check <file.csv>   or   npm run directory upload <file.csv>'); process.exit(1); }
  if (cmd === 'check') process.exit(report(file).bad ? 1 : 0);
  upload(file).catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { rows, report };
