// Translates the form so it can be read aloud in the person's language ("Hear my form").
// Only for listening: the form and the PDF/Word drafts stay in English. Nothing is stored.
const { translateForListening } = require('../lib/core/engine');
const { TR_LANG } = require('../lib/core/language');
const { overLimit, ip, codeOk } = require('../lib/core/guard');
const counters = require('../lib/core/counters');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
  if (!codeOk(req.headers['x-demo-code'])) return res.status(401).json({ error: 'Wrong or missing access code.' });
  const { text, lang, tool } = req.body || {};
  if (!text || !TR_LANG[lang]) return res.status(400).json({ error: 'Nothing to translate.' });
  if (await overLimit('translate:' + ip(req), { perHour: 40, global: false })) return res.status(429).json({ error: 'Limit reached.' });
  try {
    const out = await translateForListening(text, lang, tool);
    await counters.count('hear_form', { lang });
    return res.status(200).json({ text: out });
  } catch (e) {
    console.error('Translate error:', e.message); // never logs the form
    return res.status(500).json({ error: 'Could not translate.' });
  }
};
