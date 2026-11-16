// Runs inFORMed as one small web server on your own computer, and for the automatic checks (npm test).
// It serves the website from public/ and runs the same api/*.js handlers that the Firebase function
// runs (index.js), so the code is identical on both. Start it with: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8080);
const PUBLIC = path.join(__dirname, 'public');
const MAX_BODY = 6 * 1024 * 1024; // voice recordings arrive as text and can be a few megabytes

// The same security headers as firebase.json.
const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg',
};
const PAGES = { '/': 'index.html', '/form': 'index.html' }; // /form opens straight on the form

// Only these endpoints exist; anything else is "not found".
const API = {};
for (const f of fs.readdirSync(path.join(__dirname, 'api'))) if (f.endsWith('.js')) API[f.slice(0, -3)] = require('./api/' + f);

// Gives Node's request and response the small helpers the handlers use (Firebase provides the same ones).
function helpers(req, res, url) {
  req.query = Object.fromEntries(url.searchParams);
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); return res; };
  res.send = body => {
    if (body == null) { res.end(); return res; }
    if (Buffer.isBuffer(body) || body instanceof Uint8Array) { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/octet-stream'); res.end(Buffer.from(body)); return res; }
    if (typeof body === 'object') return res.json(body);
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(String(body)); return res;
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    // Past the limit the rest is read and dropped, so the person gets a clear "too large" answer.
    req.on('data', c => { size += c.length; if (size <= MAX_BODY) chunks.push(c); });
    req.on('end', () => size > MAX_BODY ? reject(Object.assign(new Error('too large'), { code: 413 })) : resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function serveFile(res, rel) {
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.statusCode = 404; return res.end('Not found'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Length', st.size);
    // Pages are always fresh; pictures and scripts may be cached for an hour.
    res.setHeader('Cache-Control', file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600');
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  for (const k in SECURITY) res.setHeader(k, SECURITY[k]);
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p === '/healthz') { res.statusCode = 200; return res.end('ok'); }
    const m = p.match(/^\/api\/([a-z-]+)\/?$/);
    if (m) {
      const handler = API[m[1]];
      if (!handler) { res.statusCode = 404; return res.end('Not found'); }
      helpers(req, res, url);
      if (req.method === 'POST' || req.method === 'PUT') {
        const raw = await readBody(req);
        req.rawBody = raw;
        const type = String(req.headers['content-type'] || '');
        if (/json/.test(type)) { try { req.body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch (e) { return res.status(400).send('Invalid JSON.'); } }
        else req.body = raw.toString('utf8');
      }
      return await handler(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
    return serveFile(res, PAGES[p] || decodeURIComponent(p).replace(/^\/+/, ''));
  } catch (e) {
    console.error('Server error:', e.code === 413 ? 'request too large' : e.message); // never logs what people wrote
    if (!res.headersSent) { res.statusCode = e.code === 413 ? 413 : 500; res.end(); }
    else res.end();
  }
});

if (require.main === module) server.listen(PORT, () => console.log(`inFORMed is running on port ${PORT}`));
module.exports = server;
