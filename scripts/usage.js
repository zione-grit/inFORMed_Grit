// Exports the usage counters to a spreadsheet (CSV), for the dashboard. Counts only, never content.
//
//   npm run usage                         every day so far, written to usage.csv
//   npm run usage 2026-12-01 2026-12-31   only those days
//
// One row per count: day, event, the event's labels in their own columns (tool, channel, lang, province...),
// and the number. It reads Firestore in the informed-grit project, so run it in Google Cloud Shell
// (see the README, "Usage counters"). usage.csv is not committed to GitHub.
const fs = require('fs');
const { SHAPE } = require('../lib/core/counters');

const COLUMNS = ['day', 'event', ...[...new Set(Object.values(SHAPE).flat())], 'count'];

// Turns one day's document ({ day, counts: { "turn|protection-order|web|...": 3 } }) into rows.
function toRows(doc) {
  const out = [];
  for (const [k, n] of Object.entries(doc.counts || {})) {
    const [event, ...vals] = k.split('|');
    const row = { day: doc.day, event, count: n };
    (SHAPE[event] || []).forEach((name, i) => { row[name] = vals[i]; });
    out.push(row);
  }
  return out;
}
const csv = rows => [COLUMNS.join(','), ...rows.map(r => COLUMNS.map(c => r[c] ?? '').join(','))].join('\r\n') + '\r\n';

async function main([from = '0000-00-00', to = '9999-99-99']) {
  const { getApps, initializeApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'informed-grit' });
  const snap = await getFirestore().collection('usage_daily').where('day', '>=', from).where('day', '<=', to).get();
  const rows = snap.docs.map(d => d.data()).sort((a, b) => a.day < b.day ? -1 : 1).flatMap(toRows);
  fs.writeFileSync('usage.csv', csv(rows));
  console.log(`Wrote usage.csv: ${rows.length} rows from ${snap.size} days.`);
}

module.exports = { toRows, csv, COLUMNS };
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
