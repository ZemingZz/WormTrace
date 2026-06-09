/**
 * LifeCycle.js — C. elegans developmental stage data for multiple strains.
 *
 * Base N2 stage durations at 20°C (hours from egg deposition). CORRECTED 2026-06-03:
 * the previous values (egg 7.3h, larval ~41h total) were ~25°C-magnitude mislabeled
 * as 20°C; true 20°C development is slower.
 *   Embryo (laying→hatch): ~14h at 20°C  (WormBook primer NBK299460; Byerly et al. 1976)
 *   L1: 16h, L2: 12h, L3: 12h, L4: 12h   (WormBook primer: "L1 ~16h, the others ~12h")
 *   Young adult: 12h, Reproductive adult: 120h reproductive span
 *   → egg → reproductive adult ≈ 78h (~3.3 days at 20°C); proportionally faster at 25°C.
 *
 * Temperature scaling uses Q10 ≈ 2.1 (development ~2.1× faster per +10°C across 15–25°C;
 *   Olmedo et al. 2022 PMC9047341 Arrhenius data recomputed; classic ~2.1× figure).
 *
 * Strain-specific modifications:
 *   daf-2(e1370): L2 stage >2× prolonged; all stages ~1.5–2× N2 at 20°C;
 *                 100% dauer entry at 25°C (Kenyon et al. 1993; Gems et al. 1998)
 *   dpy-13(e184): body morphology only; developmental timing ~N2 (no published difference)
 *   daf-16(mu86): same timing as N2 as single mutant; suppresses daf-2 phenotypes
 *   eat-2(ad465): dietary restriction; growth ~10-15% slower due to reduced pumping
 *   age-1(hx546): NO developmental timing difference from N2 (Friedman & Johnson 1988)
 */

const Q10_EMBRYO = 2.1;
const Q10_LARVAL = 2.1;

// ── Base stage definitions at 20°C ───────────────────────────────────────────
// Stage icons chosen to visually represent each C. elegans developmental stage
// 🥚 egg → 🌱 L1 hatch → 🐣 L2 growing → 🐛 L3 → 🪲 L4 → 🪱 young adult → 🧬 reproductive → 💤 dauer
const BASE_STAGES = [
  {
    id: 'egg',        name: 'Egg / Embryo',        icon: '🥚', color: '#fbbf24',
    durationAt20: 14.0,  q10: Q10_EMBRYO,
    description: 'Embryogenesis. 3-fold elongation stage visible. Egg is transparent to opaque.',
    visibleSigns: 'Egg cells visible on plate; 2-cell → comma → 3-fold progression.',
    size: 'Egg ~50×30 μm',
  },
  {
    id: 'l1',         name: 'L1 Larva',             icon: '🌱', color: '#34d399',
    durationAt20: 16.0, q10: Q10_LARVAL,
    description: 'First larval stage. Worm begins feeding on bacteria. Arrests without food (L1 arrest).',
    visibleSigns: 'Small, slender worms ~250 μm. Active movement, feeding on OP50.',
    size: '~250 μm length',
  },
  {
    id: 'l2',         name: 'L2 Larva',             icon: '🐣', color: '#60a5fa',
    durationAt20: 12.0,  q10: Q10_LARVAL,
    description: 'Second larval stage. Dauer decision made at L2d checkpoint. Continued growth.',
    visibleSigns: 'Worms ~360 μm. Slightly larger than L1.',
    size: '~360 μm length',
  },
  {
    id: 'l3',         name: 'L3 Larva',             icon: '🐛', color: '#a78bfa',
    durationAt20: 12.0,  q10: Q10_LARVAL,
    description: 'Third larval stage. Gonad arms elongate. Vulva precursor cells divide.',
    visibleSigns: 'Worms ~490 μm. Gonad visible as a small white region.',
    size: '~490 μm length',
  },
  {
    id: 'l4',         name: 'L4 Larva',             icon: '🪲', color: '#f472b6',
    durationAt20: 12.0,  q10: Q10_LARVAL,
    description: 'Fourth larval stage. Vulva forms (crescent-shaped). Gonad arms fully elongate.',
    visibleSigns: 'Worms ~630 μm. Clear crescent (half-moon) shape on ventral side = vulva forming.',
    size: '~630 μm length',
  },
  {
    id: 'young_adult', name: 'Young Adult',          icon: '🪱', color: '#00d4aa',
    durationAt20: 12.0,  q10: Q10_LARVAL,
    description: 'Adult body size reached. Vulva complete. Not yet laying eggs.',
    visibleSigns: 'Full-size ~1 mm. Visible uterus and vulval opening. No eggs inside body yet.',
    size: '~1,000 μm length',
    trackEggs: false,
  },
  {
    id: 'adult',      name: 'Reproductive Adult',   icon: '🧬', color: '#ef4444',
    durationAt20: 120.0, q10: Q10_LARVAL,
    description: 'Egg-laying adult. ~300 self-progeny over 4–5 days at 20°C.',
    visibleSigns: 'Eggs visible inside uterus and being laid on plate. Progeny hatch around mother.',
    size: '~1,000 μm; gravid with eggs',
    trackEggs: true,
  },
];

// ── Strain definitions ────────────────────────────────────────────────────────
//
// dafClass drives dauer behaviour throughout the app:
//   'wild'  — facultative: enters dauer only under stress (crowding / starvation /
//             high temp). Wild-type N2 and morphology/DR mutants.
//   'daf-c' — Dauer-constitutive: enters dauer even under favourable conditions.
//             Mutations in POSITIVE regulators (DAF-2/insulin/IGF-1 receptor;
//             DAF-7/TGF-β ligand, DAF-1 receptor). Most are temperature-sensitive:
//             ~100% dauer at 25 °C, reduced at 20/15 °C.
//   'daf-d' — Dauer-defective: CANNOT form dauer, and suppresses daf-c phenotypes.
//             Loss of DAF-16/FOXO, or DAF-3/DAF-5 in the TGF-β branch.
// Sources: WormBook dauer chapter (NBK535516); Gottlieb & Ruvkun 1994 (PMC1205929);
//   Golden & Riddle 1984; WormBook TGF-β signalling chapter. See DAUER below.
export const STRAINS = {
  N2: {
    id: 'N2',
    label: 'N2 (Bristol) ♀ — wild-type hermaphrodite',
    sex: 'hermaphrodite',
    color: '#00d4aa',
    stageScale: {},         // per-stage multipliers (empty = N2 baseline)
    globalScale: 1.0,       // applied to all stages
    tempScaleOverride: {},  // {temp: scaleFactor} — overrides Q10 at specific temps
    dafClass: 'wild',
    dauerTemps: [],         // no constitutive dauer at selectable temps (10/20/25 °C)
    dauerTempPartial: [27], // a small fraction enter dauer at 27 °C (not selectable here)
    maxEggs: 300,
    lifespan20C: '~23 days (mean 23.2 ± 3.9, max ~34)',
    notes: 'Standard wild-type reference (self-fertilizing hermaphrodite). All baseline timings.',
    phenotype: 'Normal morphology, behavior, and lifespan. Self-fertile: ~300 self-progeny.',
    dauerNotes: 'Facultative: does NOT enter dauer at ≤25 °C while food is present. ' +
      'Stress (crowding pheromone, starvation) drives dauer; a small proportion enter ' +
      'at 27 °C, sufficient even without pheromone.',
    refs: 'Golden & Riddle 1984; Ailion & Thomas 2000; WormBook dauer (NBK535516); Corsi et al. 2015',
  },

  'N2-male': {
    id: 'N2-male',
    label: 'N2 (Bristol) ♂ — wild-type male',
    sex: 'male',
    color: '#38bdf8',
    stageScale: {},         // males develop on the same N2 timeline
    globalScale: 1.0,
    tempScaleOverride: {},
    dafClass: 'wild',
    dauerTemps: [],
    dauerTempPartial: [27],
    maxEggs: 0,             // males do not lay eggs (no self-progeny)
    lifespan20C: '~20 days (males ~10–20 d; shorter and more variable than hermaphrodites)',
    notes: 'Wild-type male. Arises spontaneously (~0.1–0.2%) or after heat shock; used for ' +
      'genetic crosses. Develops on the same N2 timeline but produces sperm only — no self-progeny.',
    phenotype: 'Slimmer body, specialized fan-shaped copulatory tail with rays and spicules. ' +
      'Mate-searching behavior. Cannot self-fertilize.',
    dauerNotes: 'Facultative, as N2 hermaphrodite.',
    refs: 'Brenner 1974; Corsi et al. 2015 (WormBook primer NBK299460); WormBook male biology',
  },

  'dpy-11': {
    id: 'dpy-11',
    label: 'dpy-11 (e224) — Dumpy',
    color: '#f59e0b',
    stageScale: {},
    globalScale: 1.05,      // morphology mutant; timing ~N2 (very slight delay assumed)
    tempScaleOverride: {},
    dafClass: 'wild',
    dauerTemps: [],
    maxEggs: 280,
    lifespan20C: '~18–20 days (≈N2)',
    notes: 'Chromosome V. Encodes a thioredoxin-like cuticle/hypodermis protein required for ' +
      'normal body elongation. Classic teaching Dpy marker, often used in mapping crosses.',
    phenotype: 'Short, fat (Dumpy) body. Normal movement and facultative dauer.',
    dauerNotes: 'Normal (facultative) dauer response, same as N2.',
    refs: 'Brenner 1974; Ko & Chow 2002 (dpy-11 thioredoxin); WormBase',
  },

  'dpy-11-male': {
    id: 'dpy-11-male',
    label: 'dpy-11 (e224) ♂ — Dumpy male',
    sex: 'male',
    color: '#f59e0b',
    stageScale: {},
    globalScale: 1.05,
    tempScaleOverride: {},
    dafClass: 'wild',
    dauerTemps: [],
    maxEggs: 0,             // males do not lay eggs
    lifespan20C: '~16–20 days (males shorter/more variable)',
    notes: 'Dumpy male (chromosome V, e224). Needed to CROSS dpy-11 into other strains — ' +
      'hermaphrodites self-fertilize, so males supply the sperm that makes cross-progeny.',
    phenotype: 'Short, fat (Dpy) body with the male fan-shaped copulatory tail. No self-progeny.',
    dauerNotes: 'Normal (facultative) dauer response.',
    refs: 'Brenner 1974; WormBook Classical genetic methods (NBK179229)',
  },

  'dpy-13': {
    id: 'dpy-13',
    label: 'dpy-13 (e184) — Dumpy',
    color: '#fbbf24',
    stageScale: {},
    globalScale: 1.05,      // no published difference; very slight delay assumed
    tempScaleOverride: {},
    dafClass: 'wild',
    dauerTemps: [],
    maxEggs: 280,
    lifespan20C: '~18–20 days',
    notes: 'Collagen gene mutation. Body ~60–70% of N2 length.',
    phenotype: 'Short (Dpy), fat body. Normal behavioral repertoire.',
    dauerNotes: 'Normal (facultative) dauer response, same as N2.',
    refs: 'Brenner 1974; Levy et al. 1993',
  },

  'dpy-13-male': {
    id: 'dpy-13-male',
    label: 'dpy-13 (e184) ♂ — Dumpy male',
    sex: 'male',
    color: '#fbbf24',
    stageScale: {},
    globalScale: 1.05,
    tempScaleOverride: {},
    dafClass: 'wild',
    dauerTemps: [],
    maxEggs: 0,             // males do not lay eggs
    lifespan20C: '~16–20 days (males shorter/more variable)',
    notes: 'Dumpy male (chromosome IV, e184). Needed to CROSS dpy-13 into other strains — ' +
      'hermaphrodites self-fertilize, so males supply the sperm that makes cross-progeny.',
    phenotype: 'Short, fat (Dpy) body with the male fan-shaped copulatory tail. No self-progeny.',
    dauerNotes: 'Normal (facultative) dauer response.',
    refs: 'Brenner 1974; WormBook Classical genetic methods (NBK179229)',
  },

  'daf-2': {
    id: 'daf-2',
    label: 'daf-2 (e1370) — Insulin/IGF-1 receptor',
    color: '#7c3aed',
    // L2 stage is most dramatically extended (>2×); other stages ~1.3–1.5×
    stageScale: { egg: 1.1, l1: 1.3, l2: 2.2, l3: 1.4, l4: 1.5, young_adult: 1.3, adult: 1.5 },
    globalScale: 1.0,       // per-stage overrides above take precedence
    tempScaleOverride: {},
    dafClass: 'daf-c',
    dauerTemps: [25],       // ts Daf-c: ~100% dauer at 25 °C
    dauerTempPartial: [20], // reduced, allele/assay-dependent penetrance at 20 °C
    maxEggs: 200,           // reduced progeny
    lifespan20C: '~26 days (e1368: 26.3 ± 1.0; e1370 allele ~2× N2)',
    notes: 'Insulin/IGF-1 receptor (ortholog of human INSR). Extended lifespan. Dauer-constitutive.',
    phenotype: 'Normal morphology. ~2× lifespan. ~1.5× slower development (L2 most extended). ~100% dauer at 25 °C.',
    dauerNotes: 'Temperature-sensitive Daf-c: ~100% dauer at 25 °C; reduced at 20 °C ' +
      '(~15% commonly cited for e1370, but allele/assay-dependent — ~1% for some ts alleles); ' +
      'maintained at 15 °C. NOTE: strong/null daf-2 (and age-1/daf-23) alleles arrest as dauer ' +
      'NON-conditionally (temperature-independent) and do not recover.',
    refs: 'Gottlieb & Ruvkun 1994 (PMC1205929); Pierce et al. 2001 (PMC312654); ' +
      'Gems et al. 1998; WormBook dauer (NBK535516); Kenyon et al. 1993',
  },

  'daf-7': {
    id: 'daf-7',
    label: 'daf-7 (e1372) — TGF-β ligand',
    color: '#06b6d4',
    // ts Daf-c; development similar to N2 when not arresting, slight L2 prolongation
    stageScale: { l2: 1.3 },
    globalScale: 1.0,
    tempScaleOverride: {},
    dafClass: 'daf-c',
    dauerTemps: [25],       // ts Daf-c: ~100% dauer at 25 °C
    dauerTempPartial: [20], // reduced penetrance at 20 °C (allele/assay-dependent)
    maxEggs: 290,
    lifespan20C: '~20 days (≈N2 when grown non-dauer)',
    notes: 'TGF-β superfamily ligand expressed in ASI sensory neurons; normally relays the ' +
      '"favourable conditions" signal. Loss → constitutive dauer. Upstream of daf-1/daf-4 → daf-8/daf-14.',
    phenotype: 'Normal morphology. ~100% dauer at 25 °C; develops reproductively at lower temps.',
    dauerNotes: 'Temperature-sensitive Daf-c: ~100% dauer at 25 °C, dauers form by ~48 h; ' +
      'reduced dauer at 20/15 °C; maintained at 15 °C. (The 22.5%-at-20 °C figure failed ' +
      'cross-checking and is NOT used.)',
    refs: 'WormBook TGF-β signalling; WormBook dauer (NBK535516); Shaw et al. 2007 (PMC3124252)',
  },

  'daf-1': {
    id: 'daf-1',
    label: 'daf-1 (m40) — TGF-β type-I receptor',
    color: '#0ea5e9',
    stageScale: { l2: 1.3 },
    globalScale: 1.0,
    tempScaleOverride: {},
    dafClass: 'daf-c',
    dauerTemps: [25],       // ts Daf-c, like other TGF-β branch members
    dauerTempPartial: [20],
    maxEggs: 290,
    lifespan20C: '~20 days (≈N2 when grown non-dauer)',
    notes: 'Type-I TGF-β receptor for the DAF-7 ligand. Loss disrupts the favourable-conditions ' +
      'signal → constitutive dauer. Suppressed by daf-3/daf-5 (Daf-d).',
    phenotype: 'Normal morphology. Temperature-sensitive constitutive dauer.',
    dauerNotes: 'Temperature-sensitive Daf-c: high dauer penetrance at 25 °C, reduced at 20/15 °C.',
    refs: 'WormBook TGF-β signalling; Georgi et al. 1990; WormBook dauer (NBK535516)',
  },

  'daf-16': {
    id: 'daf-16',
    label: 'daf-16 (mu86) — FOXO transcription factor',
    color: '#f97316',
    stageScale: {},
    globalScale: 0.97,      // nearly identical to N2; slight acceleration reported
    tempScaleOverride: {},
    dafClass: 'daf-d',
    dauerTemps: [],         // Dauer-defective — cannot form dauer
    maxEggs: 300,
    lifespan20C: '~15 days (mu86: 15.3 ± 2.5, max ~25)',
    notes: 'FOXO transcription factor, the key effector downstream of daf-2/PI3K. ' +
      'Required for dauer; epistatic to daf-2/age-1.',
    phenotype: 'Normal morphology. Slightly shortened lifespan. Cannot enter dauer.',
    dauerNotes: 'Dauer-DEFECTIVE: cannot form dauer (DAF-16 is required for the dauer program) ' +
      'and suppresses the dauer-constitutive phenotype of daf-2 and age-1/daf-23. ' +
      'Under starvation, larvae die instead of arresting.',
    refs: 'Gottlieb & Ruvkun 1994 (PMC1205929); Lin et al. 1997; Ogg et al. 1997',
  },

  'daf-3': {
    id: 'daf-3',
    label: 'daf-3 (e1376) — Co-Smad (Daf-defective)',
    color: '#f43f5e',
    stageScale: {},
    globalScale: 1.0,
    tempScaleOverride: {},
    dafClass: 'daf-d',
    dauerTemps: [],         // Dauer-defective
    maxEggs: 300,
    lifespan20C: '~20 days (≈N2)',
    notes: 'Co-Smad acting downstream of the DAF-7/TGF-β branch; normally inhibited by DAF-7 ' +
      'signalling. Loss blocks dauer and suppresses TGF-β-branch Daf-c mutants (daf-7/daf-1/daf-4).',
    phenotype: 'Normal morphology. Dauer-defective.',
    dauerNotes: 'Dauer-DEFECTIVE: cannot form dauer via the TGF-β branch; suppresses daf-7/daf-1 Daf-c.',
    refs: 'Patterson et al. 1997; WormBook TGF-β signalling; WormBook dauer (NBK535516)',
  },

  'daf-5': {
    id: 'daf-5',
    label: 'daf-5 (e1386) — Sno/Ski (Daf-defective)',
    color: '#fb7185',
    stageScale: {},
    globalScale: 1.0,
    tempScaleOverride: {},
    dafClass: 'daf-d',
    dauerTemps: [],         // Dauer-defective
    maxEggs: 300,
    lifespan20C: '~20 days (≈N2)',
    notes: 'Sno/Ski-family partner of DAF-3 in the TGF-β branch. Loss blocks dauer and ' +
      'suppresses TGF-β-branch Daf-c mutants.',
    phenotype: 'Normal morphology. Dauer-defective.',
    dauerNotes: 'Dauer-DEFECTIVE: cannot form dauer via the TGF-β branch; suppresses daf-7/daf-1 Daf-c.',
    refs: 'da Graca et al. 2004; Tewari et al. 2004; WormBook TGF-β signalling',
  },

  'eat-2': {
    id: 'eat-2',
    label: 'eat-2 (ad465) — Dietary restriction',
    color: '#ec4899',
    stageScale: {},
    globalScale: 1.15,      // ~15% slower due to reduced food intake
    tempScaleOverride: {},
    dafClass: 'wild',
    dauerTemps: [],
    maxEggs: 150,           // fewer progeny due to dietary restriction
    lifespan20C: '~28–30 days (~1.4× N2)',
    notes: 'Nicotinic acetylcholine receptor subunit. Reduced pharyngeal pumping → dietary restriction.',
    phenotype: 'Thin body, reduced pumping rate (~45% of N2). Extended lifespan via DR.',
    dauerNotes: 'Normal (facultative) dauer response.',
    refs: 'Raizen et al. 1995; Lakowski & Hekimi 1998',
  },

  'age-1': {
    id: 'age-1',
    label: 'age-1 (hx546) — PI3 Kinase',
    color: '#a78bfa',
    stageScale: {},
    globalScale: 1.0,       // NO developmental timing difference from N2 (Friedman & Johnson 1988)
    tempScaleOverride: {},
    dafClass: 'wild',       // hx546 is a weak/ts allele: near-normal facultative dauer
    dauerTemps: [],
    dauerTempPartial: [27], // weak allele shows dauer mainly at high temp
    maxEggs: 290,
    lifespan20C: '~29–40 days (~1.4–2× N2)',
    notes: 'Catalytic subunit of PI3K (upstream of daf-16). Extended lifespan entirely post-reproductive.',
    phenotype: 'Normal morphology and development. Lifespan extension only after reproduction.',
    dauerNotes: 'The weak hx546 allele is near-normal (facultative). NOTE: strong/null age-1 ' +
      '(= daf-23) alleles are NON-conditional Daf-c — ~100% dauer arrest at all temperatures, ' +
      'do not recover, suppressed by daf-16.',
    refs: 'Gottlieb & Ruvkun 1994 (PMC1205929); Friedman & Johnson 1988; Morris et al. 1996',
  },

  custom: {
    id: 'custom',
    label: '✏ Custom strain (name yourself)',
    color: '#64748b',
    stageScale: {},
    globalScale: 1.0,
    tempScaleOverride: {},
    dafClass: 'wild',
    dauerTemps: [],
    maxEggs: 300,
    lifespan20C: 'Unknown',
    notes: 'User-defined strain. Timing defaults to N2 unless observations indicate otherwise.',
    phenotype: 'Unknown.',
    dauerNotes: 'Unknown — assumed facultative (wild-type-like) until observations indicate otherwise.',
    refs: '',
  },
};

/**
 * Register a worm from the Worm Collection as a usable strain so plates can run it.
 * Idempotent (re-registering overwrites). Imported worms carry their own
 * `lifespanDays20C` (honoured by adultLifespanHours below) and a `globalScale`
 * derived from their egg→adult growth time. Marked `_imported` so the catalog UI
 * can tell them apart from the built-in strains.
 */
export function registerStrain(rec) {
  if (!rec || !rec.id) return null;
  const dafClass = rec.dafClass || 'wild';
  STRAINS[rec.id] = {
    id: rec.id,
    label: rec.label || rec.id,
    color: rec.color || '#64748b',
    stageScale: {},
    globalScale: rec.globalScale || 1.0,    // development speed vs N2 (1.0 = N2 timing)
    tempScaleOverride: {},
    dafClass,
    dauerTemps:        dafClass === 'daf-c' ? [25] : [],
    dauerTempPartial:  dafClass === 'daf-c' ? [20] : [],
    maxEggs: rec.maxEggs ?? 300,
    lifespan20C: rec.lifespanText || (rec.lifespanDays20C ? `~${rec.lifespanDays20C} days` : 'Unknown'),
    lifespanDays20C: rec.lifespanDays20C ?? 20,   // read by adultLifespanHours()
    notes: rec.notes || '',
    phenotype: rec.phenotype || '',
    dauerNotes: '',
    refs: rec.refs || '',
    _imported: true,
  };
  return STRAINS[rec.id];
}

/**
 * Mean ADULT lifespan in days at 20 °C per strain (numeric companion to the
 * human-readable `lifespan20C` strings). Used to drive death in the growth
 * simulation so long-lived strains (daf-2, age-1, eat-2) persist realistically.
 * Sources: Kenyon 1993; Lakowski & Hekimi 1998; Hahm 2018 (see DAUER_RESEARCH.md).
 */
// N2, daf-2, daf-16 from a single large-n survival dataset supplied by the lab
// (mean ± SD days @20°C): N2 23.2 ± 3.9 (n=1187), daf-2(e1368) 26.3 ± 1.0 (n=808),
// daf-16(mu86) 15.3 ± 2.5 (n=1449). NOTE: that daf-2 allele (e1368) is only ~1.13×
// here — much weaker than the canonical daf-2(e1370) ~2×. dpy-13/daf-3 assumed ≈N2;
// daf-7/-1/-5 from Shaw 2007 (FUdR, normalized); eat-2/age-1 ~+40% from their studies.
const ADULT_LIFESPAN_DAYS_20C = {
  'N2': 23, 'N2-male': 20, 'dpy-13': 23, 'dpy-13-male': 19, 'dpy-11': 20, 'dpy-11-male': 18, 'daf-2': 26, 'daf-7': 27, 'daf-1': 29,
  'daf-16': 15, 'daf-3': 23, 'daf-5': 20, 'eat-2': 28, 'age-1': 28,
};
// Lifespan scales inversely with metabolic rate — cold extends, heat shortens.
const LIFESPAN_TEMP_FACTOR = { 10: 2.0, 15: 1.5, 20: 1.0, 25: 0.65 };

/** Mean adult lifespan in HOURS for a strain at a temperature (post-adulthood). */
export function adultLifespanHours(strainId = 'N2', tempC = 20) {
  const days = ADULT_LIFESPAN_DAYS_20C[strainId] ?? STRAINS[strainId]?.lifespanDays20C ?? 20;
  const f = LIFESPAN_TEMP_FACTOR[tempC] ?? (tempC <= 12 ? 2.0 : tempC <= 17 ? 1.5 : tempC <= 22 ? 1.0 : 0.65);
  return days * 24 * f;
}
/** Mean adult lifespan in DAYS (rounded) — for display. */
export function adultLifespanDays(strainId = 'N2', tempC = 20) {
  return Math.round(adultLifespanHours(strainId, tempC) / 24);
}

/**
 * DAUER — verified quantitative metrics for the dauer larva, used to parameterize
 * the simulation. Every figure here was cross-checked across ≥2 independent sources
 * (deep-research pass, 2026-06-02). Temperatures in °C, times in hours.
 *
 * Sources: Golden & Riddle 1984 (PNAS/Dev Biol; PMID 6706004); Ailion & Thomas 2000
 *   (Genetics 156:1047; PMID 11063684); Gottlieb & Ruvkun 1994 (PMC1205929);
 *   Pierce et al. 2001 (PMC312654); WormBook dauer chapter (NBK535516); Klass & Hirsh 1976.
 */
export const DAUER = {
  // ── Decision & commitment (the L1 → L2d → dauer pathway) ──
  decisionStages: ['l1', 'l2'],   // larva decides in late L1; commits at the L2d molt
  commitStage: 'l2',              // irreversible commitment a few hours before mid-L2d molt
  // Dauer morphogenesis (radial shrinkage → SDS-resistant) takes far longer than a normal molt
  morphogenesisHrs25C: 11.5,      // L2d→dauer molt ~11–12 h at 25 °C (vs 1–2 h for other molts)

  // ── Strain-specific time-to-dauer at 25 °C (hours from synchronized L1 on food) ──
  formByHrs25C: { 'daf-7': 48, 'daf-2': 80 },

  // ── Environmental triggers ──
  // Three cues integrate via DAF-7/TGF-β + DAF-2/insulin onto DAF-16/FOXO.
  triggers: {
    crowding: 'Population-density pheromone (ascarosides) — dose-dependent; commits at L2d molt.',
    starvation: 'Food (E. coli) scarcity — food competitively antagonizes pheromone and promotes recovery.',
    temperature: 'Higher temp raises dauer fraction (15→25 °C); 27 °C is a standalone trigger.',
  },
  maxDauerOnLawnPct: 90,          // ≤~90% achievable on an E. coli lawn; 100% only in liquid + limited food
  highTempThresholdC: 27,         // 27 °C drives dauer in WT even without pheromone
  tempSensitivePeriod: 'l1',      // temperature acts around the L1 molt (distinct from L2d commitment)

  // ── Survival without food (non-aging, lives off stored lipids) ──
  survivalHoursTypical: 60 * 24,  // ~2 months routinely
  survivalHoursMax: 120 * 24,     // up to ~4 months (Klass & Hirsh 1976)

  // ── Recovery / exit (food return or temperature downshift) ──
  recoveryCommitMinutes: [50, 60],// commits to recovery 50–60 min after reaching food (23 °C)
  recoveryFeedingHrs: [2, 3],     // resumes feeding within 2–3 h
  recoveryTempDownpulseHrs: 10,   // a 10 h 25→15 °C downpulse induces ~50% recovery

  // ── L1 starvation survival for dauer-DEFECTIVE strains (cannot arrest as dauer) ──
  l1ArrestSurvivalHrs: 12 * 24,   // L1 arrest survives ~1–2 weeks; older larvae die sooner

  // ── Behavioral / morphological hallmarks ──
  nonFeeding: true,               // pharynx constricted + buccal plug → 0 food intake
  radiallyConstricted: true,      // longer & thinner than L3
  sdsResistant: true,             // survives 1% SDS ~30 min (thickened cuticle)
};

// ── Stage computation ─────────────────────────────────────────────────────────

/**
 * Get computed stage timeline for a strain at a given temperature.
 * Returns stages with absolute start/end in hours from egg deposition.
 */
export function getStages(strainId = 'N2', tempC = 20) {
  const strain = STRAINS[strainId] ?? STRAINS.N2;

  // Check for dauer condition
  if (strain.dauerTemps?.includes(tempC)) {
    return getDauerStages(strain, tempC);
  }

  let cursor = 0;
  return BASE_STAGES.map(s => {
    // Temperature scaling (Q10-based)
    const q10Scale = Math.pow(s.q10, (20 - tempC) / 10);
    // Strain-specific per-stage scale
    const strainScale = strain.stageScale?.[s.id] ?? strain.globalScale ?? 1.0;
    const dur = s.durationAt20 * q10Scale * strainScale;
    const stage = { ...s, start: cursor, end: cursor + dur, duration: dur, tempC, strainId };
    cursor += dur;
    return stage;
  });
}

/** Synthetic dauer stage timeline for Daf-constitutive strains that arrest at 25°C.
 *  The larva develops through egg → L1 → L2(d), then enters dauer at the L2d molt
 *  (commitment a few hours before the mid-L2d molt). Dauer morphogenesis itself
 *  takes ~11–12 h at 25 °C (DAUER.morphogenesisHrs25C), far longer than the 1–2 h
 *  of a normal molt, after which the larva survives for months without feeding. */
function getDauerStages(strain, tempC) {
  const q10Scale = Math.pow(Q10_LARVAL, (20 - tempC) / 10);
  let cursor = 0;
  const preStages = ['egg','l1','l2'].map(id => {
    const s = BASE_STAGES.find(b => b.id === id);
    const dur = s.durationAt20 * q10Scale * (strain.stageScale?.[id] ?? 1.0);
    const stage = { ...s, start: cursor, end: cursor + dur, duration: dur, tempC, strainId: strain.id };
    cursor += dur;
    return stage;
  });
  // Dauer survival is temperature-scaled around the ~4-month maximum (Klass & Hirsh 1976).
  const survivalHrs = DAUER.survivalHoursMax * q10Scale;
  const dauerStage = {
    id: 'dauer', name: 'Dauer Larva', icon: '💤', color: '#94a3b8',
    start: cursor, end: cursor + survivalHrs, duration: survivalHrs,
    morphogenesisHrs: DAUER.morphogenesisHrs25C * q10Scale,
    description: `At ${tempC}°C, ${strain.id} commits to dauer at the L2d molt. Dauer is a ` +
      `stress-resistant, non-aging, non-feeding alternative to L3 that survives months ` +
      `(up to ~4 mo) without food and exits within hours once food returns.`,
    visibleSigns: 'Radially constricted (longer & thinner), non-feeding (sealed buccal cavity), ' +
      'SDS-resistant. Darkened gut granules. May form "daisy-chains".',
    size: '~500 μm, slender and straight (radially constricted)',
    tempC, strainId: strain.id, isDauer: true,
    trackEggs: false,
  };
  return [...preStages, dauerStage];
}

/**
 * Current stage and progress for given hours elapsed since egg deposition.
 */
export function getCurrentStage(hoursElapsed, strainId = 'N2', tempC = 20) {
  const stages = getStages(strainId, tempC);
  for (const s of stages) {
    if (hoursElapsed >= s.start && hoursElapsed < s.end) {
      return {
        stage: s,
        progress: (hoursElapsed - s.start) / s.duration,
        hoursInStage: hoursElapsed - s.start,
        hoursToNext: s.end - hoursElapsed,
        allStages: stages,
      };
    }
  }
  const last = stages[stages.length - 1];
  return { stage: last, progress: 1, hoursInStage: hoursElapsed - last.start, hoursToNext: 0, allStages: stages };
}

export function getTotalHours(strainId = 'N2', tempC = 20) {
  const stages = getStages(strainId, tempC);
  return stages[stages.length - 1].end;
}

/**
 * Relative bacterial-food intake per stage (normalised to adult = 1.0).
 * Intake = pumping rate × volume ingested per pump.
 *  • Eggs do NOT feed (sealed eggshell) → 0
 *  • VERIFIED (eLife 2022, Bonnard et al., >1000 animals): pumping RATE rises only
 *    SLIGHTLY across larval stages — it is NOT the main driver of the intake ramp,
 *    and per-worm intake does NOT scale linearly with body length (R²=0.753 refuted).
 *    Adults pump ~200–300/min (≈250 typical, ≈300 max); larvae pump nearly as fast.
 *  • So the steep ramp below reflects GULP VOLUME (pharynx/body size grows ~L1 250 µm →
 *    adult ~1 mm), not pumping speed. young_adult ≈ L4-and-up (rate plateaus there).
 *  • DAUER does NOT feed (pharynx constricted, buccal plug) → 0
 * (Bonnard et al. 2022 eLife 77252; Avery 1993; WormBook pharynx/feeding NBK116080.)
 */
export const STAGE_FOOD_FACTOR = {
  egg: 0, l1: 0.12, l2: 0.25, l3: 0.45, l4: 0.70,
  young_adult: 0.90, adult: 1.0, dauer: 0,
};

/**
 * FOOD — verified reference constants for the OP50 bacterial lawn, used to label the
 * food slider and (optionally) convert OD600 measurements. Cross-checked across ≥2
 * sources (deep-research pass, 2026-06-02). NOTE: dry-mass (mg/mL, g/L) and CFU-per-mg
 * conversions were REFUTED in verification and are deliberately omitted — only the
 * cells/mL ↔ OD600 conversion survived.
 *
 * Sources: WormBook maintenance (NBK19649); Stroustrup-style protocol (PMC7307455);
 *   Bonnard et al. 2022 (eLife 77252); WormBook pharynx (NBK116080); Genes&Dev 22:2149.
 */
export const FOOD = {
  // Typical OP50 seeding volumes (lab-variable; overall range ~10–300 µL).
  seedingUL: { '35mm': 25, '60mm_drop': 50, '60mm_spread': 200, '100mm': 100 },
  // The app's food slider is in mL of seeded OP50 suspension:
  //   0.05 mL ≈ a standard 50 µL centred drop lawn on a 60 mm plate
  //   0.20 mL ≈ a fully spread / concentrated lawn on a 60 mm plate (slider default)
  defaultMl: 0.2,
  // OD600 → live cell density (the surviving conversion; strain-dependent 2e7–1e9/mL).
  cellsPerMlPerOD: 8e8,
  typicalFoodOD: [1.0, 1.5],   // OP50 feeding stocks are usually OD600 1.0–1.5
  // Adult pharyngeal pumping (feeding present); larvae pump nearly as fast.
  adultPumpPerMin: [200, 300],
  adultPumpTypical: 250,
  nonFeedingStages: ['egg', 'dauer'],   // eggs sealed; dauer has a buccal plug
};

/**
 * Effective adult-equivalent feeding-hours for ONE worm developing from egg to
 * `devHrs`. Integrates the per-stage food factor over the developmental timeline
 * so younger worms consume far less than adults.
 */
export function cumulativeFeedHours(strainId, tempC, devHrs) {
  if (devHrs <= 0) return 0;
  const stages = getStages(strainId, tempC);
  let acc = 0;
  for (const s of stages) {
    const lo = Math.max(s.start, 0);
    const hi = Math.min(s.end, devHrs);
    if (hi > lo) acc += (hi - lo) * (STAGE_FOOD_FACTOR[s.id] ?? 1);
  }
  // Past the last defined stage, treat as adult feeding
  const last = stages[stages.length - 1];
  if (devHrs > last.end) acc += (devHrs - last.end) * (STAGE_FOOD_FACTOR.adult ?? 1);
  return acc;
}

export function fmtHours(h) {
  if (h < 0) return '—';
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 48) return `${h.toFixed(1)}h`;
  const d = Math.floor(h / 24), rem = h % 24;
  return d > 0 ? `${d}d ${rem.toFixed(0)}h` : `${h.toFixed(1)}h`;
}

export function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  return `${m}m ${s % 60}s`;
}

export const SUPPORTED_TEMPS = [10, 15, 20, 25];
