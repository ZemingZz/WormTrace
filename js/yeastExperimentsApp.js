/**
 * yeastExperimentsApp.js — "Experiments & Procedures" for the Saccharomyces cerevisiae project.
 * Parallel to experimentsApp.js (worms) but fully isolated: own overlay (#flyExp),
 * own localStorage keys (yeast_*), own data. Two top tabs: Experiments & Procedures.
 * Recipes are SCALABLE (pick a batch volume → ingredients rescale); checklists,
 * timers and trackers persist in localStorage. Content is sourced from BDSC food
 * recipes and published assay protocols (see each card's Source link).
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const PKEY = id => `yeast_proc_${id}`;
const loadChecks = id => { try { return new Set(JSON.parse(localStorage.getItem(PKEY(id)) || '[]')); } catch { return new Set(); } };
const saveChecks = (id, set) => localStorage.setItem(PKEY(id), JSON.stringify([...set]));

const VKEY = id => `yeast_procvol_${id}`;

// ── Daily tracker storage ──
const TKEY = id => `yeast_track_${id}`;
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

// ── Budding-yeast bench protocols. `materials` amounts are per `baseVol` mL and scale
//    linearly with the chosen batch volume. {toVol} = "top up to volume". ──
const PROCEDURES = [
  {
    id: 'ypd', icon: '🧫', title: 'YPD Rich Medium', tag: 'Standard yeast growth',
    purpose: 'Rich undefined medium for routine growth of S. cerevisiae — liquid or agar plates.',
    baseVol: 1000, volNoun: 'YPD', presets: [250, 500, 1000, 2000],
    firmness: { min: 15, max: 25, def: 20, step: 0.5 },   // agar g/L (plates)
    timer: { label: 'Autoclave', min: 20 },
    plates: { def: 25, waste: 0.05, presets: [{ label: '90 mm plate', ml: 25 }, { label: '100 mm', ml: 30 }, { label: '150 mm', ml: 60 }] },
    materials: [
      { amt: 10, unit: 'g', name: 'yeast extract (1%)' },
      { amt: 20, unit: 'g', name: 'peptone (2%)' },
      { amt: 20, unit: 'g', name: 'D-glucose / dextrose (2%)' },
      { firm: true, unit: 'g', name: 'agar (plates only)' },
      { toVol: true, name: 'deionized water' },
    ],
    steps: [
      'Dissolve the yeast extract, peptone (and agar, for plates) in most of the DI water.',
      'Bring to volume. Glucose can be autoclaved with the rest for routine YPD, or filter-sterilised and added after cooling to avoid browning.',
      'Autoclave 15–20 min at 121 °C — start the timer.',
      'For plates: cool to ~55 °C and pour ~25 mL per 90 mm plate. For liquid: cool and use.',
      'Store plates inverted at 4 °C; grow cultures at 30 °C.',
    ],
    notes: 'Final = 1% yeast extract, 2% peptone, 2% glucose (+2% agar for plates). Doubling time ~90 min in log phase at 30 °C. Add G418 / nourseothricin / hygromycin AFTER cooling to select dominant markers.',
    source: { name: 'YPD medium — Cold Spring Harbor Protocols', url: 'http://cshprotocols.cshlp.org/content/2010/9/pdb.rec12315' },
  },
  {
    id: 'sc', icon: '🧪', title: 'Synthetic Complete (SC / SD)', tag: 'Defined / selective medium',
    purpose: 'Defined medium (YNB + glucose + amino-acid mix). Drop out a nutrient (e.g. −Ura, −Leu) to select auxotrophic markers / plasmids.',
    baseVol: 1000, volNoun: 'SC medium', presets: [250, 500, 1000],
    firmness: { min: 15, max: 25, def: 20, step: 0.5 },
    timer: { label: 'Autoclave', min: 20 },
    plates: { def: 25, waste: 0.05, presets: [{ label: '90 mm plate', ml: 25 }, { label: '100 mm', ml: 30 }] },
    materials: [
      { amt: 6.7, unit: 'g', name: 'yeast nitrogen base + ammonium sulfate, w/o amino acids' },
      { amt: 20, unit: 'g', name: 'D-glucose (2%)' },
      { amt: 2, unit: 'g', name: 'complete supplement mixture (CSM) — use drop-out as needed' },
      { firm: true, unit: 'g', name: 'agar (plates only)' },
      { toVol: true, name: 'deionized water' },
    ],
    steps: [
      'Dissolve YNB, CSM (the right drop-out, e.g. CSM−Ura) and agar (for plates) in DI water.',
      'Add glucose; bring to volume. (Filter-sterilising the glucose separately gives the cleanest medium.)',
      'Autoclave 15–20 min at 121 °C — start the timer.',
      'Cool to ~55 °C; pour plates or use as liquid.',
      'Use a −marker drop-out to select transformants / maintain plasmids.',
    ],
    notes: 'Final ≈ 0.67% YNB, 2% glucose + CSM. Drop-out CSM (−Ura/−Leu/−His/−Trp) selects markers; 5-FOA plates counter-select URA3.',
    source: { name: 'Synthetic complete (SC) medium — Cold Spring Harbor Protocols', url: 'http://cshprotocols.cshlp.org/content/2016/12/pdb.rec090589' },
  },
  {
    id: 'transform', icon: '🧬', title: 'LiAc / PEG Transformation', tag: 'Introduce DNA',
    purpose: 'High-efficiency chemical transformation of yeast with plasmid or linear DNA (lithium acetate / PEG / single-stranded carrier DNA).',
    materials: [
      'Culture grown to mid-log (OD600 ~0.5–0.8, ~2 divisions from a fresh dilution)',
      '1 M lithium acetate (LiAc)',
      '50% (w/v) PEG 3350',
      'Single-stranded carrier DNA (e.g. salmon-sperm), boiled & chilled',
      'Plasmid or PCR / linear DNA (0.1–1 µg)',
      'Selective drop-out plates (see the SC/SD procedure)',
    ],
    steps: [
      'Grow cells to mid-log (OD600 ~0.5–0.8); harvest ~1×10⁸ cells per transformation.',
      'Wash in sterile water, then resuspend the pellet.',
      'Add the mix in order: 240 µL 50% PEG 3350, 36 µL 1 M LiAc, 50 µL boiled carrier DNA, then DNA + water to 360 µL.',
      'Vortex to fully resuspend; heat-shock at 42 °C for ~40 min (20–60 min).',
      'Spin gently, remove the mix, resuspend in sterile water.',
      'Plate on the appropriate selective drop-out plates; incubate 2–3 days at 30 °C.',
    ],
    notes: 'The Gietz LiAc/SS-DNA/PEG method. Heat-shock time and carrier-DNA quality matter most. For dominant markers (KanMX→G418), give a few hours outgrowth in YPD before plating.',
    source: { name: 'Gietz & Schiestl (2007) High-efficiency yeast transformation — Nat. Protoc. 2:31', url: 'https://www.nature.com/articles/nprot.2007.13' },
  },
  {
    id: 'sporulate', icon: '🔬', title: 'Sporulation & Tetrad Dissection', tag: 'Meiosis / crosses',
    purpose: 'Induce a diploid to sporulate (meiosis → 4 haploid spores per ascus), then dissect tetrads to recover and analyse meiotic progeny.',
    baseVol: 1000, volNoun: 'sporulation medium', presets: [250, 500, 1000],
    materials: [
      { amt: 10, unit: 'g', name: 'potassium acetate (1%)' },
      { amt: 1, unit: 'g', name: 'yeast extract (0.1%)' },
      { amt: 0.5, unit: 'g', name: 'glucose (0.05%)' },
      { toVol: true, name: 'deionized water' },
    ],
    steps: [
      'Grow the diploid on YPD, then patch into/onto sporulation medium (1% KOAc).',
      'Incubate at ~25 °C for 3–5 days; check for tetrads (4 spores) under the scope.',
      'Briefly digest the ascus wall with zymolyase / glusulase.',
      'Streak the digested suspension along the edge of a YPD plate.',
      'With a dissection microscope + micromanipulator, separate the 4 spores of each tetrad into a grid.',
      'Grow 2–3 days at 30 °C; score marker segregation (2:2 for a single gene).',
    ],
    notes: 'Sporulation needs a non-fermentable carbon source (acetate) + nitrogen limitation. 2:2 segregation confirms a single Mendelian locus.',
    source: { name: 'Tetrad dissection & sporulation — Cold Spring Harbor Protocols', url: 'http://cshprotocols.cshlp.org/content/2017/11/pdb.prot088824' },
  },
];

// ── Experiments (full assays). Same card shape, no volume scaling. ──
const EXPERIMENTS = [
  {
    id: 'growthcurve', icon: '📈', title: 'Growth Curve (OD600)', tag: 'Proliferation / doubling time',
    purpose: 'Track population growth by optical density (OD600) over time to read lag, exponential (log) and stationary phases and compute doubling time.',
    params: [
      'Inoculate from a fresh overnight to a low OD600 (~0.05–0.1) in YPD or SC.',
      'Grow at 30 °C with shaking (~200 rpm); plate readers: 30 °C with periodic shaking.',
      'Read OD600 every 30–60 min (blank vs sterile medium; dilute when OD > ~0.8 on a cuvette).',
      'Doubling time td = (t · ln2) / ln(ODt/OD0) during exponential phase (~90 min for wild-type in YPD).',
      'Run ≥3 replicates; include a same-run wild-type control.',
    ],
    materials: ['Fresh overnight starter culture', 'YPD or SC medium (see procedures)', 'Spectrophotometer or 96-well plate reader', 'Cuvettes / clear flat-bottom plate; 30 °C shaker'],
    steps: [
      'Dilute the overnight to OD600 ~0.05–0.1 in fresh medium; record the t = 0 OD.',
      'Incubate at 30 °C, shaking.',
      'Sample / read OD600 at regular intervals.',
      'Plot ln(OD) vs time — the straight region is exponential phase.',
      'Compute doubling time from the exponential slope; note where growth plateaus (diauxic shift → stationary phase).',
    ],
    notes: 'OD600 is turbidity, not a direct count — calibrate to CFU for absolute numbers. The diauxic shift (glucose → ethanol) shows as a brief plateau then slower growth. Preview it in the Growth Simulator.',
    source: { name: 'Yeast growth & the cell cycle — Sherman (2002) Methods Enzymol. 350:3', url: 'https://pubmed.ncbi.nlm.nih.gov/12073320/' },
  },
  {
    id: 'spotassay', icon: '🟤', title: 'Spot (Serial-Dilution) Assay', tag: 'Stress / drug sensitivity',
    purpose: 'Compare strain fitness under a condition by spotting 10-fold serial dilutions onto plates (± stress, ± drug, different temperatures).',
    params: [
      'Normalise all strains to the same OD600 (e.g. 0.5) before diluting.',
      'Make 10-fold serial dilutions (1, 10⁻¹, 10⁻², 10⁻³, 10⁻⁴).',
      'Spot ~3–5 µL of each dilution onto control and test plates.',
      'Incubate at the relevant temperature (30 °C standard; 37 °C heat; ± drug / salt / H₂O₂).',
      'Compare how many dilutions still grow vs the control strain.',
    ],
    materials: ['Mid-log cultures; OD600 meter', '96-well plate for dilutions; multichannel pipette / replica pinner', 'Control + test (stress / drug) plates', '30 °C (and other) incubators'],
    steps: [
      'Grow strains to mid-log; normalise to equal OD600.',
      'Prepare a 10-fold dilution series in a 96-well plate.',
      'Spot each dilution onto control and test plates; let the spots dry in.',
      'Incubate 2–3 days; photograph.',
      'Score relative growth (the dilution at which growth disappears) vs the control strain.',
    ],
    notes: 'Always include a wild-type / parent on every plate. Let spots fully absorb before inverting. Semi-quantitative — pair with a growth curve or CFU for numbers.',
    source: { name: 'Yeast spot / drop-dilution assay — Cold Spring Harbor Protocols', url: 'http://cshprotocols.cshlp.org/content/2016/11/pdb.prot088989' },
  },
  {
    id: 'rls', icon: '⏳', title: 'Replicative Lifespan (RLS)', tag: 'Aging — divisions per mother',
    purpose: 'Measure how many daughters a mother cell produces before senescence — the classic yeast replicative-aging assay.',
    params: [
      'On a YPD plate, micromanipulate individual virgin cells into a grid.',
      'After each division, remove (discard) the daughter and keep the mother.',
      'Count daughters until the mother stops dividing (death).',
      'Park plates at 4 °C overnight to pause; resume at 30 °C (cold storage barely affects RLS).',
      'n ≥ ~20–40 mothers per strain; compare survival curves (Wilcoxon / log-rank).',
    ],
    materials: ['Dissection microscope + micromanipulator', 'Fresh YPD plates', 'Strains of interest + a wild-type (BY4741) control'],
    steps: [
      'Patch cells onto YPD and let them bud.',
      'Micro-dissect virgin daughters into a grid.',
      'After each budding, separate and remove the new daughter; record the count.',
      'Repeat until the mother no longer divides (senescence / death).',
      'Plot % surviving vs divisions; report mean RLS and compare strains.',
    ],
    notes: 'Labour-intensive but the gold standard. rDNA instability & ERCs drive yeast replicative aging (see fob1Δ / sir2Δ). Microfluidic devices now automate it.',
    source: { name: 'Steffen, Kennedy & Kaeberlein (2009) Measuring replicative life span — JoVE 28:1209', url: 'https://www.jove.com/t/1209' },
  },
  {
    id: 'cls', icon: '🧮', title: 'Chronological Lifespan (CLS)', tag: 'Aging — survival in stationary',
    purpose: 'Measure how long non-dividing cells stay viable in stationary phase — a model of post-mitotic (chronological) aging.',
    params: [
      'Grow cells into stationary phase (SC, or shift to water) and hold the culture at 30 °C.',
      'Day ~3 ≈ 100% viability — the reference time point.',
      'Every 2–3 days, plate a known dilution on YPD and count colonies (CFU).',
      'Viability(%) = CFU now ÷ CFU at day 3 × 100.',
      'n ≥ 3 cultures; include a wild-type + a known long-lived mutant (e.g. sch9Δ).',
    ],
    materials: ['Stationary-phase cultures in SC', 'YPD plates for CFU counting', 'Sterile dilution tubes; colony counter; 30 °C incubator'],
    tracker: true,
    steps: [
      'Grow cultures to stationary phase; set day ~3 CFU as 100% viability.',
      'Maintain cultures at 30 °C (shaking).',
      'Every 2–3 days, dilute and plate onto YPD; incubate 2 days; count colonies.',
      'Compute viability(%) = CFU(t) / CFU(day 3) × 100.',
      'Log each timepoint in the tracker below; plot the survival curve and compare strains.',
    ],
    notes: 'CLS is very sensitive to medium acidification (acetic acid) — buffering or a water-shift changes results, so state your conditions. ras2Δ and sch9Δ are classic long-CLS controls.',
    source: { name: 'Fabrizio & Longo (2007) The chronological life span of S. cerevisiae — Methods Mol. Biol. 371:89', url: 'https://pubmed.ncbi.nlm.nih.gov/17634576/' },
  },
];
const findProc = id => PROCEDURES.find(p => p.id === id) || EXPERIMENTS.find(p => p.id === id);

// Shared with the Culture tracker: the available fly-food recipes (for its Food dropdown).
window.YeastFoods = PROCEDURES.filter(p => p.plates).map(p => p.title);

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
const PLKEY = id => `yeast_procplate_${id}`;
const loadPlateMl = p => { const v = parseFloat(localStorage.getItem(PLKEY(p.id))); return (v && v > 0) ? v : (p.plates ? p.plates.def : 10); };
const setPlateMl = (id, v) => localStorage.setItem(PLKEY(id), String(v));
const FKEY = id => `yeast_procfirm_${id}`;
const firmOf = p => { const v = parseFloat(localStorage.getItem(FKEY(p.id))); return (v && v > 0) ? v : (p.firmness ? p.firmness.def : 6); };
const setFirm = (id, v) => localStorage.setItem(FKEY(id), String(v));
const firmLabel = f => f < 5.5 ? 'soft' : f < 7 ? 'standard' : f < 8.5 ? 'firm' : 'very firm';

// Jump to a procedure: switch to Procedures tab, expand it, scroll to it.
function gotoProc(id) {
  const le = document.getElementById("yeastExp"); if (!le) return;
  le.querySelectorAll('.le-tab').forEach(t => t.classList.toggle('active', t.dataset.letab === 'yeProcedures'));
  le.querySelectorAll('.le-view').forEach(v => v.classList.toggle('active', v.id === 'yeProcedures'));
  openSet.add(id); renderProcs();
  setTimeout(() => { [...document.querySelectorAll('#yeProcedures [data-toggle]')].find(b => b.dataset.toggle === id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 40);
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
          <span class="pc-vol-lbl">Per plate:</span>
          <input class="pc-vol-in" data-plateml="${p.id}" type="number" min="1" step="0.5" value="${fmt(mlpp)}">
          <span class="pc-vol-u">mL/plate</span>
          <span class="pc-vol-presets">${p.plates.presets.map(s => `<button class="pc-vchip${s.ml === mlpp ? ' on' : ''}" data-plateset="${p.id}:${s.ml}" type="button">${esc(s.label)}</button>`).join('')}</span>
        </div>
        <div class="pc-yield">🧫 makes ≈ <b>${Math.round(vol / mlpp)}</b> plates at ${fmt(mlpp)} mL — allow ~${Math.round(w * 100)}% waste (≈ ${Math.floor(vol * (1 - w) / mlpp)}–${Math.floor(vol * (1 + w) / mlpp)} plates)</div>`;
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
  const root = document.getElementById('yeProcedures');
  if (!root) return;
  root.innerHTML = `
    <div class="le-intro">Bench protocols — tap one to expand, pick how much you're making (everything rescales), then check off steps as you go (progress is saved).</div>
    ${PROCEDURES.map(cardHTML).join('')}`;
  wireCards(root, renderProcs);
}

function renderExperiments() {
  const root = document.getElementById('yeExperiments');
  if (!root) return;
  root.innerHTML = `
    <div class="le-intro">Experiment protocols — tap one to expand, then check off steps as you run it (progress and trackers are saved).</div>
    ${EXPERIMENTS.map(cardHTML).join('')}`;
  wireCards(root, renderExperiments);
}

function init() {
  const le = document.getElementById("yeastExp");
  if (!le) return;
  le.querySelectorAll('.le-tab').forEach(t => t.addEventListener('click', () => {
    le.querySelectorAll('.le-tab').forEach(x => x.classList.toggle('active', x === t));
    le.querySelectorAll('.le-view').forEach(v => v.classList.toggle('active', v.id === t.dataset.letab));
  }));
  le.querySelector('.le-home')?.addEventListener('click', () => {
    le.style.display = 'none';
    if (typeof window.WormTraceShowYeastHome === 'function') window.WormTraceShowYeastHome();
    else { const h = document.getElementById('homeScreen'); if (h) h.style.display = 'flex'; }
  });
  renderProcs();
  renderExperiments();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
