// Legal knowledge records, shared by every legal module.
// Each module keeps its legal sources as one JSON file per record (lib/tools/<module>/sources/).
// Every record carries where it came from, which version it is, who reviewed it and its approval status.
// Only records with approval_status "approved" are given to the AI or shown to people; drafts, records
// under review and superseded records are kept but never used.
const fs = require('fs');
const path = require('path');

const FIELDS = ['document_id', 'legal_tool', 'jurisdiction', 'document_type', 'title', 'source_url', 'legal_reference',
  'effective_date', 'version', 'reviewed_by', 'review_date', 'next_review', 'approval_status', 'superseded_by', 'content'];
const STATUSES = ['draft', 'under_review', 'approved', 'superseded'];
const TYPES = ['act', 'regulation', 'official_form', 'court_guidance', 'procedure', 'approved_guidance', 'service_information'];
const DATE = /^(\d{4}-\d{2}-\d{2})?$/; // a date, or empty until it is known

// Reads and checks every record in a folder. A broken record stops the server from starting, so a
// mistake is found at once instead of the AI quietly working without that source.
function loadRecords(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const records = files.map(f => {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const problems = checkRecord(r, f);
    if (problems.length) throw new Error(`Legal source ${f}: ${problems.join('; ')}`);
    return r;
  });
  const ids = new Set();
  for (const r of records) { if (ids.has(r.document_id)) throw new Error(`Legal source id used twice: ${r.document_id}`); ids.add(r.document_id); }
  return records;
}

function checkRecord(r, file) {
  const p = [];
  for (const f of FIELDS) if (!(f in r)) p.push(`missing ${f}`);
  if (r.document_id && file && file !== r.document_id + '.json') p.push(`file name must be ${r.document_id}.json`);
  if (r.approval_status && !STATUSES.includes(r.approval_status)) p.push(`approval_status must be one of ${STATUSES.join(', ')}`);
  if (r.document_type && !TYPES.includes(r.document_type)) p.push(`document_type must be one of ${TYPES.join(', ')}`);
  for (const d of ['effective_date', 'review_date', 'next_review']) if (r[d] && !DATE.test(r[d])) p.push(`${d} must be written as YYYY-MM-DD`);
  if (r.approval_status === 'superseded' && !r.superseded_by) p.push('a superseded record must name the record that replaced it in superseded_by');
  if (r.approval_status === 'approved' && !String(r.content || '').trim()) p.push('an approved record needs content');
  return p;
}

const approved = records => records.filter(r => r.approval_status === 'approved');

// Records that need attention: not yet reviewed by the legal advisor, or past their review date.
function needsReview(records, today = new Date().toISOString().slice(0, 10)) {
  return records.filter(r => r.approval_status !== 'superseded' && (!r.review_date || (r.next_review && r.next_review <= today)));
}

module.exports = { loadRecords, checkRecord, approved, needsReview, FIELDS, STATUSES, TYPES };
