/**
 * PatternEngine — extracts movement feature vectors from worm trajectories
 * and uses Dynamic Time Warping (DTW) to match patterns.
 *
 * Feature vector per frame:
 *   [speed, angularVelocity, aspectRatio, sinAngle, cosAngle]
 *
 * Pattern definition: the feature time-series of a selected worm during
 * a user-specified time window, normalized to [0,1] per channel.
 */
export class PatternEngine {
  constructor() {
    this.patterns = new Map();  // id → PatternDef
    this.nextId = 1;
    this.similarityThreshold = 0.55;  // 0..1, higher = more strict
  }

  /**
   * Extract a named pattern from a worm track between t0 and t1.
   */
  definePattern(name, color, track, t0, t1) {
    const seq = this._extractSequence(track, t0, t1);
    if (seq.length < 4) return null;

    const norm = this._normalize(seq);
    const stats = this._stats(seq);

    const id = this.nextId++;
    const pat = { id, name, color, seq: norm, rawStats: stats, t0, t1, wormId: track.id };
    this.patterns.set(id, pat);
    return pat;
  }

  /**
   * Score a track against all patterns.
   * Returns: Map<patternId, score 0..1>  (1 = perfect match)
   */
  scoreTrack(track) {
    const scores = new Map();
    if (this.patterns.size === 0) return scores;

    // Use the full trajectory or last N frames
    const seq = this._extractSequence(track, -Infinity, Infinity);
    if (seq.length < 4) return scores;
    const norm = this._normalize(seq);

    for (const [pid, pat] of this.patterns) {
      const d = this._dtw(norm, pat.seq);
      // Convert DTW distance to similarity score
      const maxPossible = Math.max(norm.length, pat.seq.length) * 5;
      const score = Math.max(0, 1 - d / maxPossible);
      scores.set(pid, score);
    }
    return scores;
  }

  deletePattern(id) { this.patterns.delete(id); }

  getPattern(id) { return this.patterns.get(id); }

  getAllPatterns() { return [...this.patterns.values()]; }

  setSimilarityThreshold(v) { this.similarityThreshold = v; }

  isMatch(score) { return score >= this.similarityThreshold; }

  // ── internals ──────────────────────────────────────────────────────────────

  _extractSequence(track, t0, t1) {
    return track.trajectory
      .filter(p => p.t >= t0 && p.t <= t1 && p.speed !== undefined)
      .map(p => [
        p.speed ?? 0,
        Math.abs(p.angVel ?? 0),
        p.aspectRatio ?? 1,
        Math.sin(p.angle ?? 0),
        Math.cos(p.angle ?? 0),
      ]);
  }

  _normalize(seq) {
    if (seq.length === 0) return seq;
    const D = seq[0].length;
    const mins = Array(D).fill(Infinity);
    const maxs = Array(D).fill(-Infinity);

    for (const v of seq) {
      for (let d = 0; d < D; d++) {
        if (v[d] < mins[d]) mins[d] = v[d];
        if (v[d] > maxs[d]) maxs[d] = v[d];
      }
    }

    return seq.map(v => v.map((x, d) => {
      const range = maxs[d] - mins[d];
      return range > 0 ? (x - mins[d]) / range : 0;
    }));
  }

  _stats(seq) {
    if (seq.length === 0) return {};
    const speeds = seq.map(v => v[0]);
    const angVels = seq.map(v => v[1]);
    return {
      meanSpeed: mean(speeds),
      stdSpeed: std(speeds),
      meanAngVel: mean(angVels),
      stdAngVel: std(angVels),
      duration: seq.length,
    };
  }

  /**
   * DTW distance between two feature sequences.
   * Uses Sakoe-Chiba band (width = 20% of longer sequence) for speed.
   */
  _dtw(a, b) {
    const n = a.length, m = b.length;
    const band = Math.max(3, Math.floor(Math.max(n, m) * 0.2));
    const INF = 1e9;
    // Only allocate two rows for memory efficiency
    let prev = new Float32Array(m + 1).fill(INF);
    let curr = new Float32Array(m + 1).fill(INF);
    prev[0] = 0;

    for (let i = 1; i <= n; i++) {
      curr.fill(INF);
      const jLo = Math.max(1, i - band);
      const jHi = Math.min(m, i + band);
      for (let j = jLo; j <= jHi; j++) {
        const cost = featureDist(a[i - 1], b[j - 1]);
        curr[j] = cost + Math.min(prev[j], curr[j - 1], prev[j - 1]);
      }
      [prev, curr] = [curr, prev];
    }

    return prev[m];
  }
}

function featureDist(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function std(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}
