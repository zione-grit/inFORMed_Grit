// Writes the review pages and keeps the website's sources list in step with the approved legal sources.
// Run after changing anything in lib/tools/<module>/sources/ or workflow.json:   npm run review
// It writes:
//   review/<module>.md   a readable page for the legal advisor: every legal source with its status,
//                        and the whole workflow, step by step (GitHub shows it as a normal page)
//   public/docs.json     the approved sources the website shows under "Sources"
const fs = require('fs');
const path = require('path');
const { needsReview } = require('../lib/core/knowledge');

const ROOT = path.join(__dirname, '..');
const NEED = { required: 'Required', if_known: 'If known', if_relevant: 'If it applies', optional: 'Optional' };
const cell = s => String(s == null || s === '' ? '–' : s).replace(/\|/g, '/').replace(/\n+/g, ' ');

function page(tool) {
  const t = require(path.join(ROOT, 'lib/tools', tool));
  const recs = t.records, wf = t.workflow, waiting = new Set(needsReview(recs).map(r => r.document_id));
  const L = [];
  L.push(`# ${t.name}: legal sources and workflow`, '');
  L.push('This page is generated from the files in the repository (`npm run review`). Change the files, not this page.', '');
  L.push('## Legal sources', '');
  L.push('Only sources with the status "approved" are used by inFORMed. "Needs legal review" means the legal advisor has not yet reviewed the source, or its review date has passed.', '');
  L.push('| Source | Type | Legal reference | Version | Effective | Status | Reviewed by | Review date | Next review |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of recs) L.push(`| **${cell(r.title)}** (\`${r.document_id}\`) | ${cell(r.document_type.replace(/_/g, ' '))} | ${cell(r.legal_reference)} | ${cell(r.version)} | ${cell(r.effective_date)} | ${cell(r.approval_status.replace(/_/g, ' '))}${waiting.has(r.document_id) ? ', needs legal review' : ''} | ${cell(r.reviewed_by)} | ${cell(r.review_date)} | ${cell(r.next_review)} |`);
  L.push('', `## Workflow: ${wf.workflow_id}, version ${wf.version}`, '');
  L.push(`Form: ${wf.form}. Status: ${wf.approval_status.replace(/_/g, ' ')}${wf.reviewed_by ? `, reviewed by ${wf.reviewed_by} on ${wf.review_date}` : ''}.`, '');
  L.push(`**When the applicant cannot answer:** ${wf.if_unknown}`, '');
  if (wf.statement_rules && wf.statement_rules.length) { L.push('**How the applicant\'s statements are written:**', ''); for (const r of wf.statement_rules) L.push(`- ${r}`); L.push(''); }
  L.push('**What the levels mean:**', '');
  for (const [k, v] of Object.entries(wf.field_needs)) L.push(`- **${NEED[k]}:** ${v}`);
  for (const s of wf.steps) {
    L.push('', `### Step ${s.form_section}: ${s.title}${s.key_section ? ' (key section)' : ''}`, '');
    L.push(`**On the official form:** ${s.form_paragraphs.join('; ')}.`, '');
    L.push(`**Applies:** ${s.applies}.`, '');
    L.push(`**Opening question:** "${s.questions.en}"`, '');
    const tr = ['zu', 'af'].filter(l => !s.questions[l]);
    if (tr.length) L.push(`**Translations still needed:** ${tr.map(l => ({ zu: 'isiZulu', af: 'Afrikaans' })[l]).join(', ')}`, '');
    L.push(`**Legal sources:** ${s.legal_sources.map(id => (recs.find(r => r.document_id === id) || {}).title || id).join('; ')}`, '');
    L.push(`**Next step:** ${s.next_step ? (wf.steps.find(x => x.step_id === s.next_step) || {}).title : 'review and generate the form'}`, '');
    L.push('| Form field | Level |', '|---|---|');
    for (const f of s.fields) L.push(`| ${cell(f.label)} | ${NEED[f.need]} |`);
    if (s.validation_rules.length) { L.push('', '**Rules:**', ''); for (const r of s.validation_rules) L.push(`- ${r}`); }
  }
  return L.join('\n') + '\n';
}

function docsJson(tool) {
  const t = require(path.join(ROOT, 'lib/tools', tool));
  return JSON.stringify(t.knowledgeDocs.map(d => ({ id: d.id, title: d.title, ...(d.about ? { about: d.about } : {}), text: d.text })), null, 1) + '\n';
}

const TOOLS = ['protection-order'];
if (require.main === module) {
  for (const t of TOOLS) fs.writeFileSync(path.join(ROOT, 'review', t + '.md'), page(t));
  fs.writeFileSync(path.join(ROOT, 'public/docs.json'), docsJson('protection-order'));
  console.log('Wrote review/ and public/docs.json');
}
module.exports = { page, docsJson, TOOLS };
