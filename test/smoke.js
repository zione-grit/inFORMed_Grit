// Quick automatic check of inFORMed, with a pretend OpenAI so it costs nothing and needs no key.
// Run: npm test   (it starts its own server on free ports and stops it again)
// It checks the shared core and the protection order tool still work together. It does not judge
// the quality of real AI answers: use the golden and red-team tests for that.
const http = require('http');
const assert = require('assert');

let seen = [];
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.includes('/audio/transcriptions')) return res.end(JSON.stringify({ text: 'He pushed me last night' }));
    const j = JSON.parse(b || '{}'); seen.push(j);
    const name = j.text && j.text.format && j.text.format.name;
    let out;
    if (name === 'english_form_text') out = { updates: JSON.parse(j.input[0].content).map(u => ({ field: u.field, value: 'EN: ' + u.value })) };
    else if (name === 'listen_translation') out = { text: 'Igama lami nguThandi' };
    else {
      const last = [...j.input].reverse().find(m => m.role === 'user').content;
      out = { reply: 'Thank you for telling me.', updates: [{ field: 'history', value: last }], abuse_types: ['physical'], sources: [], grounding: 'none',
        safety: /coming now/.test(last) ? 'immediate_danger' : 'none', ready: false, language: /ngi/i.test(last) ? 'zu' : 'en',
        distress: /scared/.test(last), offer: /protect/.test(last) ? 'protections' : 'none', offer_first: [], bring: ['Your clinic card'] };
    }
    res.end(JSON.stringify({ output_text: JSON.stringify(out) }));
  });
});

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(['ok  ', name]); } catch (e) { results.push(['FAIL', name + ': ' + e.message]); }
}

(async () => {
  await new Promise(r => mock.listen(0, r));
  process.env.OPENAI_BASE_URL = 'http://localhost:' + mock.address().port;
  process.env.OPENAI_API_KEY = 'test';
  process.env.MODEL = process.env.MODEL || 'gpt-6.1-terra';
  delete process.env.DEMO_PASSCODE;
  process.env.COUNTERS = 'memory'; // counts kept in memory so the checks can read them
  const server = require('../server');
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const chat = async (content, extra = {}) => (await post('/api/chat', { tool: 'protection-order', messages: [{ role: 'user', content }], form: {}, lang: 'auto', mode: 'fill', ...extra })).json();

  await check('website pages load (/ and /form)', async () => {
    for (const p of ['/', '/form']) { const r = await fetch(base + p); assert.equal(r.status, 200); assert.match(await r.text(), /inFORMed/); }
  });
  await check('security headers are sent', async () => {
    const r = await fetch(base + '/form'); assert.equal(r.headers.get('x-frame-options'), 'DENY'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  });
  await check('files outside the website cannot be read', async () => {
    for (const p of ['/../server.js', '/%2e%2e/package.json', '/%2e%2e%2fserver.js']) assert.equal((await fetch(base + p)).status, 404);
  });
  await check('danger phrase gets the fixed emergency reply without calling the AI', async () => {
    seen = []; const r = await chat('I am in danger');
    assert.equal(r.fixed, true); assert.equal(r.crisis, true); assert.match(r.reply, /10111/); assert.equal(seen.length, 0);
  });
  await check('AI safety flag replaces the AI reply with the fixed message', async () => {
    const r = await chat('he is coming now with a knife'); assert.equal(r.fixed, true); assert.match(r.reply, /10111/);
  });
  await check('distress adds the support line once', async () => {
    const r = await chat('I am so scared of him'); assert.equal(r.support, true); assert.match(r.reply, /0800 428 428/);
  });
  await check('form updates come back in English when the chat is not', async () => {
    const r = await chat('Ngishaywe izolo', { lang: 'zu' }); assert.match(r.updates[0].value, /^EN: /);
  });
  await check('newer models get a reasoning effort and no temperature', async () => {
    seen = []; await chat('He hit me'); const q = seen[0];
    assert.ok(q.reasoning || /^gpt-4/.test(q.model)); assert.ok(!('temperature' in q) || /^gpt-4/.test(q.model)); assert.equal(q.store, false);
  });
  await check('ask mode never fills the form', async () => {
    const r = await chat('What is a protection order?', { mode: 'ask' }); assert.equal(r.updates.length, 0); assert.equal(r.offer, 'none');
  });
  await check('protections tick list is offered in fill mode', async () => {
    const r = await chat('please protect me'); assert.equal(r.offer, 'protections');
  });
  await check('official PDF (12 pages) and Word file are made', async () => {
    const form = { c_name: 'Thandi Test', r_name: 'Sipho Test', history: 'On 2 October 2026 the respondent hit me.', t_a: 'Physical abuse' };
    const pdf = await post('/api/document', { tool: 'protection-order', form, abuse: ['physical'], format: 'pdf' });
    assert.equal(pdf.status, 200); const buf = Buffer.from(await pdf.arrayBuffer()); assert.equal(buf.subarray(0, 4).toString(), '%PDF');
    const { PDFDocument } = require('pdf-lib'); assert.equal((await PDFDocument.load(buf)).getPageCount(), 12);
    const doc = await post('/api/document', { tool: 'protection-order', form, abuse: ['physical'], format: 'docx' });
    assert.equal(doc.status, 200); assert.equal(Buffer.from(await doc.arrayBuffer()).subarray(0, 2).toString(), 'PK');
  });
  await check('voice to text uses gpt-transcribe', async () => {
    const r = await (await post('/api/transcribe', { audio: Buffer.from('abc').toString('base64'), mime: 'audio/webm', lang: 'zu' })).json();
    assert.equal(r.text, 'He pushed me last night');
  });
  await check('"Hear my form" translation works', async () => {
    const r = await (await post('/api/translate', { tool: 'protection-order', text: 'My name is Thandi', lang: 'zu' })).json(); assert.match(r.text, /Thandi/);
  });
  await check('reading aloud refuses audio that does not match the text', async () => {
    const { readFaithfully } = require('../lib/core/voice');
    assert.equal(readFaithfully('Call 10111 now.', 'Call 10111 now'), true);
    assert.equal(readFaithfully('Call 10111 now.', 'Sure, here is a joke instead'), false);
  });
  await check('WhatsApp: language, fill, tick list by numbers, document, delete', async () => {
    const { handle } = require('../lib/core/bot');
    let n = 0; const say = t => handle({ channel: 'test', userKey: 'u1', text: t, msgId: 'm' + (++n) });
    await say('hi'); await say('English'); await say('Fill in my form'); await say('He hit me');
    const list = (await say('please protect me')).map(o => o.text).join(' '); assert.match(list, /1\. /);
    await say('1, 3'); const doc = await say('PDF'); assert.ok(doc.some(o => o.doc === 'pdf'));
    const del = await say('DELETE'); assert.match(del[0].text, /deleted/);
  });
  await check('an unknown tool falls back to the protection order tool', async () => {
    const r = await (await post('/api/chat', { tool: 'nope', messages: [{ role: 'user', content: 'He hit me' }], mode: 'fill' })).json(); assert.equal(r.fixed, false);
  });
  await check('Firebase set-up: Johannesburg function, website calls it directly, no always-on copy', async () => {
    const fs = require('fs'), path = require('path'), up = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const cfg = JSON.parse(up('firebase.json'));
    assert.ok(cfg.hosting.rewrites.some(r => r.source === '/form' && r.destination === '/index.html'));
    assert.ok(!cfg.hosting.rewrites.some(r => r.function || r.run), 'Hosting cannot pass requests to Johannesburg');
    const { api, SITES } = require('../index.js'), opt = api.__endpoint;
    assert.deepEqual(opt.region, ['africa-south1']); assert.equal(opt.minInstances, 0); assert.equal(opt.maxInstances, 5);
    assert.ok(SITES.includes('https://informed-grit.web.app'));
    const cfgJs = up('public/config.js');
    const apiFor = host => { const w = { location: { hostname: host } }; new Function('window', 'location', cfgJs)(w, w.location); return w.INFORMED_API; };
    assert.equal(apiFor('informed-grit.web.app'), 'https://africa-south1-informed-grit.cloudfunctions.net/api');
    assert.equal(apiFor('informed-grit-1a2b.firebaseapp.com'), 'https://africa-south1-informed-grit-1a2b.cloudfunctions.net/api');
    const page = up('public/index.html');
    assert.ok(!/fetch\('\/api\//.test(page) && !page.includes("return '/api/"), 'every request must go through API_BASE');
    assert.match(await (await fetch(base + '/config.js')).text(), /INFORMED_API/);
  });
  await check('the Firebase function runs the same endpoints and refuses unknown ones', async () => {
    const { handle } = require('../index.js');
    const call = (path, body) => new Promise(resolve => {
      const res = { headers: {}, code: 200, headersSent: false,
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, getHeader(k) { return this.headers[k.toLowerCase()]; },
        status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o, headers: this.headers }); return this; },
        send(b) { resolve({ code: this.code, body: b, headers: this.headers }); return this; }, end(b) { resolve({ code: this.code, body: b, headers: this.headers }); return this; } };
      handle({ method: 'POST', path, headers: {}, query: {}, body }, res);
    });
    const ok = await call('/api/chat', { tool: 'protection-order', messages: [{ role: 'user', content: 'I am in danger' }], mode: 'fill' });
    assert.equal(ok.code, 200); assert.equal(ok.body.fixed, true); assert.equal(ok.headers['x-frame-options'], 'DENY');
    assert.equal((await call('/api/nope', {})).code, 404); assert.equal((await call('/server.js', {})).code, 404);
  });

  await check('legal sources: every record is complete, and only approved ones reach the AI', async () => {
    const { loadRecords, checkRecord, approved } = require('../lib/core/knowledge');
    const path = require('path');
    const recs = loadRecords(path.join(__dirname, '../lib/tools/protection-order/sources'));
    assert.ok(recs.length >= 6);
    const t = require('../lib/tools').get('protection-order');
    assert.deepEqual(t.knowledgeDocs.map(d => d.id).sort(), approved(recs).map(r => r.document_id).sort());
    const draft = { ...recs[0], document_id: 'x', approval_status: 'draft' };
    assert.equal(approved([draft]).length, 0, 'a draft is never used');
    assert.ok(checkRecord({ ...recs[0], approval_status: 'superseded', superseded_by: '' }).length, 'a superseded record must say what replaced it');
    assert.ok(checkRecord({ ...recs[0], review_date: '16/11/2026' }).length, 'dates are YYYY-MM-DD');
    const instr = require('../lib/tools/protection-order/rules').instructions({ lang: 'auto', channel: 'web', form: {}, abuse: [], mode: 'fill' });
    for (const r of approved(recs)) assert.ok(instr.includes(`### DOCUMENT [${r.document_id}]`));
  });
  await check('workflow: every form field is in exactly one step, and every step links to approved sources', async () => {
    const t = require('../lib/tools').get('protection-order'), wf = t.workflow;
    const { FIELDS } = require('../public/fields.js');
    const placed = wf.steps.flatMap(s => s.fields.map(f => f.id));
    assert.equal(placed.length, new Set(placed).size, 'a field is in two steps');
    assert.deepEqual([...placed].sort(), FIELDS.map(f => f.id).sort());
    const ok = new Set(t.knowledgeDocs.map(d => d.id)), ids = new Set(wf.steps.map(s => s.step_id));
    for (const s of wf.steps) {
      for (const id of s.legal_sources) assert.ok(ok.has(id), `${s.step_id} uses ${id}, which is not an approved source`);
      assert.ok(s.next_step === null || ids.has(s.next_step), `${s.step_id} goes to an unknown step`);
      for (const f of s.fields) assert.ok(Object.keys(wf.field_needs).includes(f.need), `${f.id} has an unknown level`);
      assert.ok(s.questions.en);
      const official = [...new Set(FIELDS.filter(f => f.s === s.form_section).map(f => `Form ${f.doc}, paragraph ${f.ds}`))];
      assert.deepEqual(s.form_paragraphs, official, `${s.step_id} names the wrong paragraphs of the official form`);
    }
  });
  await check('review page and website sources list are up to date (run npm run review if not)', async () => {
    const fs = require('fs'), path = require('path'), { page, docsJson } = require('../scripts/review');
    // Windows may keep these files with its own line endings; only the words are compared.
    const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(read('../review/protection-order.md'), page('protection-order'));
    assert.equal(read('../public/docs.json'), docsJson('protection-order'));
  });
  await check('usage counters hold labels only, never what people wrote', async () => {
    const counters = require('../lib/core/counters');
    counters.memory.clear();
    await post('/api/chat', { tool: 'protection-order', messages: [{ role: 'user', content: 'My name is Thandi Zulu and he hit me at 12 Main Road' }], form: {}, lang: 'zu', mode: 'fill' });
    await post('/api/document', { tool: 'protection-order', form: { c_names: 'Thandi' }, abuse: [], format: 'pdf' });
    const keys = [...counters.memory.keys()];
    assert.ok(keys.includes('turn|protection-order|web|zu|fill|text|reply|s5'), keys.join(', '));
    assert.ok(keys.includes('document|protection-order|pdf'));
    for (const k of keys) assert.ok(!/thandi|zulu|main|road|hit/i.test(k), 'content leaked into a counter: ' + k);
    assert.equal(counters.key('turn', { channel: 'Thandi', lang: '<script>' }).includes('Thandi'), false, 'unknown labels become "other"');
  });
  await check('a counter that cannot be saved never delays or breaks a reply', async () => {
    process.env.COUNTERS = 'firestore'; // no Firebase here, so saving fails
    await require('../lib/core/counters').count('listen', { lang: 'en' }); // the first count loads Firebase's code; that happens once per running copy
    const t0 = Date.now();
    const r = await (await post('/api/chat', { tool: 'protection-order', messages: [{ role: 'user', content: 'I am in danger' }], mode: 'fill' })).json();
    assert.equal(r.fixed, true); assert.ok(Date.now() - t0 < 400, 'an emergency reply waited for its count: ' + (Date.now() - t0) + ' ms');
    const t1 = Date.now();
    const n = await (await post('/api/chat', { tool: 'protection-order', messages: [{ role: 'user', content: 'He hit me' }], mode: 'fill' })).json();
    process.env.COUNTERS = 'memory';
    assert.equal(n.fixed, false); assert.ok(n.reply); assert.ok(Date.now() - t1 < 3000, 'took ' + (Date.now() - t1) + ' ms');
  });

  server.close(); mock.close();
  for (const [s, n] of results) console.log(s, n);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} check(s) failed.` : `\nAll ${results.length} checks passed.`);
  process.exit(failed ? 1 : 0);
})();
