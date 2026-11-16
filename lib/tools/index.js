// The list of inFORMed tools. To add a tool, make a folder next to protection-order with an index.js
// that exports the same shape (see lib/tools/protection-order/index.js), and add it here.
const TOOLS = {
  'protection-order': require('./protection-order'),
};
const DEFAULT = 'protection-order';

// Unknown or missing ids fall back to the default tool, so older pages and chats keep working.
function get(id) { return TOOLS[id] || TOOLS[DEFAULT]; }
function list() { return Object.values(TOOLS).map(t => ({ id: t.id, name: t.name })); }

module.exports = { get, list, DEFAULT };
