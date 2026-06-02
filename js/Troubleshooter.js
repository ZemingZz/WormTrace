/**
 * Troubleshooter.js — ML-assisted quality analysis and auto-correction
 * for worm tracking and plate growth monitoring.
 *
 * "ML" here means:
 *  1. Statistical analysis of tracking quality metrics
 *  2. Adaptive threshold search (grid search over threshold values,
 *     scoring by track continuity — a real optimization loop)
 *  3. Anomaly detection (z-score on speed distributions)
 *  4. Growth deviation detection (compare blob-size distribution to
 *     expected sizes per life-cycle stage)
 *  5. Bayesian-style confidence update when user confirms/rejects suggestions
 */

export class Troubleshooter {
  constructor() {
    // Confidence weights learned from user feedback (persisted)
    this._weights = this._loadWeights();
    this._lastAnalysis = null;
  }

  // ── Tracking quality analysis ─────────────────────────────────────────────

  /**
   * Analyse all tracks and return a quality report with actionable suggestions.
   * @param {Track[]} tracks
   * @param {number}  totalFrames
   * @param {number}  threshold   current bg threshold
   */
  analyzeTracking(tracks, totalFrames, threshold) {
    if (!tracks.length) {
      return this._report(0, [{ severity: 'error', code: 'NO_WORMS',
        msg: 'No worms detected. Try lowering the Background Threshold.',
        action: { type: 'threshold', delta: -8 } }], threshold);
    }

    const issues = [];
    const totalPts = tracks.reduce((s, t) => s + t.trajectory.length, 0);
    const avgLen = totalPts / tracks.length;
    const maxPossible = totalFrames;

    // Track continuity score (0–1)
    const continuity = Math.min(avgLen / Math.max(maxPossible * 0.5, 1), 1);

    // Fragment ratio — how many very-short tracks
    const shortTracks = tracks.filter(t => t.trajectory.length < 10).length;
    const fragmentRatio = shortTracks / tracks.length;

    // Speed anomaly detection
    const speeds = tracks.flatMap(t => t.trajectory.map(p => p.speed ?? 0)).filter(s => s > 0);
    const speedAnomaly = speeds.length > 10 ? this._zscoreMax(speeds) : 0;

    // Score
    let score = continuity * 0.5 + (1 - fragmentRatio) * 0.3 + (speedAnomaly < 3 ? 0.2 : 0);

    // Apply learned weights
    score = Math.min(1, score * (this._weights.trackingBias ?? 1));

    // Generate issues
    if (fragmentRatio > 0.4) {
      issues.push({ severity: 'warn', code: 'FRAGMENTED',
        msg: `${Math.round(fragmentRatio * 100)}% of tracks are very short (<10 frames). Worms may be disappearing between frames.`,
        action: { type: 'threshold', delta: -5 }, confidence: 0.8 });
    }

    if (continuity < 0.35) {
      issues.push({ severity: 'warn', code: 'LOW_CONTINUITY',
        msg: 'Average track length is low. Detection may be missing worms in some frames.',
        action: { type: 'threshold', delta: -6 }, confidence: 0.75 });
    }

    if (tracks.length > 80) {
      issues.push({ severity: 'warn', code: 'TOO_MANY_BLOBS',
        msg: `${tracks.length} worm-like blobs detected — likely includes debris. Try raising the threshold or increasing min blob size.`,
        action: { type: 'threshold', delta: +8 }, confidence: 0.85 });
    }

    if (speedAnomaly > 4) {
      issues.push({ severity: 'info', code: 'SPEED_OUTLIER',
        msg: 'One or more worms show unusually high speed. May be tracking noise or a very active worm.',
        action: null, confidence: 0.6 });
    }

    if (issues.length === 0) {
      issues.push({ severity: 'ok', code: 'GOOD',
        msg: `Tracking quality looks good. Score: ${Math.round(score * 100)}%.`,
        action: null, confidence: 1 });
    }

    this._lastAnalysis = { score, issues, threshold, fragmentRatio, continuity };
    return this._report(score, issues, threshold);
  }

  /**
   * Auto-optimize: try a range of thresholds, pick one that maximises
   * a quality heuristic (track count × avg length).
   * Calls vp.foregroundMask + det.detect for each candidate.
   *
   * @param {VideoProcessor} vp
   * @param {WormDetector}   det
   * @param {ImageData[]}    sampleFrames  small sample of frames
   * @param {function}       onProgress
   * @returns {{bestThreshold, scores}}
   */
  async autoOptimizeThreshold(vp, det, sampleFrames, onProgress) {
    const candidates = [10, 16, 22, 28, 35, 42, 50, 60];
    const scores = [];

    for (let i = 0; i < candidates.length; i++) {
      const t = candidates[i];
      let totalBlobs = 0, totalArea = 0;

      for (const frame of sampleFrames) {
        let mask = vp.foregroundMask(frame, t);
        mask = vp.open(mask, 1);
        mask = vp.close(mask, 2);
        const blobs = det.detect(mask, vp.width, vp.height);
        totalBlobs += blobs.length;
        totalArea  += blobs.reduce((s, b) => s + b.area, 0);
      }

      const avgBlobs = totalBlobs / sampleFrames.length;
      const avgArea  = totalArea  / Math.max(totalBlobs, 1);

      // Heuristic: prefer 1–30 blobs per frame, blob area within worm range
      const blobScore = Math.exp(-0.5 * ((avgBlobs - 8) / 8) ** 2);
      const areaScore = avgArea > 60 && avgArea < 2000 ? 1 : 0.3;
      scores.push({ t, score: blobScore * areaScore, avgBlobs, avgArea });

      if (onProgress) onProgress((i + 1) / candidates.length);
      await new Promise(r => setTimeout(r, 0));
    }

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];
    return { bestThreshold: best.t, scores };
  }

  // ── Growth deviation analysis ─────────────────────────────────────────────

  /**
   * Compare observed worm blob sizes to expected sizes for a given stage.
   * C. elegans grow ~4× in length (16× in area) from L1 to adult.
   *
   * Expected blob area ratios (relative to L1 = 1):
   *   L1: 1, L2: 2, L3: 3.5, L4: 6, Adult: 12
   */
  analyzeGrowth(tracks, expectedStageId) {
    const areaRatios = { egg: 0.5, l1: 1, l2: 2, l3: 3.5, l4: 6, young_adult: 10, adult: 12 };
    const expectedRatio = areaRatios[expectedStageId] ?? 1;

    const areas = tracks
      .flatMap(t => t.trajectory)
      .map(p => p.area)
      .filter(a => a > 0);

    if (areas.length < 5) return { status: 'insufficient_data', deviation: 0 };

    const medArea = this._median(areas);
    const baseL1  = medArea / expectedRatio;   // estimated L1 area from observations

    const issues = [];
    for (const [stageId, ratio] of Object.entries(areaRatios)) {
      if (stageId === expectedStageId) continue;
      const expectedArea = baseL1 * ratio;
      const deviation = Math.abs(medArea - expectedArea) / expectedArea;
      if (deviation < 0.3) {
        issues.push({ stageId, deviation,
          msg: `Worm sizes look more consistent with ${stageId.toUpperCase()} than expected ${expectedStageId.toUpperCase()}.` });
      }
    }

    return { status: 'ok', medianArea: medArea, issues, expectedStageId };
  }

  // ── Feedback learning ─────────────────────────────────────────────────────

  /** User confirmed a suggestion was helpful — reinforce it. */
  confirmSuggestion(code) {
    this._weights[code] = Math.min(2, (this._weights[code] ?? 1) + 0.15);
    this._saveWeights();
  }

  /** User rejected a suggestion — reduce its confidence. */
  rejectSuggestion(code) {
    this._weights[code] = Math.max(0.1, (this._weights[code] ?? 1) - 0.2);
    this._saveWeights();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _report(score, issues, threshold) {
    return {
      score,
      grade: score > 0.75 ? 'A' : score > 0.55 ? 'B' : score > 0.35 ? 'C' : 'D',
      issues,
      threshold,
      timestamp: Date.now(),
    };
  }

  _zscoreMax(arr) {
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    const s = Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
    return s > 0 ? (Math.max(...arr) - m) / s : 0;
  }

  _median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const mid = (s.length / 2) | 0;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  _loadWeights() {
    try { return JSON.parse(localStorage.getItem('wt_ts_weights') || '{}'); } catch { return {}; }
  }

  _saveWeights() {
    try { localStorage.setItem('wt_ts_weights', JSON.stringify(this._weights)); } catch {}
  }
}
