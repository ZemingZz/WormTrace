/**
 * Renderer — draws worm overlays on a canvas that sits on top of the video.
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.showIds = true;
    this.showTrails = true;
    this.trailLength = 30;  // frames
  }

  setSize(w, h) { this.canvas.width = w; this.canvas.height = h; }

  clear() { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }

  /**
   * Draw all active worms.
   * @param {Track[]} tracks
   * @param {number} currentFrame
   * @param {number|null} selectedId
   * @param {Map<id,score>[]?} scoreMap  per-track map of pattern scores
   */
  drawTracks(tracks, currentFrame, selectedId, patternEngine) {
    const ctx = this.ctx;
    this.clear();

    for (const track of tracks) {
      const color = this._resolveColor(track, patternEngine);
      const isSelected = track.id === selectedId;

      // Trail
      if (this.showTrails && track.trajectory.length > 1) {
        const pts = track.trajectory.slice(-this.trailLength);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.strokeStyle = color + '55';
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.stroke();
      }

      // Ellipse at current position
      const last = track.trajectory[track.trajectory.length - 1];
      if (!last) continue;

      ctx.save();
      ctx.translate(last.x, last.y);
      ctx.rotate(track.trajectory.length > 0 ? (last.angle ?? 0) : 0);

      const rx = Math.max(6, (last.aspectRatio ?? 2) * 5);
      const ry = Math.max(3, 5);

      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      if (isSelected) {
        ctx.fillStyle = color + '33';
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();

      // ID label
      if (this.showIds) {
        const label = this._label(track, patternEngine);
        ctx.font = `bold 10px monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(label, last.x, last.y - 10);
      }

      // Selected highlight ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(last.x, last.y, 18, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Match score badge
      if (patternEngine && track.bestMatch) {
        const { score, patternName } = track.bestMatch;
        const pct = Math.round(score * 100);
        ctx.font = '9px monospace';
        ctx.fillStyle = '#c084fc';
        ctx.textAlign = 'center';
        ctx.fillText(`${patternName} ${pct}%`, last.x, last.y + 18);
      }
    }
  }

  drawClickTarget(x, y) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _resolveColor(track, pe) {
    if (!pe || !track.bestMatch) return track.color;
    const pat = pe.getPattern(track.bestMatch.patternId);
    return pat ? pat.color : track.color;
  }

  _label(track, pe) {
    if (track.bestMatch && pe) {
      const pat = pe.getPattern(track.bestMatch.patternId);
      if (pat) return `W${track.id}·${pat.name.slice(0,4)}`;
    }
    return `W${track.id}`;
  }
}
