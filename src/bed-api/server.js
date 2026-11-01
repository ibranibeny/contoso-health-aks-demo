'use strict';
process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'bed-api';
const { createApp, send } = require('./lib/kit');
const { BED_CLASSES, HOSPITALS, hospitalView } = require('./lib/hospitals');

function listView(url, now = Date.now()) {
  const q = url.searchParams;
  const province = q.get('province');
  const city = q.get('city');
  const cls = q.get('class');
  const onlyAvailable = q.get('available') === '1' || q.get('available') === 'true';
  const text = (q.get('q') || '').trim().toLowerCase();
  return HOSPITALS
    .filter((h) => (!province || h.province === province) && (!city || h.city === city) &&
      (!text || h.name.toLowerCase().includes(text) || h.city.toLowerCase().includes(text)))
    .map((h) => hospitalView(h, now))
    .filter((h) => !cls || h.beds.some((b) => b.code === cls))
    .filter((h) => !onlyAvailable || (cls ? h.beds.find((b) => b.code === cls).available > 0 : h.totals.available > 0));
}

function summarize(views) {
  const byClass = BED_CLASSES.map((c) => {
    let capacity = 0; let available = 0; let hospitalsWithBeds = 0; let full = 0;
    for (const h of views) {
      const b = h.beds.find((x) => x.code === c.code);
      if (!b) continue;
      capacity += b.capacity; available += b.available; hospitalsWithBeds += 1; if (b.available === 0) full += 1;
    }
    return { code: c.code, label: c.label, local: c.local, group: c.group, capacity, available, occupancyRate: capacity ? Math.round(((capacity - available) / capacity) * 1000) / 10 : 0, hospitals: hospitalsWithBeds, hospitalsFull: full };
  });
  const provinces = new Map();
  for (const h of views) {
    const p = provinces.get(h.province) || { province: h.province, hospitals: 0, capacity: 0, available: 0 };
    p.hospitals += 1; p.capacity += h.totals.capacity; p.available += h.totals.available;
    provinces.set(h.province, p);
  }
  const totals = byClass.reduce((t, c) => ({ capacity: t.capacity + c.capacity, available: t.available + c.available }), { capacity: 0, available: 0 });
  return { totals: { ...totals, hospitals: views.length }, byClass, byProvince: [...provinces.values()] };
}

const routes = [
  { method: 'GET', path: /^\/api\/hospitals$/, name: 'list_hospitals', handler: (req, res, m, url) => {
    const items = listView(url);
    send(res, 200, { asOf: new Date().toISOString(), total: items.length, items });
  } },
  { method: 'GET', path: /^\/api\/hospitals\/([A-Z]{2}-[A-Z]{3}-\d{2})$/, name: 'get_hospital', handler: (req, res, m) => {
    const h = HOSPITALS.find((x) => x.id === m[1]);
    if (!h) return send(res, 404, { error: 'hospital_not_found' });
    send(res, 200, hospitalView(h));
  } },
  { method: 'GET', path: /^\/api\/beds\/summary$/, name: 'bed_summary', handler: (req, res, m, url) => {
    send(res, 200, { asOf: new Date().toISOString(), ...summarize(listView(url)) });
  } },
  { method: 'GET', path: /^\/api\/beds\/classes$/, name: 'bed_classes', handler: (req, res) => {
    send(res, 200, BED_CLASSES.map(({ baseOccupancy, ...c }) => c));
  } }
];

const app = createApp({
  service: 'bed-api',
  routes,
  metricsExtra: () => {
    const s = summarize(HOSPITALS.map((h) => hospitalView(h)));
    return [
      '# HELP contoso_beds_available Available beds across all hospitals, by bed class.',
      '# TYPE contoso_beds_available gauge',
      ...s.byClass.map((c) => `contoso_beds_available{service="bed-api",bed_class="${c.code}"} ${c.available}`),
      '# HELP contoso_beds_capacity Bed capacity across all hospitals, by bed class.',
      '# TYPE contoso_beds_capacity gauge',
      ...s.byClass.map((c) => `contoso_beds_capacity{service="bed-api",bed_class="${c.code}"} ${c.capacity}`)
    ];
  }
});

if (require.main === module) app.start(Number(process.env.PORT || 8080));
module.exports = { app, summarize, listView };
