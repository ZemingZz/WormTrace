/**
 * experimentsApp.js — "Experiments & Procedures" project (opened from the Biotastic
 * Lab home). Separate from the C. elegans app. Two top tabs:
 *   • Experiments — placeholder for now (to build out together).
 *   • Procedures  — working protocol checklists with a SCALABLE batch volume:
 *     pick how much you're making and every ingredient auto-adjusts proportionally.
 * Step checkboxes + chosen volume persist in localStorage so a protocol is a usable,
 * resumable checklist at the bench.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const PKEY = id => `wt_proc_${id}`;
const loadChecks = id => { try { return new Set(JSON.parse(localStorage.getItem(PKEY(id)) || '[]')); } catch { return new Set(); } };
const saveChecks = (id, set) => localStorage.setItem(PKEY(id), JSON.stringify([...set]));

const VKEY = id => `wt_procvol_${id}`;

// Round to a sensible number of significant figures for a bench recipe.
function fmt(n) {
  const a = Math.abs(n);
  if (a === 0) return '0';
  if (a >= 100) return String(Math.round(n));
  if (a >= 10)  return String(Math.round(n * 10) / 10);
  if (a >= 1)   return String(Math.round(n * 100) / 100);
  return String(Math.round(n * 1000) / 1000);
}
const fmtVol = ml => ml >= 1000 ? `${fmt(ml / 1000)} L` : `${fmt(ml)} mL`;

// ── Standard C. elegans bench protocols. `materials` amounts are per `baseVol` mL
//    and scale linearly with the chosen batch volume. {toVol} = "top up to volume". ──
const PROCEDURES = [
  {
    id: 'ngm', icon: '🧫', title: 'NGM Agar Plates', tag: 'Worm growth dishes',
    purpose: 'Standard solid medium for culturing C. elegans on an E. coli (OP50) lawn.',
    baseVol: 1000, volNoun: 'NGM media', presets: [250, 500, 1000, 2000],
    materials: [
      { amt: 3, unit: 'g', name: 'NaCl' },
      { amt: 2.5, unit: 'g', name: 'Bacto-peptone' },
      { amt: 17, unit: 'g', name: 'agar' },
      { amt: 975, unit: 'mL', name: 'deionized water' },
      { amt: 1, unit: 'mL', name: '1 M CaCl₂ (sterile)' },
      { amt: 1, unit: 'mL', name: '1 M MgSO₄ (sterile)' },
      { amt: 1, unit: 'mL', name: 'cholesterol, 5 mg/mL in ethanol' },
      { amt: 25, unit: 'mL', name: '1 M KPO₄ buffer pH 6.0 (sterile)' },
    ],
    steps: [
      'Combine the NaCl, peptone and agar with the water in a flask; stir.',
      'Autoclave 15–20 min at 121 °C on the liquid cycle.',
      'Cool in a 55 °C water bath until the flask is handleable (~15–20 min).',
      'Add the sterile supplements (CaCl₂, MgSO₄, cholesterol, KPO₄ buffer). Swirl gently — avoid bubbles.',
      'Pour ~10 mL per 60 mm plate (≈18–20 mL per 100 mm). Flame off surface bubbles.',
      'Let solidify, then dry 1–2 days (store inverted once set).',
      'Seed each plate with ~50–100 µL OP50; grow the lawn overnight at room temp.',
      'Store inverted at 4 °C and use within ~2–4 weeks.',
    ],
    notes: 'Add CaCl₂ / MgSO₄ / cholesterol / phosphate AFTER cooling — autoclaving them together causes precipitation.',
  },
  {
    id: 'liquid', icon: '💧', title: 'Liquid Culture (S-medium)', tag: 'Scale-up worms',
    purpose: 'Liquid medium to grow large worm populations on concentrated E. coli.',
    baseVol: 1000, volNoun: 'S-medium', presets: [250, 500, 1000, 2000],
    materials: [
      { amt: 5.85, unit: 'g', name: 'NaCl (S Basal)' },
      { amt: 1, unit: 'g', name: 'K₂HPO₄ (S Basal)' },
      { amt: 6, unit: 'g', name: 'KH₂PO₄ (S Basal)' },
      { amt: 1, unit: 'mL', name: 'cholesterol 5 mg/mL (S Basal)' },
      { toVol: true, name: 'deionized water (S Basal)' },
      { amt: 10, unit: 'mL', name: '1 M potassium citrate pH 6.0' },
      { amt: 10, unit: 'mL', name: 'trace-metals solution' },
      { amt: 3, unit: 'mL', name: '1 M CaCl₂' },
      { amt: 3, unit: 'mL', name: '1 M MgSO₄' },
    ],
    steps: [
      'Prepare S Basal (NaCl, K₂HPO₄, KH₂PO₄, cholesterol) with the water; autoclave.',
      'After cooling, add the sterile supplements (citrate, trace metals, CaCl₂, MgSO₄) → S-medium.',
      'Add concentrated E. coli (OP50 or HB101) as food.',
      'Inoculate with worms washed off plates in M9 buffer.',
      'Shake at ~20 °C, 150–200 rpm.',
      'Monitor density/food; add more bacteria before they starve (starvation → dauer).',
      'Harvest by settling on ice or gentle centrifugation; wash the pellet in M9.',
    ],
    notes: 'Aeration matters — use a flask ≥5× the culture volume. Don’t let it starve unless you WANT dauers.',
  },
  {
    id: 'tae', icon: '🧪', title: 'TAE Buffer (50× → 1×)', tag: 'Agarose gels / genotyping',
    purpose: 'Tris-acetate-EDTA running buffer for agarose gels (e.g. PCR genotyping of strains).',
    baseVol: 1000, volNoun: '50× TAE stock', presets: [250, 500, 1000],
    materials: [
      { amt: 242, unit: 'g', name: 'Tris base' },
      { amt: 57.1, unit: 'mL', name: 'glacial acetic acid' },
      { amt: 100, unit: 'mL', name: '0.5 M EDTA, pH 8.0' },
      { toVol: true, name: 'deionized water' },
    ],
    steps: [
      'Dissolve the Tris base in ~70% of the final volume of DI water (stir).',
      'Add the glacial acetic acid (use a fume hood).',
      'Add the 0.5 M EDTA (pH 8.0).',
      'Top up to the final volume with DI water → this is 50× TAE stock.',
      'For a 1× working buffer, dilute 1:50 (1 part stock + 49 parts DI water).',
      'Use 1× TAE to cast and run agarose gels.',
    ],
    notes: '50× stock keeps at room temp; warm to re-dissolve any precipitate. 1× TAE has low buffering capacity — don’t over-reuse on long runs.',
  },
];

let expanded = null;   // currently-open procedure id
const volOf = p => { const v = parseFloat(localStorage.getItem(VKEY(p.id))); return (v && v > 0) ? v : p.baseVol; };
const setVol = (id, v) => localStorage.setItem(VKEY(id), String(v));

function procCardHTML(p) {
  const checks = loadChecks(p.id);
  const done = p.steps.reduce((n, _, i) => n + (checks.has(i) ? 1 : 0), 0);
  const pct = Math.round(done / p.steps.length * 100);
  const open = expanded === p.id;
  const vol = volOf(p), factor = vol / p.baseVol;
  const mats = p.materials.map(m => m.toVol
    ? `<li>${esc(m.name)} <span style="color:#64748b">to ${fmtVol(vol)}</span></li>`
    : `<li><b style="color:#cbd5e1">${fmt(m.amt * factor)} ${m.unit}</b> ${esc(m.name)}</li>`).join('');
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
        <div class="pc-vol">
          <span class="pc-vol-lbl">Make:</span>
          <input class="pc-vol-in" data-vol="${p.id}" type="number" min="10" step="10" value="${fmt(vol)}">
          <span class="pc-vol-u">mL ${esc(p.volNoun)}</span>
          <span class="pc-vol-presets">${p.presets.map(v => `<button class="pc-vchip${v === vol ? ' on' : ''}" data-volset="${p.id}:${v}" type="button">${fmtVol(v)}</button>`).join('')}</span>
        </div>
        <div class="pc-sec">Materials <span class="pc-pct">for ${fmtVol(vol)}</span></div>
        <ul class="pc-mat">${mats}</ul>
        <div class="pc-sec">Steps <span class="pc-pct">${pct}% done</span></div>
        <div class="pc-steps">${p.steps.map((s, i) => `
          <button class="pc-step${checks.has(i) ? ' done' : ''}" data-step="${p.id}:${i}" type="button">
            <span class="pc-box">${checks.has(i) ? '✓' : ''}</span><span class="pc-stext">${esc(s)}</span></button>`).join('')}</div>
        ${p.notes ? `<div class="pc-notes">📝 ${esc(p.notes)}</div>` : ''}
        <div class="pc-act"><button class="pc-reset" data-reset="${p.id}" type="button">↺ Reset checklist</button></div>
      </div>` : ''}
    </div>`;
}

function renderProcs() {
  const root = document.getElementById('leProcedures');
  if (!root) return;
  root.innerHTML = `
    <div class="le-intro">Bench protocols — tap one to expand, pick how much you're making (everything rescales), then check off steps as you go (progress is saved).</div>
    ${PROCEDURES.map(procCardHTML).join('')}`;
  root.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
    expanded = expanded === b.dataset.toggle ? null : b.dataset.toggle; renderProcs();
  });
  root.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
    const [id, i] = b.dataset.step.split(':'); const idx = +i;
    const set = loadChecks(id); set.has(idx) ? set.delete(idx) : set.add(idx); saveChecks(id, set);
    renderProcs();
  });
  root.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => { saveChecks(b.dataset.reset, new Set()); renderProcs(); });
  root.querySelectorAll('[data-volset]').forEach(b => b.onclick = () => {
    const [id, v] = b.dataset.volset.split(':'); setVol(id, +v); renderProcs();
  });
  root.querySelectorAll('[data-vol]').forEach(inp => inp.onchange = () => {
    const v = parseFloat(inp.value); if (v && v > 0) setVol(inp.dataset.vol, v); renderProcs();
  });
}

function renderExperiments() {
  const root = document.getElementById('leExperiments');
  if (!root) return;
  root.innerHTML = `
    <div class="le-empty">
      <div style="font-size:44px">🧪</div>
      <div class="le-empty-t">No experiments yet</div>
      <div class="le-empty-s">Plan, run, and track experiments here. We'll build this out together — tell me what an
        experiment should capture (design, strains/plates used, conditions, timeline, results).</div>
    </div>`;
}

function init() {
  const le = document.getElementById('labExp');
  if (!le) return;
  le.querySelectorAll('.le-tab').forEach(t => t.addEventListener('click', () => {
    le.querySelectorAll('.le-tab').forEach(x => x.classList.toggle('active', x === t));
    le.querySelectorAll('.le-view').forEach(v => v.classList.toggle('active', v.id === t.dataset.letab));
  }));
  le.querySelector('.le-home')?.addEventListener('click', () => {
    le.style.display = 'none';
    const h = document.getElementById('homeScreen'); if (h) h.style.display = 'flex';
  });
  renderProcs();
  renderExperiments();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
