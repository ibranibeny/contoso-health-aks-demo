'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { paymentStatus, contributionFor, addMonths } = require('../lib/rules');

const nov = (day) => ({ year: 2026, month: 11, day });

test('paid when the current month is covered', () => {
  const s = paymentStatus({ year: 2026, month: 11 }, nov(20));
  assert.equal(s.status, 'paid');
  assert.equal(s.coverage, 'active');
});

test('due (still active) before the 10th when only this month is open', () => {
  const s = paymentStatus({ year: 2026, month: 10 }, nov(10));
  assert.equal(s.status, 'due');
  assert.equal(s.coverage, 'active');
  assert.equal(s.arrearsMonths, 0);
});

test('unpaid after the 10th: one month of arrears and coverage inactive', () => {
  const s = paymentStatus({ year: 2026, month: 10 }, nov(11));
  assert.equal(s.status, 'unpaid');
  assert.equal(s.coverage, 'inactive');
  assert.equal(s.arrearsMonths, 1);
});

test('arrears counted across year boundaries', () => {
  const s = paymentStatus({ year: 2025, month: 12 }, nov(5));
  assert.equal(s.status, 'unpaid');
  assert.equal(s.arrearsMonths, 10); // Jan..Oct 2026 overdue, Nov not yet due
});

test('contribution amounts follow the class table', () => {
  assert.equal(contributionFor({ segment: 'PBPU', class: 1 }).total, 150000);
  assert.equal(contributionFor({ segment: 'PBPU', class: 2 }).total, 100000);
  const c3 = contributionFor({ segment: 'BP', class: 3 });
  assert.deepEqual([c3.total, c3.memberShare, c3.governmentShare], [42000, 35000, 7000]);
  assert.equal(contributionFor({ segment: 'PBI', class: 3 }).governmentShare, 42000);
});

test('wage earners pay 5% of salary, capped at 12 million', () => {
  const c = contributionFor({ segment: 'PPU', class: 1, salary: 20000000 });
  assert.equal(c.employerShare, 480000);
  assert.equal(c.memberShare, 120000);
});

test('addMonths wraps years', () => {
  assert.deepEqual(addMonths({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  assert.deepEqual(addMonths({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
});
