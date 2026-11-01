'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

function fakeUpstream(name) {
  return http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ upstream: name, path: req.url }));
  });
}

let base; let up1; let up2; let app;
test.before(async () => {
  up1 = fakeUpstream('membership'); up2 = fakeUpstream('capacity');
  await new Promise((r) => up1.listen(0, r)); await new Promise((r) => up2.listen(0, r));
  process.env.MEMBERSHIP_API_URL = `http://127.0.0.1:${up1.address().port}`;
  process.env.BED_API_URL = `http://127.0.0.1:${up2.address().port}`;
  ({ app } = require('../server'));
  await app.start(0);
  base = `http://127.0.0.1:${app.address().port}`;
});
test.after(() => { app.close(); up1.close(); up2.close(); });

test('serves the single-page UI with security headers', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(await r.text(), /Contoso Health/);
});

test('proxies membership and capacity APIs', async () => {
  const m = await (await fetch(base + '/api/membership/members?status=unpaid')).json();
  assert.deepEqual(m, { upstream: 'membership', path: '/api/members?status=unpaid' });
  const c = await (await fetch(base + '/api/capacity/beds/summary')).json();
  assert.deepEqual(c, { upstream: 'capacity', path: '/api/beds/summary' });
});

test('info endpoint reports version and pod', async () => {
  const i = await (await fetch(base + '/api/info')).json();
  assert.equal(i.service, 'portal');
  assert.ok(i.pod);
});

test('returns 502 when an upstream is down', async () => {
  up2.close();
  await new Promise((r) => setTimeout(r, 50));
  const r = await fetch(base + '/api/capacity/beds/summary');
  assert.equal(r.status, 502);
});

test('unknown asset is 404', async () => {
  assert.equal((await fetch(base + '/nope.js')).status, 404);
});
