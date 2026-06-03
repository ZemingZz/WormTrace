/**
 * PlateTracker.js — plate records with real-time inoculation timers,
 * egg count tracking, multi-strain support, biohazard bin, and Excel export.
 */

import { cumulativeFeedHours } from './LifeCycle.js?v=74';

const STORE_KEY = 'wormtrace_plates_v2';
const BIN_KEY   = 'wormtrace_biohazard_bin';
const BINS_KEY  = 'wormtrace_bins';            // user-created groups (NOT the biohazard bin)

// Days after which a plate is assumed contaminated / past usable life.
export const MAX_PLATE_DAYS = 28;

export class PlateTracker {
  constructor() {
    this._plates = this._load(STORE_KEY);
    this._bin    = this._load(BIN_KEY);
    this._bins   = this._load(BINS_KEY);   // [{id, name, createdAt}]
  }

  // ── Plate CRUD ─────────────────────────────────────────────────────────────

  addPlate({ name = 'My Plate', strainId = 'N2', tempC = 20, notes = '' } = {}) {
    const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const plate = {
      id, name, strainId, tempC, notes,
      binId: null,              // user group this plate belongs to (null = Unfiled)
      createdAt: Date.now(),
      inoculatedAt: null,       // actual wall-clock time of inoculation
      stageStartOffset: 0,      // extra hours to add (from starting stage selection)
      startingStageId: 'egg',   // stage worms were in when inoculated
      observations: [],
      eggCounts: [],
      stageOverride: null,
      wormCount: 1,
      initialFood: 0.2,        // standard 60 mm NGM plate seeded with OP50
      consumptionRate: 'standard',
      cohorts: [],
    };
    this._plates.unshift(plate);
    this._persist();
    return plate;
  }

  update(id, fields) {
    const p = this._find(id);
    if (!p) return false;
    Object.assign(p, fields);
    this._persist();
    return true;
  }

  delete(id) {
    this._plates = this._plates.filter(p => p.id !== id);
    this._persist();
  }

  get(id) { return this._find(id); }
  getAll() { return [...this._plates]; }

  // ── Inoculation ────────────────────────────────────────────────────────────

  /**
   * Inoculate a plate.
   * @param {string} id
   * @param {string} startingStageId  stage worms are currently in
   * @param {number} stageStartOffsetHrs  hours since egg to reach that stage
   * @param {number} timestamp  wall-clock time of inoculation
   */
  inoculate(id, startingStageId = 'egg', stageStartOffsetHrs = 0, timestamp = Date.now()) {
    const p = this._find(id);
    if (!p) return false;
    p.inoculatedAt      = timestamp;
    p.startingStageId   = startingStageId;
    p.stageStartOffset  = stageStartOffsetHrs;
    this._persist();
    return true;
  }

  resetInoculation(id) {
    const p = this._find(id);
    if (!p) return;
    p.inoculatedAt     = null;
    p.stageStartOffset = 0;
    p.startingStageId  = 'egg';
    p.eggCounts        = [];
    p.stageOverride    = null;
    p.cohorts          = [];
    this._persist();
  }

  // ── Worm cohorts (groups of worms with their own stage/history) ─────────────

  /** Ensure a plate has a cohorts array; migrate legacy single-count plates. */
  _ensureCohorts(p) {
    if (!p.cohorts) p.cohorts = [];
    // Migrate: if plate inoculated but no cohorts, create one from base info
    if (p.inoculatedAt && p.cohorts.length === 0) {
      p.cohorts.push({
        id: `c_${p.inoculatedAt}_base`,
        count: p.wormCount ?? 1,
        startingStageId: p.startingStageId ?? 'egg',
        stageStartOffset: p.stageStartOffset ?? 0,
        stageStartHr: p.stageStartOffset ?? 0,   // dev-age of these worms at h=0
        addedAtHrs: 0,                            // founding worms present from start
        addedAt: p.inoculatedAt,
        origin: 'inoculation',
        history: [],
      });
    }
    // Backfill new fields on older cohorts
    for (const c of p.cohorts) {
      if (c.stageStartHr === undefined) c.stageStartHr = c.stageStartOffset ?? 0;
      if (c.addedAtHrs === undefined)  c.addedAtHrs = c.origin === 'inoculation' ? 0 : (c.stageStartOffset ?? 0);
    }
    return p.cohorts;
  }

  getCohorts(plateId) {
    const p = this._find(plateId);
    if (!p) return [];
    return this._ensureCohorts(p);
  }

  /**
   * Add a new cohort of worms at a chosen stage AFTER inoculation.
   * @param {number} stageStartOffsetHrs  developmental hours for the chosen stage
   */
  addCohort(plateId, count, startingStageId, stageStartHr, strainId = null) {
    const p = this._find(plateId);
    if (!p) return null;
    this._ensureCohorts(p);
    // Hours since inoculation right now — the moment these worms appear on the plate.
    const addedAtHrs = this.elapsedSinceInoculation(plateId);
    const cohort = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      count: Math.max(1, count),
      startingStageId,
      stageStartHr,            // these worms ARE at this dev-age when added
      addedAtHrs,              // plate-hours-since-inoc when they were added
      stageStartOffset: stageStartHr,   // legacy field for display helpers
      strainId: strainId ?? p.strainId,
      addedAt: Date.now(),
      origin: 'added',
      history: [`Added ${count} ${strainId ?? p.strainId} ${startingStageId} worm(s) on ${new Date().toLocaleString()}`],
    };
    p.cohorts.push(cohort);
    p.wormCount = (p.wormCount ?? 0) + cohort.count;
    this._persist();
    return cohort;
  }

  /**
   * Transfer worms from one plate to another, keeping their developmental info.
   * Their stage/age is preserved by carrying over stageStartOffset + elapsed.
   */
  transferWorms(fromId, toId, cohortId, count) {
    const from = this._find(fromId);
    const to   = this._find(toId);
    if (!from || !to) return { ok: false, error: 'Plate not found' };
    this._ensureCohorts(from);
    this._ensureCohorts(to);

    const src = from.cohorts.find(c => c.id === cohortId);
    if (!src) return { ok: false, error: 'Cohort not found' };
    const moveCount = Math.min(count, src.count);
    if (moveCount < 1) return { ok: false, error: 'Nothing to move' };

    // Compute current developmental age of the source cohort
    const elapsedHrs = from.inoculatedAt
      ? (Date.now() - from.inoculatedAt) / 3_600_000 + (src.stageStartOffset ?? 0)
      : (src.stageStartOffset ?? 0);

    // If destination isn't inoculated yet, inoculate it now.
    // A fresh plate has a placeholder wormCount of 1 with NO real cohorts —
    // reset its count to 0 so the transfer doesn't double (the bug fix).
    const destWasFresh = !to.inoculatedAt;
    if (destWasFresh) {
      to.inoculatedAt = Date.now();
      to.startingStageId = src.startingStageId;
      to.stageStartOffset = elapsedHrs;
      to.cohorts = [];          // discard any phantom/migrated placeholder cohort
      to.wormCount = 0;         // clear the default placeholder worm
    }

    // New cohort on destination preserves developmental age
    const destOffset = elapsedHrs - (Date.now() - to.inoculatedAt) / 3_600_000;
    const destAddedAtHrs = this.elapsedSinceInoculation(to.id);

    const newCohort = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      count: moveCount,
      startingStageId: src.startingStageId,
      strainId: src.strainId ?? from.strainId,
      stageStartOffset: Math.max(0, destOffset),
      stageStartHr: Math.max(0, elapsedHrs),    // transferred worms keep their age
      addedAtHrs: destAddedAtHrs,
      addedAt: Date.now(),
      origin: 'transfer',
      history: [
        ...(src.history ?? []),
        `Transferred ${moveCount} worm(s) from "${from.name}" to "${to.name}" on ${new Date().toLocaleString()} (age ${elapsedHrs.toFixed(1)}h)`,
      ],
    };
    to.cohorts.push(newCohort);
    to.wormCount = (to.wormCount ?? 0) + moveCount;

    // Remove from source
    src.count -= moveCount;
    from.wormCount = Math.max(0, (from.wormCount ?? moveCount) - moveCount);
    if (src.count <= 0) from.cohorts = from.cohorts.filter(c => c.id !== src.id);

    this._persist();
    return { ok: true, moved: moveCount, age: elapsedHrs };
  }

  // ── Biohazard Bin ──────────────────────────────────────────────────────────

  /** Move plate to biohazard bin. Returns the number of plates now in bin. */
  discardPlate(id) {
    const p = this._find(id);
    if (!p) return this._bin.length;
    this._plates = this._plates.filter(x => x.id !== id);
    this._bin.unshift({ ...p, discardedAt: Date.now() });
    this._persist();
    this._persistBin();
    return this._bin.length;
  }

  /** Restore a plate from the bin back to active plates. */
  restoreFromBin(id) {
    const p = this._bin.find(x => x.id === id);
    if (!p) return;
    const { discardedAt, ...plate } = p;
    this._bin = this._bin.filter(x => x.id !== id);
    this._plates.unshift(plate);
    this._persist();
    this._persistBin();
  }

  /** Permanently delete a plate from the bin. */
  deleteFromBin(id) {
    this._bin = this._bin.filter(x => x.id !== id);
    this._persistBin();
  }

  /** Empty the entire biohazard bin. */
  emptyBin() {
    this._bin = [];
    this._persistBin();
  }

  getBin()      { return [...this._bin]; }
  getBinCount() { return this._bin.length; }

  // ── Bins (user-created groups of plates) ─────────────────────────────────────

  getBins() { return [...this._bins]; }

  addBin(name = 'New Bin') {
    const bin = { id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, name, createdAt: Date.now() };
    this._bins.push(bin);
    this._persistBins();
    return bin;
  }

  renameBin(id, name) {
    const b = this._bins.find(x => x.id === id);
    if (!b) return false;
    b.name = name;
    this._persistBins();
    return true;
  }

  /** Delete a bin; its plates fall back to Unfiled (binId = null). */
  deleteBin(id) {
    this._bins = this._bins.filter(b => b.id !== id);
    for (const p of this._plates) if (p.binId === id) p.binId = null;
    this._persistBins();
    this._persist();
  }

  setPlateBin(plateId, binId) {
    const p = this._find(plateId);
    if (!p) return false;
    p.binId = binId ?? null;
    this._persist();
    return true;
  }

  /** Active plates in a bin (binId === null → the Unfiled group). */
  getPlatesInBin(binId) {
    return this._plates.filter(p => (p.binId ?? null) === (binId ?? null));
  }

  binPlateCount(binId) { return this.getPlatesInBin(binId).length; }

  // ── Egg counts ─────────────────────────────────────────────────────────────

  addEggCount(plateId, count) {
    const p = this._find(plateId);
    if (!p) return null;
    const prev = p.eggCounts[p.eggCounts.length - 1];
    const entry = {
      id: `e_${Date.now()}`,
      time: Date.now(),
      count: Math.max(0, count),
      cumulative: (prev?.cumulative ?? 0) + Math.max(0, count),
    };
    p.eggCounts.push(entry);
    this._persist();
    return entry;
  }

  adjustLastEggCount(plateId, delta) {
    const p = this._find(plateId);
    if (!p || !p.eggCounts.length) return;
    const last = p.eggCounts[p.eggCounts.length - 1];
    last.count = Math.max(0, last.count + delta);
    let cum = 0;
    for (const e of p.eggCounts) { cum += e.count; e.cumulative = cum; }
    this._persist();
    return last;
  }

  totalEggs(plateId) {
    const p = this._find(plateId);
    if (!p || !p.eggCounts.length) return 0;
    return p.eggCounts[p.eggCounts.length - 1].cumulative;
  }

  /**
   * Simulated egg-laying for adult worms.
   * @param adultStartHr  developmental hour when reproductive adult begins
   * @param hrs           current developmental hours
   * @param maxEggs       expected self-progeny per worm (strain brood size)
   * @param wormCount     number of egg-laying adults on the plate
   * Returns laying stats; rate = average eggs over the laying period.
   */
  eggLayingInfo(adultStartHr, hrs, maxEggs, wormCount = 1) {
    // C. elegans hermaphrodite lays its ~300 self-progeny over ~80 h of the
    // reproductive period (WormBook). Use that as the averaging window.
    const LAYING_WINDOW = 80;            // hours of active laying
    const layingAdults  = Math.max(1, wormCount);
    const totalExpected = maxEggs * layingAdults;
    const ratePerHr     = totalExpected / LAYING_WINDOW;   // average rate

    const hoursLaying = hrs - adultStartHr;
    if (hoursLaying <= 0) {
      return { isLaying: false, predicted: 0, ratePerHr, totalExpected,
               secsToNext: null, nextFracPct: 0, hoursLaying: 0 };
    }
    const clampedHrs = Math.min(hoursLaying, LAYING_WINDOW);
    const predicted  = Math.min(totalExpected, Math.floor(ratePerHr * clampedHrs));
    const done       = hoursLaying >= LAYING_WINDOW;

    // Time-till-next-egg from the average rate
    const secsPerEgg = 3600 / ratePerHr;
    const secsToNext = done ? null : secsPerEgg * (1 - ((ratePerHr * clampedHrs) % 1));
    const nextFracPct = done ? 100 : ((ratePerHr * clampedHrs) % 1) * 100;

    return { isLaying: !done, predicted, ratePerHr, totalExpected,
             secsToNext, nextFracPct, hoursLaying: clampedHrs, done };
  }

  // ── Observations ───────────────────────────────────────────────────────────

  addObservation(plateId, { note = '', imageDataUrl = null, stageId = null } = {}) {
    const p = this._find(plateId);
    if (!p) return null;
    const obs = { id: `o_${Date.now()}`, time: Date.now(), note, imageDataUrl, stageId };
    p.observations.push(obs);
    if (stageId) p.stageOverride = stageId;
    this._persist();
    return obs;
  }

  deleteObservation(plateId, obsId) {
    const p = this._find(plateId);
    if (!p) return;
    p.observations = p.observations.filter(o => o.id !== obsId);
    this._persist();
  }

  // ── Food calculations ──────────────────────────────────────────────────────

  static CONSUMPTION_ML_PER_HR = { low: 0.00003, standard: 0.0001, high: 0.0002 };

  foodRemaining(plateId) {
    const p = this._find(plateId);
    if (!p) return 0;
    const init = p.initialFood ?? 0.5;
    if (!p.inoculatedAt) return init;
    const adultRate = PlateTracker.CONSUMPTION_ML_PER_HR[p.consumptionRate ?? 'standard'];
    // Stage-aware: integrate per-stage feeding factor over developmental time so
    // larvae/dauer consume far less than adults (eggs & dauer don't feed at all).
    const devHrs = this.elapsedHours(plateId) ?? 0;
    const feedHrs = cumulativeFeedHours(p.strainId, p.tempC, devHrs);
    return Math.max(0, init - (p.wormCount ?? 1) * adultRate * feedHrs);
  }

  foodPercent(plateId) {
    const p = this._find(plateId);
    if (!p) return 100;
    const init = p.initialFood ?? 0.5;
    return init > 0 ? (this.foodRemaining(plateId) / init) * 100 : 0;
  }

  hoursUntilEmpty(plateId) {
    const p = this._find(plateId);
    if (!p) return null;
    const remaining = this.foodRemaining(plateId);
    if (remaining <= 0) return 0;
    // Estimate using the CURRENT stage feeding rate (worms at this stage now)
    const adultRate = PlateTracker.CONSUMPTION_ML_PER_HR[p.consumptionRate ?? 'standard'];
    const devHrs = this.elapsedHours(plateId) ?? 0;
    // current feeding factor ≈ derivative of cumulative feed-hours
    const f1 = cumulativeFeedHours(p.strainId, p.tempC, devHrs);
    const f2 = cumulativeFeedHours(p.strainId, p.tempC, devHrs + 1);
    const curFactor = Math.max(0.05, f2 - f1);   // adult-equiv factor right now
    const totalRate = (p.wormCount ?? 1) * adultRate * curFactor;
    return totalRate > 0 ? remaining / totalRate : Infinity;
  }

  // ── Time helpers ───────────────────────────────────────────────────────────

  /** Total developmental hours = actual elapsed + starting stage offset. */
  elapsedHours(plateId) {
    const p = this._find(plateId);
    if (!p || !p.inoculatedAt) return null;
    return (Date.now() - p.inoculatedAt) / 3_600_000 + (p.stageStartOffset ?? 0);
  }

  /** Same as elapsedHours but also searches the biohazard bin — timer keeps running. */
  elapsedHoursAny(plateId) {
    const p = this._find(plateId) ?? this._bin.find(x => x.id === plateId);
    if (!p || !p.inoculatedAt) return null;
    return (Date.now() - p.inoculatedAt) / 3_600_000 + (p.stageStartOffset ?? 0);
  }

  /** Wall-clock ms since inoculation — also searches bin. */
  elapsedMsAny(plateId) {
    const p = this._find(plateId) ?? this._bin.find(x => x.id === plateId);
    if (!p || !p.inoculatedAt) return null;
    return Date.now() - p.inoculatedAt;
  }

  /** Actual wall-clock hours since the inoculate button was pressed. */
  elapsedSinceInoculation(plateId) {
    const p = this._find(plateId);
    if (!p || !p.inoculatedAt) return 0;
    return (Date.now() - p.inoculatedAt) / 3_600_000;
  }

  elapsedMs(plateId) {
    const p = this._find(plateId);
    if (!p || !p.inoculatedAt) return null;
    return Date.now() - p.inoculatedAt;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  _find(id) { return this._plates.find(p => p.id === id) ?? null; }

  _load(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  }

  _persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this._plates)); }
    catch {
      for (const plate of this._plates)
        for (const obs of plate.observations)
          if (obs.imageDataUrl?.length > 1000) obs.imageDataUrl = null;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(this._plates)); } catch {}
    }
  }

  _persistBin() {
    try { localStorage.setItem(BIN_KEY, JSON.stringify(this._bin)); }
    catch {
      for (const plate of this._bin)
        for (const obs of (plate.observations ?? []))
          if (obs.imageDataUrl?.length > 1000) obs.imageDataUrl = null;
      try { localStorage.setItem(BIN_KEY, JSON.stringify(this._bin)); } catch {}
    }
  }

  _persistBins() {
    try { localStorage.setItem(BINS_KEY, JSON.stringify(this._bins)); } catch {}
  }
}
