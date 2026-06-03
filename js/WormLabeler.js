/**
 * WormLabeler — interactive image-labeling canvas for the Worm Counter tab.
 * Tap to drop categorized dots, pinch/scroll to zoom, drag to pan. Exports a
 * self-contained training file (image + labeled points) for later upload.
 *
 * Built for clumped/dense plates where the auto-counter struggles: the human
 * marks each worm (zoomed in), and those labels become training data.
 */
export const LABEL_CATS = {
  large:    { color: '#2e90ff', label: 'Large' },
  juvenile: { color: '#ff8c00', label: 'Juvenile' },
  baby:     { color: '#b446dc', label: 'Baby' },
  edge:     { color: '#ffd400', label: 'Edge' },
  dead:     { color: '#ff3b3b', label: 'Dead' },
  egg:      { color: '#22c55e', label: 'Egg' },
};

const TAP_MOVE_TOL = 8;     // px of movement still counted as a tap (not a pan)
const HIT_RADIUS   = 14;    // px screen radius to grab/erase an existing dot
const MAX_SCALE    = 12;

export class WormLabeler {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = null;
    this.imgName = '';
    this.points = [];          // {x, y, cat} in IMAGE coordinates
    this.cat = 'large';
    this.mode = 'add';         // 'add' | 'erase'
    this.scale = 1; this.fitScale = 1;
    this.tx = 0; this.ty = 0;  // pan offset in CSS px
    this.onChange = null;
    this._pointers = new Map();
    this._gesture = null;      // {moved, downX, downY, t}
    this._bind();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  setImage(imgEl, name) {
    this.img = imgEl; this.imgName = name || '';
    this.points = [];
    this._resize();
    this._fit();
    this.render();
    this._changed();
  }
  setCategory(cat) { this.cat = cat; }
  setMode(mode)    { this.mode = mode; }
  clear()          { this.points = []; this.render(); this._changed(); }

  prefill(pts, cat = 'large') {
    // pts: [{x,y}] in image coords (from the auto-detector)
    for (const p of pts) this.points.push({ x: p.x, y: p.y, cat });
    this.render(); this._changed();
  }

  counts() {
    const c = {}; for (const k in LABEL_CATS) c[k] = 0;
    for (const p of this.points) c[p.cat] = (c[p.cat] || 0) + 1;
    return c;
  }

  getData() {
    return {
      type: 'wormtrace-training', version: 1,
      image: this.img ? {
        name: this.imgName,
        width: this.img.naturalWidth || this.img.width,
        height: this.img.naturalHeight || this.img.height,
        dataUrl: this._imageDataUrl(),
      } : null,
      labels: this.points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), cat: p.cat })),
      counts: this.counts(),
    };
  }

  loadData(obj, imgEl) {
    if (imgEl) { this.img = imgEl; this.imgName = obj.image?.name || ''; }
    this.points = (obj.labels || []).map(p => ({ x: p.x, y: p.y, cat: p.cat }));
    this._resize(); this._fit(); this.render(); this._changed();
  }

  zoomBy(factor) {
    const r = this.canvas.getBoundingClientRect();
    this._zoomAt(r.width / 2, r.height / 2, factor);
  }
  resetView() { this._fit(); this.render(); }

  // ── Rendering ─────────────────────────────────────────────────────────────
  render() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.canvas.clientWidth, cssH = this.canvas.clientHeight;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, cssW, cssH);
    if (!this.img) return;

    // image with pan/zoom transform
    ctx.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, this.tx * dpr, this.ty * dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.img, 0, 0);

    // dots at constant screen size
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of this.points) {
      const sx = p.x * this.scale + this.tx, sy = p.y * this.scale + this.ty;
      if (sx < -10 || sy < -10 || sx > cssW + 10 || sy > cssH + 10) continue;
      ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 2 * Math.PI);
      ctx.fillStyle = (LABEL_CATS[p.cat] || LABEL_CATS.large).color;
      ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    }
  }

  // ── Geometry ──────────────────────────────────────────────────────────────
  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.canvas.clientWidth || 300, cssH = this.canvas.clientHeight || 300;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
  }
  _fit() {
    if (!this.img) return;
    const cssW = this.canvas.clientWidth, cssH = this.canvas.clientHeight;
    const iw = this.img.naturalWidth || this.img.width, ih = this.img.naturalHeight || this.img.height;
    this.fitScale = Math.min(cssW / iw, cssH / ih);
    this.scale = this.fitScale;
    this.tx = (cssW - iw * this.scale) / 2;
    this.ty = (cssH - ih * this.scale) / 2;
  }
  _screenToImage(sx, sy) { return { x: (sx - this.tx) / this.scale, y: (sy - this.ty) / this.scale }; }
  _zoomAt(sx, sy, factor) {
    const before = this._screenToImage(sx, sy);
    this.scale = Math.max(this.fitScale, Math.min(MAX_SCALE, this.scale * factor));
    this.tx = sx - before.x * this.scale;
    this.ty = sy - before.y * this.scale;
    this.render();
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  _bind() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', e => this._down(e));
    c.addEventListener('pointermove', e => this._move(e));
    c.addEventListener('pointerup', e => this._up(e));
    c.addEventListener('pointercancel', e => this._up(e));
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this._zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
    window.addEventListener('resize', () => { if (this.img) { this._resize(); this.render(); } });
  }
  _pt(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  _down(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this._pt(e);
    this._pointers.set(e.pointerId, p);
    if (this._pointers.size === 1) this._gesture = { moved: false, downX: p.x, downY: p.y };
    else this._gesture = null;   // multi-touch = pinch, never a tap
  }
  _move(e) {
    if (!this._pointers.has(e.pointerId)) return;
    const p = this._pt(e);
    const prev = this._pointers.get(e.pointerId);
    this._pointers.set(e.pointerId, p);

    if (this._pointers.size >= 2) {
      const pts = [...this._pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (this._lastPinch) {
        this._zoomAt(mid.x, mid.y, dist / this._lastPinch.dist);
        this.tx += mid.x - this._lastPinch.mid.x;
        this.ty += mid.y - this._lastPinch.mid.y;
        this.render();
      }
      this._lastPinch = { dist, mid };
    } else if (this._gesture) {
      const dx = p.x - prev.x, dy = p.y - prev.y;
      if (Math.abs(p.x - this._gesture.downX) > TAP_MOVE_TOL ||
          Math.abs(p.y - this._gesture.downY) > TAP_MOVE_TOL) this._gesture.moved = true;
      if (this._gesture.moved) { this.tx += dx; this.ty += dy; this.render(); }   // pan
    }
  }
  _up(e) {
    const wasTap = this._gesture && !this._gesture.moved && this._pointers.size === 1;
    const p = this._pt(e);
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._lastPinch = null;
    if (wasTap) this._tap(p.x, p.y);
    if (this._pointers.size === 0) this._gesture = null;
  }
  _tap(sx, sy) {
    // erase if tapping near an existing dot (always), else add in add-mode
    let nearest = -1, best = HIT_RADIUS;
    for (let i = 0; i < this.points.length; i++) {
      const dx = (this.points[i].x * this.scale + this.tx) - sx;
      const dy = (this.points[i].y * this.scale + this.ty) - sy;
      const d = Math.hypot(dx, dy);
      if (d < best) { best = d; nearest = i; }
    }
    if (this.mode === 'erase') {
      if (nearest >= 0) this.points.splice(nearest, 1);
    } else {
      if (nearest >= 0) this.points.splice(nearest, 1);   // tap existing dot removes it
      else { const ip = this._screenToImage(sx, sy); this.points.push({ x: ip.x, y: ip.y, cat: this.cat }); }
    }
    this.render(); this._changed();
  }

  _imageDataUrl() {
    const c = document.createElement('canvas');
    c.width = this.img.naturalWidth || this.img.width;
    c.height = this.img.naturalHeight || this.img.height;
    c.getContext('2d').drawImage(this.img, 0, 0);
    try { return c.toDataURL('image/jpeg', 0.85); } catch { return null; }
  }
  _changed() { if (this.onChange) this.onChange(this.counts()); }
}
