'use strict';
// Synthetic hospital registry and a deterministic bed-occupancy model.
// Availability changes every 5 minutes (like hospitals pushing updates), but every
// replica computes the same numbers for the same time window -> stateless API.
const { mulberry32, hashString } = require('./kit');

const BED_CLASSES = [
  { code: 'VIP', label: 'VIP', local: 'VIP', group: 'ward', baseOccupancy: 0.62 },
  { code: 'K1', label: 'Class 1', local: 'Kelas I', group: 'ward', baseOccupancy: 0.74 },
  { code: 'K2', label: 'Class 2', local: 'Kelas II', group: 'ward', baseOccupancy: 0.81 },
  { code: 'K3', label: 'Class 3', local: 'Kelas III', group: 'ward', baseOccupancy: 0.9 },
  { code: 'ICU', label: 'ICU', local: 'ICU', group: 'intensive', baseOccupancy: 0.9 },
  { code: 'HCU', label: 'HCU', local: 'HCU', group: 'intensive', baseOccupancy: 0.8 },
  { code: 'NICU', label: 'NICU', local: 'NICU', group: 'intensive', baseOccupancy: 0.86 },
  { code: 'PICU', label: 'PICU', local: 'PICU', group: 'intensive', baseOccupancy: 0.78 },
  { code: 'ISO', label: 'Isolation', local: 'Isolasi', group: 'special', baseOccupancy: 0.58 }
];

// Capacity ranges [min, max] per hospital type (A = largest referral hospitals, D = smallest).
const CAPACITY = {
  A: { VIP: [20, 40], K1: [40, 80], K2: [60, 120], K3: [100, 200], ICU: [20, 40], HCU: [10, 24], NICU: [10, 20], PICU: [8, 16], ISO: [10, 24] },
  B: { VIP: [10, 24], K1: [20, 40], K2: [30, 60], K3: [50, 110], ICU: [10, 20], HCU: [6, 12], NICU: [6, 12], PICU: [4, 8], ISO: [6, 14] },
  C: { VIP: [4, 10], K1: [8, 20], K2: [16, 30], K3: [30, 60], ICU: [4, 10], HCU: [0, 6], NICU: [0, 6], PICU: [0, 0], ISO: [2, 8] },
  D: { VIP: [0, 4], K1: [4, 10], K2: [8, 16], K3: [16, 32], ICU: [0, 4], HCU: [0, 0], NICU: [0, 0], PICU: [0, 0], ISO: [0, 4] }
};

const SEED_HOSPITALS = [
  ['RS-JKT-01', 'RSUP Contoso Nasional', 'A', 'Public', 'Jakarta Pusat', 'DKI Jakarta'],
  ['RS-JKT-02', 'RS Contoso Harapan', 'B', 'Private', 'Jakarta Selatan', 'DKI Jakarta'],
  ['RS-JKT-03', 'RSUD Contoso Jakarta Timur', 'B', 'Public', 'Jakarta Timur', 'DKI Jakarta'],
  ['RS-BDG-01', 'RSUP Contoso Bandung', 'A', 'Public', 'Bandung', 'Jawa Barat'],
  ['RS-BKS-01', 'RSUD Contoso Bekasi', 'B', 'Public', 'Bekasi', 'Jawa Barat'],
  ['RS-BGR-01', 'RS Contoso Medika Bogor', 'C', 'Private', 'Bogor', 'Jawa Barat'],
  ['RS-SMG-01', 'RSUP Contoso Semarang', 'A', 'Public', 'Semarang', 'Jawa Tengah'],
  ['RS-SKA-01', 'RS Contoso Sehat Surakarta', 'C', 'Private', 'Surakarta', 'Jawa Tengah'],
  ['RS-YOG-01', 'RSUP Contoso Yogyakarta', 'A', 'Public', 'Sleman', 'DI Yogyakarta'],
  ['RS-SBY-01', 'RSUD Contoso Surabaya', 'A', 'Public', 'Surabaya', 'Jawa Timur'],
  ['RS-MLG-01', 'RS Contoso Husada Malang', 'B', 'Private', 'Malang', 'Jawa Timur'],
  ['RS-DPS-01', 'RSUP Contoso Denpasar', 'A', 'Public', 'Denpasar', 'Bali'],
  ['RS-GNY-01', 'RS Contoso Ubud Gianyar', 'D', 'Private', 'Gianyar', 'Bali'],
  ['RS-MDN-01', 'RSUP Contoso Medan', 'A', 'Public', 'Medan', 'Sumatera Utara'],
  ['RS-MDN-02', 'RS Contoso Sentosa Medan', 'C', 'Private', 'Medan', 'Sumatera Utara'],
  ['RS-PLM-01', 'RSUP Contoso Palembang', 'B', 'Public', 'Palembang', 'Sumatera Selatan'],
  ['RS-MKS-01', 'RSUP Contoso Makassar', 'A', 'Public', 'Makassar', 'Sulawesi Selatan'],
  ['RS-BPN-01', 'RSUD Contoso Balikpapan', 'B', 'Public', 'Balikpapan', 'Kalimantan Timur'],
  ['RS-SMD-01', 'RS Contoso Mahakam Samarinda', 'C', 'Private', 'Samarinda', 'Kalimantan Timur'],
  ['RS-KPG-01', 'RSUD Contoso Kupang', 'C', 'Public', 'Kupang', 'Nusa Tenggara Timur'],
  ['RS-JAP-01', 'RSUD Contoso Jayapura', 'B', 'Public', 'Jayapura', 'Papua'],
  ['RS-MRK-01', 'RS Contoso Merauke', 'D', 'Public', 'Merauke', 'Papua']
];

function buildHospitals() {
  const rand = mulberry32(Number(process.env.DATA_SEED || 20261101) + 7);
  return SEED_HOSPITALS.map(([id, name, type, ownership, city, province]) => {
    const beds = BED_CLASSES.map((c) => {
      const [min, max] = CAPACITY[type][c.code];
      const capacity = min === max ? min : min + Math.floor(rand() * (max - min + 1));
      return { code: c.code, capacity };
    }).filter((b) => b.capacity > 0);
    return { id, name, type, ownership, city, province, krisReady: rand() < (type === 'A' ? 0.9 : type === 'B' ? 0.7 : 0.45), beds };
  });
}

const HOSPITALS = buildHospitals();
const CLASS_BY_CODE = new Map(BED_CLASSES.map((c) => [c.code, c]));
const BUCKET_MS = 5 * 60 * 1000;

/** Occupied beds for a hospital/class at time `now` (pure function). */
function occupancyAt(hospitalId, code, capacity, now) {
  const bucket = Math.floor(now / BUCKET_MS);
  const cls = CLASS_BY_CODE.get(code);
  const hourWib = (new Date(now).getUTCHours() + 7) % 24;
  const daily = 0.05 * Math.sin((2 * Math.PI * (hourWib - 8)) / 24); // busier in the afternoon
  const noise = ((hashString(`${hospitalId}:${code}:${bucket}`) % 1000) / 1000 - 0.5) * 0.24;
  const bias = ((hashString(`${hospitalId}:${code}`) % 1000) / 1000 - 0.5) * 0.16;
  const occ = Math.min(1, Math.max(0.3, cls.baseOccupancy + daily + noise + bias));
  return Math.min(capacity, Math.round(capacity * occ));
}

function hospitalView(h, now = Date.now()) {
  const bucketStart = Math.floor(now / BUCKET_MS) * BUCKET_MS;
  const beds = h.beds.map((b) => {
    const occupied = occupancyAt(h.id, b.code, b.capacity, now);
    const cls = CLASS_BY_CODE.get(b.code);
    const lag = hashString(`${h.id}:${b.code}:lag:${bucketStart}`) % 4;
    return {
      code: b.code, label: cls.label, local: cls.local, group: cls.group,
      capacity: b.capacity, occupied, available: b.capacity - occupied,
      updatedAt: new Date(bucketStart - lag * 60000).toISOString()
    };
  });
  const totals = beds.reduce((t, b) => ({ capacity: t.capacity + b.capacity, available: t.available + b.available }), { capacity: 0, available: 0 });
  return { ...h, beds, totals };
}

module.exports = { BED_CLASSES, HOSPITALS, hospitalView, occupancyAt };
