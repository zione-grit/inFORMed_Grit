// Builds the PDF or Word draft from the form the browser sends. Nothing is stored.
const { ensureEnglish } = require('../lib/core/engine');
const tools = require('../lib/tools');
const counters = require('../lib/core/counters');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('POST only.');
  try {
    let { tool: toolId, form = {}, abuse = [], format = 'pdf', demo = false } = req.body || {};
    const tool = tools.get(toolId);
    // The person may have typed into the form panel in another language: make sure the court draft is English.
    if (process.env.OPENAI_API_KEY) {
      const items = Object.entries(form).filter(([k, v]) => !k.startsWith('_') && String(v || '').trim()).map(([field, value]) => ({ field, value: String(value) }));
      const fixed = await ensureEnglish(tool.id, items, null, null);
      if (fixed !== items) { form = { ...form }; for (const u of fixed) form[u.field] = u.value; }
    }
    const isWord = format === 'docx';
    const buf = isWord ? await tool.documents.docx(form, abuse, { demo }) : await tool.documents.pdf(form, abuse, { demo });
    res.setHeader('Content-Type', isWord ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${tool.documents.fileName(format, demo)}"`);
    res.setHeader('Cache-Control', 'no-store');
    await counters.count('document', { tool: tool.id, format: isWord ? 'docx' : 'pdf' });
    return res.status(200).send(buf);
  } catch (e) {
    console.error('Document error:', e.message);
    return res.status(500).send('Could not build the document.');
  }
};
