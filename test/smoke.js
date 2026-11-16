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

  server.close(); mock.close();
  for (const [s, n] of results) console.log(s, n);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} check(s) failed.` : `\nAll ${results.length} checks passed.`);
  process.exit(failed ? 1 : 0);
})();
