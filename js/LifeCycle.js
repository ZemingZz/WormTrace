/**
 * LifeCycle.js — C. elegans developmental stage data for multiple strains.
 *
 * Base N2 stage durations at 20°C (hours from egg deposition):
 *   Embryo hatch: 7.3h  (Corsi et al. 2015)
 *   L1: 14.95h, L2: 9.01h, L3: 7.37h, L4: 9.85h (Corsi et al. 2015)
 *   Young adult: 11h, Reproductive adult: 120h reproductive span
 *
 * Temperature scaling uses stage-specific Q10 values:
 *   Q10 ≈ 2.8 embryonic, ≈ 2.5 larval (Boyle et al. 2022, PMC9047341)
 *
 * Strain-specific modifications:
 *   daf-2(e1370): L2 stage >2× prolonged; all stages ~1.5–2× N2 at 20°C;
 *                 100% dauer entry at 25°C (Kenyon et al. 1993; Gems et al. 1998)
 *   dpy-13(e184): body morphology only; developmental timing ~N2 (no published difference)
 *   daf-16(mu86): same timing as N2 as single mutant; suppresses daf-2 phenotypes
 *   eat-2(ad465): dietary restriction; growth ~10-15% slower due to reduced pumping
 *   age-1(hx546): NO developmental timing difference from N2 (Friedman & Johnson 1988)
 */

const Q10_EMBRYO = 2.8;
const Q10_LARVAL = 2.5;

// ── Base stage definitions at 20°C ───────────────────────────────────────────
// Stage icons chosen to visually represent each C. elegans developmental stage
// 🥚 egg → 🌱 L1 hatch → 🐣 L2 growing → 🐛 L3 → 🪲 L4 → 🪱 young adult → 🧬 reproductive → 💤 dauer
const BASE_STAGES = [
  {
    id: 'egg',        name: 'Egg / Embryo',        icon: '🥚', color: '#fbbf24',
    durationAt20: 7.3,  q10: Q10_EMBRYO,
    description: 'Embryogenesis. 3-fold elongation stage visible. Egg is transparent to opaque.',
    visibleSigns: 'Egg cells visible on plate; 2-cell → comma → 3-fold progression.',
    size: 'Egg ~50×30 μm',
  },
  {
    id: 'l1',         name: 'L1 Larva',             icon: '🌱', color: '#34d399',
    durationAt20: 14.95, q10: Q10_LARVAL,
    description: 'First larval stage. Worm begins feeding on bacteria. Arrests without food (L1 arrest).',
    visibleSigns: 'Small, slender worms ~250 μm. Active movement, feeding on OP50.',
    size: '~250 μm length',
  },
  {
    id: 'l2',         name: 'L2 Larva',             icon: '🐣', color: '#60a5fa',
    durationAt20: 9.01,  q10: Q10_LARVAL,
    description: 'Second larval stage. Dauer decision made at L2d checkpoint. Continued growth.',
    visibleSigns: 'Worms ~360 μm. Slightly larger than L1.',
    size: '~360 μm length',
  },
  {
    id: 'l3',         name: 'L3 Larva',             icon: '🐛', color: '#a78bfa',
    durationAt20: 7.37,  q10: Q10_LARVAL,
    description: 'Third larval stage. Gonad arms elongate. Vulva precursor cells divide.',
    visibleSigns: 'Worms ~490 μm. Gonad visible as a small white region.',
    size: '~490 μm length',
  },
  {
    id: 'l4',         name: 'L4 Larva',             icon: '🪲', color: '#f472b6',
    durationAt20: 9.85,  q10: Q10_LARVAL,
    description: 'Fourth larval stage. Vulva forms (crescent-shaped). Gonad arms fully elongate.',
    visibleSigns: 'Worms ~630 μm. Clear crescent (half-moon) shape on ventral side = vulva forming.',
    size: '~630 μm length',
  },
  {
    id: 'young_adult', name: 'Young Adult',          icon: '🪱', color: '#00d4aa',
    durationAt20: 11.0,  q10: Q10_LARVAL,
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
export const STRAINS = {
  N2: {
    id: 'N2',
    label: 'N2 (Bristol) — wild-type',
    color: '#00d4aa',
    stageScale: {},         // per-stage multipliers (empty = N2 baseline)
    globalScale: 1.0,       // applied to all stages
    tempScaleOverride: {},  // {temp: scaleFactor} — overrides Q10 at specific temps
    dauerTemps: [],         // temps at which this strain reliably enters dauer
    maxEggs: 300,
    lifespan20C: '~20 days',
    notes: 'Standard wild-type reference. All baseline timings.',
    phenotype: 'Normal morphology, behavior, and lifespan.',
    dauerNotes: 'Rarely enters dauer under standard laboratory conditions.',
    refs: 'Corsi et al. 2015 (WormBook); Boyle et al. 2022 (PMC9047341)',
  },

  'dpy-13': {
    id: 'dpy-13',
    label: 'dpy-13 (e184) — Dumpy',
    color: '#fbbf24',
    stageScale: {},
    globalScale: 1.05,      // no published difference; very slight delay assumed
    tempScaleOverride: {},
    dauerTemps: [],
    maxEggs: 280,
    lifespan20C: '~18–20 days',
    notes: 'Collagen gene mutation. Body ~60–70% of N2 length.',
    phenotype: 'Short (Dpy), fat body. Normal behavioral repertoire.',
    dauerNotes: 'Normal dauer response (same as N2).',
    refs: 'Brenner 1974; Levy et al. 1993',
  },

  'daf-2': {
    id: 'daf-2',
    label: 'daf-2 (e1370) — Insulin receptor',
    color: '#7c3aed',
    // L2 stage is most dramatically extended (>2×); other stages ~1.3–1.5×
    stageScale: { egg: 1.1, l1: 1.3, l2: 2.2, l3: 1.4, l4: 1.5, young_adult: 1.4, adult: 2.0 },
    globalScale: 1.0,       // per-stage overrides above take precedence
    tempScaleOverride: {},
    dauerTemps: [25],       // 100% dauer at 25°C
    dauerTempPartial: [20], // low penetrance dauer at 20°C
    maxEggs: 200,           // reduced progeny
    lifespan20C: '~40–50 days (~2× N2)',
    notes: 'Insulin/IGF-1 receptor (ortholog of human INSR). Extended lifespan. Dauer-prone.',
    phenotype: 'Normal morphology. ~2× lifespan. ~2× slower development. 100% dauer at 25°C.',
    dauerNotes: '100% dauer entry at 25°C. Low-penetrance dauer at 20°C (<1% under normal food).',
    refs: 'Kenyon et al. 1993 (Nature); Gems et al. 1998; Corsi et al. 2015',
  },

  'daf-16': {
    id: 'daf-16',
    label: 'daf-16 (mu86) — FOXO transcription factor',
    color: '#f97316',
    stageScale: {},
    globalScale: 0.97,      // nearly identical to N2; slight acceleration reported
    tempScaleOverride: {},
    dauerTemps: [],         // cannot form dauer (daf-16 required for dauer)
    maxEggs: 300,
    lifespan20C: '~14–16 days (slightly reduced vs N2)',
    notes: 'FOXO transcription factor, downstream of daf-2/PI3K pathway. Suppresses daf-2 longevity.',
    phenotype: 'Normal morphology. Slightly shortened lifespan. Cannot enter dauer.',
    dauerNotes: 'Cannot form dauer — daf-16 is required for all dauer-related gene expression.',
    refs: 'Lin et al. 1997; Ogg et al. 1997',
  },

  'eat-2': {
    id: 'eat-2',
    label: 'eat-2 (ad465) — Dietary restriction',
    color: '#ec4899',
    stageScale: {},
    globalScale: 1.15,      // ~15% slower due to reduced food intake
    tempScaleOverride: {},
    dauerTemps: [],
    maxEggs: 150,           // fewer progeny due to dietary restriction
    lifespan20C: '~28–30 days (~1.4× N2)',
    notes: 'Nicotinic acetylcholine receptor subunit. Reduced pharyngeal pumping → dietary restriction.',
    phenotype: 'Thin body, reduced pumping rate (~45% of N2). Extended lifespan via DR.',
    dauerNotes: 'Normal dauer response.',
    refs: 'Raizen et al. 1995; Lakowski & Hekimi 1998',
  },

  'age-1': {
    id: 'age-1',
    label: 'age-1 (hx546) — PI3 Kinase',
    color: '#a78bfa',
    stageScale: {},
    globalScale: 1.0,       // NO developmental timing difference from N2 (Friedman & Johnson 1988)
    tempScaleOverride: {},
    dauerTemps: [],
    maxEggs: 290,
    lifespan20C: '~29–40 days (~1.4–2× N2)',
    notes: 'Catalytic subunit of PI3K (upstream of daf-16). Extended lifespan entirely post-reproductive.',
    phenotype: 'Normal morphology and development. Lifespan extension only after reproduction.',
    dauerNotes: 'Normal dauer response at 25°C.',
    refs: 'Friedman & Johnson 1988; Morris et al. 1996',
  },

  custom: {
    id: 'custom',
    label: '✏ Custom strain (name yourself)',
    color: '#64748b',
    stageScale: {},
    globalScale: 1.0,
    tempScaleOverride: {},
    dauerTemps: [],
    maxEggs: 300,
    lifespan20C: 'Unknown',
    notes: 'User-defined strain. Timing defaults to N2 unless observations indicate otherwise.',
    phenotype: 'Unknown.',
    dauerNotes: 'Unknown.',
    refs: '',
  },
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

/** Synthetic dauer stage timeline for strains that arrest at 25°C. */
function getDauerStages(strain, tempC) {
  // Dauer typically occurs at L2d (between L2 and L3)
  // Show partial normal development then dauer arrest
  const q10Scale = Math.pow(Q10_LARVAL, (20 - tempC) / 10);
  let cursor = 0;
  const preStages = ['egg','l1','l2'].map(id => {
    const s = BASE_STAGES.find(b => b.id === id);
    const dur = s.durationAt20 * q10Scale * (strain.stageScale?.[id] ?? 1.0);
    const stage = { ...s, start: cursor, end: cursor + dur, duration: dur, tempC, strainId: strain.id };
    cursor += dur;
    return stage;
  });
  const dauerStage = {
    id: 'dauer', name: 'Dauer Larva', icon: '💤', color: '#94a3b8',
    start: cursor, end: cursor + 240, duration: 240,
    description: `At ${tempC}°C, ${strain.id} worms enter dauer larva at the L2d checkpoint. Dauer is a stress-resistant, long-lived, non-feeding alternative L3 stage.`,
    visibleSigns: 'Darker, non-feeding, elongated. Gut granules visible. May form "daisy-chains".',
    size: '~500 μm, slender and straight',
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
 * Relative bacterial-food consumption per stage (normalised to adult = 1.0).
 * Derived from pharyngeal pumping rate × body biomass:
 *  • Eggs do NOT feed (sealed eggshell) → 0
 *  • Pumping rises L1 (~150/min) → adult (~250–300/min); biomass grows ~1000×
 *    from L1 (~250 µm) to adult (~1 mm), so intake scales steeply with stage.
 *  • DAUER does NOT feed (pharynx constricted, mouth sealed) → 0
 * (Avery 1993; Fang-Yen et al. 2009; WormBook feeding/pharynx chapters.)
 */
export const STAGE_FOOD_FACTOR = {
  egg: 0, l1: 0.10, l2: 0.25, l3: 0.45, l4: 0.70,
  young_adult: 0.90, adult: 1.0, dauer: 0,
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
