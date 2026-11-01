'use strict';
/**
 * Contribution rules for the synthetic "Contoso Health" national health insurance scheme.
 * Simplified for a demo; amounts are in Indonesian Rupiah (IDR) per member per month.
 *
 * Segments
 *   PBI  - Subsidized: contribution paid by government, inpatient class 3
 *   PPU  - Wage earner: 5% of salary (4% employer + 1% employee), salary cap IDR 12,000,000
 *   PBPU - Self-employed / informal worker: pays by chosen class
 *   BP   - Non-worker: pays by chosen class
 *
 * Due date: the 10th of each month. Members who have not paid the previous month's
 * contribution after the due date are in arrears and their coverage is inactive.
 * Reactivation requires settling arrears (counted for at most 24 months).
 */
const DUE_DAY = 10;
const MAX_ARREARS_MONTHS = 24;
const PPU_SALARY_CAP = 12000000;
const PPU_CLASS1_THRESHOLD = 4000000;

const SEGMENTS = {
  PBI: { code: 'PBI', label: 'Subsidized (government-paid)', payer: 'Government' },
  PPU: { code: 'PPU', label: 'Wage earner (employer + employee)', payer: 'Employer' },
  PBPU: { code: 'PBPU', label: 'Self-employed / informal', payer: 'Member' },
  BP: { code: 'BP', label: 'Non-worker', payer: 'Member' }
};

const CLASS_FEES = { 1: 150000, 2: 100000, 3: 42000 };
const CLASS3_SUBSIDY = 7000;

/** Monthly contribution for a member: { total, memberShare, employerShare, governmentShare } */
function contributionFor(member) {
  if (member.segment === 'PBI') return { total: 42000, memberShare: 0, employerShare: 0, governmentShare: 42000 };
  if (member.segment === 'PPU') {
    const base = Math.min(member.salary, PPU_SALARY_CAP);
    const employer = Math.round(base * 0.04);
    const employee = Math.round(base * 0.01);
    return { total: employer + employee, memberShare: employee, employerShare: employer, governmentShare: 0 };
  }
  const total = CLASS_FEES[member.class];
  const subsidy = member.class === 3 ? CLASS3_SUBSIDY : 0;
  return { total, memberShare: total - subsidy, employerShare: 0, governmentShare: subsidy };
}

/** Period helpers: a period is { year, month } with month 1..12. */
function addMonths(p, n) {
  const idx = p.year * 12 + (p.month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}
function diffMonths(a, b) { return (a.year * 12 + a.month) - (b.year * 12 + b.month); }
function periodKey(p) { return `${p.year}-${String(p.month).padStart(2, '0')}`; }

/**
 * Payment status as of a calendar date (Asia/Jakarta).
 *  paid   : contribution for the current month is paid
 *  due    : only the current month is outstanding and the due date has not passed yet
 *  unpaid : one or more months past their due date are unpaid -> coverage inactive
 */
function paymentStatus(paidThrough, today) {
  const current = { year: today.year, month: today.month };
  const previous = addMonths(current, -1);
  if (diffMonths(paidThrough, current) >= 0) {
    return { status: 'paid', coverage: 'active', arrearsMonths: 0, nextDue: periodKey(addMonths(paidThrough, 1)) };
  }
  if (diffMonths(paidThrough, previous) === 0 && today.day <= DUE_DAY) {
    return { status: 'due', coverage: 'active', arrearsMonths: 0, nextDue: periodKey(current) };
  }
  // Months whose due date has passed: up to the current month after the 10th, else up to last month.
  const lastOverdue = today.day > DUE_DAY ? current : previous;
  const arrears = Math.max(diffMonths(lastOverdue, paidThrough), 1);
  return { status: 'unpaid', coverage: 'inactive', arrearsMonths: arrears, nextDue: periodKey(addMonths(paidThrough, 1)) };
}

module.exports = {
  DUE_DAY, MAX_ARREARS_MONTHS, SEGMENTS, CLASS_FEES, CLASS3_SUBSIDY, PPU_SALARY_CAP, PPU_CLASS1_THRESHOLD,
  contributionFor, paymentStatus, addMonths, diffMonths, periodKey
};
