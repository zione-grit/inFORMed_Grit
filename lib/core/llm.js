// Calls the AI model. Every tool uses this one function, so the model can be changed in one place.
// The OpenAI key lives only in the server's environment (Google Secret Manager).

// gpt-4.1 is switched off by OpenAI on 14 January 2027. Any model can be set with MODEL.
const MODEL = process.env.MODEL || 'gpt-6.1-terra';
// How much the newer models think before answering. "low" keeps replies quick and cheap; "none" is
// not accepted by every model (for example the Sol and Astra models), so it falls back to "low" there.
const EFFORT = process.env.REASONING_EFFORT || 'low';

function reasoningFor(model, effort = EFFORT) {
  if (/^gpt-4|^gpt-3/.test(model)) return {};
  const noNone = /sol|astra/.test(model);
  return { reasoning: { effort: effort === 'none' && noNone ? 'low' : effort } };
}

// Keeps the last 40 messages, in the shape the model expects.
function cleanMessages(messages) {
  return (messages || []).slice(-40)
    .filter(m => m && m.content)
    .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content).slice(0, 4000) }));
}

// AI usage for the cost counters: token numbers only, never content. Not waited for.
function countTokens(u) {
  if (!u) return;
  const counters = require('./counters');
  const cached = (u.input_tokens_details && u.input_tokens_details.cached_tokens) || 0;
  counters.count('tokens', { model: MODEL, kind: 'input' }, { wait: false, n: (u.input_tokens || 0) - cached });
  counters.count('tokens', { model: MODEL, kind: 'cached' }, { wait: false, n: cached });
  counters.count('tokens', { model: MODEL, kind: 'output' }, { wait: false, n: u.output_tokens || 0 });
}

// Asks the model for one JSON object that matches the schema. Nothing is stored at OpenAI (store: false).
async function callModel(input, instructions, schema, name = 'informed_turn', temperature = 0.4, effort = EFFORT) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 50000);
  try {
    const r = await fetch((process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1') + '/responses', {
      method: 'POST',
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        instructions,
        input,
        store: false,
        // Newer models do not take a temperature setting; they take a reasoning effort instead.
        ...(/^gpt-4/.test(MODEL) ? { temperature } : reasoningFor(MODEL, effort)),
        text: { format: { type: 'json_schema', name, strict: true, schema } },
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || r.statusText);
    countTokens(j.usage);
    const text = j.output_text ?? (j.output || []).flatMap(o => o.content || []).map(c => c.text || '').join('');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { callModel, cleanMessages, MODEL };
