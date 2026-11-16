// inFORMed on Firebase. One function, "api", runs every endpoint in api/ (chat, document, speak,
// transcribe, translate, whatsapp). It runs in Johannesburg (africa-south1).
// Firebase Hosting serves the website from public/. The website calls this function at its own
// address (public/config.js), because Hosting cannot pass requests on to a Johannesburg function.
// So what people write goes straight to Johannesburg and does not travel through Hosting.
// Keys come from Secret Manager, never from a file.
const fs = require('fs');
const path = require('path');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

// Keys the function may read. Each one must exist in Secret Manager before deploying:
//   firebase functions:secrets:set NAME --data-file "%TEMP%\\k.txt" --project informed-grit
// When WhatsApp goes live, add 'WHATSAPP_TOKEN' and 'WHATSAPP_VERIFY_TOKEN' here.
const SECRET_NAMES = ['OPENAI_API_KEY'];
const SECRETS = SECRET_NAMES.map(n => defineSecret(n));

// Websites whose pages may call this function from a browser: the inFORMed site's two Firebase
// addresses. When inFORMed gets its own web address, add it to EXTRA_SITES (for example
// 'https://informed.example.org'). This stops other websites from using the function through
// people's browsers. It is not a lock: the message limits and the access code are the real guards.
const PROJECT = process.env.GCLOUD_PROJECT || 'informed-grit';
const EXTRA_SITES = [];
const SITES = ['https://' + PROJECT + '.web.app', 'https://' + PROJECT + '.firebaseapp.com', ...EXTRA_SITES];

// The same security headers the website gets from Hosting.
const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };

// The endpoints are loaded on the first request, so deploying stays quick.
let API = null;
function endpoints() {
  if (API) return API;
  // A key saved from a text file can end with a line break, which would break every call to OpenAI.
  for (const n of SECRET_NAMES) if (process.env[n]) process.env[n] = process.env[n].trim();
  API = {};
  const dir = path.join(__dirname, 'api');
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.js')) API[f.slice(0, -3)] = require(path.join(dir, f));
  return API;
}

async function handle(req, res) {
  for (const k in SECURITY) res.setHeader(k, SECURITY[k]);
  const m = String(req.path || '').match(/^\/api\/([a-z-]+)\/?$/);
  const handler = m && endpoints()[m[1]];
  if (!handler) return res.status(404).send('Not found');
  try {
    return await handler(req, res);
  } catch (e) {
    console.error('Server error:', e.message); // never logs what people wrote
    if (!res.headersSent) res.status(500).end(); else res.end();
  }
}

// minInstances 0: no copy runs while nobody is using inFORMed, so there is no fixed monthly cost while I
// am building. The first message after a quiet spell waits a few seconds while a copy starts. Before the
// pilot, set it to 1 so nobody waits.
// maxInstances caps how many copies can run at once, which also caps cost.
exports.api = onRequest(
  { region: 'africa-south1', secrets: SECRETS, cors: SITES, memory: '1GiB', timeoutSeconds: 120, minInstances: 0, maxInstances: 5, invoker: 'public' },
  handle
);
exports.handle = handle; // for the automatic checks
exports.SITES = SITES;
