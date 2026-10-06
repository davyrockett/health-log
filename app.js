'use strict';

const APP_VERSION = 'v2';

const $ = (id) => document.getElementById(id);
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const status = (msg) => { $('status').textContent = msg || ''; $('status').hidden = !msg; };
const sign = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±');

let weights = [], meds = [], loaded = false;
let editingMed = null, editingWeight = null, confirming = null;

$('w-date').value = today();
$('app-version').textContent = APP_VERSION;

/* ---------- Tabs ---------- */
const TABS = ['weight', 'meds', 'settings'];
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
    $('w-list').innerHTML = loaded ? `<div class="empty">No weigh-ins yet. Enter your weight and the date above, then press <b>Add weight</b>. A trend line appears once you have two entries.</div>` : '';
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

function delBtn(store, id) {
  if (confirming === store + ':' + id)
    return `<span class="confirm">Delete?<button class="link danger" data-confirm="${store}:${esc(id)}">Yes</button><button class="link" data-cancel>No</button></span>`;
  return `<button class="link" data-del="${store}:${esc(id)}">Delete</button>`;
}

function renderAll() {
  renderWeights();
  renderMeds();
  $('connect-banner').hidden = !(loaded && !sync.isOn() && !weights.length && !meds.length);
}

async function loadAll() {
  [weights, meds] = await Promise.all([db.getAll('weights'), db.getAll('meds')]);
  loaded = true;
  renderAll();
}

function resetMedForm() {
  editingMed = null;
  $('m-form').reset();
  $('m-submit').textContent = 'Add medication';
  $('m-cancel').hidden = true;
}
function resetWeightForm() {
  editingWeight = null;
  $('w-form').reset();
  $('w-date').value = today();
  $('w-submit').textContent = 'Add weight';
  $('w-cancel').hidden = true;
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
    $('m-submit').textContent = 'Save changes'; $('m-cancel').hidden = false;
    $('m-form').scrollIntoView({ block: 'nearest' });
    $('m-name').focus();
  }
  if (t.dataset.wedit) {
    const w = weights.find((x) => x.id === t.dataset.wedit); if (!w) return;
    editingWeight = w.id;
    $('w-lbs').value = w.lbs; $('w-date').value = w.date; $('w-note').value = w.note || '';
    $('w-submit').textContent = 'Save changes'; $('w-cancel').hidden = false;
    $('w-form').scrollIntoView({ block: 'nearest' });
    $('w-note').focus();
  }
});
$('m-cancel').addEventListener('click', resetMedForm);
$('w-cancel').addEventListener('click', resetWeightForm);

$('w-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const lbs = Math.round(parseFloat($('w-lbs').value) * 10) / 10;
  const date = $('w-date').value;
  const note = $('w-note').value.trim();
  if (!(lbs > 0) || !date) return;
  try {
    await db.put('weights', { id: editingWeight || newId(), lbs, date, note, updatedAt: new Date().toISOString() });
    if (editingWeight) resetWeightForm();
    else { $('w-lbs').value = ''; $('w-note').value = ''; }
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
