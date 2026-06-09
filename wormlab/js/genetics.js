/**
 * genetics.js — genotype-aware Mendelian engine for the course strains.
 *
 * Two recessive, loss-of-function Dpy loci on different chromosomes:
 *   dpy-11 (chromosome V) and dpy-13 (chromosome IV) → unlinked → independent assortment.
 * Both are RECESSIVE: a worm is Dumpy at a locus only when homozygous mutant (m/m).
 * They are germline (heritable) genome mutations, transmitted to progeny.
 *
 * A locus genotype is a probability distribution over {pp:+/+, pm:m/+, mm:m/m}
 * (definite genotypes have one probability = 1; "picked" worms can be uncertain,
 * e.g. a wild-type F2 that may be +/+ OR a m/+ carrier).
 *
 * Reproduction:
 *   • SELF (hermaphrodite selfs): each worm's eggs are fertilised by its own sperm.
 *   • CROSS (male × hermaphrodite): hermaphrodite eggs × male sperm. ~50% of
 *     cross-progeny are male (X0); self-progeny are ~100% hermaphrodite (XX).
 */
export const LOCI = ['dpy-11', 'dpy-13'];
const base = id => String(id).replace('-male', '');
export const isMaleStrain = id => String(id).includes('male');
export const isCourseGeneticStrain = id => ['N2', 'dpy-11', 'dpy-13'].includes(base(id));
export const dpyName = L => L === 'dpy-11' ? 'Dpy-11' : 'Dpy-13';

const homo = isMut => isMut ? { pp: 0, pm: 0, mm: 1 } : { pp: 1, pm: 0, mm: 0 };

/** Genotype + sex of a built-in strain. */
export function strainGeno(strainId) {
  const b = base(strainId);
  return {
    sex: isMaleStrain(strainId) ? 'male' : 'hermaphrodite',
    loci: { 'dpy-11': homo(b === 'dpy-11'), 'dpy-13': homo(b === 'dpy-13') },
  };
}

// ── locus math ────────────────────────────────────────────────────────────────
const mFreq = d => d.pm * 0.5 + d.mm;                       // freq of the mutant allele in gametes
function selfLocus(d) {                                     // one individual selfing (Punnett)
  return { pp: d.pp + d.pm * 0.25, pm: d.pm * 0.5, mm: d.mm + d.pm * 0.25 };
}
function crossLocus(em, sm) {                               // egg m-freq × sperm m-freq
  return { pp: (1 - em) * (1 - sm), pm: em * (1 - sm) + (1 - em) * sm, mm: em * sm };
}

// ── phenotype distribution from locus distributions ────────────────────────────
export function phenoDist(loci) {
  const p11 = loci['dpy-11'].mm, p13 = loci['dpy-13'].mm;
  return [
    { key: 'wild', label: 'Wild-type', pct: (1 - p11) * (1 - p13) },
    { key: 'd11', label: 'Dpy-11', pct: p11 * (1 - p13) },
    { key: 'd13', label: 'Dpy-13', pct: (1 - p11) * p13 },
    { key: 'dbl', label: 'Dpy-11 ; Dpy-13 (double)', pct: p11 * p13 },
  ].filter(c => c.pct > 1e-9);
}

export function ratioOf(phenos) {
  const ns = phenos.map(p => Math.round(p.pct * 16));
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const g = ns.reduce((a, b) => gcd(a, b), 0) || 1;
  return ns.map(n => n / g).join(' : ');
}

// ── progeny predictions ────────────────────────────────────────────────────────
// parents: [{ loci, sex, count }]
export function selfProgeny(parents) {
  const herms = parents.filter(p => p.sex !== 'male' && p.count > 0);
  const tot = herms.reduce((s, p) => s + p.count, 0);
  if (!tot) return null;
  const loci = {};
  for (const L of LOCI) {
    const acc = { pp: 0, pm: 0, mm: 0 };
    for (const p of herms) { const s = selfLocus(p.loci[L]); const w = p.count / tot;
      acc.pp += s.pp * w; acc.pm += s.pm * w; acc.mm += s.mm * w; }
    loci[L] = acc;
  }
  return { loci, phenos: phenoDist(loci), maleFrac: 0 };
}

export function crossProgeny(parents) {
  const herms = parents.filter(p => p.sex !== 'male' && p.count > 0);
  const males = parents.filter(p => p.sex === 'male' && p.count > 0);
  if (!herms.length || !males.length) return null;
  const hTot = herms.reduce((s, p) => s + p.count, 0), mTot = males.reduce((s, p) => s + p.count, 0);
  const loci = {};
  for (const L of LOCI) {
    let em = 0; for (const p of herms) em += mFreq(p.loci[L]) * (p.count / hTot);
    let sm = 0; for (const p of males) sm += mFreq(p.loci[L]) * (p.count / mTot);
    loci[L] = crossLocus(em, sm);
  }
  return { loci, phenos: phenoDist(loci), maleFrac: 0.5 };
}

/** Condition a progeny genotype on an observed phenotype (used when you PICK worms). */
export function conditionOnPheno(loci, key) {
  const need = {
    wild: { 'dpy-11': false, 'dpy-13': false },
    d11:  { 'dpy-11': true,  'dpy-13': false },
    d13:  { 'dpy-11': false, 'dpy-13': true },
    dbl:  { 'dpy-11': true,  'dpy-13': true },
  }[key] || { 'dpy-11': false, 'dpy-13': false };
  const out = {};
  for (const L of LOCI) {
    const d = loci[L];
    if (need[L]) out[L] = { pp: 0, pm: 0, mm: 1 };
    else { const t = d.pp + d.pm; out[L] = t > 0 ? { pp: d.pp / t, pm: d.pm / t, mm: 0 } : { pp: 1, pm: 0, mm: 0 }; }
  }
  return out;
}

// ── display helpers ────────────────────────────────────────────────────────────
export function phenoOfLoci(loci) {
  const d = LOCI.filter(L => loci[L].mm > 0.999).map(dpyName);
  return d.length ? d.join(' + ') : 'wild-type';
}
const g3 = (n) => Math.round(n * 100);
/** Compact genotype text per locus, e.g. "dpy-11 m/+", or with uncertainty
 *  "dpy-11 (33% +/+, 67% m/+)". */
export function genoText(loci) {
  return LOCI.map(L => {
    const d = loci[L];
    if (d.pp > 0.999) return `${L} +/+`;
    if (d.mm > 0.999) return `${L} m/m`;
    if (d.pm > 0.999) return `${L} m/+`;
    const parts = [];
    if (d.pp > 1e-6) parts.push(`${g3(d.pp)}% +/+`);
    if (d.pm > 1e-6) parts.push(`${g3(d.pm)}% m/+`);
    if (d.mm > 1e-6) parts.push(`${g3(d.mm)}% m/m`);
    return `${L} (${parts.join(', ')})`;
  }).join(' ; ');
}

// kept for older callers
export function predictCross(maleId, hermId) {
  const r = crossProgeny([{ ...strainGeno(maleId), count: 1 }, { ...strainGeno(hermId), count: 1 }]);
  return { f1Pheno: phenoOfLoci(r.loci), f2: r.phenos, ratio: ratioOf(r.phenos), complement: false };
}
