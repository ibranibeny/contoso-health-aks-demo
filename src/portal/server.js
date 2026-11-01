'use strict';
process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'portal';
const fs = require('node:fs');
const path = require('node:path');
const { createApp, send, POD, VERSION } = require('./lib/kit');

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPSTREAMS = {
  membership: process.env.MEMBERSHIP_API_URL || 'http://membership-api',
  capacity: process.env.BED_API_URL || 'http://bed-api'
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};

// Read static assets once at start-up (the root filesystem is read-only in Kubernetes).
const STATIC = new Map();
for (const file of fs.readdirSync(PUBLIC_DIR)) {
  STATIC.set('/' + file, { body: fs.readFileSync(path.join(PUBLIC_DIR, file)), type: MIME[path.extname(file)] || 'application/octet-stream' });
}

async function proxy(res, upstream, rest, search) {
  const target = `${UPSTREAMS[upstream]}/api/${rest}${search}`;
  try {
    const r = await fetch(target, { signal: AbortSignal.timeout(Number(process.env.UPSTREAM_TIMEOUT_MS || 3000)) });
    const body = Buffer.from(await r.arrayBuffer());
    send(res, r.status, body, { 'content-type': r.headers.get('content-type') || 'application/json' });
  } catch (err) {
    send(res, 502, { error: 'upstream_unavailable', upstream, detail: err.name });
  }
}

const routes = [
  { method: 'GET', path: /^\/api\/info$/, name: 'info', handler: (req, res) => send(res, 200, {
    service: 'portal', version: VERSION, pod: POD, node: process.env.NODE_NAME || null,
    region: process.env.AZURE_REGION || null, cluster: process.env.CLUSTER_NAME || null, upstreams: Object.keys(UPSTREAMS)
  }) },
  { method: 'GET', path: /^\/api\/membership\/(.+)$/, name: 'proxy_membership', handler: (req, res, m, url) => proxy(res, 'membership', m[1], url.search) },
  { method: 'GET', path: /^\/api\/capacity\/(.+)$/, name: 'proxy_capacity', handler: (req, res, m, url) => proxy(res, 'capacity', m[1], url.search) },
  { method: 'GET', path: /^\/(?!api\/)[^?]*$/, name: 'static', handler: (req, res, m, url) => {
    const asset = STATIC.get(url.pathname === '/' ? '/index.html' : url.pathname);
    if (!asset) return send(res, 404, 'Not found', SECURITY_HEADERS);
    send(res, 200, asset.body, { 'content-type': asset.type, ...SECURITY_HEADERS, 'cache-control': url.pathname === '/' ? 'no-store' : 'public, max-age=300' });
  } }
];

const app = createApp({ service: 'portal', routes });
if (require.main === module) app.start(Number(process.env.PORT || 8080));
module.exports = { app };
