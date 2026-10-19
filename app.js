'use strict';

const APP_VERSION = 'v12';

const $ = (id) => document.getElementById(id);
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const status = (msg) => { $('status').textContent = msg || ''; $('status').hidden = !msg; };
const sign = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±');

let weights = [], meds = [], appts = [], heads = [], loaded = false;
let editingMed = null, editingWeight = null, editingAppt = null, editingHead = null, confirming = null;

$('w-date').value = today();
$('a-date').value = today();
$('app-version').textContent = APP_VERSION;

/* ---------- Tabs ---------- */
const TABS = ['weight', 'meds', 'appts', 'heads', 'settings'];
function showTab(name, remember = true) {
  if (!TABS.includes(name)) name = 'weight';
  for (const t of TABS) {
    $(t).hidden = t !== name;
    $('tab-' + t).setAttribute('aria-selected', String(t === name));
    $('tab-' + t).tabIndex = t === name ? 0 : -1;
  }
  if (remember) { try { localStorage.setItem('healthlog-tab', name); } catch (e) {} }
  if (name === 'settings') refreshFacts();
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) showTab(t.dataset.tab);
});
document.querySelector('.tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const i = TABS.indexOf(document.activeElement.dataset.tab);
  if (i < 0) return;
  const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
  showTab(next); $('tab-' + next).focus();
});

window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

/* ---------- Weight ---------- */
function renderWeights() {
  const sorted = [...weights].sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  $('w-meta').textContent = sorted.length ? `${sorted.length} ${sorted.length === 1 ? 'entry' : 'entries'} · lbs` : 'lbs';
  if (!sorted.length) {
    $('w-summary').innerHTML = '';
    $('w-list').innerHTML = loaded ? `<div class="empty">No weigh-ins yet. Tap <b>Add Weight</b> to log your first weigh-in. A trend line appears once you have two entries.</div>` : '';
    return;
  }
  const latest = sorted[0], first = sorted[sorted.length - 1];
  const change = latest.lbs - first.lbs;
  const lo = Math.min(...sorted.map((w) => w.lbs)), hi = Math.max(...sorted.map((w) => w.lbs));
  $('w-summary').innerHTML = `
    <div class="summary">
      <div class="stat"><div class="k">Latest · ${esc(fmtDate(latest.date))}</div><div class="v">${latest.lbs.toFixed(1)}<small>lbs</small></div></div>
      ${sorted.length > 1 ? `<div class="stat"><div class="k">Since ${esc(fmtDate(first.date))}</div><div class="v ${change > 0 ? 'delta up' : change < 0 ? 'delta down' : ''}" style="font-size:1.6rem">${sign(change)}${Math.abs(change).toFixed(1)}<small>lbs</small></div></div>
      <div class="stat"><div class="k">Range</div><div class="v">${lo.toFixed(1)}–${hi.toFixed(1)}<small>lbs</small></div></div>` : ''}
    </div>
    ${sorted.length > 1 ? chart([...sorted].reverse()) : ''}`;

  $('w-list').innerHTML = `<div class="tbl"><table>
    <thead><tr><th>Date</th><th>Weight</th><th>Change</th><th class="hide-sm">Note</th><th></th></tr></thead>
    <tbody>${sorted.map((w, i) => {
      const prev = sorted[i + 1];
      let d = '';
      if (prev) { const x = w.lbs - prev.lbs; d = `<span class="delta ${x > 0 ? 'up' : x < 0 ? 'down' : 'flat'}">${sign(x)}${Math.abs(x).toFixed(1)}</span>`; }
      return `<tr><td><span class="nw">${esc(fmtDate(w.date))}</span>${w.note ? `<span class="note-inline">${esc(w.note)}</span>` : ''}</td><td class="num">${w.lbs.toFixed(1)}</td><td>${d}</td><td class="note hide-sm">${esc(w.note || '')}</td><td class="act"><button class="link" data-wedit="${esc(w.id)}">Edit</button>${delBtn('weights', w.id)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function chart(pts) {
  const W = 700, H = 170, L = 44, R = 12, T = 12, B = 26;
  const ts = pts.map((p) => Date.parse(p.date));
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  let lo = Math.min(...pts.map((p) => p.lbs)), hi = Math.max(...pts.map((p) => p.lbs));
  const pad = Math.max(1, (hi - lo) * 0.15); lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad);
  const x = (t) => L + (t1 === t0 ? (W - L - R) / 2 : ((t - t0) / (t1 - t0)) * (W - L - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(ts[i]).toFixed(1)},${y(p.lbs).toFixed(1)}`).join('');
  const area = `${line}L${x(ts[ts.length - 1]).toFixed(1)},${H - B}L${x(ts[0]).toFixed(1)},${H - B}Z`;
  const ticks = [lo, (lo + hi) / 2, hi];
  const last = pts[pts.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend from ${esc(fmtDate(pts[0].date))} to ${esc(fmtDate(last.date))}">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 10) / 10}</text>`).join('')}
    <path d="${area}" fill="var(--accent-soft)" opacity="0.7"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${x(ts[i])}" cy="${y(p.lbs)}" r="${i === pts.length - 1 ? 4.5 : 2.5}" fill="var(--accent)"/>`).join('')}
    <text x="${L}" y="${H - 6}">${esc(fmtDate(pts[0].date))}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end">${esc(fmtDate(last.date))}</text>
  </svg>`;
}

/* ---------- Medications ---------- */
function renderMeds() {
  const t = today();
  const byName = (a, b) => a.name.localeCompare(b.name) || (b.started || '').localeCompare(a.started || '');
  const current = meds.filter((m) => !m.ended || m.ended > t).sort(byName);
  const past = meds.filter((m) => m.ended && m.ended <= t).sort((a, b) => b.ended.localeCompare(a.ended) || byName(a, b));
  $('m-meta').textContent = meds.length ? `${current.length} current · ${past.length} past` : '';
  if (!meds.length) {
    $('m-list').innerHTML = loaded ? `<div class="empty">No medications listed. Add each one with its dose, how often you take it, and when you started.</div>` : '';
    return;
  }
  const row = (m, isPast) => `<tr>
      <td class="med-name">${esc(m.name)}</td>
      <td class="num">${esc(m.dose)}</td>
      <td${isPast ? ' class="hide-sm"' : ''}><span class="pill${isPast ? ' past' : ''}">${esc(m.frequency)}</span></td>
      <td${isPast ? '' : ' class="hide-sm"'}>${isPast ? `<span class="nw">${esc(fmtDate(m.started))} –</span> <span class="nw">${esc(fmtDate(m.ended))}</span>` : `<span class="nw">${esc(fmtDate(m.started))}</span>`}</td>
      <td class="act"><button class="link" data-edit="${esc(m.id)}">Edit</button>${delBtn('meds', m.id)}</td>
    </tr>`;
  $('m-list').innerHTML = `
    <h3 class="sub">Current</h3>
    ${current.length ? `<div class="tbl"><table>
      <thead><tr><th>Medication</th><th>Dose</th><th>Frequency</th><th class="hide-sm">Started</th><th></th></tr></thead>
      <tbody>${current.map((m) => row(m, false)).join('')}</tbody></table></div>`
    : `<div class="empty">No current medications.</div>`}
    <h3 class="sub">Past</h3>
    ${past.length ? `<div class="tbl past-tbl"><table>
      <thead><tr><th>Medication</th><th>Dose</th><th class="hide-sm">Frequency</th><th>Taken</th><th></th></tr></thead>
      <tbody>${past.map((m) => row(m, true)).join('')}</tbody></table></div>`
    : `<div class="empty">Nothing here yet. To move a medication here, edit it and add the date you stopped taking it.</div>`}`;
}

/* ---------- Doctor's appointments ---------- */
// Upcoming ones (today or later) first, soonest at the top; then past ones, newest first.
function renderAppts() {
  const t = today();
  const upcoming = appts.filter((a) => a.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const past = appts.filter((a) => a.date < t).sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  $('a-meta').textContent = appts.length ? `${upcoming.length} upcoming · ${past.length} past` : '';
  if (!appts.length) {
    $('a-list').innerHTML = loaded ? `<div class="empty">No appointments yet. Add the date and the reason for the visit; you can fill in the results afterwards with <b>Edit</b>.</div>` : '';
    return;
  }
  const card = (a, isUpcoming) => `<div class="appt${isUpcoming ? ' upcoming' : ''}">
      <div class="appt-top"><span class="appt-date">${esc(fmtDate(a.date))}</span><span class="act"><button class="link" data-aedit="${esc(a.id)}">Edit</button>${delBtn('appts', a.id)}</span></div>
      <div class="appt-reason">${esc(a.reason)}</div>
      ${a.results ? `<p class="appt-results">${esc(a.results)}</p>` : `<p class="appt-results none">${isUpcoming ? 'Results can be added after the visit.' : 'No results added.'}</p>`}
    </div>`;
  $('a-list').innerHTML = `
    ${upcoming.length ? `<h3 class="sub">Upcoming</h3>${upcoming.map((a) => card(a, true)).join('')}` : ''}
    ${past.length ? `<h3 class="sub">Past</h3>${past.map((a) => card(a, false)).join('')}` : ''}`;
}

/* ---------- Headaches ---------- */
// A small calendar for choosing one or more days (up to today). One headache can cover several days.
let calSel = new Set(), calMonth = null;
function calPick(days) {
  calSel = new Set(days);
  const [y, m] = [...days].sort().at(-1).split('-').map(Number);
  calMonth = new Date(y, m - 1, 1);
  renderCal();
}
function renderCal() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth(), t = today();
  const pad = (n) => String(n).padStart(2, '0');
  const first = new Date(y, m, 1).getDay(), count = new Date(y, m + 1, 0).getDate();
  const nextOk = `${y}-${pad(m + 1)}-${pad(count)}` < t;
  let cells = '<span></span>'.repeat(first);
  for (let d = 1; d <= count; d++) {
    const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
    cells += `<button type="button" data-day="${iso}" aria-pressed="${calSel.has(iso)}"${iso > t ? ' disabled' : ''}${iso === t ? ' class="today"' : ''}>${d}</button>`;
  }
  $('h-cal').innerHTML = `<div class="cal-head">
      <button type="button" data-cal="-1" aria-label="Previous month">‹</button>
      <span>${calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
      <button type="button" data-cal="1" aria-label="Next month"${nextOk ? '' : ' disabled'}>›</button>
    </div>
    <div class="cal-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w) => `<span class="wd">${w}</span>`).join('')}${cells}</div>`;
  $('h-days-n').textContent = calSel.size > 1 ? `· ${calSel.size} chosen` : '';
}
$('h-cal').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.cal) calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + Number(b.dataset.cal), 1);
  if (b.dataset.day) { const d = b.dataset.day; calSel.has(d) ? calSel.delete(d) : calSel.add(d); }
  renderCal();
});
calPick([today()]);

// Newest first, with a count and average pain for the last 30 days.
const fmtTime = (s) => { if (!s) return ''; const [h, m] = s.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
// A headache's days (older entries have just `date`), and how to show them:
// runs of neighbouring days are joined, e.g. "Oct 17 – 19, 2026, Oct 22, 2026".
const hDays = (h) => (h.days && h.days.length ? h.days : [h.date]);
const lastDay = (h) => hDays(h).at(-1);
function fmtDays(days) {
  const next = (s) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(y, m - 1, d + 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const runs = [];
  for (const d of days) { const r = runs.at(-1); if (r && next(r[1]) === d) r[1] = d; else runs.push([d, d]); }
  const md = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  return runs.map(([a, b]) => (a === b ? fmtDate(a)
    : `${md(a)} – ${a.slice(0, 7) === b.slice(0, 7) ? Number(b.slice(8)) : md(b)}, ${b.slice(0, 4)}`)).join(', ');
}
function renderHeads() {
  const sorted = [...heads].sort((a, b) => lastDay(b).localeCompare(lastDay(a)) || (b.time || '').localeCompare(a.time || ''));
  $('h-meta').textContent = heads.length ? `${heads.length} logged` : '';
  if (!sorted.length) {
    $('h-summary').innerHTML = '';
    $('h-list').innerHTML = loaded ? `<div class="empty">No headaches logged. Tap <b>Add Headache</b> to log one: the date, how bad it was, and anything that might help spot a pattern.</div>` : '';
    return;
  }
  const d = new Date(); d.setDate(d.getDate() - 29); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  const from = d.toISOString().slice(0, 10);
  const recent = sorted.filter((x) => hDays(x).some((day) => day >= from && day <= today()));
  const avg = recent.length ? recent.reduce((s, x) => s + x.pain, 0) / recent.length : 0;
  $('h-summary').innerHTML = `<div class="summary">
      <div class="stat"><div class="k">Last 30 days</div><div class="v">${recent.length}<small>${recent.length === 1 ? 'headache' : 'headaches'}</small></div></div>
      ${recent.length ? `<div class="stat"><div class="k">Average pain</div><div class="v">${avg.toFixed(1)}<small>/ 10</small></div></div>` : ''}
      <div class="stat"><div class="k">Last one</div><div class="v" style="font-size:1.3rem">${esc(fmtDate(lastDay(sorted[0])))}</div></div>
    </div>`;
  $('h-list').innerHTML = sorted.map((h) => `<div class="appt">
      <div class="appt-top"><span class="appt-date">${esc(fmtDays(hDays(h)))}${h.time ? ` · ${esc(fmtTime(h.time))}` : ''}</span><span class="act"><button class="link" data-hedit="${esc(h.id)}">Edit</button>${delBtn('heads', h.id)}</span></div>
      <div class="appt-reason"><span class="pain p${Math.min(3, Math.ceil(h.pain / 3.4))}">Pain ${h.pain}/10</span>${h.duration ? ` <span class="muted">· ${esc(h.duration)}</span>` : ''}</div>
      ${h.medicine ? `<div>Medicine: ${esc(h.medicine)}</div>` : ''}
      ${h.note ? `<p class="appt-results">${esc(h.note)}</p>` : ''}
    </div>`).join('');
}

function delBtn(store, id) {
  if (confirming === store + ':' + id)
    return `<span class="confirm">Delete?<button class="link danger" data-confirm="${store}:${esc(id)}">Yes</button><button class="link" data-cancel>No</button></span>`;
  return `<button class="link" data-del="${store}:${esc(id)}">Delete</button>`;
}

function renderAll() {
  renderWeights();
  renderMeds();
  renderAppts();
  renderHeads();
  $('connect-banner').hidden = !(loaded && !sync.isOn() && !weights.length && !meds.length && !appts.length && !heads.length);
}

async function loadAll() {
  [weights, meds, appts, heads] = await Promise.all([db.getAll('weights'), db.getAll('meds'), db.getAll('appts'), db.getAll('heads')]);
  loaded = true;
  renderAll();
}

// Each tab shows only its Add button until you tap it (or Edit on a row).
function openForm(pre, focusId) {
  $(pre + '-open').parentElement.hidden = true;
  $(pre + '-form').hidden = false;
  $(pre + '-form').scrollIntoView({ block: 'nearest' });
  $(focusId).focus();
}
function closeForm(pre) {
  $(pre + '-form').hidden = true;
  $(pre + '-open').parentElement.hidden = false;
}

function resetMedForm() {
  editingMed = null;
  $('m-form').reset();
  $('m-submit').textContent = 'Save';
  closeForm('m');
}
function resetApptForm() {
  editingAppt = null;
  $('a-form').reset();
  $('a-date').value = today();
  $('a-submit').textContent = 'Save';
  closeForm('a');
}
function resetHeadForm() {
  editingHead = null;
  $('h-form').reset();
  calPick([today()]);
  $('h-submit').textContent = 'Save';
  closeForm('h');
}
function resetWeightForm() {
  editingWeight = null;
  $('w-form').reset();
  $('w-date').value = today();
  $('w-submit').textContent = 'Save';
  closeForm('w');
}

/* ---------- Editing ---------- */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.del) { confirming = t.dataset.del; renderAll(); return; }
  if (t.hasAttribute('data-cancel')) { confirming = null; renderAll(); return; }
  if (t.dataset.confirm) {
    const [store, id] = t.dataset.confirm.split(':');
    confirming = null;
    try { await db.remove(store, id); status(''); }
    catch (err) { status('Couldn’t delete that entry. Try again.'); }
    await loadAll();
    return;
  }
  if (t.dataset.edit) {
    const m = meds.find((x) => x.id === t.dataset.edit); if (!m) return;
    editingMed = m.id;
    $('m-name').value = m.name; $('m-dose').value = m.dose; $('m-freq').value = m.frequency;
    $('m-start').value = m.started || ''; $('m-end').value = m.ended || '';
    $('m-submit').textContent = 'Save changes';
    openForm('m', 'm-name');
  }
  if (t.dataset.aedit) {
    const a = appts.find((x) => x.id === t.dataset.aedit); if (!a) return;
    editingAppt = a.id;
    $('a-date').value = a.date; $('a-reason').value = a.reason; $('a-results').value = a.results || '';
    $('a-submit').textContent = 'Save changes';
    openForm('a', 'a-results');
  }
  if (t.dataset.hedit) {
    const h = heads.find((x) => x.id === t.dataset.hedit); if (!h) return;
    editingHead = h.id;
    calPick(hDays(h)); $('h-time').value = h.time || ''; $('h-pain').value = String(h.pain);
    $('h-dur').value = h.duration || ''; $('h-med').value = h.medicine || ''; $('h-note').value = h.note || '';
    $('h-submit').textContent = 'Save changes';
    openForm('h', 'h-note');
  }
  if (t.dataset.wedit) {
    const w = weights.find((x) => x.id === t.dataset.wedit); if (!w) return;
    editingWeight = w.id;
    $('w-lbs').value = w.lbs; $('w-date').value = w.date; $('w-note').value = w.note || '';
    $('w-submit').textContent = 'Save changes';
    openForm('w', 'w-note');
  }
});
$('m-cancel').addEventListener('click', resetMedForm);
$('w-cancel').addEventListener('click', resetWeightForm);
$('a-cancel').addEventListener('click', resetApptForm);
$('h-cancel').addEventListener('click', resetHeadForm);
$('w-open').addEventListener('click', () => { resetWeightForm(); openForm('w', 'w-lbs'); });
$('m-open').addEventListener('click', () => { resetMedForm(); openForm('m', 'm-name'); });
$('a-open').addEventListener('click', () => { resetApptForm(); openForm('a', 'a-date'); });
$('h-open').addEventListener('click', () => { resetHeadForm(); openForm('h', 'h-pain'); });

$('a-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { date: $('a-date').value, reason: $('a-reason').value.trim(), results: $('a-results').value.trim() };
  if (!body.date || !body.reason) return;
  try {
    await db.put('appts', { id: editingAppt || newId(), ...body, updatedAt: new Date().toISOString() });
    resetApptForm(); status('');
  } catch (err) { status('Couldn’t save that appointment. Try again.'); }
  await loadAll();
});

$('h-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const days = [...calSel].sort();
  const body = { time: $('h-time').value || '', pain: Number($('h-pain').value), duration: $('h-dur').value.trim(), medicine: $('h-med').value.trim(), note: $('h-note').value.trim() };
  if (!days.length) { status('Choose at least one day.'); return; }
  if (!(body.pain >= 1 && body.pain <= 10)) return;
  try {
    await db.put('heads', { id: editingHead || newId(), date: days[0], days, ...body, updatedAt: new Date().toISOString() });
    resetHeadForm(); status('');
  } catch (err) { status('Couldn’t save that headache. Try again.'); }
  await loadAll();
});

$('w-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const lbs = Math.round(parseFloat($('w-lbs').value) * 10) / 10;
  const date = $('w-date').value;
  const note = $('w-note').value.trim();
  if (!(lbs > 0) || !date) return;
  try {
    await db.put('weights', { id: editingWeight || newId(), lbs, date, note, updatedAt: new Date().toISOString() });
    resetWeightForm();
    status('');
  } catch (err) { status('Couldn’t save that weight. Try again.'); }
  await loadAll();
});

$('m-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { name: $('m-name').value.trim(), dose: $('m-dose').value.trim(), frequency: $('m-freq').value.trim(), started: $('m-start').value || '', ended: $('m-end').value || '' };
  if (!body.name || !body.dose || !body.frequency) return;
  if (body.started && body.ended && body.ended < body.started) { status('The end date is before the start date. Check the dates and try again.'); return; }
  try {
    await db.put('meds', { id: editingMed || newId(), ...body, updatedAt: new Date().toISOString() });
    resetMedForm(); status('');
  } catch (err) { status('Couldn’t save that medication. Try again.'); }
  await loadAll();
});

/* ---------- Sync (see sync.js) ---------- */
db.onChange = () => sync.soon();

function timeAgoText(iso) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  const days = Math.floor(mins / (24 * 60));
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function renderSync() {
  const on = sync.isOn();
  $('sync-on').hidden = !on;
  $('sync-off').hidden = on;
  const problem = on && ['auth', 'missing', 'other', 'conflict'].includes(sync.status);
  $('sync-dot').hidden = !problem;
  renderAll();
  if (!on) return;

  $('sync-repo').textContent = sync.repo();
  const el = $('sync-status');
  const last = sync.lastSynced();
  el.className = 'sync-status';
  if (sync.status === 'syncing') {
    el.textContent = 'Syncing…';
  } else if (sync.status === 'ok') {
    el.textContent = `✓ Up to date · synced ${timeAgoText(last)}`;
    el.classList.add('ok');
  } else if (sync.status === 'offline') {
    el.textContent = `Offline. Your changes are saved here and will sync when you’re back online.${last ? ` Last synced ${timeAgoText(last)}.` : ''}`;
  } else if (problem) {
    el.textContent = sync.message;
    el.classList.add('problem');
  } else {
    el.textContent = last ? `Last synced ${timeAgoText(last)}` : 'Not synced yet';
  }
}

sync.onStatus = renderSync;
sync.onUpdated = loadAll;

$('sync-off').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const err = $('sync-error');
  const repo = form.elements.repo.value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
  const token = form.elements.token.value.trim();
  err.hidden = true;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { err.textContent = 'The project should look like davyrockett/health-log-data.'; err.hidden = false; return; }
  if (!token) { err.textContent = 'Paste your access key.'; err.hidden = false; return; }

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Checking…';
  try {
    await sync.connect(repo, token);
    form.elements.token.value = '';
    renderSync();
    // Combine anything already on this device with the synced data.
    await sync.run('merge');
    if (sync.status === 'ok') showTab('weight');
  } catch (e) {
    err.textContent = e.message || 'Couldn’t connect.';
    err.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Connect';
  }
});

$('sync-now').addEventListener('click', () => sync.run());
$('sync-disconnect').addEventListener('click', () => { $('disconnect-confirm').hidden = false; });
$('disconnect-no').addEventListener('click', () => { $('disconnect-confirm').hidden = true; });
$('disconnect-yes').addEventListener('click', () => {
  $('disconnect-confirm').hidden = true;
  sync.disconnect();
});

// When to sync: on open, when you come back to the app, when the
// connection returns, and every 2 minutes while the app is on screen.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sync.run();
});
window.addEventListener('online', () => sync.run());
setInterval(() => {
  if (document.visibilityState === 'visible' && navigator.onLine) sync.run();
}, 2 * 60 * 1000);
setInterval(() => { if (sync.status === 'ok') renderSync(); }, 30 * 1000); // keep "synced 3 min ago" fresh

/* ---------- This device (Settings) ---------- */
function setFact(id, ok) {
  const el = $(id);
  el.textContent = ok ? 'Yes' : 'No';
  el.className = ok ? 'yes' : 'no';
}
function refreshFacts() {
  setFact('fact-installed', window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches);
  setFact('fact-offline', Boolean(navigator.serviceWorker && navigator.serviceWorker.controller));
}

/* ---------- Offline support (service worker) ---------- */
function showUpdateBanner(worker) {
  $('update-banner').hidden = false;
  $('update-btn').onclick = () => worker.postMessage('skipWaiting');
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.register('sw.js');

  // A new version was downloaded on an earlier visit and is waiting.
  if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(worker);
    });
  });

  // Once a new version takes over, reload to use it (not on the very first visit).
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { refreshFacts(); return; }
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  // Home Screen apps rarely restart, so check for updates when reopened.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) reg.update();
  });
}

/* ---------- Start ---------- */
let startTab = location.hash.slice(1);
if (!startTab) { try { startTab = localStorage.getItem('healthlog-tab'); } catch (e) {} }
showTab(startTab, false);
renderSync();
loadAll().then(() => sync.run());
registerServiceWorker();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
