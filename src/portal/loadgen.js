'use strict';
// Tiny traffic generator used by the monitoring demo (k8s/demo/loadgen-job.yaml).
// It reuses the portal image, so it satisfies the "allowed images" policy.
const target = (process.env.TARGET_URL || 'http://portal').replace(/\/$/, '');
const durationMs = Number(process.env.DURATION_SECONDS || 300) * 1000;
const concurrency = Number(process.env.CONCURRENCY || 4);
const paths = ['/api/membership/payments/summary', '/api/membership/members?status=unpaid', '/api/membership/members?status=paid&page=2',
  '/api/capacity/beds/summary', '/api/capacity/hospitals?class=ICU', '/api/capacity/hospitals?province=DKI%20Jakarta', '/'];
const stats = { ok: 0, failed: 0 };
const end = Date.now() + durationMs;
async function worker() {
  while (Date.now() < end) {
    const p = paths[Math.floor(Math.random() * paths.length)];
    try { const r = await fetch(target + p, { signal: AbortSignal.timeout(5000) }); await r.arrayBuffer(); r.ok ? stats.ok++ : stats.failed++; } catch { stats.failed++; }
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
  }
}
const timer = setInterval(() => console.log(JSON.stringify({ msg: 'loadgen', ...stats })), 10000);
Promise.all(Array.from({ length: concurrency }, worker)).then(() => { clearInterval(timer); console.log(JSON.stringify({ msg: 'loadgen done', ...stats })); });
