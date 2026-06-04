/**
 * PlateCanvas.js — animated canvas renderer for the petri dish visualisation.
 *
 * Renders:
 *   • Petri dish with agar base + gloss highlight
 *   • Bacterial lawn that shrinks & changes colour as food depletes
 *   • Worms as animated ellipses (stage-sized, slow sinusoidal wiggle)
 *   • Egg dots when worms are in the adult stage
 *   • Food-exhausted warning when food = 0
 */
import { fmtElapsed, fmtHours } from './LifeCycle.js?v=131';

export class PlateCanvas {
  constructor(canvas) {
    this.canvas    = canvas;
    this.ctx       = canvas.getContext('2d');
    this._t        = 0;
    this._raf      = null;
    this._state    = null;
    this._zoomOpen = false;
  }

  /** Start the animation loop. */
  start() {
    if (this._raf) return;
    const loop = () => {
      this._t++;
      this._autoSize();                 // keep canvas pixel size in sync with its box
      if (this._state) this._render(this._state);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  /** Self-size the canvas each frame from its wrapper's rendered box.
   *  Guarantees the plate is visible immediately, not only after a click/resize. */
  _autoSize() {
    if (this._noAutoSize) return;                              // fixed-size canvas (e.g. simulator)
    const wrap = this.canvas.parentElement;
    if (!wrap) return;
    if (wrap.classList.contains('canvas-collapsed')) return;   // don't fight the collapse
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (w < 20 || h < 20) return;                               // not laid out yet
    const size = Math.max(40, Math.min(w - 24, h - 24, 320));
    if (size > 0 && (this.canvas.width !== size || this.canvas.height !== size)) {
      this.canvas.width = size;
      this.canvas.height = size;
    }
  }

  stop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  /** Update the data that gets rendered each frame. */
  setState(state) {
    this._state = state;
  }

  /** Enable tap-to-zoom: clicking canvas opens a fullscreen modal. */
  enableZoom(wrapEl) {
    wrapEl.style.cursor = 'zoom-in';
    wrapEl.addEventListener('click', () => {
      // When collapsed, a tap should expand the box (handled by plateUI), not zoom
      if (wrapEl.classList.contains('canvas-collapsed')) return;
      if (!this._zoomOpen) this._openZoomModal();
    });
  }

  _openZoomModal() {
    if (!this._state || this._zoomOpen) return;
    this._zoomOpen = true;

    let modal = document.getElementById('plateZoomModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'plateZoomModal';
      document.body.appendChild(modal);
    }
    modal.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.93);z-index:800;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;touch-action:none;';

    const base = Math.round(Math.min(window.innerWidth * 0.9, window.innerHeight * 0.7, 520));
    const bs = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;min-height:unset;width:auto;border-radius:10px;';
    modal.innerHTML = `
      <div style="font-size:12px;color:#94a3b8">Pinch / scroll to zoom · drag to pan · tap outside to close</div>
      <div id="pzScroll" style="overflow:auto;max-width:94vw;max-height:74vh;border-radius:18px;background:#000;-webkit-overflow-scrolling:touch;cursor:grab">
        <canvas id="plateZoomCanvas" width="${base}" height="${base}" style="display:block;border-radius:50%"></canvas>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button id="pzOut" style="${bs}width:38px;height:38px;font-size:20px">−</button>
        <button id="pzFit" style="${bs}height:38px;padding:0 14px;font-size:12px">Fit</button>
        <button id="pzIn" style="${bs}width:38px;height:38px;font-size:20px">+</button>
        <button id="pzClose" style="${bs}height:38px;padding:0 22px;font-size:14px">Close ✕</button>
      </div>`;
    modal.style.display = 'flex';

    const zc = document.getElementById('plateZoomCanvas');
    const sc = document.getElementById('pzScroll');
    let zoom = 1, active = true, down = false, sx = 0, sy = 0, sl = 0, st = 0, pinch = 0;
    const MINZ = 1, MAXZ = 4;
    const applyZoom = z => {
      zoom = Math.max(MINZ, Math.min(MAXZ, z));
      const px = Math.round(base * zoom);
      if (zc.width !== px) { zc.width = px; zc.height = px; }   // re-render crisp at the new size
      return zoom;
    };
    const zoomAt = (nz, clientX, clientY) => {
      const r = sc.getBoundingClientRect();
      const px = clientX - r.left + sc.scrollLeft, py = clientY - r.top + sc.scrollTop;
      const old = zoom, k = applyZoom(nz) / old;
      sc.scrollLeft = px * k - (clientX - r.left);
      sc.scrollTop  = py * k - (clientY - r.top);
    };
    const center = () => { const r = sc.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

    const onMove = e => { if (!down) return; sc.scrollLeft = sl - (e.clientX - sx); sc.scrollTop = st - (e.clientY - sy); };
    const onUp = () => { down = false; sc.style.cursor = 'grab'; };
    const closeModal = () => {
      active = false;
      modal.style.display = 'none';
      this._zoomOpen = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!this._raf) this.start();
    };

    document.getElementById('pzClose').onclick = closeModal;
    document.getElementById('pzIn').onclick  = () => zoomAt(zoom * 1.3, ...center());
    document.getElementById('pzOut').onclick = () => zoomAt(zoom / 1.3, ...center());
    document.getElementById('pzFit').onclick = () => applyZoom(1);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    sc.addEventListener('wheel', e => { e.preventDefault(); zoomAt(zoom * (e.deltaY < 0 ? 1.15 : 0.87), e.clientX, e.clientY); }, { passive: false });
    sc.addEventListener('mousedown', e => { down = true; sx = e.clientX; sy = e.clientY; sl = sc.scrollLeft; st = sc.scrollTop; sc.style.cursor = 'grabbing'; });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid  = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
    sc.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = dist(e.touches); }, { passive: true });
    sc.addEventListener('touchmove', e => { if (e.touches.length === 2 && pinch) { e.preventDefault(); const d = dist(e.touches); zoomAt(zoom * d / pinch, ...mid(e.touches)); pinch = d; } }, { passive: false });
    sc.addEventListener('touchend', () => { pinch = 0; });

    // Animate: own renderer, redrawing each frame at the current (zoomed) resolution.
    const zRenderer = new PlateCanvas(zc);
    const refresh = () => {
      if (!active || modal.style.display === 'none') { active = false; return; }
      zRenderer._t = this._t;
      if (this._state) zRenderer._render(this._state);
      requestAnimationFrame(refresh);
    };
    requestAnimationFrame(refresh);
  }

  /** Render a "no plate" placeholder. */
  renderEmpty() {
    this._state = null;
    const { canvas: c, ctx } = this;
    ctx.clearRect(0, 0, c.width, c.height);
    this._drawPlateRing(c.width / 2, c.height / 2, Math.min(c.width, c.height) / 2 - 8, 0.08);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Select a plate', c.width / 2, c.height / 2 - 10);
    ctx.fillText('to see visualisation', c.width / 2, c.height / 2 + 10);
  }

  // ── Internal render ────────────────────────────────────────────────────────

  _render({ plate, hrsElapsed = 0, stage, foodPct = 100, wormCount = 1, totalEggs = 0, inoculatedAt, population }) {
    const { canvas: c, ctx } = this;
    const W = c.width, H = c.height;
    const cx = W / 2, cy = H / 2;
    const R  = Math.min(W, H) / 2 - 8;
    const lawnR = R * 0.86;

    ctx.clearRect(0, 0, W, H);

    // ── Agar base ────────────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    const agarGrad = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.25, 0, cx, cy, R);
    agarGrad.addColorStop(0, '#f9f4e7');
    agarGrad.addColorStop(1, '#e8dfc6');
    ctx.fillStyle = agarGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // ── Bacterial lawn ───────────────────────────────────────────────────────
    if (plate.inoculatedAt) {
      const fp = Math.max(0, Math.min(100, foodPct));
      // Lawn shrinks as food depletes
      const lawnScale = fp > 0 ? (0.35 + 0.65 * (fp / 100)) : 0;

      if (lawnScale > 0.01) {
        // Lawn colour: full=green → half=yellow-green → low=amber → 0=nothing
        const lawnColor = fp > 65 ? '#5a9e32' : fp > 35 ? '#8fa820' : fp > 10 ? '#c08020' : '#c05010';

        // Outer glow
        const lawnGrad = ctx.createRadialGradient(cx, cy, lawnR * lawnScale * 0.1, cx, cy, lawnR * lawnScale);
        lawnGrad.addColorStop(0, lawnColor + 'bb');
        lawnGrad.addColorStop(0.7, lawnColor + '99');
        lawnGrad.addColorStop(1, lawnColor + '44');
        ctx.beginPath();
        ctx.arc(cx, cy, lawnR * lawnScale, 0, Math.PI * 2);
        ctx.fillStyle = lawnGrad;
        ctx.fill();

        // Texture stippling
        this._drawLawnTexture(ctx, cx, cy, lawnR * lawnScale, lawnColor);
      }

      const wormR = lawnR * (lawnScale > 0 ? lawnScale : 0.6) * 0.9;

      // ── Eggs ── laid along the worms' (random) crawl paths; drawn under worms.
      if (totalEggs > 0) {
        this._updateEggs(totalEggs);
        this._drawEggsAt(ctx, cx, cy, wormR);
      }

      // ── Worms ────────────────────────────────────────────────────────────
      if (population && population.length) {
        // Mixed multi-generation population: round-robin interleave so stages mix
        const isDpy = (plate.strainId ?? 'N2') === 'dpy-13';
        const groups = population.map(g => ({ ...g, left: g.count }));
        const items = [];
        let remaining = groups.reduce((s, g) => s + g.left, 0);
        while (remaining > 0 && items.length < 200) {
          for (const g of groups) {
            if (g.left > 0) { items.push({ stageId: g.stageId, color: g.color }); g.left--; remaining--; }
          }
        }
        this._layoutWorms(ctx, cx, cy, wormR, items, isDpy);
      } else if (wormCount > 0 && stage) {
        this._drawWorms(ctx, cx, cy, wormR, wormCount, stage, plate.strainId ?? 'N2');
      }
    }

    // ── Plate rim ────────────────────────────────────────────────────────────
    this._drawPlateRing(cx, cy, R, foodPct / 100);

    // ── Stage label ──────────────────────────────────────────────────────────
    if (plate.inoculatedAt && stage) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = stage.color + 'cc';
      ctx.fillText(`${stage.icon} ${stage.name}`, cx, cy + R - 10);
    }

    // ── Food warning ─────────────────────────────────────────────────────────
    if (plate.inoculatedAt && foodPct <= 5) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = foodPct <= 0 ? '#ef4444' : '#f59e0b';
      ctx.fillText(foodPct <= 0 ? '⚠ FOOD EXHAUSTED' : '⚠ LOW FOOD', cx, cy - R + 22);
    }

    // (On-canvas corner stats removed — the plate detail panel already shows this info.)

    // ── Not inoculated overlay ────────────────────────────────────────────────
    if (!plate.inoculatedAt) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Press "Inoculate" to start', cx, cy);
    }
  }

  _drawPlateRing(cx, cy, R, alphaMod = 1) {
    const ctx = this.ctx;
    // Outer rim
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(160,150,130,0.6)';
    ctx.stroke();

    // Inner rim highlight
    ctx.beginPath();
    ctx.arc(cx, cy, R - 2, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.stroke();

    // Top gloss
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R - 1, Math.PI * 1.1, Math.PI * 1.9);
    const gloss = ctx.createLinearGradient(cx - R, cy - R, cx, cy - R * 0.5);
    gloss.addColorStop(0, 'rgba(255,255,255,0)');
    gloss.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = gloss;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }

  _drawLawnTexture(ctx, cx, cy, r, color) {
    // Small dots scattered across the lawn
    const count = Math.floor(r * 1.8);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 * 3.7 + i * 0.4;
      const d = r * (0.05 + ((i * 53) % 100) / 100 * 0.9);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = color + '66';
      ctx.fill();
    }
  }

  /** Size [length, width] for a stage — kept small to reduce clutter when the
   *  plate is crowded with hundreds of worms. */
  _wormSize(stageId, isDpy) {
    const normalMap = {
      egg:[2.5,2], l1:[5,1.1], l2:[7,1.2], l3:[9,1.3], l4:[10.5,1.4],
      young_adult:[12,1.5], adult:[13,1.6], dauer:[6,0.9],
    };
    const dpyMap = {
      egg:[2.5,2], l1:[4,1.8], l2:[4.5,2.0], l3:[6,2.3], l4:[6.5,2.5],
      young_adult:[7,2.7], adult:[8,2.9], dauer:[4.5,1.3],
    };
    return (isDpy ? dpyMap : normalMap)[stageId] ?? [10, 1.8];
  }

  /** Draw one sinusoidal worm centred at the current transform origin. */
  _drawOneWorm(ctx, wLen, wWid, color, swimPhase) {
    const N_SEG = 10;
    const pts = [];
    for (let s = 0; s <= N_SEG; s++) {
      const u = s / N_SEG;
      const bx = (u - 0.5) * wLen * 2;
      const taper = Math.sin(u * Math.PI);
      const by = Math.sin(u * Math.PI * 2.2 - swimPhase) * wWid * 2.8 * taper;
      pts.push([bx, by]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let s = 1; s <= N_SEG; s++) ctx.lineTo(pts[s][0], pts[s][1]);
    ctx.strokeStyle = color + 'dd';
    ctx.lineWidth = wWid * 2.0; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let s = 1; s <= N_SEG; s++) ctx.lineTo(pts[s][0], pts[s][1]);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = wWid * 0.8; ctx.stroke();
    const head = pts[N_SEG];
    ctx.beginPath(); ctx.arc(head[0], head[1], wWid * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
  }

  /** Lay out a list of worms (each {stageId,color}) as independent RANDOM-WALK agents.
   *  Each worm keeps a persistent normalised position/heading on `this._agents` and
   *  wanders the lawn, gently steering back when it nears the edge. Worm size scales
   *  with the canvas (so the zoom modal renders bigger worms) and is ~3× smaller than
   *  before, keeping the plate readable and worth zooming into. */
  _layoutWorms(ctx, cx, cy, maxR, items, isDpy) {
    const t = this._t;
    const drawCount = Math.min(items.length, 160);

    // Persistent agents (position is normalised to the lawn radius, -1..1).
    const A = this._agents || (this._agents = []);
    if (A.length < drawCount) {
      for (let i = A.length; i < drawCount; i++) {
        const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 0.85;
        A.push({ nx: Math.cos(ang) * rr, ny: Math.sin(ang) * rr, dir: Math.random() * Math.PI * 2,
                 spd: 0.00055 + Math.random() * 0.00075, ph: Math.random() * Math.PI * 2 });
      }
    } else if (A.length > drawCount) {
      A.length = drawCount;
    }

    // 3× smaller than the old fixed sizes, and proportional to the canvas → zoom enlarges.
    const sizeScale = (this.canvas.width / 300) / 3;

    for (let i = 0; i < drawCount; i++) {
      const it = items[i], ag = A[i];
      // Random walk: gently jitter the heading, step forward, steer back inside the lawn.
      ag.dir += (Math.random() - 0.5) * 0.22;
      ag.nx += Math.cos(ag.dir) * ag.spd;
      ag.ny += Math.sin(ag.dir) * ag.spd;
      const r = Math.hypot(ag.nx, ag.ny);
      if (r > 0.9) {
        const posAng = Math.atan2(ag.ny, ag.nx);
        ag.nx = Math.cos(posAng) * 0.9;
        ag.ny = Math.sin(posAng) * 0.9;
        ag.dir = posAng + Math.PI + (Math.random() - 0.5) * 0.6;   // turn back toward centre
      }
      let [wLen, wWid] = this._wormSize(it.stageId, isDpy);
      wLen *= sizeScale; wWid *= sizeScale;
      const wx = cx + ag.nx * maxR, wy = cy + ag.ny * maxR;
      const swimPhase = t * 0.06 + ag.ph;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(ag.dir);                 // head points the way it's crawling
      this._drawOneWorm(ctx, wLen, wWid, it.color, swimPhase);
      ctx.restore();
    }
    if (items.length > 160) {
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`+${items.length - 160} more`, cx, cy + maxR - 4);
    }
  }

  _drawWorms(ctx, cx, cy, maxR, count, stage, strainId) {
    const isDpy = strainId === 'dpy-13';
    const items = Array.from({ length: count }, () => ({ stageId: stage.id, color: stage.color }));
    this._layoutWorms(ctx, cx, cy, maxR, items, isDpy);
  }

  /** Draw corner stats in the BLACK CORNERS outside the plate circle. */
  _cornerText(ctx, W, H, corners, colorOverrides = {}) {
    const PAD = 7;
    const LINE = 14;
    ctx.font = 'bold 10px -apple-system, sans-serif';

    const _draw = (lines, x, y, align, colorIdx) => {
      if (!lines) return;
      const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + PAD * 2;
      const h = lines.length * LINE + PAD;
      const bx = align === 'right' ? x - w : x;

      // Dark pill background
      ctx.fillStyle = 'rgba(5,8,15,0.78)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, y, w, h, 5);
      else ctx.rect(bx, y, w, h);
      ctx.fill();

      lines.forEach((line, i) => {
        ctx.fillStyle = (i === 0 && colorIdx) ? colorIdx : '#94a3b8';
        ctx.textAlign = align;
        ctx.textBaseline = 'top';
        ctx.fillText(line, align === 'right' ? x - PAD : bx + PAD, y + PAD * 0.6 + i * LINE);
      });
    };

    // Corners are in the dark areas OUTSIDE the plate circle
    _draw(corners.tl, PAD,     PAD,     'left',  colorOverrides.tl ?? '#00d4aa');
    _draw(corners.tr, W - PAD, PAD,     'right', colorOverrides.tr ?? '#e2e8f0');
    _draw(corners.bl, PAD,     H - PAD - (corners.bl?.length ?? 0) * LINE - PAD, 'left',  colorOverrides.bl ?? '#00d4aa');
    if (corners.br) _draw(corners.br, W - PAD, H - PAD - (corners.br?.length ?? 0) * LINE - PAD, 'right', colorOverrides.br ?? '#fbbf24');
  }

  /** Maintain the persistent egg list so eggs are dropped where worms have crawled.
   *  Each egg is stored in normalised lawn coords with a random rotation, so it stays
   *  put once laid. New eggs appear at a random worm's CURRENT position (its path);
   *  if no worms are present yet, they fall on random spots. */
  _updateEggs(totalEggs) {
    const eggs = this._eggs || (this._eggs = []);
    const cap = Math.min(totalEggs, 140);
    if (eggs.length > cap) eggs.length = cap;        // eggs hatched / plate reset
    const ags = this._agents;
    while (eggs.length < cap) {
      let nx, ny;
      if (ags && ags.length) {
        const a = ags[Math.floor(Math.random() * ags.length)];   // a worm's current path point
        nx = a.nx + (Math.random() - 0.5) * 0.05;
        ny = a.ny + (Math.random() - 0.5) * 0.05;
      } else {
        const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 0.82;
        nx = Math.cos(ang) * rr; ny = Math.sin(ang) * rr;
      }
      eggs.push({ nx, ny, rot: Math.random() * Math.PI });
    }
  }

  _drawEggsAt(ctx, cx, cy, maxR) {
    const eggs = this._eggs || [];
    const eggScale = this.canvas.width / 300;        // scales with the canvas (zoom-aware)
    for (const e of eggs) {
      ctx.beginPath();
      ctx.ellipse(cx + e.nx * maxR, cy + e.ny * maxR, 2.2 * eggScale, 1.5 * eggScale, e.rot, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(247,238,200,0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(170,140,70,0.45)';
      ctx.lineWidth = 0.5 * eggScale;
      ctx.stroke();
    }
  }
}
