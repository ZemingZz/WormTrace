/**
 * WormTracker — nearest-neighbour tracker that maintains consistent worm
 * identities across frames and accumulates per-worm feature time-series.
 */

const PALETTE = [
  '#00d4aa','#7c3aed','#f59e0b','#ef4444','#3b82f6',
  '#ec4899','#14b8a6','#f97316','#a3e635','#e879f9'
];

export class WormTracker {
  constructor({ maxGapFrames = 8, maxMatchDist = 40 } = {}) {
    this.maxGap = maxGapFrames;
    this.maxDist = maxMatchDist;
    this.tracks = new Map();   // id → Track
    this.nextId = 1;
    this.frameIdx = 0;
  }

  /**
   * Update tracker with detections from one frame.
   * @param {Blob[]} detections
   * @param {number} timestamp  video time in seconds
   */
  update(detections, timestamp) {
    const frame = this.frameIdx++;
    const activeTracks = [...this.tracks.values()].filter(t => frame - t.lastFrame <= this.maxGap);
    const used = new Set();

    // Greedy nearest-neighbour matching (sufficient for sparse worm videos)
    for (const track of activeTracks) {
      let bestDist = this.maxDist, bestDet = null;
      for (let i = 0; i < detections.length; i++) {
        if (used.has(i)) continue;
        const d = dist(track.cx, track.cy, detections[i].cx, detections[i].cy);
        if (d < bestDist) { bestDist = d; bestDet = i; }
      }
      if (bestDet !== null) {
        used.add(bestDet);
        this._updateTrack(track, detections[bestDet], frame, timestamp);
      }
    }

    // Unmatched detections → new tracks
    for (let i = 0; i < detections.length; i++) {
      if (!used.has(i)) this._newTrack(detections[i], frame, timestamp);
    }
  }

  _newTrack(det, frame, t) {
    const id = this.nextId++;
    const color = PALETTE[(id - 1) % PALETTE.length];
    this.tracks.set(id, {
      id, color,
      cx: det.cx, cy: det.cy,
      firstFrame: frame, lastFrame: frame,
      firstTime: t,
      trajectory: [{ t, x: det.cx, y: det.cy, area: det.area, angle: det.angle, aspectRatio: det.aspectRatio }],
      features: [],   // computed lazily
      patternId: null,
      matchScore: null,
    });
  }

  _updateTrack(track, det, frame, t) {
    const prev = track.trajectory[track.trajectory.length - 1];
    const dt = t - prev.t;
    const dx = det.cx - prev.x, dy = det.cy - prev.y;
    const speed = dt > 0 ? Math.sqrt(dx * dx + dy * dy) / dt : 0;
    const dAngle = angleDiff(det.angle, prev.angle ?? det.angle);
    const angVel = dt > 0 ? dAngle / dt : 0;

    track.cx = det.cx; track.cy = det.cy;
    track.lastFrame = frame;
    track.trajectory.push({
      t, x: det.cx, y: det.cy, area: det.area,
      angle: det.angle, aspectRatio: det.aspectRatio,
      speed, angVel, dx, dy
    });
  }

  getActive(currentFrame) {
    return [...this.tracks.values()].filter(t => currentFrame - t.lastFrame <= this.maxGap * 2);
  }

  getAll() { return [...this.tracks.values()]; }

  reset() { this.tracks.clear(); this.nextId = 1; this.frameIdx = 0; }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function dist(x1, y1, x2, y2) { return Math.sqrt((x2-x1)**2 + (y2-y1)**2); }
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}
