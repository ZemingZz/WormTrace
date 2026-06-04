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

// ── Daily tracker storage (e.g. lifespan scoring) ──
const TKEY = id => `wt_track_${id}`;
function loadTrack(id) { try { const r = JSON.parse(localStorage.getItem(TKEY(id)) || '{}'); return { n0: r.n0 ?? '', rows: Array.isArray(r.rows) ? r.rows : [] }; } catch { return { n0: '', rows: [] }; } }
function saveTrack(id, t) { localStorage.setItem(TKEY(id), JSON.stringify(t)); }
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

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
    baseVol: 1000, volNoun: 'NGM media', presets: [250, 500, 750, 1000],
    firmness: { min: 13, max: 25, def: 17, step: 0.5 },   // agar g/L — only ratio that really varies
    timer: { label: 'Autoclave', min: 55 },               // countdown + alarm
    plates: { def: 10, waste: 0.05, presets: [{ label: '35 mm', ml: 4 }, { label: '60 mm', ml: 10 }, { label: '100 mm', ml: 20 }] },
    materials: [
      { amt: 3, unit: 'g', name: 'NaCl' },
      { amt: 2.5, unit: 'g', name: 'Bacto-peptone' },
      { firm: true, unit: 'g', name: 'agar' },
      { amt: 975, unit: 'mL', name: 'deionized water' },
      { amt: 1, unit: 'mL', name: '1 M CaCl₂ (sterile)' },
      { amt: 1, unit: 'mL', name: '1 M MgSO₄ (sterile)' },
      { amt: 1, unit: 'mL', name: 'cholesterol, 5 mg/mL in ethanol' },
      { amt: 25, unit: 'mL', name: '1 M KPO₄ buffer pH 6.0 (sterile)' },
    ],
    steps: [
      'Switch on the autoclave and make sure it is pre-heating.',
      'Combine the NaCl, peptone and agar with the DI water in a flask; stir.',
      'Autoclave at 121 °C (liquid cycle) — start the 55-min timer below as a safe total.',
      'Cool in a 55 °C water bath until the flask is handleable (~15–20 min).',
      'Add the sterile supplements (CaCl₂, MgSO₄, cholesterol, KPO₄ buffer). Swirl gently — avoid bubbles.',
      'Pour ~10 mL per 60 mm plate (≈18–20 mL per 100 mm). Flame off surface bubbles.',
      'Let solidify, then dry 1–2 days (store inverted once set).',
      'Seed each plate with ~50–100 µL OP50; grow the lawn overnight at room temp.',
      'Store inverted at 4 °C and use within ~2–4 weeks.',
    ],
    notes: 'Add CaCl₂ / MgSO₄ / cholesterol / phosphate AFTER cooling — autoclaving them together causes precipitation.',
    source: { name: 'NGM — Cold Spring Harbor Protocols (2014)', url: 'https://cshprotocols.cshlp.org/content/2014/3/pdb.rec081299' },
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
    source: { name: 'Stiernagle (2006) Maintenance of C. elegans — WormBook', url: 'https://www.wormbook.org/chapters/www_strainmaintain/strainmaintain.html' },
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
    source: { name: '50× TAE — Sambrook & Russell, Molecular Cloning (standard)', url: 'https://www.protocols.io/view/recipe-for-50x-tae-buffer-ewov1d47vr24' },
  },
  {
    id: 'bleach', icon: '🥚', title: 'Bleach Solution (synchronization)', tag: 'Egg prep — make fresh',
    purpose: 'Alkaline-hypochlorite to dissolve gravid adults and release bleach-resistant embryos for a synchronized (L1) population.',
    baseVol: 10, volNoun: 'bleach solution', presets: [5, 10, 20, 50],
    timer: { label: 'Bleach', min: 5 },
    materials: [
      { amt: 7, unit: 'mL', name: 'deionized water (ddH₂O)' },
      { amt: 2, unit: 'mL', name: 'household bleach (sodium hypochlorite ~5%)' },
      { amt: 1, unit: 'mL', name: '5 M NaOH (or KOH)' },
    ],
    steps: [
      'Make the bleach solution FRESH right before use (7:2:1 water : bleach : NaOH) — it loses potency fast.',
      'Wash gravid adults off plates with M9 into a 15 mL conical; let settle / spin briefly and remove the supernatant.',
      'Add the bleach solution to the worm pellet and agitate (vortex / shake). Start the timer.',
      'Watch under a dissecting scope — stop at ~3–9 min when most adult bodies have dissolved but eggs are freed (do NOT over-bleach).',
      'Spin down the eggs (~30 s–1 min) and remove the bleach supernatant.',
      'Wash the egg pellet 3× with M9 to remove all residual bleach.',
      'Resuspend eggs in M9 and rotate overnight with no food → synchronized L1 arrest.',
      'Pipette the arrested L1s onto seeded NGM plates to start a synchronized culture.',
    ],
    notes: 'Embryos tolerate ~10 min of bleach; adults & larvae do not. Over-bleaching kills embryos. Expect ~10 eggs per gravid adult. Bleach is corrosive — wear gloves & eye protection.',
    source: { name: 'Porta-de-la-Riva et al. (2012) Basic C. elegans Methods — JoVE', url: 'https://www.jove.com/t/4019' },
  },
  {
    id: 'm9', icon: '🧂', title: 'M9 Buffer', tag: 'Worm wash / suspension buffer',
    purpose: 'General buffer to wash worms off plates and suspend them (used in bleaching, chemotaxis, drug & bacterial assays).',
    baseVol: 1000, volNoun: 'M9 buffer', presets: [250, 500, 1000, 2000],
    materials: [
      { amt: 3, unit: 'g', name: 'KH₂PO₄' },
      { amt: 6, unit: 'g', name: 'Na₂HPO₄' },
      { amt: 5, unit: 'g', name: 'NaCl' },
      { toVol: true, name: 'deionized water' },
      { amt: 1, unit: 'mL', name: '1 M MgSO₄ (sterile, add after autoclave)' },
    ],
    steps: [
      'Dissolve the KH₂PO₄, Na₂HPO₄ and NaCl in DI water; bring to volume.',
      'Autoclave 15–20 min at 121 °C.',
      'After cooling, add the sterile 1 M MgSO₄.',
      'Store at room temperature; use to wash/suspend worms.',
    ],
    notes: 'Final ≈ 22 mM KH₂PO₄, 42 mM Na₂HPO₄, 86 mM NaCl, 1 mM MgSO₄. Add MgSO₄ after autoclaving to avoid precipitation.',
    source: { name: 'Stiernagle (2006) Maintenance of C. elegans — WormBook', url: 'https://www.wormbook.org/chapters/www_strainmaintain/strainmaintain.html' },
  },
  {
    id: 'ctxagar', icon: '🧭', title: 'Chemotaxis Assay Agar', tag: 'Chemotaxis plates (no food)',
    purpose: 'Buffered agar with no peptone or bacteria, for chemotaxis assay plates.',
    baseVol: 1000, volNoun: 'chemotaxis agar', presets: [250, 500, 1000],
    firmness: { min: 14, max: 25, def: 16, step: 0.5 },
    materials: [
      { firm: true, unit: 'g', name: 'agar' },
      { toVol: true, name: 'deionized water' },
      { amt: 5, unit: 'mL', name: '1 M KPO₄ buffer pH 6 (sterile)' },
      { amt: 1, unit: 'mL', name: '1 M CaCl₂ (sterile)' },
      { amt: 1, unit: 'mL', name: '1 M MgSO₄ (sterile)' },
    ],
    steps: [
      'Add the agar to DI water (to volume); stir.',
      'Autoclave 15–20 min at 121 °C; cool to ~55 °C.',
      'Add the sterile KPO₄ buffer, CaCl₂ and MgSO₄; swirl gently — avoid bubbles.',
      'Pour plates (no bacteria). Dry well before use.',
    ],
    notes: '1.6% agar, 5 mM KPO₄ (pH 6), 1 mM CaCl₂, 1 mM MgSO₄ — no peptone, no food. Keep the surface dry so worms crawl rather than swim (some labs use 2% agar for a firmer surface).',
    source: { name: 'Margie, Palmer & Chin-Sang (2013) Chemotaxis Assay — JoVE (Bargmann 1993)', url: 'https://www.jove.com/t/50069' },
  },
  {
    id: 'skagar', icon: '🦠', title: 'Slow-Kill (SK) Agar', tag: 'Killing-assay plates',
    purpose: 'NGM with extra peptone (0.35%) to support a dense pathogen lawn for slow-killing virulence assays.',
    baseVol: 1000, volNoun: 'slow-kill agar', presets: [250, 500, 1000],
    firmness: { min: 13, max: 25, def: 17, step: 0.5 },
    materials: [
      { amt: 3, unit: 'g', name: 'NaCl' },
      { amt: 3.5, unit: 'g', name: 'Bacto-peptone (0.35%)' },
      { firm: true, unit: 'g', name: 'agar' },
      { amt: 975, unit: 'mL', name: 'deionized water' },
      { amt: 1, unit: 'mL', name: '1 M CaCl₂ (sterile)' },
      { amt: 1, unit: 'mL', name: '1 M MgSO₄ (sterile)' },
      { amt: 1, unit: 'mL', name: 'cholesterol 5 mg/mL (sterile)' },
      { amt: 25, unit: 'mL', name: '1 M KPO₄ buffer pH 6 (sterile)' },
    ],
    steps: [
      'Combine the NaCl, peptone and agar with the DI water; stir.',
      'Autoclave 15–20 min at 121 °C; cool to ~55 °C.',
      'Add the sterile CaCl₂, MgSO₄, cholesterol and KPO₄ buffer; swirl gently.',
      '(Optional) add FUdR to block progeny on multi-day assays.',
      'Pour 5.5 cm plates; spot the pathogen lawn, 37 °C ~24 h, then 23–25 °C 8–24 h before adding worms.',
    ],
    notes: 'Same as NGM but 0.35% peptone (vs 0.25%) for a denser lawn. Used for slow-kill (e.g. P. aeruginosa) virulence assays.',
    source: { name: 'Tan, Mahajan-Miklos & Ausubel (1999) — PNAS 96:715', url: 'https://www.pnas.org/doi/10.1073/pnas.96.2.715' },
  },
  {
    id: 'pgsagar', icon: '☠️', title: 'Fast-Kill (PGS) Agar', tag: 'High-osmolarity kill plates',
    purpose: 'High-osmolarity peptone/glucose/sorbitol agar for fast (toxin-mediated) killing assays.',
    baseVol: 1000, volNoun: 'PGS agar', presets: [250, 500, 1000],
    firmness: { min: 13, max: 25, def: 17, step: 0.5 },
    materials: [
      { amt: 10, unit: 'g', name: 'Bacto-peptone (1%)' },
      { amt: 10, unit: 'g', name: 'NaCl (1%)' },
      { amt: 10, unit: 'g', name: 'glucose (1%)' },
      { amt: 27.3, unit: 'g', name: 'sorbitol (0.15 M)' },
      { firm: true, unit: 'g', name: 'Bacto-agar' },
      { toVol: true, name: 'deionized water' },
    ],
    steps: [
      'Combine the peptone, NaCl, glucose, sorbitol and agar with DI water (to volume).',
      'Autoclave 15–20 min at 121 °C; cool to ~55 °C and pour plates.',
      'Spot the bacterial lawn; use for fast (toxin-mediated) killing.',
    ],
    notes: 'High osmolarity (0.15 M sorbitol) drives fast, toxin-mediated death over hours (live bacteria not required). Glucose can caramelize if over-autoclaved — autoclave it separately and add after cooling if that happens.',
    source: { name: 'Tan, Mahajan-Miklos & Ausubel (1999) fast-kill — PNAS 96:715', url: 'https://www.pnas.org/doi/10.1073/pnas.96.2.715' },
  },
];

// ── Experiments (full assays). Same card shape as procedures, no volume scaling. ──
const EXPERIMENTS = [
  {
    id: 'lifespan', icon: '📈', title: 'Lifespan Assay (solid media)', tag: 'Survival / aging',
    purpose: 'Measure C. elegans survival over time on NGM plates to compare longevity between strains or conditions (Kaplan–Meier).',
    params: [
      'Temperature: 20 °C standard (15 or 25 °C also used) — keep it constant the whole assay.',
      'n: aim for ≥100 worms per condition across ≥3 plates; always run a same-batch N2 control.',
      'Day 0 = young adult (synchronize first by bleaching → L1).',
      'Progeny control: FUdR plates (no transfers) OR manual daily transfer through reproduction (~first 5–7 d).',
      'Scoring cadence: every 1–2 days until all worms are dead or censored.',
    ],
    materials: [
      'Synchronized young-adult worms (see the Bleach Solution procedure)',
      'Seeded NGM plates (see the NGM Agar Plates procedure)',
      'Optional FUdR/Amp plates — ~33 µL of 150 mM FUdR (+100 µL of 100 mg/mL ampicillin) per 100 mL NGM (≈50 µM FUdR)',
      'Platinum worm pick + alcohol lamp',
      'Dissecting microscope; a survival scoring sheet or software (e.g. OASIS/GraphPad)',
    ],
    tracker: true,
    steps: [
      { t: 'Synchronize the population (bleach gravid adults → L1 arrest → seed onto NGM).', goto: 'bleach' },
      'Grow to L4 / young adult — this time point is Day 0 of the assay.',
      'Pick ~30–40 young adults onto each of ≥3 plates per strain/condition; record the starting count.',
      'If NOT using FUdR: transfer adults to fresh plates daily through the reproductive period (~5–7 d), then every 2–3 d.',
      'Score every 1–2 days: gently prod each worm with the pick.',
      'Dead = no movement AND no pharyngeal pumping AND no response to prodding.',
      'Censor (remove from the denominator): crawled off the agar, desiccated on the wall, “bagged” (internal hatching), or ruptured/exploded vulva.',
      'Record alive / dead / censored per plate on every scoring day.',
      'Continue until every worm is dead or censored.',
      'Plot a Kaplan–Meier survival curve; compare conditions with the log-rank (Mantel–Cox) test; report median lifespan, n, replicates and p-value.',
    ],
    notes: 'FUdR removes daily transfers but can itself alter lifespan/stress in some strains — keep it identical across all conditions and state it in methods. Keep temperature constant and avoid contamination (both skew survival). Always compare against a same-batch N2 control.',
    source: { name: 'Sutphin & Kaeberlein (2009) Measuring C. elegans Life Span on Solid Media — JoVE', url: 'https://www.jove.com/t/1152' },
  },
  {
    id: 'chemotaxis', icon: '🧭', title: 'Chemotaxis Assay', tag: 'Behavior / sensory',
    purpose: 'Quantify attraction or repulsion to a chemical by where worms accumulate, as a Chemotaxis Index (−1 to +1).',
    params: [
      'Assay plates: chemotaxis agar, NO food — 1.6% agar, 5 mM KPO₄ pH 6, 1 mM CaCl₂, 1 mM MgSO₄.',
      'Worms: ~50–200 synchronized young adults per plate, washed free of bacteria.',
      'Layout: attractant spot vs solvent-control spot on opposite sides; 1 µL of 1 M sodium azide at BOTH to trap arrivals.',
      'Temperature ~20–22 °C; score after ~60 min (up to ~2 h).',
      'Replicates: ≥3 plates/condition; include a known attractant (e.g. diacetyl) + an N2 reference.',
    ],
    materials: [
      'Chemotaxis assay plates (agar above; no bacteria)',
      'Synchronized young adults, washed in M9 or ddH₂O',
      'Attractant — e.g. diacetyl 1:1000 in ethanol (or isoamyl alcohol, benzaldehyde, NaCl)',
      'Solvent control — e.g. ethanol',
      '1 M sodium azide (NaN₃) anesthetic — TOXIC, wear gloves',
      'Glass pipette / worm pick, dissecting scope, marker, timer',
    ],
    steps: [
      { t: 'Synchronize & grow worms to young adult.', goto: 'bleach' },
      'On the plate bottom mark an origin (center), two spots on opposite sides (test vs control), and a small origin scoring circle.',
      'Spot 1 µL of 1 M sodium azide at BOTH the test and control spots (paralyzes worms that arrive).',
      'Spot the attractant (e.g. 1 µL) at the test spot and the solvent at the control spot.',
      'Wash worms off their plate with M9 / ddH₂O and rinse 2–3× to remove bacteria.',
      'Pipette ~50–200 worms at the origin; wick away excess liquid with a tissue corner.',
      'Lid on; incubate ~60 min at 20–22 °C.',
      'Count worms at the test region vs the control region (ignore non-movers left in the origin circle).',
      'Compute Chemotaxis Index = (Test − Control) / (Test + Control) and log it in the tracker below.',
      'Repeat across replicates; average the CI and compare conditions.',
    ],
    notes: 'Sodium azide is toxic — gloves + ventilation. Keep the agar surface dry (excess liquid lets worms swim instead of crawl). Always include a positive-control attractant and an N2 reference.',
    tracker: 'ci',
    source: { name: 'Margie, Palmer & Chin-Sang (2013) C. elegans Chemotaxis Assay — JoVE (modified from Bargmann 1993)', url: 'https://www.jove.com/t/50069' },
  },
  {
    id: 'drugscreen', icon: '💊', title: 'Drug Screening (liquid, 96-well)', tag: 'Chemical / HTS',
    purpose: 'Test small molecules for a phenotypic effect (survival, movement, growth, or a GFP reporter) by culturing worms with compounds in liquid 96-well plates.',
    params: [
      'Format: liquid culture in 96-well plates (S-medium + E. coli food).',
      'Worms: synchronized, ~10–30 per well (stage depends on the readout).',
      'Compounds: library stocks usually 10 mM in DMSO — keep FINAL DMSO ≤0.25% (no lifespan effect in N2 at that level).',
      'Controls on every plate: DMSO vehicle (negative) + a known-active compound (positive); ≥3 replicate wells.',
      'Hits: confirm with a dose–response (EC50/IC50) and a counter-screen.',
      'Readout: scored visually, by imaging, or by plate reader (survival, motility, body size, fluorescence).',
    ],
    materials: [
      'S-medium liquid culture with E. coli (see Liquid Culture procedure)',
      'Synchronized worms (see Bleach Solution procedure)',
      '96-well plates (clear flat-bottom; black for fluorescence)',
      'Compound library — typically 10 mM stocks in DMSO',
      'DMSO (vehicle control) + a positive-control compound',
      'Multichannel pipette / liquid handler; gas-permeable plate seal',
      'Scoring: dissecting scope, microplate imager, or plate reader',
    ],
    steps: [
      { t: 'Synchronize the worms (bleach → L1).', goto: 'bleach' },
      { t: 'Prepare S-medium with concentrated E. coli food.', goto: 'liquid' },
      'Dispense a fixed number of worms (~10–30) per well in S-medium + food.',
      'Add each compound to its well; keep final DMSO ≤0.25%. Include DMSO-only (vehicle) and positive-control wells, ≥3 replicates each.',
      'Seal with a gas-permeable membrane; incubate at 20 °C for the assay window (hours to weeks depending on readout).',
      'Top up food if it runs low — small volumes deplete fast.',
      'Score the phenotype per well; for movement, briefly stimulate (light/tap) first.',
      'Normalize each compound to the DMSO control on the same plate; flag wells past your hit threshold.',
      'Confirm hits: re-test, run a dose–response (EC50/IC50), and counter-screen for toxicity/autofluorescence.',
      'Record the % effect per compound in the tracker below.',
    ],
    notes: 'C. elegans has a cuticle and active xenobiotic metabolism, so effective doses are often higher than in cell culture — a non-hit is not always inactive. Watch DMSO (≤0.25%), food depletion, and plate edge-effects. Always confirm a hit in a secondary assay.',
    tracker: 'pct',
    source: { name: "O'Reilly et al. (2014) C. elegans in high-throughput drug discovery — Adv Drug Deliv Rev", url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4019719/' },
  },
  {
    id: 'bacterial', icon: '🦠', title: 'Bacterial Screening (killing assay)', tag: 'Host–pathogen / virulence',
    purpose: 'Screen bacterial strains for virulence (or test antibacterials) by scoring C. elegans survival on a test bacterial lawn versus an E. coli (OP50) control.',
    params: [
      'Two modes — SLOW kill (standard SK agar; gut infection over days; the reliable virulence readout) vs FAST kill (high-osmolarity agar; toxin-mediated death over hours).',
      'Test lawn: candidate bacterium (e.g. P. aeruginosa PA14). Control lawn: E. coli OP50 (non-pathogenic) in parallel.',
      'Worms: synchronized young adults, ~30–40 per plate, ≥3 plates per condition.',
      'Temperature: 25 °C is common for killing assays.',
      'Progeny control: FUdR or daily transfers (slow kill runs several days).',
      'Score: survival once daily (slow kill) or every 1–2 h (fast kill).',
    ],
    materials: [
      'Slow-kill (SK, modified NGM) plates — and/or high-osmolarity (PGS) plates for fast kill',
      'Test bacterial strain(s) (e.g. P. aeruginosa PA14) + E. coli OP50 control',
      'Synchronized young adults (see the Bleach Solution procedure)',
      'Platinum worm pick, dissecting scope, 25 °C incubator, scoring sheet',
    ],
    steps: [
      { t: 'Synchronize & grow worms to young adult.', goto: 'bleach' },
      'Grow the test bacterium and the OP50 control; spot lawns on the assay plates and incubate to form lawns.',
      'Use slow-kill agar for infection over days, or high-osmolarity agar for fast (toxin) killing.',
      'Transfer ~30–40 young adults onto each lawn (test + OP50 control), ≥3 plates each; record the starting count.',
      'Incubate at 25 °C.',
      'Score survival — daily for slow kill, every 1–2 h for fast kill.',
      'Dead = no response to gentle prodding; censor crawl-offs, bagged, desiccated or ruptured worms.',
      'Log survival per plate in the tracker; compare the test lawn against the OP50 control.',
      'Plot Kaplan–Meier survival, compare with the log-rank test, and report median survival / TD50.',
    ],
    notes: 'P. aeruginosa and similar pathogens are BSL-2 — get institutional approval and use BSL-2 practices. Slow killing reflects an active gut infection (specific virulence); fast killing is toxin-mediated and less strain-specific. Always run an OP50 control in parallel.',
    tracker: true,
    source: { name: 'Tan, Mahajan-Miklos & Ausubel (1999) Killing of C. elegans by P. aeruginosa — PNAS 96:715', url: 'https://www.pnas.org/doi/10.1073/pnas.96.2.715' },
  },
];

const findProc = id => PROCEDURES.find(p => p.id === id) || EXPERIMENTS.find(p => p.id === id);

// ── Per-procedure countdown timers (module-level so they survive card re-renders) ─
const timers = {};      // id -> {total,remaining,running,done}
const timerInts = {};   // id -> intervalId
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

const openSet = new Set();   // ids of expanded cards (procedures + experiments)
const volOf = p => { const v = parseFloat(localStorage.getItem(VKEY(p.id))); return (v && v > 0) ? v : p.baseVol; };
const setVol = (id, v) => localStorage.setItem(VKEY(id), String(v));
const PLKEY = id => `wt_procplate_${id}`;
const loadPlateMl = p => { const v = parseFloat(localStorage.getItem(PLKEY(p.id))); return (v && v > 0) ? v : (p.plates ? p.plates.def : 10); };
const setPlateMl = (id, v) => localStorage.setItem(PLKEY(id), String(v));
const FKEY = id => `wt_procfirm_${id}`;
const firmOf = p => { const v = parseFloat(localStorage.getItem(FKEY(p.id))); return (v && v > 0) ? v : (p.firmness ? p.firmness.def : 17); };
const setFirm = (id, v) => localStorage.setItem(FKEY(id), String(v));
const firmLabel = f => f < 15.5 ? 'soft' : f < 18.5 ? 'standard' : f < 21.5 ? 'firm' : 'very firm';

// Jump to a procedure: switch to the Procedures tab, expand it, scroll to it.
function gotoProc(id) {
  const le = document.getElementById('labExp'); if (!le) return;
  le.querySelectorAll('.le-tab').forEach(t => t.classList.toggle('active', t.dataset.letab === 'leProcedures'));
  le.querySelectorAll('.le-view').forEach(v => v.classList.toggle('active', v.id === 'leProcedures'));
  openSet.add(id); renderProcs();
  setTimeout(() => { [...document.querySelectorAll('#leProcedures [data-toggle]')].find(b => b.dataset.toggle === id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 40);
}

// Daily scoring tracker (date · dead · censored · auto-computed alive) with CSV export.
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

// Chemotaxis-index tracker: per-plate Test/Control counts → CI = (T−C)/(T+C).
function ciTrackerHTML(p) {
  const tk = loadTrack(p.id);
  const cis = [];
  const rows = tk.rows.map((r, i) => {
    const T = Number(r.test) || 0, C = Number(r.control) || 0, tot = T + C, ci = tot ? (T - C) / tot : null;
    if (ci != null) cis.push(ci);
    return `<tr>
      <td><input class="trk-in" data-trk="${p.id}:${i}:label" type="text" placeholder="plate ${i + 1}" value="${esc(r.label || '')}"></td>
      <td><input class="trk-in trk-num" data-trk="${p.id}:${i}:test" type="number" min="0" value="${esc(r.test ?? '')}"></td>
      <td><input class="trk-in trk-num" data-trk="${p.id}:${i}:control" type="number" min="0" value="${esc(r.control ?? '')}"></td>
      <td class="trk-alive">${ci == null ? '—' : ci.toFixed(2)}</td>
      <td><button class="trk-del" data-trkdel="${p.id}:${i}" type="button">✕</button></td>
    </tr>`;
  }).join('');
  const mean = cis.length ? cis.reduce((s, x) => s + x, 0) / cis.length : null;
  return `
    <div class="pc-sec">📊 Chemotaxis Index tracker</div>
    <div class="trk">
      <div class="trk-top">CI = (Test − Control) / (Test + Control), −1…+1 <span class="trk-sum">${mean == null ? '' : `mean CI ${mean.toFixed(2)} (n=${cis.length})`}</span></div>
      <table class="trk-tbl"><thead><tr><th>Plate / replicate</th><th>Test</th><th>Control</th><th>CI</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="trk-empty">No counts yet — add a plate after scoring.</td></tr>'}</tbody></table>
      <div class="trk-act">
        <button class="trk-add" data-trkadd="${p.id}" type="button">➕ Add plate</button>
        ${tk.rows.length ? `<button class="trk-csv" data-trkcsv="${p.id}" type="button">⬇ CSV</button>` : ''}
      </div>
    </div>`;
}

// % effect / hit tracker: per-compound Affected/Total → % effect.
function pctTrackerHTML(p) {
  const tk = loadTrack(p.id);
  const rows = tk.rows.map((r, i) => {
    const a = Number(r.affected) || 0, t = Number(r.total) || 0, pct = t ? a / t * 100 : null;
    return `<tr>
      <td><input class="trk-in" data-trk="${p.id}:${i}:label" type="text" placeholder="compound ${i + 1}" value="${esc(r.label || '')}"></td>
      <td><input class="trk-in trk-num" data-trk="${p.id}:${i}:affected" type="number" min="0" value="${esc(r.affected ?? '')}"></td>
      <td><input class="trk-in trk-num" data-trk="${p.id}:${i}:total" type="number" min="0" value="${esc(r.total ?? '')}"></td>
      <td class="trk-alive">${pct == null ? '—' : pct.toFixed(0) + '%'}</td>
      <td><button class="trk-del" data-trkdel="${p.id}:${i}" type="button">✕</button></td>
    </tr>`;
  }).join('');
  return `
    <div class="pc-sec">📊 Hit tracker (% effect)</div>
    <div class="trk">
      <div class="trk-top">% effect = affected ÷ total × 100 — compare each compound to its DMSO control</div>
      <table class="trk-tbl"><thead><tr><th>Compound</th><th>Affected</th><th>Total</th><th>% effect</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="trk-empty">No compounds scored yet.</td></tr>'}</tbody></table>
      <div class="trk-act">
        <button class="trk-add" data-trkadd="${p.id}" type="button">➕ Add compound</button>
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
          <span class="pc-vol-lbl">Plate:</span>
          <input class="pc-vol-in" data-plateml="${p.id}" type="number" min="1" step="0.5" value="${fmt(mlpp)}">
          <span class="pc-vol-u">mL/plate</span>
          <span class="pc-vol-presets">${p.plates.presets.map(s => `<button class="pc-vchip${s.ml === mlpp ? ' on' : ''}" data-plateset="${p.id}:${s.ml}" type="button">${esc(s.label)}</button>`).join('')}</span>
        </div>
        <div class="pc-yield">🍽 makes ≈ <b>${Math.round(vol / mlpp)}</b> plates at ${fmt(mlpp)} mL — allow ~${Math.round(w * 100)}% plating waste (≈ ${Math.floor(vol * (1 - w) / mlpp)}–${Math.floor(vol * (1 + w) / mlpp)} plates)</div>`;
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
        ${p.tracker ? (p.tracker === 'ci' ? ciTrackerHTML(p) : p.tracker === 'pct' ? pctTrackerHTML(p) : trackerHTML(p)) : ''}
        ${p.notes ? `<div class="pc-notes">📝 ${esc(p.notes)}</div>` : ''}
        ${p.source ? `<div class="pc-src">📚 Source: <a href="${esc(p.source.url)}" target="_blank" rel="noopener noreferrer">${esc(p.source.name)} ↗</a></div>` : ''}
        <div class="pc-act"><button class="pc-reset" data-reset="${p.id}" type="button">↺ Reset checklist</button></div>
      </div>` : ''}
    </div>`;
}

// Shared event wiring for a card container; `rerender` is the container's own render fn.
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
  // Step "→ Open" jump links
  root.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => gotoProc(b.dataset.goto));
  // Daily tracker
  root.querySelectorAll('[data-trkn]').forEach(inp => inp.onchange = () => { const id = inp.dataset.trkn; const t = loadTrack(id); t.n0 = inp.value === '' ? '' : Number(inp.value); saveTrack(id, t); rerender(); });
  root.querySelectorAll('[data-trk]').forEach(inp => inp.onchange = () => {
    const [id, i, field] = inp.dataset.trk.split(':'); const t = loadTrack(id);
    if (t.rows[i]) { t.rows[i][field] = (field === 'date' || field === 'label') ? inp.value : (inp.value === '' ? '' : Number(inp.value)); saveTrack(id, t); rerender(); }
  });
  root.querySelectorAll('[data-trkadd]').forEach(b => b.onclick = () => {
    const id = b.dataset.trkadd, tp = findProc(id)?.tracker; const t = loadTrack(id);
    t.rows.push(tp === 'ci' ? { label: '', test: '', control: '' } : tp === 'pct' ? { label: '', affected: '', total: '' } : { date: todayStr(), dead: '', censored: '' });
    saveTrack(id, t); rerender();
  });
  root.querySelectorAll('[data-trkdel]').forEach(b => b.onclick = () => { const [id, i] = b.dataset.trkdel.split(':'); const t = loadTrack(id); t.rows.splice(i, 1); saveTrack(id, t); rerender(); });
  root.querySelectorAll('[data-trkcsv]').forEach(b => b.onclick = () => exportTrackCSV(b.dataset.trkcsv));
}

function exportTrackCSV(id) {
  const t = loadTrack(id); let lines; const tp = findProc(id)?.tracker;
  if (tp === 'ci') {
    lines = [['plate', 'test', 'control', 'CI'].join(',')];
    t.rows.forEach(r => { const T = Number(r.test) || 0, C = Number(r.control) || 0, tot = T + C; lines.push([r.label || '', r.test ?? '', r.control ?? '', tot ? ((T - C) / tot).toFixed(3) : ''].join(',')); });
  } else if (tp === 'pct') {
    lines = [['compound', 'affected', 'total', 'percent_effect'].join(',')];
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
  const root = document.getElementById('leProcedures');
  if (!root) return;
  root.innerHTML = `
    <div class="le-intro">Bench protocols — tap one to expand, pick how much you're making (everything rescales), then check off steps as you go (progress is saved).</div>
    ${PROCEDURES.map(cardHTML).join('')}`;
  wireCards(root, renderProcs);
}

function renderExperiments() {
  const root = document.getElementById('leExperiments');
  if (!root) return;
  root.innerHTML = `
    <div class="le-intro">Experiment protocols — tap one to expand, then check off steps as you run it (progress is saved).</div>
    ${EXPERIMENTS.map(cardHTML).join('')}`;
  wireCards(root, renderExperiments);
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
