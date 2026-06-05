/**
 * WormLabeler — interactive image-labeling canvas for the Worm Counter tab.
 * Tap to drop categorized BOXES (training-tool style) that wrap each worm,
 * pinch/scroll to zoom, drag to pan. With a stage selected, tapping an existing
 * box re-tags it to that stage; tapping a same-stage box removes it. Exports a
 * self-contained training file (image + labeled marks) for later upload.
 *
 * Built for clumped/dense plates where the auto-counter struggles: the human
 * marks each worm (zoomed in), and those labels become training data. A mark is
 * {x,y,cat} (center + stage) plus optional {w,h} box size for display only —
 * training/feature extraction uses the center, so the data model is unchanged.
 */
// Life-stage labels — match the Plate Tracker stages 1:1 (ids/colors from
// LifeCycle.js BASE_STAGES) so a labelled photo maps straight onto plate cohorts.
export const LABEL_CATS = {
  egg:   { color: '#fbbf24', label: 'Egg' },
  l1:    { color: '#34d399', label: 'L1' },
  l2:    { color: '#60a5fa', label: 'L2' },
  l3:    { color: '#a78bfa', label: 'L3' },
  l4:    { color: '#f472b6', label: 'L4' },
  adult: { color: '#ef4444', label: 'Adult' },
  dead:  { color: '#64748b', label: 'Dead' },
};

// Old size-class labels → life-stage ids, for importing pre-switch training files.
export const CAT_MIGRATE = { large: 'l4', juvenile: 'l2', baby: 'l1', edge: 'l4' };
const migrateCat = c => CAT_MIGRATE[c] || c;

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
    this.cat = 'l4';
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

  prefill(pts, cat = 'l4') {
    // pts: [{x,y,w?,h?}] in image coords (from the auto-detector). w/h size the box.
    for (const p of pts) this.points.push({ x: p.x, y: p.y, cat: p.cat || cat, w: p.w, h: p.h });
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
      // x,y,cat drive training (unchanged); w,h are optional box sizes for display.
      labels: this.points.map(p => ({
        x: Math.round(p.x), y: Math.round(p.y), cat: p.cat,
        ...(p.w ? { w: Math.round(p.w), h: Math.round(p.h) } : {}),
      })),
      counts: this.counts(),
    };
  }

  loadData(obj, imgEl) {
    if (imgEl) { this.img = imgEl; this.imgName = obj.image?.name || ''; }
    this.points = (obj.labels || []).map(p => ({ x: p.x, y: p.y, cat: migrateCat(p.cat), w: p.w, h: p.h }));
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

    // box markers (training-tool style) at constant screen line width
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const def = this._defaultBox();
    ctx.font = '700 10px -apple-system, sans-serif';
    ctx.textBaseline = 'bottom';
    for (const p of this.points) {
      const r = this._boxScreenRect(p, def);
      if (r.x > cssW + 8 || r.y > cssH + 8 || r.x + r.w < -8 || r.y + r.h < -8) continue;
      const col = (LABEL_CATS[p.cat] || LABEL_CATS.l4).color;
      ctx.fillStyle = col + '26';                 // ~15% translucent fill
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.lineWidth = 2; ctx.strokeStyle = col;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      // stage tag in the corner when the box is big enough to read
      if (r.w >= 22 && r.h >= 18) {
        const tag = (LABEL_CATS[p.cat] || LABEL_CATS.l4).label;
        const tw = ctx.measureText(tag).width + 6;
        ctx.fillStyle = col;
        ctx.fillRect(r.x, r.y - 12, tw, 12);
        ctx.fillStyle = '#04201a';
        ctx.fillText(tag, r.x + 3, r.y);
      }
    }
  }

  // Screen-space rect for a mark's box, with a minimum tappable size.
  _boxScreenRect(p, def) {
    const w = Math.max(14, ((p.w || def.w) * this.scale));
    const h = Math.max(14, ((p.h || def.h) * this.scale));
    const cx = p.x * this.scale + this.tx, cy = p.y * this.scale + this.ty;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  // Default box size (image px) — median of boxed marks, else a fraction of the image.
  _defaultBox() {
    const ws = [], hs = [];
    for (const p of this.points) { if (p.w) ws.push(p.w); if (p.h) hs.push(p.h); }
    const med = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    const iw = this.img ? (this.img.naturalWidth || this.img.width) : 300;
    const ih = this.img ? (this.img.naturalHeight || this.img.height) : 300;
    const fallback = Math.max(10, Math.round(Math.min(iw, ih) * 0.045));
    return { w: med(ws) || fallback, h: med(hs) || fallback };
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
    const hit = this._hitTest(sx, sy);
    if (this.mode === 'erase') {
      if (hit >= 0) this.points.splice(hit, 1);
    } else if (hit >= 0) {
      // Tapping a box: re-tag it to the selected stage, or remove it if already that stage.
      if (this.points[hit].cat !== this.cat) this.points[hit].cat = this.cat;
      else this.points.splice(hit, 1);
    } else {
      // Empty space: drop a new box (sized like the others) at the tap.
      const ip = this._screenToImage(sx, sy);
      const def = this._defaultBox();
      this.points.push({ x: ip.x, y: ip.y, cat: this.cat, w: def.w, h: def.h });
    }
    this.render(); this._changed();
  }
  // Index of the smallest box containing the screen point (so overlapping marks are
  // selectable), falling back to the nearest center within a small radius.
  _hitTest(sx, sy) {
    const def = this._defaultBox();
    let best = -1, bestArea = Infinity, nearest = -1, nd = HIT_RADIUS;
    for (let i = 0; i < this.points.length; i++) {
      const r = this._boxScreenRect(this.points[i], def);
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) {
        const a = r.w * r.h;
        if (a < bestArea) { bestArea = a; best = i; }
      }
      const d = Math.hypot(r.x + r.w / 2 - sx, r.y + r.h / 2 - sy);
      if (d < nd) { nd = d; nearest = i; }
    }
    return best >= 0 ? best : nearest;
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
