// Work that should carry on after a webhook has been answered (WhatsApp wants a quick "ok").
// On Vercel, waitUntil keeps the function alive after the reply. On Google Cloud Run, the server stops
// giving a request CPU once it has replied, so the work is finished first and then "ok" is sent.
async function later(task) {
  if (process.env.VERCEL) { require('@vercel/functions').waitUntil(task); return; }
  await task;
}
module.exports = { later };
