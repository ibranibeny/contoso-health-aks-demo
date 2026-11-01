'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const num = new Intl.NumberFormat('en-US');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getJSON = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} -> ${r.status}`); return r.json(); };
  const STATUS_LABEL = { paid: 'Paid', due: 'Due by the 10th', unpaid: 'In arrears' };
  const state = { status: '', page: 1, pageSize: 15, bedClasses: [] };

  // ---------- header / footer ----------
  getJSON('api/info').then((i) => {
    const pills = [i.cluster && `AKS · ${i.cluster}`, i.region && `region · ${i.region}`, `version · ${String(i.version).slice(0, 12)}`].filter(Boolean);
    $('#env').innerHTML = pills.map((p) => `<span class="pill">${esc(p)}</span>`).join('');
    $('#foot').textContent = `Contoso Health demo · synthetic data · served by pod ${i.pod}${i.node ? ' on ' + i.node : ''}`;
  }).catch(() => { $('#env').innerHTML = '<span class="pill">local</span>'; });

  // ---------- tabs ----------
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('#view-contrib').hidden = b.dataset.view !== 'contrib';
    $('#view-beds').hidden = b.dataset.view !== 'beds';
    if (b.dataset.view === 'beds') loadBeds();
  }));

  // ---------- contribution view ----------
  function kpi(label, value, sub, cls = '') { return `<div class="kpi ${cls}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`; }

  function stackedBars(rows, labelOf) {
    const w = 560; const rowH = 34; const left = 150; const h = rows.length * rowH + 28;
    let y = 8; let svg = '';
    for (const r of rows) {
      const total = r.members || 1; let x = left; const bw = w - left - 60;
      for (const [k, color] of [['paid', '#16a34a'], ['due', '#f59e0b'], ['unpaid', '#ef4444']]) {
        const width = (r[k] / total) * bw;
        if (width > 0) svg += `<rect x="${x}" y="${y}" width="${width}" height="20" rx="3" fill="${color}"><title>${STATUS_LABEL[k]}: ${r[k]}</title></rect>`;
        x += width;
      }
      svg += `<text x="${left - 8}" y="${y + 14}" text-anchor="end" font-size="12" fill="#334155">${esc(labelOf(r))}</text>`;
      svg += `<text x="${w - 52}" y="${y + 14}" font-size="12" fill="#64748b">${num.format(r.members)}</text>`;
      y += rowH;
    }
    svg += `<g font-size="11" fill="#475569"><rect x="${left}" y="${y + 2}" width="10" height="10" fill="#16a34a"/><text x="${left + 14}" y="${y + 11}">Paid</text>
      <rect x="${left + 60}" y="${y + 2}" width="10" height="10" fill="#f59e0b"/><text x="${left + 74}" y="${y + 11}">Due by the 10th</text>
      <rect x="${left + 180}" y="${y + 2}" width="10" height="10" fill="#ef4444"/><text x="${left + 194}" y="${y + 11}">In arrears (coverage inactive)</text></g>`;
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="stacked bar chart">${svg}</svg>`;
  }

  function rateBars(rows) {
    const w = 560; const rowH = 46; const left = 90; const h = rows.length * rowH + 6; let y = 8; let svg = '';
    for (const r of rows) {
      const bw = w - left - 70; const width = (r.collectionRate / 100) * bw;
      svg += `<text x="${left - 10}" y="${y + 15}" text-anchor="end" font-size="12" fill="#334155">${esc(r.key)}</text>
        <rect x="${left}" y="${y}" width="${bw}" height="22" rx="4" fill="#e2e8f0"/><rect x="${left}" y="${y}" width="${width}" height="22" rx="4" fill="#0f766e"/>
        <text x="${left + bw + 8}" y="${y + 15}" font-size="12" font-weight="700" fill="#0f172a">${r.collectionRate}%</text>
        <text x="${left}" y="${y + 37}" font-size="11" fill="#64748b">${num.format(r.unpaid)} in arrears · outstanding ${esc(idr.format(r.outstanding))}</text>`;
      y += rowH;
    }
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="collection rate by class">${svg}</svg>`;
  }

  async function loadSummary() {
    const s = await getJSON('api/membership/payments/summary');
    const t = s.totals; const pct = (n) => `${Math.round((n / t.members) * 1000) / 10}%`;
    $('#kpis').innerHTML = [
      kpi('Members', num.format(t.members), 'synthetic registry'),
      kpi('Paid', num.format(t.paid), `${pct(t.paid)} of members`, 'ok'),
      kpi('Due by the 10th', num.format(t.due), 'still covered', 'warn'),
      kpi('Not paid', num.format(t.unpaid), `${pct(t.unpaid)} · coverage inactive`, 'bad'),
      kpi('Collection rate', `${t.collectionRate}%`, 'paid + due, as of ' + s.asOf),
      kpi('Outstanding', idr.format(t.outstanding), 'arrears owed by payers')
    ].join('');
    const segOrder = ['PBI', 'PPU', 'PBPU', 'BP'];
    const names = { PBI: 'Subsidized (PBI)', PPU: 'Wage earner (PPU)', PBPU: 'Self-employed (PBPU)', BP: 'Non-worker (BP)' };
    $('#chart-segment').innerHTML = stackedBars(segOrder.map((k) => s.bySegment.find((x) => x.key === k)).filter(Boolean), (r) => names[r.key] || r.key);
    $('#chart-class').innerHTML = rateBars(s.byClass.sort((a, b) => a.key.localeCompare(b.key)));
    $('#asof').textContent = `As of ${s.asOf} (WIB) · contributions are due on day ${s.dueDay} of each month`;
  }

  async function loadMeta() {
    const m = await getJSON('api/membership/meta');
    $('#f-segment').innerHTML += m.segments.map((s) => `<option value="${esc(s.code)}">${esc(s.code)} · ${esc(s.label)}</option>`).join('');
    $('#f-province').innerHTML += m.provinces.map((p) => `<option>${esc(p)}</option>`).join('');
    $('#b-province').innerHTML += m.provinces.map((p) => `<option>${esc(p)}</option>`).join('');
  }

  async function loadMembers() {
    const p = new URLSearchParams({ page: state.page, pageSize: state.pageSize });
    if (state.status) p.set('status', state.status);
    for (const [id, key] of [['#f-segment', 'segment'], ['#f-class', 'class'], ['#f-province', 'province'], ['#f-q', 'q']]) { const v = $(id).value.trim(); if (v) p.set(key, v); }
    const r = await getJSON('api/membership/members?' + p);
    $('#members tbody').innerHTML = r.items.map((m) => `<tr data-id="${m.id}">
      <td class="mono">${m.id}</td><td>${esc(m.name)}</td><td><span class="seg">${m.segment}</span></td><td>${m.class}</td>
      <td>${esc(m.city)}, ${esc(m.province)}</td><td class="num">${idr.format(m.contribution.total)}</td><td class="mono">${m.paidThrough}</td>
      <td><span class="badge ${m.status}">${STATUS_LABEL[m.status]}</span></td><td class="num">${m.arrearsMonths ? m.arrearsMonths + ' mo' : '–'}</td>
      <td class="num">${m.outstanding ? idr.format(m.outstanding) : '–'}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">No members match these filters.</td></tr>';
    const pages = Math.max(1, Math.ceil(r.total / r.pageSize));
    $('#pageinfo').textContent = `${num.format(r.total)} members · page ${r.page} of ${pages}`;
    $('#prev').disabled = r.page <= 1; $('#next').disabled = r.page >= pages;
  }

  async function openMember(id) {
    const m = await getJSON('api/membership/members/' + id);
    $('#drawer-body').innerHTML = `<div class="muted mono">${m.id}</div><h3>${esc(m.name)}</h3>
      <span class="badge ${m.status}">${STATUS_LABEL[m.status]}</span> <span class="seg">${m.segment}</span>
      <div class="kv"><div>Segment</div><div>${esc(m.segmentLabel)}</div><div>Payer</div><div>${esc(m.payer)}</div>
      <div>Inpatient class</div><div>Class ${m.class}</div><div>Location</div><div>${esc(m.city)}, ${esc(m.province)}</div>
      <div>Monthly contribution</div><div>${idr.format(m.contribution.total)}</div><div>Payment channel</div><div>${esc(m.channel)}</div>
      <div>Paid through</div><div class="mono">${m.paidThrough}</div><div>Coverage</div><div>${m.coverage}</div>
      <div>Arrears</div><div>${m.arrearsMonths} month(s)</div><div>Outstanding</div><div>${idr.format(m.outstanding)}</div></div>
      <div class="muted">Last 12 months</div>
      <div class="months">${m.history.map((h) => `<div class="m ${h.paid ? 'p' : 'u'}" title="${h.period}">${h.period.slice(5)}</div>`).join('')}</div>
      ${m.status === 'unpaid' ? '<p class="note">Coverage is inactive until all arrears are settled (max. 24 months billed). An inpatient service penalty may apply if the member is hospitalised within 45 days after reactivation.</p>' : ''}`;
    $('#drawer').hidden = false;
  }

  $('#members tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openMember(tr.dataset.id); });
  $('#drawer-close').addEventListener('click', () => { $('#drawer').hidden = true; });
  document.querySelectorAll('#status-chips .chip').forEach((c) => c.addEventListener('click', () => {
    document.querySelectorAll('#status-chips .chip').forEach((x) => x.classList.toggle('active', x === c));
    state.status = c.dataset.status; state.page = 1; loadMembers();
  }));
  for (const id of ['#f-segment', '#f-class', '#f-province']) $(id).addEventListener('change', () => { state.page = 1; loadMembers(); });
  let t; $('#f-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.page = 1; loadMembers(); }, 250); });
  $('#prev').addEventListener('click', () => { state.page -= 1; loadMembers(); });
  $('#next').addEventListener('click', () => { state.page += 1; loadMembers(); });

  // ---------- bed availability view ----------
  let bedTimer;
  function cell(b) {
    if (!b) return '<span class="cell na">n/a</span>';
    const cls = b.available === 0 ? 'full' : b.available / b.capacity < 0.2 ? 'low' : 'ok';
    return `<span class="cell ${cls}" title="${b.occupied} occupied of ${b.capacity}">${b.available}/${b.capacity}</span>`;
  }
  async function loadBeds() {
    clearTimeout(bedTimer);
    const p = new URLSearchParams();
    for (const [id, key] of [['#b-province', 'province'], ['#b-class', 'class'], ['#b-q', 'q']]) { const v = $(id).value.trim(); if (v) p.set(key, v); }
    if ($('#b-available').checked) p.set('available', '1');
    const [classes, summary, list] = await Promise.all([
      state.bedClasses.length ? state.bedClasses : getJSON('api/capacity/beds/classes'),
      getJSON('api/capacity/beds/summary?' + p), getJSON('api/capacity/hospitals?' + p)]);
    if (!state.bedClasses.length) {
      state.bedClasses = classes;
      $('#b-class').innerHTML += classes.map((c) => `<option value="${c.code}">${esc(c.label)}${c.local !== c.label ? ' (' + esc(c.local) + ')' : ''}</option>`).join('');
    }
    $('#tiles').innerHTML = summary.byClass.map((c) => {
      const free = c.capacity ? c.available / c.capacity : 0;
      const cls = free < 0.08 ? 'critical' : free < 0.2 ? 'tight' : '';
      return `<div class="tile ${cls}"><div class="t-label">${esc(c.label)}</div><div class="t-local">${esc(c.local)}</div>
        <div class="t-val">${num.format(c.available)}</div><div class="t-cap">free of ${num.format(c.capacity)} · ${c.hospitalsFull} full</div>
        <div class="bar"><span data-w="${Math.round(c.occupancyRate)}"></span></div></div>`;
    }).join('');
    // CSP-friendly: widths are applied through the CSSOM instead of inline style attributes.
    document.querySelectorAll('#tiles .bar > span').forEach((s) => { s.style.width = s.dataset.w + '%'; });
    $('#hospitals thead').innerHTML = `<tr><th>Hospital</th><th>Type</th><th>City</th>${state.bedClasses.map((c) => `<th class="num">${esc(c.label)}</th>`).join('')}<th>Updated</th></tr>`;
    $('#hospitals tbody').innerHTML = list.items.map((h) => {
      const by = new Map(h.beds.map((b) => [b.code, b]));
      const updated = h.beds.map((b) => b.updatedAt).sort().pop();
      return `<tr><td>${esc(h.name)}${h.krisReady ? '<span class="kris" title="Standard inpatient ward criteria met">KRIS</span>' : ''}</td>
        <td>${h.type} · ${esc(h.ownership)}</td><td title="${esc(h.province)}">${esc(h.city)}</td>
        ${state.bedClasses.map((c) => `<td class="num">${cell(by.get(c.code))}</td>`).join('')}
        <td class="mono">${new Date(updated).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })} WIB</td></tr>`;
    }).join('') || '<tr><td colspan="13" class="muted">No hospitals match these filters.</td></tr>';
    $('#beds-asof').textContent = `${list.total} hospitals · refreshed ${new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta' })} WIB · auto-refresh every 30 s`;
    bedTimer = setTimeout(() => { if (!$('#view-beds').hidden) loadBeds(); }, 30000);
  }
  for (const id of ['#b-province', '#b-class', '#b-available']) $(id).addEventListener('change', loadBeds);
  let tb; $('#b-q').addEventListener('input', () => { clearTimeout(tb); tb = setTimeout(loadBeds, 250); });

  loadMeta().catch(console.error);
  loadSummary().catch((e) => { $('#kpis').innerHTML = `<div class="card">Could not load data: ${esc(e.message)}</div>`; });
  loadMembers().catch(console.error);
})();
