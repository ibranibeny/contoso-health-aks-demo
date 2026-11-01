'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.AS_OF = '2026-11-05';
const { app } = require('../server');

let base;
test.before(async () => { await app.start(0); base = `http://127.0.0.1:${app.address().port}`; });
test.after(() => app.close());

test('health endpoints respond', async () => {
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/readyz`)).status, 200);
});

test('summary totals add up', async () => {
  const s = await (await fetch(`${base}/api/payments/summary`)).json();
  assert.equal(s.asOf, '2026-11-05');
  assert.equal(s.totals.paid + s.totals.due + s.totals.unpaid, s.totals.members);
  assert.ok(s.totals.unpaid > 0, 'synthetic data should contain members in arrears');
  assert.equal(s.bySegment.reduce((n, x) => n + x.members, 0), s.totals.members);
});

test('status filter returns only matching members', async () => {
  const r = await (await fetch(`${base}/api/members?status=unpaid&pageSize=200`)).json();
  assert.ok(r.items.length > 0);
  assert.ok(r.items.every((m) => m.status === 'unpaid' && m.coverage === 'inactive' && m.arrearsMonths >= 1));
  const np = await (await fetch(`${base}/api/members?status=notpaid&pageSize=200`)).json();
  assert.ok(np.items.every((m) => m.status !== 'paid'));
});

test('member detail includes a 12-month history', async () => {
  const list = await (await fetch(`${base}/api/members?pageSize=1`)).json();
  const id = list.items[0].id;
  const d = await (await fetch(`${base}/api/members/${id}`)).json();
  assert.equal(d.id, id);
  assert.equal(d.history.length, 12);
  assert.equal((await fetch(`${base}/api/members/0000000000000`)).status, 404);
});

test('metrics are exposed in Prometheus text format', async () => {
  const text = await (await fetch(`${base}/metrics`)).text();
  assert.match(text, /contoso_http_requests_total\{service="membership-api"/);
  assert.match(text, /contoso_members_total\{service="membership-api",status="unpaid"\} \d+/);
});

test('data is deterministic across replicas', () => {
  const a = require('../lib/data').MEMBERS[0];
  delete require.cache[require.resolve('../lib/data')];
  const b = require('../lib/data').MEMBERS[0];
  assert.deepEqual(a, b);
});
