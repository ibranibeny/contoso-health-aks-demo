'use strict';
process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'membership-api';
const { createApp, send, jakartaToday } = require('./lib/kit');
const { MEMBERS, BY_ID, REGIONS, view, history } = require('./lib/data');
const { SEGMENTS, CLASS_FEES, CLASS3_SUBSIDY, DUE_DAY, MAX_ARREARS_MONTHS, periodKey } = require('./lib/rules');

const STATUSES = ['paid', 'due', 'unpaid'];

function snapshot() {
  const today = jakartaToday();
  return { today, rows: MEMBERS.map((m) => view(m, today)) };
}

function filterRows(rows, q) {
  const status = q.get('status');
  const segment = q.get('segment');
  const cls = q.get('class');
  const province = q.get('province');
  const text = (q.get('q') || '').trim().toLowerCase();
  return rows.filter((r) =>
    (!status || (status === 'notpaid' ? r.status !== 'paid' : r.status === status)) &&
    (!segment || r.segment === segment) &&
    (!cls || String(r.class) === cls) &&
    (!province || r.province === province) &&
    (!text || r.name.toLowerCase().includes(text) || r.id.includes(text) || r.city.toLowerCase().includes(text)));
}

function tally(rows, keyFn) {
  const out = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!out.has(k)) out.set(k, { key: k, members: 0, paid: 0, due: 0, unpaid: 0, outstanding: 0 });
    const t = out.get(k);
    t.members += 1; t[r.status] += 1; t.outstanding += r.outstanding;
  }
  return [...out.values()].map((t) => ({ ...t, collectionRate: t.members ? Math.round(((t.paid + t.due) / t.members) * 1000) / 10 : 0 }));
}

const routes = [
  {
    method: 'GET', path: /^\/api\/members$/, name: 'list_members',
    handler: (req, res, m, url) => {
      const { today, rows } = snapshot();
      const filtered = filterRows(rows, url.searchParams);
      const sort = url.searchParams.get('sort') || 'arrears';
      const sorters = {
        arrears: (a, b) => b.arrearsMonths - a.arrearsMonths || b.outstanding - a.outstanding || a.name.localeCompare(b.name),
        name: (a, b) => a.name.localeCompare(b.name),
        outstanding: (a, b) => b.outstanding - a.outstanding
      };
      filtered.sort(sorters[sort] || sorters.arrears);
      const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize')) || 25, 1), 200);
      const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
      const items = filtered.slice((page - 1) * pageSize, page * pageSize);
      send(res, 200, { asOf: periodKey(today) + '-' + String(today.day).padStart(2, '0'), total: filtered.length, page, pageSize, items });
    }
  },
  {
    method: 'GET', path: /^\/api\/members\/(\d{13})$/, name: 'get_member',
    handler: (req, res, m) => {
      const member = BY_ID.get(m[1]);
      if (!member) return send(res, 404, { error: 'member_not_found' });
      const today = jakartaToday();
      send(res, 200, { ...view(member, today), history: history(member, today) });
    }
  },
  {
    method: 'GET', path: /^\/api\/payments\/summary$/, name: 'payment_summary',
    handler: (req, res) => {
      const { today, rows } = snapshot();
      const totals = tally(rows, () => 'all')[0];
      send(res, 200, {
        asOf: `${periodKey(today)}-${String(today.day).padStart(2, '0')}`,
        dueDay: DUE_DAY,
        totals,
        bySegment: tally(rows, (r) => r.segment),
        byClass: tally(rows, (r) => `Class ${r.class}`),
        byProvince: tally(rows, (r) => r.province).sort((a, b) => b.members - a.members)
      });
    }
  },
  {
    method: 'GET', path: /^\/api\/meta$/, name: 'meta',
    handler: (req, res) => send(res, 200, {
      statuses: STATUSES,
      segments: Object.values(SEGMENTS),
      classes: [1, 2, 3].map((c) => ({ class: c, monthlyFee: CLASS_FEES[c], governmentSubsidy: c === 3 ? CLASS3_SUBSIDY : 0 })),
      provinces: REGIONS.map((r) => r.province),
      rules: { dueDay: DUE_DAY, maxArrearsMonthsBilled: MAX_ARREARS_MONTHS, ppu: '5% of salary (4% employer, 1% employee), salary cap IDR 12,000,000', pbi: 'IDR 42,000 paid by government' }
    })
  }
];

const app = createApp({
  service: 'membership-api',
  routes,
  metricsExtra: () => {
    const { rows } = snapshot();
    const t = tally(rows, () => 'all')[0];
    return [
      '# HELP contoso_members_total Members by payment status (synthetic registry).',
      '# TYPE contoso_members_total gauge',
      ...STATUSES.map((s) => `contoso_members_total{service="membership-api",status="${s}"} ${t[s]}`)
    ];
  }
});

if (require.main === module) app.start(Number(process.env.PORT || 8080));
module.exports = { app, filterRows, tally };
