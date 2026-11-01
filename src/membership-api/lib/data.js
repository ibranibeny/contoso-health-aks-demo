'use strict';
// Synthetic, deterministic member registry. Every replica generates exactly the same data
// from the same seed, so the API stays stateless and horizontally scalable.
const { mulberry32 } = require('./kit');
const { SEGMENTS, PPU_CLASS1_THRESHOLD, contributionFor, paymentStatus, addMonths, periodKey, MAX_ARREARS_MONTHS } = require('./rules');

const SEED = Number(process.env.DATA_SEED || 20261101);
const MEMBER_COUNT = Number(process.env.MEMBER_COUNT || 360);

const FIRST = ['Adi', 'Agus', 'Ahmad', 'Andi', 'Anita', 'Ayu', 'Bambang', 'Budi', 'Citra', 'Dewi', 'Dian', 'Eka', 'Fajar', 'Fitri', 'Gita', 'Hadi',
  'Hendra', 'Indah', 'Intan', 'Joko', 'Kartika', 'Lestari', 'Made', 'Maya', 'Nur', 'Nyoman', 'Putri', 'Rahmat', 'Rina', 'Rizky', 'Sari', 'Siti',
  'Taufik', 'Tri', 'Wahyu', 'Wayan', 'Yanti', 'Yusuf', 'Zainal', 'Ketut', 'Lina', 'Reza', 'Dimas', 'Nadia', 'Galih', 'Arif', 'Mega', 'Rudi'];
const LAST = ['Santoso', 'Wijaya', 'Saputra', 'Lestari', 'Pratama', 'Hidayat', 'Kusuma', 'Siregar', 'Nasution', 'Simanjuntak', 'Hakim', 'Setiawan',
  'Gunawan', 'Halim', 'Purnomo', 'Susanto', 'Rahman', 'Utami', 'Wibowo', 'Sihombing', 'Harahap', 'Putra', 'Sari', 'Ramadhan', 'Firmansyah', 'Nugroho',
  'Suryadi', 'Tanjung', 'Lubis', 'Panjaitan', 'Mahendra', 'Permana'];
const REGIONS = [
  { province: 'DKI Jakarta', cities: ['Jakarta Pusat', 'Jakarta Selatan', 'Jakarta Timur', 'Jakarta Barat', 'Jakarta Utara'], weight: 14 },
  { province: 'Jawa Barat', cities: ['Bandung', 'Bekasi', 'Bogor', 'Depok', 'Cirebon'], weight: 16 },
  { province: 'Jawa Tengah', cities: ['Semarang', 'Surakarta', 'Tegal', 'Magelang'], weight: 11 },
  { province: 'DI Yogyakarta', cities: ['Yogyakarta', 'Sleman', 'Bantul'], weight: 5 },
  { province: 'Jawa Timur', cities: ['Surabaya', 'Malang', 'Sidoarjo', 'Kediri'], weight: 13 },
  { province: 'Bali', cities: ['Denpasar', 'Badung', 'Gianyar'], weight: 5 },
  { province: 'Sumatera Utara', cities: ['Medan', 'Binjai', 'Pematangsiantar'], weight: 8 },
  { province: 'Sumatera Selatan', cities: ['Palembang', 'Prabumulih'], weight: 5 },
  { province: 'Sulawesi Selatan', cities: ['Makassar', 'Parepare', 'Gowa'], weight: 6 },
  { province: 'Kalimantan Timur', cities: ['Balikpapan', 'Samarinda', 'Bontang'], weight: 5 },
  { province: 'Nusa Tenggara Timur', cities: ['Kupang', 'Ende'], weight: 3 },
  { province: 'Papua', cities: ['Jayapura', 'Merauke'], weight: 3 }
];
const CHANNELS = ['Auto-debit', 'Virtual account', 'Mobile banking', 'E-wallet', 'Retail outlet', 'Payroll deduction'];

function pickWeighted(rand, items, weightOf) {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  let r = rand() * total;
  for (const it of items) { r -= weightOf(it); if (r <= 0) return it; }
  return items[items.length - 1];
}

/** Offset in months between the current period and the last paid period (0 = paid this month). */
function paidOffset(rand, segment) {
  const r = rand();
  const profile = { PBI: [0.97, 0.03], PPU: [0.88, 0.08], PBPU: [0.55, 0.15], BP: [0.70, 0.12] }[segment];
  if (r < profile[0]) return 0;
  if (r < profile[0] + profile[1]) return -1;
  // Arrears: mostly short, a long tail up to 30 months.
  const t = rand();
  const months = t < 0.45 ? 2 : t < 0.7 ? 3 : t < 0.85 ? 2 + Math.floor(rand() * 6) : 6 + Math.floor(rand() * 25);
  return -months;
}

function generateMembers() {
  const rand = mulberry32(SEED);
  const segments = [{ code: 'PBI', w: 40 }, { code: 'PPU', w: 31 }, { code: 'PBPU', w: 21 }, { code: 'BP', w: 8 }];
  const members = [];
  for (let i = 0; i < MEMBER_COUNT; i++) {
    const segment = pickWeighted(rand, segments, (s) => s.w).code;
    const region = pickWeighted(rand, REGIONS, (r) => r.weight);
    const city = region.cities[Math.floor(rand() * region.cities.length)];
    const first = FIRST[Math.floor(rand() * FIRST.length)];
    const last = LAST[Math.floor(rand() * LAST.length)];
    const salary = segment === 'PPU' ? Math.round((2800000 + rand() * 14000000) / 50000) * 50000 : null;
    let cls;
    if (segment === 'PBI') cls = 3;
    else if (segment === 'PPU') cls = salary > PPU_CLASS1_THRESHOLD ? 1 : 2;
    else { const r = rand(); cls = r < 0.5 ? 3 : r < 0.8 ? 2 : 1; }
    const id = '0001' + String(Math.floor(rand() * 1e9)).padStart(9, '0');
    const member = {
      id,
      name: `${first} ${last}`,
      segment,
      segmentLabel: SEGMENTS[segment].label,
      payer: SEGMENTS[segment].payer,
      class: cls,
      province: region.province,
      city,
      familySize: 1 + Math.floor(rand() * 5),
      channel: segment === 'PPU' ? 'Payroll deduction' : segment === 'PBI' ? 'Government transfer' : CHANNELS[Math.floor(rand() * 5)],
      salary,
      paidOffset: paidOffset(rand, segment)
    };
    member.contribution = contributionFor(member);
    members.push(member);
  }
  return members;
}

const MEMBERS = generateMembers();
const BY_ID = new Map(MEMBERS.map((m) => [m.id, m]));

/** Materialise a member's status for a given day (pure function of member + day). */
function view(member, today) {
  const current = { year: today.year, month: today.month };
  const paidThrough = addMonths(current, member.paidOffset);
  const st = paymentStatus(paidThrough, today);
  const billable = Math.min(st.arrearsMonths, MAX_ARREARS_MONTHS);
  const payerShare = member.segment === 'PPU' ? member.contribution.total : member.segment === 'PBI' ? member.contribution.governmentShare : member.contribution.memberShare;
  const { paidOffset: _omit, ...pub } = member;
  return { ...pub, paidThrough: periodKey(paidThrough), ...st, outstanding: billable * payerShare };
}

function history(member, today, months = 12) {
  const current = { year: today.year, month: today.month };
  const paidThrough = addMonths(current, member.paidOffset);
  const rows = [];
  for (let i = months - 1; i >= 0; i--) {
    const p = addMonths(current, -i);
    const paid = (p.year * 12 + p.month) <= (paidThrough.year * 12 + paidThrough.month);
    rows.push({ period: periodKey(p), paid });
  }
  return rows;
}

module.exports = { MEMBERS, BY_ID, REGIONS, view, history };
