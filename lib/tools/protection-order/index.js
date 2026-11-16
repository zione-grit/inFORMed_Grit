// Tool: Protection order (Domestic Violence Act, Form 6 and Form 6A, J480).
//
// Every inFORMed tool exports the same shape, so the shared core (lib/core) can run it:
//   id, name                 tool id and display name
//   fieldIds                 the form fields the AI may fill
//   schema, instructions()   the AI's answer schema and its instructions for one turn
//   shape(result, mode)      tidies the tool's own answer fields after the shared safety steps
//   englishRules, listenLabel  wording for the "always English" step and for "Hear my form"
//   documents                the files the tool makes (pdf, docx, text) and their file names
//   openings, chat           wording for the WhatsApp channel
//   choices, applyChoices()  tick lists offered in the chat, and how a choice fills the form
//   records, knowledgeDocs   legal source records (sources/), and the approved ones the AI reads
//   workflow                 the structured workflow (workflow.json), reviewed by the legal advisor
const { CHOICES, ABUSE_TYPES, DOCS } = require('../../../public/fields.js');
const { SCHEMA, FIELD_IDS, instructions } = require('./rules');
const { toOfficialPdf, toDocx, toText } = require('./render');
const { docs: knowledgeDocs, records } = require('./knowledge');
const workflow = require('./workflow.json');
const { FILL_OPENING, ASK_OPENING } = require('./openings');

const englishRules = `You prepare text for a South African court form (protection order application, Form 6 and 6A).
You receive a JSON list of form fields. Return the same list with every value in clear, plain English.
- If a value is already in English, return it unchanged.
- Translate isiZulu, Afrikaans or any other language into English faithfully. Do not add, remove, soften or strengthen any fact.
- Keep names of people and places, addresses, dates, times, numbers, ID numbers and phone numbers exactly as they are.
- Keep the first-person voice ("I", "me") and keep calling the other person "the respondent".
- For words someone said (threats, insults), give the English translation in quotation marks followed by the original words in brackets, for example: "I will kill you" (original words: "Ngizokubulala").
- Keep the same field ids and the same order. Never leave a field out.`;

// The tick lists and the things to bring only apply while filling in the form.
function shape(r, mode) {
  return {
    ...r,
    offer: mode === 'ask' ? 'none' : (r.offer || 'none'),
    offer_first: r.offer_first || [],
    bring: mode === 'ask' ? [] : (r.bring || []),
  };
}

// A choice from a tick list ticks the matching box on the form.
function applyChoices(s, group, picked) {
  const empty = id => !String(s.form[id] || '').trim() || /^requested$/i.test(String(s.form[id]).trim());
  if (group === 'protections') picked.forEach(o => {
    if (!o.field) return;
    if (o.id === 'stop') { if (empty('t_a')) { const acts = (s.abuse || []).map(a => (ABUSE_TYPES.find(x => x.id === a) || {}).label).filter(Boolean); s.form.t_a = acts.length ? acts.join('; ') : 'Requested'; } }
    else if (o.id === 'secret') s.form.o_h = 'Yes';
    else if (empty(o.field)) s.form[o.field] = 'Requested';
  });
  else {
    const kinds = picked.filter(o => o.field === 'o_e').map(o => o.label);
    if (kinds.length && empty('o_e')) s.form.o_e = kinds.join('; ');
    picked.forEach(o => { if (o.field && o.field !== 'o_e' && empty(o.field)) s.form[o.field] = 'Requested'; });
  }
}

module.exports = {
  id: 'protection-order',
  name: 'Protection order',
  fieldIds: FIELD_IDS,
  schema: SCHEMA,
  instructions,
  shape,
  englishRules,
  listenLabel: 'draft South African protection order application',
  sources: DOCS,
  records,        // every legal source record, with its review status (sources/)
  knowledgeDocs,  // the approved sources the AI reads
  workflow,       // the structured workflow, for review and checks (workflow.json)
  choices: CHOICES,
  choiceTopFirst: { protections: ['stop', 'others'] },
  applyChoices,
  documents: {
    pdf: (form, abuse, opts) => toOfficialPdf(form, abuse, opts),
    docx: (form, abuse, opts) => toDocx(form, abuse, opts),
    text: (form, abuse) => toText(form, abuse),
    fileName: (format, demo) => format === 'docx' ? 'protection-order-draft.docx' : (demo ? 'protection-order-draft.pdf' : 'protection-order-Form6-J480E.pdf'),
  },
  openings: { fill: FILL_OPENING, ask: ASK_OPENING },
  chat: {
    welcome: 'Welcome to inFORMed, your protection order support assistant, powered by GRIT (Gender Rights in Tech). Which language would you like to use?',
    about: 'to ask about protection orders and legal words',
    fillStart: 'Tell me what is happening. You can type, or send a voice note.',
    empty: k => `Your application is still empty. Send ${k.fill} and tell me what happened, and I will fill it in as we talk.`,
    ready: 'Here is your draft. Take it to the clerk at any Magistrates’ Court. Applying is free, and you do not need a lawyer or a police case.',
    deleted: 'Done. This conversation and your draft application have been deleted from inFORMed. You can start again any time.',
    notSure: 'Not sure? Just tell me what is happening and I will help you choose.',
  },
};
