/**
 * flyTrackersApp.js — "Culture & Activity Trackers" for the Drosophila project.
 * One overlay (#flyCulture, class flab) with two tabs:
 *   🍶 Cultures — vial/bottle culture log with a flip schedule (next-flip date + overdue
 *      status), one-tap "Flip" to reset the clock. localStorage: drosophila_cultures_v1.
 *   🪜 Activity — climbing / negative-geotaxis log (date · group · climbed/total → %),
 *      mean %, CSV export. localStorage: drosophila_activity_v1.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function addDays(dateStr, n) {
  const d = new Date((dateStr || todayStr()) + 'T00:00:00');
  d.setDate(d.getDate() + (Number(n) || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const daysFromToday = dateStr => Math.round((Date.parse(dateStr + 'T00:00:00') - Date.parse(todayStr() + 'T00:00:00')) / 86400000);

// ── Cultures ──────────────────────────────────────────────────────────────────
const CKEY = 'drosophila_cultures_v1';
function loadCultures() { try { const a = JSON.parse(localStorage.getItem(CKEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
function saveCultures(a) { localStorage.setItem(CKEY, JSON.stringify(a)); }
let cultures = loadCultures();

function flipStatus(c) {
  const next = addDays(c.lastFlip || c.start, c.interval);
  const d = daysFromToday(next);
  if (d < 0)  return { next, txt: `⚠ overdue ${-d} d`, color: '#f87171', bg: '#2a0808', bd: '#5b1d1d', sort: d };
  if (d === 0) return { next, txt: '● flip today', color: '#fbbf24', bg: '#2a2105', bd: '#7c5e1a', sort: 0 };
  return { next, txt: `in ${d} d`, color: '#34d399', bg: '#052e22', bd: '#16734f', sort: d };
}

function cultureCard(c) {
  const s = flipStatus(c);
  return `<div style="background:#0f1623;border:1px solid #1e2a3a;border-radius:11px;padding:11px 12px;margin-bottom:9px">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:800;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name || 'culture')}</div>
        <div style="font-size:10.5px;color:#94a3b8">${esc(c.vessel || 'vial')} · ${esc(c.food || 'standard food')}</div>
      </div>
      <span style="font-size:10px;font-weight:800;color:${s.color};background:${s.bg};border:1px solid ${s.bd};border-radius:9px;padding:3px 8px;white-space:nowrap">${s.txt}</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:7px;font-size:10.5px;color:#64748b">
      <span>Started <b style="color:#cbd5e1">${esc(c.start)}</b></span>
      <span>Last flip <b style="color:#cbd5e1">${esc(c.lastFlip || c.start)}</b></span>
      <span>Every <b style="color:#cbd5e1">${esc(c.interval)} d</b></span>
      <span>Next <b style="color:#cbd5e1">${esc(s.next)}</b></span>
    </div>
    <div style="display:flex;gap:7px;margin-top:9px">
      <button data-flip="${esc(c.id)}" style="font-size:11px;font-weight:700;background:#00d4aa;border:none;color:#04201a;border-radius:7px;padding:6px 12px;cursor:pointer;width:auto;min-height:unset">✓ Flip today</button>
      <span style="flex:1"></span>
      <button data-cdel="${esc(c.id)}" style="font-size:11px;background:#2a0808;border:1px solid #5b1d1d;color:#f87171;border-radius:7px;padding:6px 10px;cursor:pointer;width:auto;min-height:unset">🗑</button>
    </div>
  </div>`;
}

function openAddCulture() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1600;display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(4px);overflow-y:auto';
  const inStyle = 'width:100%;padding:9px;border-radius:8px;background:#0f172a;border:1px solid #2d3748;color:#e2e8f0;font-size:13px;box-sizing:border-box';
  const fld = (id, label, ph, type = 'text', val = '') =>
    `<label style="display:block;font-size:11px;color:#94a3b8;margin:8px 0 2px">${label}</label>
     <input id="${id}" type="${type}" placeholder="${ph}" value="${val}" style="${inStyle}">`;
  // Name dropdown from the Stock Collection; Food dropdown from the available recipes.
  const stocks = (typeof window.DrosoAllStocks === 'function') ? window.DrosoAllStocks() : [];
  const foods = (Array.isArray(window.DrosoFoods) && window.DrosoFoods.length) ? window.DrosoFoods : ['Cornmeal–Molasses Food', 'Cornmeal–Dextrose Food'];
  const stockOpts = ['<option value="">— select a stock —</option>',
    ...stocks.map(s => `<option value="${esc(s.name)}">${esc(s.name)}${s.genotype ? ' — ' + esc(s.genotype) : ''}</option>`),
    '<option value="__other__">✏️ Other / type manually…</option>'].join('');
  const foodOpts = [...foods.map(f => `<option value="${esc(f)}">${esc(f)}</option>`),
    '<option value="__other__">✏️ Other / type manually…</option>'].join('');
  const selOther = (id, label, opts, ph) =>
    `<label style="display:block;font-size:11px;color:#94a3b8;margin:8px 0 2px">${label}</label>
     <select id="${id}" style="${inStyle}">${opts}</select>
     <input id="${id}Other" type="text" placeholder="${ph}" style="${inStyle};margin-top:6px;display:none">`;
  overlay.innerHTML = `
    <div style="background:#111827;border:1px solid #1e2a3a;border-radius:16px;padding:20px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.8);margin:auto">
      <div style="font-size:15px;font-weight:700;color:#00d4aa;margin-bottom:8px">➕ New culture</div>
      ${selOther('cuName', 'Name / genotype <span style="color:#f87171">*</span>', stockOpts, 'type a name / genotype')}
      <label style="display:block;font-size:11px;color:#94a3b8;margin:8px 0 2px">Vessel</label>
      <select id="cuVessel" style="${inStyle}">
        <option>vial</option><option>bottle</option></select>
      ${selOther('cuFood', 'Food', foodOpts, 'type a food')}
      ${fld('cuStart', 'Start date', 'date', 'date', todayStr())}
      ${fld('cuInt', 'Flip every (days)', 'e.g. 14 (bottle) / 21 (vial)', 'number', '14')}
      <div style="display:flex;gap:10px;margin-top:16px">
        <button id="cuCancel" style="flex:1;padding:11px;border-radius:8px;background:#1e2a3a;border:1px solid #2d3748;color:#94a3b8;font-size:13px;font-weight:600;cursor:pointer;min-height:44px">Cancel</button>
        <button id="cuSave" style="flex:1;padding:11px;border-radius:8px;background:#00d4aa;border:none;color:#000;font-size:13px;font-weight:700;cursor:pointer;min-height:44px">Add</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const v = id => overlay.querySelector('#' + id).value.trim();
  const close = () => overlay.remove();
  // Reveal the free-text field only when "Other" is chosen.
  const wireOther = id => { const s = overlay.querySelector('#' + id), t = overlay.querySelector('#' + id + 'Other'); s.onchange = () => { const o = s.value === '__other__'; t.style.display = o ? 'block' : 'none'; if (o) t.focus(); }; };
  wireOther('cuName'); wireOther('cuFood');
  const pick = id => { const s = overlay.querySelector('#' + id).value; return s === '__other__' ? overlay.querySelector('#' + id + 'Other').value.trim() : s; };
  overlay.querySelector('#cuCancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#cuSave').onclick = () => {
    const name = pick('cuName'); if (!name) { overlay.querySelector('#cuName').focus(); return; }
    const start = v('cuStart') || todayStr();
    cultures.push({ id: 'c_' + Date.now().toString(36), name, vessel: v('cuVessel') || 'vial', food: pick('cuFood') || 'standard food', start, lastFlip: start, interval: Number(v('cuInt')) || 14 });
    saveCultures(cultures); close(); renderCultures();
  };
}

function renderCultures() {
  const root = document.getElementById('flcCultures');
  if (!root) return;
  const list = [...cultures].sort((a, b) => flipStatus(a).sort - flipStatus(b).sort);
  const due = list.filter(c => flipStatus(c).sort <= 0).length;
  root.innerHTML = `
    <div class="le-intro">Track each fly culture and when it needs flipping to fresh food. Vials are usually flipped ~every 2–3 weeks, bottles ~every 1–2 weeks (sooner if crowded/wet). Tap <b>Flip today</b> when you transfer it.</div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
      <button id="btnAddCulture" style="background:var(--accent,#00d4aa);color:#04201a;border:none;border-radius:9px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;width:auto">➕ Add culture</button>
      ${due ? `<span style="font-size:11px;font-weight:700;color:#fbbf24">${due} need${due > 1 ? '' : 's'} flipping</span>` : (list.length ? `<span style="font-size:11px;color:#34d399">all on schedule</span>` : '')}
    </div>
    ${list.length ? list.map(cultureCard).join('') : '<div style="font-size:12px;color:#64748b;text-align:center;padding:24px">No cultures yet — add one to start tracking the flip schedule.</div>'}`;
  root.querySelector('#btnAddCulture').onclick = openAddCulture;
  root.querySelectorAll('[data-flip]').forEach(b => b.onclick = () => { const c = cultures.find(x => x.id === b.dataset.flip); if (c) { c.lastFlip = todayStr(); saveCultures(cultures); renderCultures(); } });
  root.querySelectorAll('[data-cdel]').forEach(b => b.onclick = () => { cultures = cultures.filter(x => x.id !== b.dataset.cdel); saveCultures(cultures); renderCultures(); });
}

// ── Activity (climbing) log ─────────────────────────────────────────────────────
const AKEY = 'drosophila_activity_v1';
function loadActivity() { try { const a = JSON.parse(localStorage.getItem(AKEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
function saveActivity(a) { localStorage.setItem(AKEY, JSON.stringify(a)); }
let activity = loadActivity();

function renderActivity() {
  const root = document.getElementById('flcActivity');
  if (!root) return;
  const pcts = [];
  const rows = activity.map((r, i) => {
    const cl = Number(r.climbed) || 0, t = Number(r.total) || 0, pct = t ? cl / t * 100 : null;
    if (pct != null) pcts.push(pct);
    return `<tr>
      <td><input class="trk-in" data-act="${i}:date" type="date" value="${esc(r.date || '')}"></td>
      <td><input class="trk-in" data-act="${i}:group" type="text" placeholder="genotype/group" value="${esc(r.group || '')}"></td>
      <td><input class="trk-in trk-num" data-act="${i}:climbed" type="number" min="0" value="${esc(r.climbed ?? '')}"></td>
      <td><input class="trk-in trk-num" data-act="${i}:total" type="number" min="0" value="${esc(r.total ?? '')}"></td>
      <td class="trk-alive">${pct == null ? '—' : pct.toFixed(0) + '%'}</td>
      <td><button class="trk-del" data-adel="${i}" type="button">✕</button></td>
    </tr>`;
  }).join('');
  const mean = pcts.length ? pcts.reduce((s, x) => s + x, 0) / pcts.length : null;
  root.innerHTML = `
    <div class="le-intro">Log climbing / negative-geotaxis trials (% of flies passing the line). One row per trial or per group; see the Experiments tab for the full assay protocol.</div>
    <div class="trk">
      <div class="trk-top">% climbed = climbed ÷ total × 100 <span class="trk-sum">${mean == null ? '' : `mean ${mean.toFixed(0)}% (n=${pcts.length})`}</span></div>
      <table class="trk-tbl"><thead><tr><th>Date</th><th>Group</th><th>Climbed</th><th>Total</th><th>%</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="trk-empty">No trials logged yet.</td></tr>'}</tbody></table>
      <div class="trk-act">
        <button class="trk-add" id="btnAddAct" type="button">➕ Add trial</button>
        ${activity.length ? `<button class="trk-csv" id="btnActCsv" type="button">⬇ Download results (CSV)</button>` : ''}
      </div>
    </div>`;
  root.querySelector('#btnAddAct').onclick = () => { activity.push({ date: todayStr(), group: '', climbed: '', total: '' }); saveActivity(activity); renderActivity(); };
  root.querySelectorAll('[data-act]').forEach(inp => inp.onchange = () => {
    const [i, f] = inp.dataset.act.split(':');
    if (activity[i]) { activity[i][f] = (f === 'date' || f === 'group') ? inp.value : (inp.value === '' ? '' : Number(inp.value)); saveActivity(activity); if (f !== 'date' && f !== 'group') renderActivity(); }
  });
  root.querySelectorAll('[data-adel]').forEach(b => b.onclick = () => { activity.splice(b.dataset.adel, 1); saveActivity(activity); renderActivity(); });
  const csv = root.querySelector('#btnActCsv');
  if (csv) csv.onclick = () => {
    const lines = [['date', 'group', 'climbed', 'total', 'percent'].join(',')];
    activity.forEach(r => { const cl = Number(r.climbed) || 0, t = Number(r.total) || 0; lines.push([r.date || '', (r.group || '').replace(/,/g, ' '), r.climbed ?? '', r.total ?? '', t ? (cl / t * 100).toFixed(1) : ''].join(',')); });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'drosophila_activity.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}

function init() {
  const fc = document.getElementById('flyCulture');
  if (!fc) return;
  fc.querySelectorAll('.le-tab').forEach(t => t.addEventListener('click', () => {
    fc.querySelectorAll('.le-tab').forEach(x => x.classList.toggle('active', x === t));
    fc.querySelectorAll('.le-view').forEach(v => v.classList.toggle('active', v.id === t.dataset.letab));
  }));
  fc.querySelector('.le-home')?.addEventListener('click', () => {
    fc.style.display = 'none';
    if (typeof window.WormTraceShowDrosoHome === 'function') window.WormTraceShowDrosoHome();
    else { const h = document.getElementById('homeScreen'); if (h) h.style.display = 'flex'; }
  });
  renderCultures();
  renderActivity();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
