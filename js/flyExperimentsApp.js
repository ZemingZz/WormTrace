/**
 * flyExperimentsApp.js — "Experiments & Procedures" for the Drosophila project.
 * Parallel to experimentsApp.js (worms) but fully isolated: own overlay (#flyExp),
 * own localStorage keys (fly_*), own data. Two top tabs: Experiments & Procedures.
 * Recipes are SCALABLE (pick a batch volume → ingredients rescale); checklists,
 * timers and trackers persist in localStorage. Content is sourced from BDSC food
 * recipes and published assay protocols (see each card's Source link).
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const PKEY = id => `fly_proc_${id}`;
const loadChecks = id => { try { return new Set(JSON.parse(localStorage.getItem(PKEY(id)) || '[]')); } catch { return new Set(); } };
const saveChecks = (id, set) => localStorage.setItem(PKEY(id), JSON.stringify([...set]));

const VKEY = id => `fly_procvol_${id}`;

// ── Daily tracker storage ──
const TKEY = id => `fly_track_${id}`;
function loadTrack(id) { try { const r = JSON.parse(localStorage.getItem(TKEY(id)) || '{}'); return { n0: r.n0 ?? '', rows: Array.isArray(r.rows) ? r.rows : [] }; } catch { return { n0: '', rows: [] }; } }
function saveTrack(id, t) { localStorage.setItem(TKEY(id), JSON.stringify(t)); }
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function fmt(n) {
  const a = Math.abs(n);
  if (a === 0) return '0';
  if (a >= 100) return String(Math.round(n));
  if (a >= 10)  return String(Math.round(n * 10) / 10);
  if (a >= 1)   return String(Math.round(n * 100) / 100);
  return String(Math.round(n * 1000) / 1000);
}
const fmtVol = ml => ml >= 1000 ? `${fmt(ml / 1000)} L` : `${fmt(ml)} mL`;

// ── Drosophila bench protocols. `materials` amounts are per `baseVol` mL and scale
//    linearly with the chosen batch volume. {toVol} = "top up to volume". ──
const PROCEDURES = [
  {
    id: 'molassesfood', icon: '🍶', title: 'Cornmeal–Molasses Food', tag: 'Standard fly medium',
    purpose: 'Standard cornmeal/molasses/yeast medium for rearing Drosophila in vials and bottles.',
    baseVol: 1000, volNoun: 'molasses food', presets: [250, 500, 1000, 2000],
    firmness: { min: 4, max: 10, def: 6, step: 0.5 },     // agar g/L
    timer: { label: 'Autoclave/cook', min: 25 },
    plates: { def: 10, waste: 0.05, presets: [{ label: 'vial (10 mL)', ml: 10 }, { label: 'bottle (50 mL)', ml: 50 }] },
    materials: [
      { firm: true, unit: 'g', name: 'agar' },
      { amt: 61.3, unit: 'g', name: 'yellow cornmeal' },
      { amt: 12.4, unit: 'g', name: 'inactive (nutritional) yeast' },
      { amt: 75, unit: 'mL', name: 'molasses' },
      { toVol: true, name: 'deionized water' },
      { amt: 14.3, unit: 'mL', name: '10% Tegosept (methylparaben in 95% ethanol)' },
    ],
    steps: [
      'Mix the agar, cornmeal and yeast into most of the DI water in a pot/kettle; stir.',
      'Add the molasses and bring to the boil while stirring (or autoclave) so the agar fully dissolves — start the timer.',
      'Simmer/cook ~15–20 min, stirring so it does not scorch on the bottom.',
      'Cool to ~60 °C (so the mold inhibitor is not boiled off).',
      'Add the 10% Tegosept (and propionic acid if your lab uses it — see note); stir well.',
      'Dispense ~10 mL per vial or ~50 mL per bottle while still molten.',
      'Let set uncovered until firm, then plug; cool fully before storing.',
      'Store at 4 °C; let vials reach room temperature before adding flies. Use within ~2–3 weeks.',
    ],
    notes: 'BDSC molasses recipe scaled to per-litre. Many labs also add ~3–6 mL/L propionic acid as an extra mold/bacteria inhibitor (BDSC uses Tegosept alone). Add inhibitors AFTER cooling below ~60 °C. Watch for mites and mold; toss contaminated food.',
    source: { name: 'Cornmeal, Molasses & Yeast Medium — Bloomington Drosophila Stock Center', url: 'https://bdsc.indiana.edu/information/recipes/molassesfood.html' },
  },
  {
    id: 'dextrosefood', icon: '🌽', title: 'Cornmeal–Dextrose Food', tag: 'Alt. fly medium (no molasses)',
    purpose: 'Cornmeal/dextrose/yeast medium — a defined-sugar alternative to molasses food.',
    baseVol: 1000, volNoun: 'dextrose food', presets: [250, 500, 1000, 2000],
    firmness: { min: 4, max: 10, def: 5.2, step: 0.2 },
    timer: { label: 'Autoclave/cook', min: 25 },
    plates: { def: 10, waste: 0.05, presets: [{ label: 'vial (10 mL)', ml: 10 }, { label: 'bottle (50 mL)', ml: 50 }] },
    materials: [
      { firm: true, unit: 'g', name: 'agar' },
      { amt: 90.9, unit: 'g', name: 'cornmeal' },
      { amt: 147, unit: 'g', name: 'dextrose' },
      { amt: 18.2, unit: 'g', name: "brewer's yeast" },
      { toVol: true, name: 'deionized water' },
      { amt: 16.2, unit: 'mL', name: '10% p-hydroxybenzoic acid methyl ester in 95% ethanol (Tegosept)' },
      { amt: 22.7, unit: 'mL', name: '1.5% benzyl benzoate in 95% ethanol' },
    ],
    steps: [
      'Combine agar, cornmeal, dextrose and yeast with most of the DI water; stir.',
      'Heat to boiling (or autoclave) to dissolve the agar — start the timer; stir to prevent scorching.',
      'Cook ~15–20 min; top up to the final volume with DI water.',
      'Cool to ~60 °C.',
      'Add the Tegosept and benzyl benzoate solutions; mix well.',
      'Dispense ~10 mL/vial or ~50 mL/bottle; let set, then plug.',
      'Store at 4 °C; warm to room temp before use.',
    ],
    notes: 'BDSC cornmeal/dextrose recipe scaled to per-litre. Dextrose food gives reproducible sugar content (useful for diet/aging studies). Add mold inhibitors only after cooling below ~60 °C.',
    source: { name: 'Cornmeal, Dextrose & Yeast Medium — Bloomington Drosophila Stock Center', url: 'https://bdsc.indiana.edu/information/recipes/dextrosefood.html' },
  },
  {
    id: 'co2', icon: '😴', title: 'CO₂ Anesthesia & Fly Handling', tag: 'Sorting under the scope',
    purpose: 'Anesthetize adult flies with CO₂ so they can be sorted, sexed and counted under a dissecting scope without harm.',
    materials: [
      'CO₂ source + regulator and a porous "fly pad" (and/or a blowgun for knock-down)',
      'Dissecting microscope and a soft brush or featherweight forceps',
      'A "fly morgue" (vial of 70% ethanol/oil) for discarding unwanted flies',
      'Fresh food vials/bottles to return sorted flies to',
    ],
    steps: [
      'Tap flies to the bottom of the vial, then invert over the CO₂ blowgun/pad to knock them down.',
      'Tip the anesthetized flies onto the CO₂ pad (keep a gentle CO₂ flow so they stay under).',
      'Work promptly — sort/sex/count with a soft brush; minimize total time under CO₂.',
      'Sex by external features: males are smaller with a dark, rounded abdomen tip + sex combs on the forelegs; females are larger with a pointed, banded abdomen.',
      'Return wanted flies to fresh food; place the vial on its SIDE until they wake (so they do not stick to the food).',
      'Discard unwanted flies in the morgue.',
      'Avoid prolonged/repeated CO₂ on flies you will assay (it can affect behavior/physiology) — use the minimum needed.',
    ],
    notes: 'Long CO₂ exposure (minutes) can impair behavior, fertility and lifespan readouts — keep exposures short, especially for flies entering an assay. Light CO₂ is gentler than ice or ether for routine sorting.',
    source: { name: 'Working with Drosophila / fly handling — Bloomington Drosophila Stock Center', url: 'https://bdsc.indiana.edu/information/care.html' },
  },
  {
    id: 'cross', icon: '⚥', title: 'Setting Up a Genetic Cross', tag: 'Virgins & matings',
    purpose: 'Cross two genotypes by mating virgin females to males — the basis of Drosophila genetics (GAL4/UAS, balancing, mapping).',
    materials: [
      'Virgin females of one genotype (see step 1) + males of the other',
      'Fresh food vials/bottles; CO₂ setup (see CO₂ Anesthesia procedure)',
      'Incubator at 25 °C (18 °C to slow development, 29 °C to boost GAL4/UAS expression)',
    ],
    steps: [
      'Collect VIRGIN females: clear adults from the stock, then collect newly-eclosed females within ~8 h at 25 °C (or ~16–18 h at 18 °C) — females cannot mate that early.',
      'Hold candidate virgins a few days; discard the vial if any larvae appear (means a non-virgin slipped in).',
      'Set the cross: put ~5–10 virgin females + ~3–5 males of the other genotype into a fresh vial (more in a bottle).',
      'Label with both genotypes, the date and your initials; incubate at 25 °C.',
      'Flip the parents to fresh food every 2–3 days to keep density reasonable and get more progeny.',
      'Remove (clear) the parents before their progeny eclose so you do not confuse generations.',
      'Score/collect F1 progeny by the expected marker phenotypes.',
    ],
    notes: 'GAL4/UAS expression is temperature-sensitive — 29 °C drives stronger expression, 18 °C is weaker. Develop­ment time ≈ 10 days egg→adult at 25 °C (about double at 18 °C). Always confirm virginity before relying on a cross.',
    source: { name: 'Fly pushing / setting up crosses — Bloomington Drosophila Stock Center', url: 'https://bdsc.indiana.edu/information/care.html' },
  },
];

// ── Experiments (full assays). Same card shape, no volume scaling. ──
const EXPERIMENTS = [
  {
    id: 'flylifespan', icon: '📈', title: 'Lifespan / Longevity Assay', tag: 'Survival / aging',
    purpose: 'Measure adult Drosophila survival over time to compare longevity between genotypes or diets (Kaplan–Meier).',
    params: [
      'Density: house ~25–30 flies per vial — crowding shortens life and confounds results.',
      'Sexes: assay males and females SEPARATELY (different lifespans); start from age-matched adults.',
      'n: ≥100 flies per genotype/sex across replicate vials; always run a matched control genotype.',
      'Temperature: keep constant (25 °C common; 18 °C lengthens, 29 °C shortens lifespan).',
      'Transfers: flip to fresh food every 2–3 days (more often on rich/wet food); score at each flip.',
      'Diet: keep food batch/formulation identical across groups (diet strongly affects lifespan).',
    ],
    materials: [
      'Age-matched adult flies, sexed (collect as virgins/young adults under light CO₂)',
      'Fresh food vials (see the Cornmeal–Molasses or –Dextrose Food procedure)',
      'CO₂ setup for the initial sort; thereafter transfer WITHOUT anesthesia by tapping',
      '25 °C incubator (constant temperature & humidity)',
      'Scoring sheet or software (e.g. OASIS/GraphPad) for survival curves',
    ],
    tracker: true,
    steps: [
      'Collect age-matched adults; sort by sex under light CO₂ and let them recover ~1–2 days.',
      'Distribute ~25–30 same-sex flies per vial; record the starting count per vial (Day 0).',
      'Incubate at a constant temperature (e.g. 25 °C); keep all groups in the same conditions.',
      'Every 2–3 days, tap flies into a fresh vial WITHOUT anesthesia (CO₂ at every flip would bias the assay).',
      'At each transfer, score and record deaths; a fly is dead if it does not move when the vial is tapped/prodded.',
      'Censor (remove from the denominator) flies that escape or are killed accidentally (e.g. stuck in food).',
      'Watch for and discard contaminated (mold/bacteria) vials — note them as censored.',
      'Continue until all flies are dead or censored.',
      'Plot a Kaplan–Meier survival curve; compare with the log-rank (Mantel–Cox) test; report median lifespan, n, replicates and p-value.',
    ],
    notes: 'Diet, density, temperature, humidity and mating status all shift lifespan — hold them constant and report them. Avoid CO₂ during the assay (use it only for the initial sort). Always include a matched control genotype run in parallel.',
    source: { name: 'Linford et al. (2013) Measurement of Lifespan in Drosophila melanogaster — JoVE 71:50068', url: 'https://www.jove.com/t/50068' },
  },
  {
    id: 'climbing', icon: '🪜', title: 'Climbing Assay (negative geotaxis / RING)', tag: 'Locomotor / aging',
    purpose: 'Quantify locomotor ability and its age-related decline: startled flies climb upward (negative geotaxis); score the fraction passing a set height in a set time.',
    params: [
      'Group ~10–20 flies per vial/tube; assay several replicate groups per genotype.',
      'Mark a pass line at a set height (e.g. 8 cm) up a clear empty vial/tube.',
      'Let flies acclimate ~10–20 min in the assay tube; assay at a fixed time of day.',
      'Tap all flies to the bottom, then time: count how many cross the line within the cutoff (e.g. 10 s).',
      'RING variant: photograph all tubes ~3 s after the tap and measure the height each fly reached.',
      'Do ~3 trials per group with ~1 min rest between; average them.',
    ],
    materials: [
      'Clear empty vials/tubes with a pass line marked at a set height',
      'A multi-vial rack or RING apparatus + camera (for the imaged variant)',
      'Stopwatch/timer; the flies under test (avoid CO₂ just before assaying)',
    ],
    steps: [
      'Transfer flies into clear assay tubes (~10–20 per tube) WITHOUT CO₂; let them acclimate ~10–20 min.',
      'Briskly tap all tubes down on the bench so every fly is knocked to the bottom.',
      'Start timing; after the cutoff (e.g. 10 s) count how many flies have climbed above the pass line.',
      'Record climbed vs total for that trial in the tracker (% climbed).',
      'Rest ~1 min, then repeat for ~3 trials and average per group.',
      '(RING variant) instead photograph all tubes ~3 s after the tap and measure climbing height per fly.',
      'Compare genotypes/ages; locomotor performance declines with age, so include age-matched controls.',
    ],
    notes: 'Standardize tap force, tube geometry, height, cutoff time and time-of-day — the readout is sensitive to all of them. Avoid CO₂ shortly before testing (it depresses climbing). The RING (Rapid Iterative Negative Geotaxis) method assays many tubes at once by photographing height climbed.',
    tracker: 'pct',
    source: { name: 'Gargano et al. (2005) RING negative-geotaxis — Exp. Gerontol.; Nichols et al. (2012) Methods in Drosophila locomotor assays — JoVE 61:3795', url: 'https://www.jove.com/t/3795' },
  },
];

const findProc = id => PROCEDURES.find(p => p.id === id) || EXPERIMENTS.find(p => p.id === id);

// Shared with the Culture tracker: the available fly-food recipes (for its Food dropdown).
window.DrosoFoods = PROCEDURES.filter(p => p.plates).map(p => p.title);

// ── Per-procedure countdown timers ──
const timers = {};
const timerInts = {};
let alarmInt = null, audioCtx = null;
const fmtTime = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
const defMin = id => (findProc(id)?.timer?.min) || 5;
function getTimer(p) {
  if (!timers[p.id]) { const s = (p.timer.min || 5) * 60; timers[p.id] = { total: s, remaining: s, running: false, done: false }; }
  return timers[p.id];
}
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'square'; o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4);
    o.start(); o.stop(audioCtx.currentTime + 0.42);
  } catch (e) { /* audio unavailable */ }
}
function startAlarm() { stopAlarm(); let n = 0; beep(); alarmInt = setInterval(() => { beep(); if (++n > 60) stopAlarm(); }, 750); }
function stopAlarm() { if (alarmInt) { clearInterval(alarmInt); alarmInt = null; } }
function syncTimerUI(id) {
  const t = timers[id]; if (!t) return;
  const d = document.getElementById('ptd-' + id); if (!d) return;
  d.textContent = t.done ? '⏰ Time’s up!' : fmtTime(t.remaining);
  d.classList.toggle('done', t.done);
  const b = document.getElementById('ptb-' + id);
  if (b) b.textContent = t.running ? '⏸ Pause' : (!t.done && t.remaining < t.total ? '▶ Resume' : '▶ Start');
}
function tTick(id) {
  const t = timers[id];
  if (t.remaining > 0) t.remaining--;
  if (t.remaining <= 0 && !t.done) { t.done = true; t.running = false; clearInterval(timerInts[id]); timerInts[id] = null; startAlarm(); }
  syncTimerUI(id);
}
function tStart(id) {
  const t = timers[id]; if (t.running || t.done) return;
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume?.(); } catch (e) {}
  t.running = true; timerInts[id] = setInterval(() => tTick(id), 1000); syncTimerUI(id);
}
function tPause(id) { const t = timers[id]; t.running = false; if (timerInts[id]) { clearInterval(timerInts[id]); timerInts[id] = null; } syncTimerUI(id); }
function tReset(id, mins) { tPause(id); stopAlarm(); const t = timers[id]; t.total = Math.max(1, Math.round(mins * 60)); t.remaining = t.total; t.done = false; syncTimerUI(id); }

const openSet = new Set();
const volOf = p => { const v = parseFloat(localStorage.getItem(VKEY(p.id))); return (v && v > 0) ? v : p.baseVol; };
const setVol = (id, v) => localStorage.setItem(VKEY(id), String(v));
const PLKEY = id => `fly_procplate_${id}`;
const loadPlateMl = p => { const v = parseFloat(localStorage.getItem(PLKEY(p.id))); return (v && v > 0) ? v : (p.plates ? p.plates.def : 10); };
const setPlateMl = (id, v) => localStorage.setItem(PLKEY(id), String(v));
const FKEY = id => `fly_procfirm_${id}`;
const firmOf = p => { const v = parseFloat(localStorage.getItem(FKEY(p.id))); return (v && v > 0) ? v : (p.firmness ? p.firmness.def : 6); };
const setFirm = (id, v) => localStorage.setItem(FKEY(id), String(v));
const firmLabel = f => f < 5.5 ? 'soft' : f < 7 ? 'standard' : f < 8.5 ? 'firm' : 'very firm';

// Jump to a procedure: switch to Procedures tab, expand it, scroll to it.
function gotoProc(id) {
  const le = document.getElementById('flyExp'); if (!le) return;
  le.querySelectorAll('.le-tab').forEach(t => t.classList.toggle('active', t.dataset.letab === 'fleProcedures'));
  le.querySelectorAll('.le-view').forEach(v => v.classList.toggle('active', v.id === 'fleProcedures'));
  openSet.add(id); renderProcs();
  setTimeout(() => { [...document.querySelectorAll('#fleProcedures [data-toggle]')].find(b => b.dataset.toggle === id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 40);
}

function trackerHTML(p) {
  const tk = loadTrack(p.id);
  let alive = Number(tk.n0) || 0;
  const rows = tk.rows.map((r, i) => {
    alive = alive - (Number(r.dead) || 0) - (Number(r.censored) || 0);
    return `<tr>
      <td><input class="trk-in" data-trk="${p.id}:${i}:date" type="date" value="${esc(r.date || '')}"></td>
      <td><input class="trk-in trk-num" data-trk="${p.id}:${i}:dead" type="number" min="0" value="${esc(r.dead ?? '')}"></td>
      <td><input class="trk-in trk-num" data-trk="${p.id}:${i}:censored" type="number" min="0" value="${esc(r.censored ?? '')}"></td>
      <td class="trk-alive">${tk.n0 === '' ? '—' : Math.max(0, alive)}</td>
      <td><button class="trk-del" data-trkdel="${p.id}:${i}" type="button">✕</button></td>
    </tr>`;
  }).join('');
  const totD = tk.rows.reduce((s, r) => s + (Number(r.dead) || 0), 0);
  const totC = tk.rows.reduce((s, r) => s + (Number(r.censored) || 0), 0);
  return `
    <div class="pc-sec">📅 Daily scoring tracker</div>
    <div class="trk">
      <div class="trk-top">Starting N (day 0): <input class="trk-in trk-num" data-trkn="${p.id}" type="number" min="0" value="${esc(tk.n0 ?? '')}">
        <span class="trk-sum">Σ dead ${totD} · Σ censored ${totC}</span></div>
      <table class="trk-tbl"><thead><tr><th>Date</th><th>Dead</th><th>Cens.</th><th>Alive</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="trk-empty">No scoring days yet — add one each time you score.</td></tr>'}</tbody></table>
      <div class="trk-act">
        <button class="trk-add" data-trkadd="${p.id}" type="button">➕ Add scoring day</button>
        ${tk.rows.length ? `<button class="trk-csv" data-trkcsv="${p.id}" type="button">⬇ Download results (CSV)</button>` : ''}
      </div>
    </div>`;
}

// % climbed / % effect tracker: per-trial Climbed/Total → %.
function pctTrackerHTML(p) {
  const tk = loadTrack(p.id);
  const pcts = [];
  const rows = tk.rows.map((r, i) => {
    const a = Number(r.affected) || 0, t = Number(r.total) || 0, pct = t ? a / t * 100 : null;
    if (pct != null) pcts.push(pct);
    return `<tr>
      <td><input class="trk-in" data-trk="${p.id}:${i}:label" type="text" placeholder="trial ${i + 1}" value="${esc(r.label || '')}"></td>
      <td><input class="trk-in trk-num" data-trk="${p.id}:${i}:affected" type="number" min="0" value="${esc(r.affected ?? '')}"></td>
      <td><input class="trk-in trk-num" data-trk="${p.id}:${i}:total" type="number" min="0" value="${esc(r.total ?? '')}"></td>
      <td class="trk-alive">${pct == null ? '—' : pct.toFixed(0) + '%'}</td>
      <td><button class="trk-del" data-trkdel="${p.id}:${i}" type="button">✕</button></td>
    </tr>`;
  }).join('');
  const mean = pcts.length ? pcts.reduce((s, x) => s + x, 0) / pcts.length : null;
  return `
    <div class="pc-sec">📊 Climbing tracker (% passing the line)</div>
    <div class="trk">
      <div class="trk-top">% climbed = climbed ÷ total × 100 <span class="trk-sum">${mean == null ? '' : `mean ${mean.toFixed(0)}% (n=${pcts.length})`}</span></div>
      <table class="trk-tbl"><thead><tr><th>Trial / group</th><th>Climbed</th><th>Total</th><th>% climbed</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="trk-empty">No trials yet — add one after each climb.</td></tr>'}</tbody></table>
      <div class="trk-act">
        <button class="trk-add" data-trkadd="${p.id}" type="button">➕ Add trial</button>
        ${tk.rows.length ? `<button class="trk-csv" data-trkcsv="${p.id}" type="button">⬇ Download results (CSV)</button>` : ''}
      </div>
    </div>`;
}

function cardHTML(p) {
  const checks = loadChecks(p.id);
  const done = p.steps.reduce((n, _, i) => n + (checks.has(i) ? 1 : 0), 0);
  const pct = Math.round(done / p.steps.length * 100);
  const open = openSet.has(p.id);
  const hasVol = !!p.baseVol;
  const vol = hasVol ? volOf(p) : 0, factor = hasVol ? vol / p.baseVol : 1, firm = p.firmness ? firmOf(p) : 0;
  const mats = (p.materials || []).map(m => {
    if (typeof m === 'string') return `<li>${esc(m)}</li>`;
    if (m.toVol) return `<li>${esc(m.name)} <span style="color:#64748b">to ${fmtVol(vol)}</span></li>`;
    if (m.firm)  return `<li id="agarli-${p.id}"><b style="color:#cbd5e1">${fmt(firm * vol / 1000)} ${m.unit}</b> ${esc(m.name)} <span style="color:#64748b">(${fmt(firm)} g/L)</span></li>`;
    return `<li><b style="color:#cbd5e1">${fmt(m.amt * factor)} ${m.unit}</b> ${esc(m.name)}</li>`;
  }).join('');
  return `
    <div class="pc">
      <button class="pc-head" data-toggle="${p.id}" type="button">
        <span class="pc-ic">${p.icon}</span>
        <span class="pc-tt"><span class="pc-title">${esc(p.title)}</span><span class="pc-tag">${esc(p.tag)}</span></span>
        <span class="pc-prog${done === p.steps.length ? ' full' : ''}">${done}/${p.steps.length}</span>
        <span class="pc-car">${open ? '▾' : '▸'}</span>
      </button>
      ${open ? `<div class="pc-body">
        <div class="pc-purpose">${esc(p.purpose)}</div>
        ${hasVol ? `<div class="pc-vol">
          <span class="pc-vol-lbl">Make:</span>
          <input class="pc-vol-in" data-vol="${p.id}" type="number" min="1" step="1" value="${fmt(vol)}">
          <span class="pc-vol-u">mL ${esc(p.volNoun)}</span>
          <span class="pc-vol-presets">${(p.presets || []).map(v => `<button class="pc-vchip${v === vol ? ' on' : ''}" data-volset="${p.id}:${v}" type="button">${fmtVol(v)}</button>`).join('')}</span>
        </div>` : ''}
        ${p.plates ? (() => {
          const mlpp = loadPlateMl(p), w = p.plates.waste || 0.05;
          return `<div class="pc-vol">
          <span class="pc-vol-lbl">Per vessel:</span>
          <input class="pc-vol-in" data-plateml="${p.id}" type="number" min="1" step="0.5" value="${fmt(mlpp)}">
          <span class="pc-vol-u">mL each</span>
          <span class="pc-vol-presets">${p.plates.presets.map(s => `<button class="pc-vchip${s.ml === mlpp ? ' on' : ''}" data-plateset="${p.id}:${s.ml}" type="button">${esc(s.label)}</button>`).join('')}</span>
        </div>
        <div class="pc-yield">🍶 makes ≈ <b>${Math.round(vol / mlpp)}</b> vessels at ${fmt(mlpp)} mL — allow ~${Math.round(w * 100)}% waste (≈ ${Math.floor(vol * (1 - w) / mlpp)}–${Math.floor(vol * (1 + w) / mlpp)} vessels)</div>`;
        })() : ''}
        ${p.firmness ? `<div class="pc-firm">
          <span class="pc-firm-lbl">Agar firmness</span>
          <input class="pc-firm-in" data-firm="${p.id}" type="range" min="${p.firmness.min}" max="${p.firmness.max}" step="${p.firmness.step}" value="${firm}">
          <span class="pc-firm-val" id="firmval-${p.id}">${fmt(firm)} g/L · ${firmLabel(firm)}</span>
        </div>` : ''}
        ${p.timer ? (() => { const t = getTimer(p); return `<div class="pc-timer">
          <span class="pc-timer-lbl">⏱ ${esc(p.timer.label)} timer</span>
          <input class="pc-timer-min" id="ptm-${p.id}" type="number" min="1" step="1" value="${Math.round(t.total / 60)}"><span style="font-size:11px;color:#64748b">min</span>
          <span class="pc-timer-disp${t.done ? ' done' : ''}" id="ptd-${p.id}">${t.done ? '⏰ Time’s up!' : fmtTime(t.remaining)}</span>
          <button class="pc-timer-btn" id="ptb-${p.id}" type="button">${t.running ? '⏸ Pause' : '▶ Start'}</button>
          <button class="pc-timer-rst" id="ptr-${p.id}" type="button">↺</button>
        </div>`; })() : ''}
        ${p.params ? `<div class="pc-sec">Key parameters</div><ul class="pc-mat">${p.params.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${p.materials ? `<div class="pc-sec">Materials${hasVol ? ` <span class="pc-pct">for ${fmtVol(vol)}</span>` : ''}</div><ul class="pc-mat">${mats}</ul>` : ''}
        <div class="pc-sec">Steps <span class="pc-pct">${pct}% done</span></div>
        <div class="pc-steps">${p.steps.map((s, i) => {
          const stext = typeof s === 'string' ? s : s.t;
          const sgoto = (s && s.goto) ? s.goto : null;
          return `<button class="pc-step${checks.has(i) ? ' done' : ''}" data-step="${p.id}:${i}" type="button">
            <span class="pc-box">${checks.has(i) ? '✓' : ''}</span><span class="pc-stext">${esc(stext)}</span></button>` +
            (sgoto ? `<div class="pc-goto-row"><button class="pc-goto" data-goto="${esc(sgoto)}" type="button">→ Open: ${esc(findProc(sgoto)?.title || sgoto)}</button></div>` : '');
        }).join('')}</div>
        ${p.tracker ? (p.tracker === 'pct' ? pctTrackerHTML(p) : trackerHTML(p)) : ''}
        ${p.notes ? `<div class="pc-notes">📝 ${esc(p.notes)}</div>` : ''}
        ${p.source ? `<div class="pc-src">📚 Source: <a href="${esc(p.source.url)}" target="_blank" rel="noopener noreferrer">${esc(p.source.name)} ↗</a></div>` : ''}
        <div class="pc-act"><button class="pc-reset" data-reset="${p.id}" type="button">↺ Reset checklist</button></div>
      </div>` : ''}
    </div>`;
}

function wireCards(root, rerender) {
  root.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
    const id = b.dataset.toggle; openSet.has(id) ? openSet.delete(id) : openSet.add(id); rerender();
  });
  root.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
    const [id, i] = b.dataset.step.split(':'); const idx = +i;
    const set = loadChecks(id); set.has(idx) ? set.delete(idx) : set.add(idx); saveChecks(id, set); rerender();
  });
  root.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => { saveChecks(b.dataset.reset, new Set()); rerender(); });
  root.querySelectorAll('[data-volset]').forEach(b => b.onclick = () => { const [id, v] = b.dataset.volset.split(':'); setVol(id, +v); rerender(); });
  root.querySelectorAll('[data-vol]').forEach(inp => inp.onchange = () => { const v = parseFloat(inp.value); if (v && v > 0) setVol(inp.dataset.vol, v); rerender(); });
  root.querySelectorAll('[data-plateml]').forEach(inp => inp.onchange = () => { const v = parseFloat(inp.value); if (v && v > 0) { setPlateMl(inp.dataset.plateml, v); rerender(); } });
  root.querySelectorAll('[data-plateset]').forEach(b => b.onclick = () => { const [id, ml] = b.dataset.plateset.split(':'); setPlateMl(id, +ml); rerender(); });
  root.querySelectorAll('[data-firm]').forEach(inp => inp.oninput = () => {
    const id = inp.dataset.firm, f = parseFloat(inp.value), p = findProc(id); setFirm(id, f);
    const vlbl = document.getElementById('firmval-' + id); if (vlbl) vlbl.textContent = `${fmt(f)} g/L · ${firmLabel(f)}`;
    const li = document.getElementById('agarli-' + id);
    if (li) li.innerHTML = `<b style="color:#cbd5e1">${fmt(f * volOf(p) / 1000)} g</b> agar <span style="color:#64748b">(${fmt(f)} g/L)</span>`;
  });
  root.querySelectorAll('.pc-timer-btn').forEach(b => { const id = b.id.slice(4); b.onclick = () => { timers[id].running ? tPause(id) : tStart(id); }; });
  root.querySelectorAll('.pc-timer-rst').forEach(b => { const id = b.id.slice(4); b.onclick = () => tReset(id, parseFloat(document.getElementById('ptm-' + id).value) || defMin(id)); });
  root.querySelectorAll('.pc-timer-min').forEach(inp => { const id = inp.id.slice(4); inp.onchange = () => { if (!timers[id].running) tReset(id, parseFloat(inp.value) || defMin(id)); }; });
  Object.keys(timers).forEach(syncTimerUI);
  root.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => gotoProc(b.dataset.goto));
  root.querySelectorAll('[data-trkn]').forEach(inp => inp.onchange = () => { const id = inp.dataset.trkn; const t = loadTrack(id); t.n0 = inp.value === '' ? '' : Number(inp.value); saveTrack(id, t); rerender(); });
  root.querySelectorAll('[data-trk]').forEach(inp => inp.onchange = () => {
    const [id, i, field] = inp.dataset.trk.split(':'); const t = loadTrack(id);
    if (t.rows[i]) { t.rows[i][field] = (field === 'date' || field === 'label') ? inp.value : (inp.value === '' ? '' : Number(inp.value)); saveTrack(id, t); rerender(); }
  });
  root.querySelectorAll('[data-trkadd]').forEach(b => b.onclick = () => {
    const id = b.dataset.trkadd, tp = findProc(id)?.tracker; const t = loadTrack(id);
    t.rows.push(tp === 'pct' ? { label: '', affected: '', total: '' } : { date: todayStr(), dead: '', censored: '' });
    saveTrack(id, t); rerender();
  });
  root.querySelectorAll('[data-trkdel]').forEach(b => b.onclick = () => { const [id, i] = b.dataset.trkdel.split(':'); const t = loadTrack(id); t.rows.splice(i, 1); saveTrack(id, t); rerender(); });
  root.querySelectorAll('[data-trkcsv]').forEach(b => b.onclick = () => exportTrackCSV(b.dataset.trkcsv));
}

function exportTrackCSV(id) {
  const t = loadTrack(id); let lines; const tp = findProc(id)?.tracker;
  if (tp === 'pct') {
    lines = [['trial', 'climbed', 'total', 'percent'].join(',')];
    t.rows.forEach(r => { const a = Number(r.affected) || 0, tt = Number(r.total) || 0; lines.push([r.label || '', r.affected ?? '', r.total ?? '', tt ? (a / tt * 100).toFixed(1) : ''].join(',')); });
  } else {
    const n0 = Number(t.n0) || 0; let alive = n0;
    lines = [['date', 'dead', 'censored', 'alive', 'percent_survival'].join(',')];
    t.rows.forEach(r => {
      alive = Math.max(0, alive - (Number(r.dead) || 0) - (Number(r.censored) || 0));
      const pct = n0 ? (alive / n0 * 100).toFixed(1) : '';
      lines.push([r.date || '', r.dead ?? '', r.censored ?? '', alive, pct].join(','));
    });
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${id}_results.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function renderProcs() {
  const root = document.getElementById('fleProcedures');
  if (!root) return;
  root.innerHTML = `
    <div class="le-intro">Bench protocols — tap one to expand, pick how much you're making (everything rescales), then check off steps as you go (progress is saved).</div>
    ${PROCEDURES.map(cardHTML).join('')}`;
  wireCards(root, renderProcs);
}

function renderExperiments() {
  const root = document.getElementById('fleExperiments');
  if (!root) return;
  root.innerHTML = `
    <div class="le-intro">Experiment protocols — tap one to expand, then check off steps as you run it (progress and trackers are saved).</div>
    ${EXPERIMENTS.map(cardHTML).join('')}`;
  wireCards(root, renderExperiments);
}

function init() {
  const le = document.getElementById('flyExp');
  if (!le) return;
  le.querySelectorAll('.le-tab').forEach(t => t.addEventListener('click', () => {
    le.querySelectorAll('.le-tab').forEach(x => x.classList.toggle('active', x === t));
    le.querySelectorAll('.le-view').forEach(v => v.classList.toggle('active', v.id === t.dataset.letab));
  }));
  le.querySelector('.le-home')?.addEventListener('click', () => {
    le.style.display = 'none';
    if (typeof window.WormTraceShowDrosoHome === 'function') window.WormTraceShowDrosoHome();
    else { const h = document.getElementById('homeScreen'); if (h) h.style.display = 'flex'; }
  });
  renderProcs();
  renderExperiments();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
