// Reads a reply aloud (only when the person taps "Listen" or turns on "Read aloud").
// POST /api/speak { text, lang } with the access code in x-demo-code; returns MP3. The page asks for one
// sentence or so at a time, so playback starts quickly. The text is only ever in the request body, never
// in the web address, so it is not kept in server logs.
const { speakStream } = require('../lib/core/voice');
const { overLimit, ip, codeOk } = require('../lib/core/guard');
const counters = require('../lib/core/counters');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('POST only.');
  const { text, lang } = req.body || {};
  const code = req.headers['x-demo-code'];
  if (!codeOk(code)) return res.status(401).send('Wrong or missing access code.');
  if (!text) return res.status(400).send('No text.');
  // Listening has its own, generous limit and does not count towards the message limits.
  if (await overLimit('speak:' + ip(req), { perHour: 600, global: false })) return res.status(429).send('Limit reached.');
  try {
    const upstream = await speakStream(text, lang);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 200;
    await counters.count('listen', { lang });
    await counters.count('listen_chars', { lang }, { n: String(text).length });
    if (upstream.mp3) { res.setHeader('Content-Length', upstream.mp3.length); return res.end(upstream.mp3); }
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    return res.end();
  } catch (e) {
    console.error('Speak error:', e.message);
    if (!res.headersSent) return res.status(500).send('Could not read this aloud.');
    return res.end();
  }
};
