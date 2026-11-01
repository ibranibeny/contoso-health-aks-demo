'use strict';
// Minimal, dependency-free HTTP toolkit: routing, JSON helpers, structured logs,
// Prometheus text-format metrics and graceful shutdown. Copied into each service
// so every container image stays self-contained (no npm install, no supply chain).
const http = require('node:http');
const os = require('node:os');

const POD = process.env.HOSTNAME || os.hostname();
const VERSION = process.env.APP_VERSION || 'dev';

function log(level, msg, fields = {}) {
  const line = { time: new Date().toISOString(), level, service: process.env.SERVICE_NAME || 'unknown', pod: POD, version: VERSION, msg, ...fields };
  const out = level === 'error' ? process.stderr : process.stdout;
  out.write(JSON.stringify(line) + '\n');
}

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5];
function esc(v) { return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'); }
function labelKey(labels) { return Object.entries(labels).map(([k, v]) => `${k}="${esc(v)}"`).join(','); }

function createMetrics(service) {
  const requests = new Map();
  const latency = new Map();
  return {
    observe(route, method, status, seconds) {
      const rk = labelKey({ service, route, method, status });
      requests.set(rk, (requests.get(rk) || 0) + 1);
      const lk = labelKey({ service, route, method });
      let h = latency.get(lk);
      if (!h) { h = { counts: new Array(BUCKETS.length).fill(0), sum: 0, count: 0 }; latency.set(lk, h); }
      BUCKETS.forEach((b, i) => { if (seconds <= b) h.counts[i] += 1; });
      h.sum += seconds; h.count += 1;
    },
    render(extra = []) {
      const lines = [
        '# HELP contoso_http_requests_total Total HTTP requests handled, by route and status code.',
        '# TYPE contoso_http_requests_total counter'];
      for (const [k, v] of requests) lines.push(`contoso_http_requests_total{${k}} ${v}`);
      lines.push('# HELP contoso_http_request_duration_seconds HTTP request latency in seconds.',
        '# TYPE contoso_http_request_duration_seconds histogram');
      for (const [k, h] of latency) {
        BUCKETS.forEach((b, i) => lines.push(`contoso_http_request_duration_seconds_bucket{${k},le="${b}"} ${h.counts[i]}`));
        lines.push(`contoso_http_request_duration_seconds_bucket{${k},le="+Inf"} ${h.count}`);
        lines.push(`contoso_http_request_duration_seconds_sum{${k}} ${h.sum.toFixed(6)}`);
        lines.push(`contoso_http_request_duration_seconds_count{${k}} ${h.count}`);
      }
      lines.push('# HELP contoso_process_resident_memory_bytes Resident memory of the Node.js process.',
        '# TYPE contoso_process_resident_memory_bytes gauge',
        `contoso_process_resident_memory_bytes{service="${esc(service)}"} ${process.memoryUsage().rss}`,
        '# HELP contoso_app_info Static information about the running build.',
        '# TYPE contoso_app_info gauge',
        `contoso_app_info{service="${esc(service)}",version="${esc(VERSION)}"} 1`);
      for (const l of extra) lines.push(l);
      return lines.join('\n') + '\n';
    }
  };
}

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  const type = isBuf || typeof body === 'string' ? (headers['content-type'] || 'text/plain; charset=utf-8') : 'application/json; charset=utf-8';
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers
  });
  res.end(payload);
}

/**
 * createApp({ service, routes, metricsExtra }) -> http.Server
 * routes: [{ method, path: RegExp, name, handler(req, res, match, url) }]
 */
function createApp({ service, routes, metricsExtra = () => [] }) {
  const metrics = createMetrics(service);
  const state = { ready: true };
  const faultRate = Math.min(Math.max(Number(process.env.FAULT_RATE || 0), 0), 1);

  const server = http.createServer(async (req, res) => {
    const started = process.hrtime.bigint();
    const url = new URL(req.url, 'http://localhost');
    let routeName = 'unmatched';
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      if (routeName !== 'metrics' && routeName !== 'healthz' && routeName !== 'readyz') {
        metrics.observe(routeName, req.method, res.statusCode, seconds);
        log(res.statusCode >= 500 ? 'error' : 'info', 'request', { method: req.method, path: url.pathname, route: routeName, status: res.statusCode, durationMs: Math.round(seconds * 1000) });
      }
    });
    try {
      if (url.pathname === '/healthz') { routeName = 'healthz'; return send(res, 200, { status: 'ok' }); }
      if (url.pathname === '/readyz') { routeName = 'readyz'; return send(res, state.ready ? 200 : 503, { ready: state.ready }); }
      if (url.pathname === '/metrics') { routeName = 'metrics'; return send(res, 200, metrics.render(metricsExtra()), { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' }); }
      for (const r of routes) {
        if (r.method !== req.method && !(r.method === 'GET' && req.method === 'HEAD')) continue;
        const m = url.pathname.match(r.path);
        if (!m) continue;
        routeName = r.name;
        if (faultRate > 0 && url.pathname.startsWith('/api/') && Math.random() < faultRate) {
          return send(res, 503, { error: 'injected_fault', detail: 'FAULT_RATE is set on this deployment (demo only).' });
        }
        return await r.handler(req, res, m, url);
      }
      return send(res, 404, { error: 'not_found', path: url.pathname });
    } catch (err) {
      log('error', 'unhandled', { error: err.message, stack: err.stack });
      if (!res.headersSent) send(res, 500, { error: 'internal_error' });
    }
  });

  function shutdown(signal) {
    state.ready = false;
    log('info', 'shutting down', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  }
  server.start = (port) => new Promise((resolve) => {
    server.listen(port, () => {
      log('info', 'listening', { port: server.address().port, faultRate });
      process.once('SIGTERM', () => shutdown('SIGTERM'));
      process.once('SIGINT', () => shutdown('SIGINT'));
      resolve(server);
    });
  });
  return server;
}

// Deterministic PRNG so every replica serves the same synthetic data.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** Calendar date in Asia/Jakarta (WIB), optionally overridden with AS_OF=YYYY-MM-DD. */
function jakartaToday(now = new Date()) {
  const override = process.env.AS_OF;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) {
    const [y, m, d] = override.split('-').map(Number);
    return { year: y, month: m, day: d };
  }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

module.exports = { createApp, send, log, mulberry32, hashString, jakartaToday, POD, VERSION };
