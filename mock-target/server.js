// Scriptable mock of a monitored API, used by end-to-end tests (E5–E12).
//
//   POST /__script   {"path": "/api/v1/events", "responses": [{"status": 200, "body": {...}, "delayMs": 0}], "repeat": true}
//                    Queue responses for a path. With repeat, the last one keeps being served.
//   POST /__reset    Clear all scripts and the request log.
//   GET  /__requests Every request received (method, path, headers, body), oldest first.
//   *    anything else: next scripted response for the path, or 200 {"count": 5, "data": [{}, {}]}.
const http = require('node:http');

const PORT = Number(process.env.PORT || 4000);
const DEFAULT = { status: 200, body: { count: 5, data: [{ id: 1 }, { id: 2 }] } };
let scripts = new Map(); // path -> { responses: [], repeat: boolean }
let requests = [];

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

function send(res, status, body) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const body = await readBody(req);

  if (url.pathname === '/__script' && req.method === 'POST') {
    const s = JSON.parse(body || '{}');
    scripts.set(s.path, { responses: s.responses ?? [], repeat: !!s.repeat });
    return send(res, 204);
  }
  if (url.pathname === '/__reset' && req.method === 'POST') {
    scripts = new Map();
    requests = [];
    return send(res, 204);
  }
  if (url.pathname === '/__requests') return send(res, 200, requests);
  if (url.pathname === '/__health') return send(res, 200, { ok: true });

  requests.push({ method: req.method, path: url.pathname + url.search, headers: req.headers, body, at: new Date().toISOString() });

  const s = scripts.get(url.pathname);
  let r = DEFAULT;
  if (s && s.responses.length) {
    r = s.responses.length > 1 || !s.repeat ? s.responses.shift() : s.responses[0];
  }
  if (r.delayMs) await new Promise((ok) => setTimeout(ok, r.delayMs));
  if (r.hang) return; // never respond: simulates a timeout
  send(res, r.status ?? 200, r.body);
});

server.listen(PORT, '0.0.0.0', () => console.log(`mock-target listening on ${PORT}`));
