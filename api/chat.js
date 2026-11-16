// Website chat endpoint. The OpenAI key lives only in Vercel's environment variables.
const { turn } = require('../lib/core/engine');
const { overLimit, LIMIT_REPLY, ip, codeOk } = require('../lib/core/guard');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ reply: 'POST only.' });
  if (!codeOk(req.headers['x-demo-code'])) return res.status(401).json({ reply: 'Wrong or missing access code.' });
  const over = await overLimit('web:' + ip(req));
  if (over) return res.status(200).json({ reply: LIMIT_REPLY[over], updates: [], sources: [], limited: true });
  const { tool, messages, form, abuse, lang, mode, voice } = req.body || {};
  const out = await turn({ tool, messages, form, abuse, lang, mode, channel: 'web', voice: voice === true });
  return res.status(200).json(out);
};
