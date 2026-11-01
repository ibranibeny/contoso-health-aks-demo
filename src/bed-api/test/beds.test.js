'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { HOSPITALS, hospitalView, occupancyAt, BED_CLASSES } = require('../lib/hospitals');
const { app } = require('../server');

let base;
test.before(async () => { await app.start(0); base = `http://127.0.0.1:${app.address().port}`; });
test.after(() => app.close());

test('occupancy never exceeds capacity and is deterministic', () => {
  const now = Date.UTC(2026, 10, 1, 6, 0, 0);
  for (const h of HOSPITALS) for (const b of h.beds) {
    const o1 = occupancyAt(h.id, b.code, b.capacity, now);
    const o2 = occupancyAt(h.id, b.code, b.capacity, now);
    assert.equal(o1, o2);
    assert.ok(o1 >= 0 && o1 <= b.capacity);
  }
});

test('every hospital reports ward classes 1-3', () => {
  for (const h of HOSPITALS) {
    const codes = hospitalView(h).beds.map((b) => b.code);
    for (const c of ['K1', 'K2', 'K3']) assert.ok(codes.includes(c), `${h.id} missing ${c}`);
  }
});

test('summary per class adds up to the total', async () => {
  const s = await (await fetch(`${base}/api/beds/summary`)).json();
  assert.equal(s.byClass.length, BED_CLASSES.length);
  assert.equal(s.byClass.reduce((n, c) => n + c.capacity, 0), s.totals.capacity);
  assert.equal(s.byClass.reduce((n, c) => n + c.available, 0), s.totals.available);
});

test('filter by province and class', async () => {
  const r = await (await fetch(`${base}/api/hospitals?province=DKI%20Jakarta&class=ICU`)).json();
  assert.ok(r.total >= 1);
  assert.ok(r.items.every((h) => h.province === 'DKI Jakarta' && h.beds.some((b) => b.code === 'ICU')));
});

test('hospital detail and 404', async () => {
  const d = await (await fetch(`${base}/api/hospitals/RS-JKT-01`)).json();
  assert.equal(d.id, 'RS-JKT-01');
  assert.equal((await fetch(`${base}/api/hospitals/RS-XXX-99`)).status, 404);
});

test('metrics expose bed gauges', async () => {
  const text = await (await fetch(`${base}/metrics`)).text();
  assert.match(text, /contoso_beds_available\{service="bed-api",bed_class="ICU"\} \d+/);
});
