// Work started by a webhook (WhatsApp wants a quick "ok").
// A Firebase function may be stopped as soon as it has replied, so the work is finished first and
// then "ok" is sent. Meta sends a message again if "ok" is slow; duplicates are ignored (lib/core/store.js).
async function later(task) {
  await task;
}
module.exports = { later };
