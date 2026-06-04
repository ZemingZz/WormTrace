/**
 * flySimApp.js — Drosophila "Growth Simulator" (the fly analogue of the worm plate view).
 * An animated VIAL canvas (food layer + eggs, crawling larvae, pupae on the glass, adult
 * flies in the air) driven by a deterministic life-cycle timeline (egg→L1→L2→L3→pupa→
 * adult→death @25 °C), with play/scrub/speed, food%, counts, "add food", total-hours
 * readout, and tap-to-zoom. Preview only — self-contained, isolated overlay (#flySim).
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmtH = h => { h = Math.max(0, Math.round(h)); const d = Math.floor(h / 24), r = h % 24; return d > 0 ? `${d}d ${r}h` : `${r}h`; };

// ── Drosophila life cycle @25 °C (hours). egg→adult ≈ 10 d; adult median ≈ 50 d. ──
const ST = [
  { id: 'egg',   name: 'Egg',      start: 0,   color: '#efe3b0' },
  { id: 'l1',    name: 'L1 larva', start: 24,  color: '#e4ebd0' },
  { id: 'l2',    name: 'L2 larva', start: 48,  color: '#cdd89a' },
  { id: 'l3',    name: 'L3 larva', start: 72,  color: '#a9bd5e' },
  { id: 'pupa',  name: 'Pupa',     start: 120, color: '#9a6b3f' },
  { id: 'adult', name: 'Adult',    start: 240, color: '#7c5aa6' },
];
const ADULT = 240;
const stageAt = age => { let s = ST[0]; for (const st of ST) if (age >= st.start) s = st; return s; };
const LARVAL = new Set(['l1', 'l2', 'l3']);

// ── Deterministic timeline ────────────────────────────────────────────────────
function buildFlyTimeline(food0, founders) {
  const DT = 6, MAX_H = 70 * 24, POP_CAP = 2e5;
  const GA = 0.0016, GG = 0.22, kAge = 50 / 20;          // adult Gompertz → median ~50 d
  const LAY0 = ADULT + 48, LAY1 = ADULT + 22 * 24, EGGS_PER_F = 400;
  const layRate = EGGS_PER_F / (LAY1 - LAY0);            // eggs / female / hr
  const larvaFoodPerHr = 0.00035;                        // food (mL) consumed per larva·hr
  let food = food0;
  let cohorts = [{ age: ADULT, count: founders, dead: false, starving: false, starveAge: 0 }];
  let agedDead = 0;
  const snaps = [];

  for (let h = 0; h <= MAX_H; h += DT) {
    // snapshot
    const by = {}; let living = 0, dead = 0, eggs = 0, larvae = 0, adults = 0;
    for (const c of cohorts) {
      if (c.dead) { dead += c.count; continue; }
      const s = stageAt(c.age);
      by[s.id] = (by[s.id] || 0) + c.count;
      living += c.count;
      if (s.id === 'egg') eggs += c.count;
      else if (LARVAL.has(s.id)) larvae += c.count;
      else if (s.id === 'adult') adults += c.count;
    }
    dead += agedDead;
    const r1 = n => Math.round(n * 10) / 10;
    snaps.push({ h, byStage: by, living: r1(living), eggs: r1(eggs), larvae: r1(larvae),
      adults: r1(adults), dead: r1(dead), foodPct: food0 > 0 ? (food / food0) * 100 : 0 });

    // consume food (larvae only)
    const hadFood = food > 0;
    let larvaeNow = 0;
    for (const c of cohorts) if (!c.dead && !c.starving && LARVAL.has(stageAt(c.age).id)) larvaeNow += c.count;
    food = Math.max(0, food - larvaeNow * larvaFoodPerHr * DT);
    const foodOut = food <= 0;

    // reproduction (egg laying by adult females ≈ 50% of adults)
    if (hadFood || true) {   // adults lay even on depleting food; larvae are what need food
      let born = 0;
      for (const c of cohorts) {
        if (c.dead || c.starving) continue;
        if (c.age >= LAY0 && c.age <= LAY1) born += c.count * 0.5 * layRate * DT;
      }
      if (born >= 1) cohorts.push({ age: 0, count: Math.min(born, POP_CAP), dead: false, starving: false, starveAge: 0 });
    }

    // starvation: when larval food runs out, eggs+larvae starve gradually (pupae & adults unaffected by larval food)
    if (foodOut) {
      for (const c of cohorts) {
        if (c.dead || c.starving) continue;
        const sid = stageAt(c.age).id;
        if (sid === 'egg' || LARVAL.has(sid)) { c.starving = true; c.starveAge = 0; }
      }
    }

    // age + mortality
    for (const c of cohorts) {
      if (c.dead) continue;
      if (c.starving) {                                   // gradual starvation death (~5 d median, accelerating)
        c.starveAge += DT;
        const frac = c.starveAge / (5 * 24);
        const mu = (Math.LN2 / (5 * 24)) * (1 + frac * frac);
        const d = c.count * (1 - Math.exp(-mu * DT)); c.count -= d; agedDead += d;
        if (c.count < 0.01) c.dead = true;
        continue;
      }
      c.age += DT;
      if (c.age >= ADULT) {                               // adult old-age (Gompertz)
        const ageDays = (c.age - ADULT) / 24;
        const mu = (GA / kAge) * Math.exp((GG / kAge) * ageDays);
        const d = c.count * (1 - Math.exp(-mu * (DT / 24))); c.count -= d; agedDead += d;
        if (c.count < 0.01) c.dead = true;
      }
    }

    // merge to stay fast
    if (cohorts.length > 260) {
      const buckets = {}; let xPool = 0; const keep = [];
      for (const c of cohorts) {
        if (c.dead) { xPool += c.count; continue; }
        if (c.starving) { keep.push(c); continue; }
        const k = Math.round(c.age / DT); buckets[k] = (buckets[k] || 0) + c.count;
      }
      cohorts = Object.entries(buckets).map(([k, count]) => ({ age: +k * DT, count, dead: false, starving: false, starveAge: 0 }));
      cohorts.push(...keep);
      if (xPool > 0) cohorts.push({ age: 0, count: xPool, dead: true });
    }
  }
  return snaps;
}
function flyTimelineAt(snaps, h) {
  if (!snaps.length) return null;
  if (h <= 0) return snaps[0];
  const DT = snaps[1] ? snaps[1].h - snaps[0].h : 6;
  const i = Math.min(snaps.length - 1, Math.floor(h / DT));
  return snaps[i];
}

// ── Vial canvas (food, eggs, larvae, pupae, adult flies) ───────────────────────
class FlyVial {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this._t = 0; this._raf = null; this._state = null; this._larvae = []; this._flies = []; this._zoom = false; }
  start() { if (this._raf) return; const loop = () => { this._t++; if (this._state) this._render(this._state); this._raf = requestAnimationFrame(loop); }; this._raf = requestAnimationFrame(loop); }
  stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } }
  setState(s) { this._state = s; }

  _ensure(arr, n, mk) { while (arr.length < n) arr.push(mk()); if (arr.length > n) arr.length = n; }

  _render(snap) {
    const c = this.canvas, ctx = c.getContext('2d'), W = c.width, H = c.height, t = this._t;
    ctx.clearRect(0, 0, W, H);
    // vial geometry
    const vw = Math.min(W * 0.62, 150 * (W / 220)), vx = (W - vw) / 2, vy = 10, vh = H - 20, r = Math.min(16, vw * 0.22);
    const foodPct = Math.max(0, Math.min(100, snap?.foodPct ?? 100));
    const foodH = vh * (0.30 + 0.22 * (foodPct / 100));   // food layer shrinks as it depletes
    const foodTop = vy + vh - foodH;
    const sc = W / 220;   // size scale (zoom-aware)

    // glass
    ctx.save();
    this._roundRect(ctx, vx, vy, vw, vh, r); ctx.clip();
    ctx.fillStyle = '#0c1320'; ctx.fillRect(vx, vy, vw, vh);
    // food layer (cornmeal-brown, paler as depleted)
    const fc = foodPct > 55 ? '#6b4a2a' : foodPct > 25 ? '#7a5836' : foodPct > 5 ? '#8a6a44' : '#9a8260';
    ctx.fillStyle = fc; ctx.fillRect(vx, foodTop, vw, foodH);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(vx, foodTop, vw, 3);
    // food speckle
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let i = 0; i < vw * 0.5; i++) { const a = i * 12.9898; const rx = vx + (Math.abs(Math.sin(a)) * vw); const ry = foodTop + 4 + Math.abs(Math.cos(a * 1.7)) * (foodH - 6); ctx.fillRect(rx, ry, 1.4 * sc, 1.4 * sc); }

    if (snap) {
      const by = snap.byStage || {};
      // ── eggs: tiny pale ovals on the food surface
      const nEgg = Math.min(Math.round(by.egg || 0), 60);
      ctx.fillStyle = 'rgba(245,238,205,0.92)';
      for (let i = 0; i < nEgg; i++) { const a = i * 2.39996; const ex = vx + 6 + ((i * 37) % Math.max(1, vw - 12)); const ey = foodTop + 3 + ((i * 53) % 8); ctx.beginPath(); ctx.ellipse(ex, ey, 1.5 * sc, 0.9 * sc, a, 0, 7); ctx.fill(); }

      // ── larvae: small curved maggots burrowing in the food (animated wiggle + drift)
      const nLarv = Math.min(Math.round((by.l1 || 0) + (by.l2 || 0) + (by.l3 || 0)), 80);
      this._ensure(this._larvae, nLarv, () => ({ x: vx + 8 + Math.random() * (vw - 16), y: foodTop + 6 + Math.random() * (foodH - 10), ph: Math.random() * 7, vx: (Math.random() - 0.5) * 0.15 }));
      const larvW = ((by.l3 || 0) > (by.l1 || 0)) ? 7 : 5;
      ctx.lineCap = 'round';
      for (let i = 0; i < this._larvae.length; i++) {
        const L = this._larvae[i]; L.x += L.vx; if (L.x < vx + 6 || L.x > vx + vw - 6) L.vx *= -1;
        L.y += Math.sin(t * 0.05 + L.ph) * 0.06;
        L.y = Math.max(foodTop + 5, Math.min(vy + vh - 5, L.y));
        const bend = Math.sin(t * 0.12 + L.ph) * 0.5;
        ctx.strokeStyle = 'rgba(245,245,225,0.9)'; ctx.lineWidth = Math.max(1.2, 2.2 * sc);
        ctx.beginPath();
        for (let s = 0; s <= 6; s++) { const u = s / 6; const px = L.x + (u - 0.5) * larvW * sc; const py = L.y + Math.sin(u * Math.PI + bend) * 2.2 * sc; s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
        ctx.stroke();
      }

      // ── pupae: brown capsules stuck on the upper glass wall (static)
      const nPup = Math.min(Math.round(by.pupa || 0), 40);
      ctx.fillStyle = '#9a6b3f';
      for (let i = 0; i < nPup; i++) { const side = i % 2 === 0; const px = side ? vx + 4 + (i % 3) * 3 : vx + vw - 8 - (i % 3) * 3; const py = vy + 12 + ((i * 17) % Math.max(1, (foodTop - vy - 24))); ctx.beginPath(); ctx.ellipse(px, py, 1.6 * sc, 3.4 * sc, 0, 0, 7); ctx.fill(); }

      // ── adult flies: small flies buzzing in the air space
      const nFly = Math.min(Math.round(by.adult || 0), 60);
      this._ensure(this._flies, nFly, () => ({ x: vx + 10 + Math.random() * (vw - 20), y: vy + 8 + Math.random() * (foodTop - vy - 12), dir: Math.random() * 7, ph: Math.random() * 7 }));
      for (let i = 0; i < this._flies.length; i++) {
        const F = this._flies[i];
        F.dir += (Math.random() - 0.5) * 0.6;
        F.x += Math.cos(F.dir) * 0.8; F.y += Math.sin(F.dir) * 0.6;
        if (F.x < vx + 6) { F.x = vx + 6; F.dir = Math.PI - F.dir; }
        if (F.x > vx + vw - 6) { F.x = vx + vw - 6; F.dir = Math.PI - F.dir; }
        if (F.y < vy + 6) { F.y = vy + 6; F.dir = -F.dir; }
        if (F.y > foodTop - 2) { F.y = foodTop - 2; F.dir = -F.dir; }
        const bs = 1.7 * sc, wob = Math.sin(t * 0.5 + F.ph);
        // wings
        ctx.fillStyle = 'rgba(210,220,240,0.5)';
        ctx.beginPath(); ctx.ellipse(F.x - bs, F.y - bs * 0.5 + wob * 0.4, bs * 1.3, bs * 0.6, -0.5, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(F.x + bs, F.y - bs * 0.5 - wob * 0.4, bs * 1.3, bs * 0.6, 0.5, 0, 7); ctx.fill();
        // body (tan with red-ish eye)
        ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.ellipse(F.x, F.y, bs * 0.8, bs * 1.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#b33'; ctx.beginPath(); ctx.arc(F.x, F.y - bs * 1.2, bs * 0.5, 0, 7); ctx.fill();
      }
    }
    ctx.restore();

    // glass outline + gloss
    this._roundRect(ctx, vx, vy, vw, vh, r); ctx.strokeStyle = 'rgba(180,200,220,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(vx + 5, vy + 14); ctx.lineTo(vx + 5, vy + vh - 14); ctx.stroke();
    // plug
    ctx.fillStyle = '#dfe3ea'; this._roundRect(ctx, vx - 3, vy - 6, vw + 6, 12, 5); ctx.fill();

    if (snap && (snap.living || 0) < 0.5 && (snap.dead || 0) > 0) {
      ctx.fillStyle = '#ef4444'; ctx.font = `bold ${12 * sc}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('☠ culture ended', W / 2, vy + vh / 2);
    }
  }
  _roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  enableZoom(el) {
    el.style.cursor = 'zoom-in';
    el.addEventListener('click', () => { if (!this._zoom) this._openZoom(); });
  }
  _openZoom() {
    if (!this._state || this._zoom) return; this._zoom = true;
    let m = document.getElementById('flySimZoom'); if (m) m.remove();
    m = document.createElement('div'); m.id = 'flySimZoom';
    m.style.cssText = 'position:fixed;inset:0;z-index:1700;background:rgba(0,0,0,0.93);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;touch-action:none';
    const base = Math.round(Math.min(window.innerWidth * 0.8, window.innerHeight * 0.7, 460));
    const bs = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;min-height:unset;width:auto;border-radius:10px;';
    m.innerHTML = `<div style="font-size:12px;color:#94a3b8">Pinch / scroll to zoom · drag to pan · tap outside to close</div>
      <div id="fzScroll" style="overflow:auto;max-width:94vw;max-height:74vh;border-radius:14px;background:#000;cursor:grab"><canvas id="fzCanvas" width="${Math.round(base * 0.7)}" height="${base}" style="display:block"></canvas></div>
      <div style="display:flex;gap:8px"><button id="fzOut" style="${bs}width:38px;height:38px;font-size:20px">−</button><button id="fzFit" style="${bs}height:38px;padding:0 14px;font-size:12px">Fit</button><button id="fzIn" style="${bs}width:38px;height:38px;font-size:20px">+</button><button id="fzClose" style="${bs}height:38px;padding:0 20px;font-size:14px">Close ✕</button></div>`;
    document.body.appendChild(m);
    const zc = m.querySelector('#fzCanvas'), sc = m.querySelector('#fzScroll');
    const bw = Math.round(base * 0.7), bh = base; let zoom = 1, active = true, down = false, sx = 0, sy = 0, sl = 0, st = 0, pinch = 0;
    const apply = z => { zoom = Math.max(1, Math.min(4, z)); zc.width = Math.round(bw * zoom); zc.height = Math.round(bh * zoom); return zoom; };
    const at = (nz, cx, cy) => { const rr = sc.getBoundingClientRect(); const px = cx - rr.left + sc.scrollLeft, py = cy - rr.top + sc.scrollTop; const k = apply(nz) / zoom * zoom; const o = zoom; const ap = apply(nz); const kk = ap / o; sc.scrollLeft = px * kk - (cx - rr.left); sc.scrollTop = py * kk - (cy - rr.top); };
    const ctr = () => { const rr = sc.getBoundingClientRect(); return [rr.left + rr.width / 2, rr.top + rr.height / 2]; };
    const onMove = e => { if (!down) return; sc.scrollLeft = sl - (e.clientX - sx); sc.scrollTop = st - (e.clientY - sy); };
    const onUp = () => { down = false; sc.style.cursor = 'grab'; };
    const close = () => { active = false; this._zoom = false; m.remove(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    m.querySelector('#fzClose').onclick = close; m.addEventListener('click', e => { if (e.target === m) close(); });
    m.querySelector('#fzIn').onclick = () => at(zoom * 1.3, ...ctr()); m.querySelector('#fzOut').onclick = () => at(zoom / 1.3, ...ctr()); m.querySelector('#fzFit').onclick = () => apply(1);
    sc.addEventListener('wheel', e => { e.preventDefault(); at(zoom * (e.deltaY < 0 ? 1.15 : 0.87), e.clientX, e.clientY); }, { passive: false });
    sc.addEventListener('mousedown', e => { down = true; sx = e.clientX; sy = e.clientY; sl = sc.scrollLeft; st = sc.scrollTop; sc.style.cursor = 'grabbing'; });
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    const dist = tt => Math.hypot(tt[0].clientX - tt[1].clientX, tt[0].clientY - tt[1].clientY); const mid = tt => [(tt[0].clientX + tt[1].clientX) / 2, (tt[0].clientY + tt[1].clientY) / 2];
    sc.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = dist(e.touches); }, { passive: true });
    sc.addEventListener('touchmove', e => { if (e.touches.length === 2 && pinch) { e.preventDefault(); const d = dist(e.touches); at(zoom * d / pinch, ...mid(e.touches)); pinch = d; } }, { passive: false });
    sc.addEventListener('touchend', () => { pinch = 0; });
    const zr = new FlyVial(zc);
    const refresh = () => { if (!active) return; zr._t = this._t; zr._larvae = this._larvae; zr._flies = this._flies; if (this._state) zr._render(this._state); requestAnimationFrame(refresh); };
    requestAnimationFrame(refresh);
  }
}

// ── Panel wiring ────────────────────────────────────────────────────────────────
function init() {
  const root = document.getElementById('flySim');
  if (!root) return;
  root.querySelector('.le-home')?.addEventListener('click', () => {
    root.style.display = 'none';
    if (typeof window.WormTraceShowDrosoHome === 'function') window.WormTraceShowDrosoHome();
    else { const h = document.getElementById('homeScreen'); if (h) h.style.display = 'flex'; }
  });

  const body = document.getElementById('flySimBody');
  if (!body) return;
  body.innerHTML = `
    <div class="le-intro">Watch a fly culture develop in a vial: eggs are laid on the food, larvae burrow and feed, pupae climb the glass, and adults emerge and lay the next generation — until the food runs out. Preview only.</div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start">
      <canvas id="flySimCanvas" width="200" height="300" style="background:#070b14;border:1px solid #1e2a3a;border-radius:14px;display:block;flex-shrink:0"></canvas>
      <div style="flex:1;min-width:200px">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:6px"><span id="fsStage" style="font-weight:700"></span><span id="fsTime" style="color:#64748b;font-family:monospace"></span></div>
        <div style="display:flex;gap:10px;font-size:10px;color:#64748b;flex-wrap:wrap;margin-bottom:8px">
          <span>🍽 <span id="fsFood" style="color:#5a9e32">100%</span></span>
          <span>🥚 <span id="fsEggs" style="color:#fbbf24">0</span></span>
          <span>🐛 <span id="fsLarv" style="color:#a3e635">0</span></span>
          <span>🟤 <span id="fsPup" style="color:#c08552">0</span></span>
          <span>🪰 <span id="fsAd" style="color:#c084fc">0</span></span>
          <span>☠ <span id="fsDead" style="color:#ef4444">0</span></span>
        </div>
        <input type="range" id="fsScrub" min="0" max="100" value="0" style="width:100%;accent-color:var(--accent,#00d4aa);margin-bottom:8px">
        <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
          <button id="fsPlay" class="sim-btn" style="background:var(--accent,#00d4aa);color:#04201a">▶</button>
          ${[{ x: 1, r: 8 }, { x: 2, r: 24 }, { x: 3, r: 72 }].map(s => `<button class="sim-btn fs-speed" data-spd="${s.r}">${s.x}×</button>`).join('')}
          <button id="fsReset" class="sim-btn" style="margin-left:auto">↺</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="fsAddFood" class="sim-btn" style="flex:1;background:#0d2a22;border:1px solid #16734f;color:#34d399">🍽 Add food (+0.5 mL)</button>
          <span id="fsAddedFood" style="font-size:10px;color:#64748b;white-space:nowrap"></span>
        </div>
        <div id="fsBars" style="margin-top:10px"></div>
      </div>
    </div>
    <div style="font-size:10px;color:#475569;margin-top:8px;line-height:1.5">Model: egg ~1 d · larva (L1–L3) ~4 d · pupa ~5 d · adult emerges ~day 10; adults live ~50 d and lay ~400 eggs each. Larvae deplete the food; once it's gone they starve. Tap the vial to zoom.</div>`;

  const canvas = document.getElementById('flySimCanvas');
  const vial = new FlyVial(canvas); vial.start(); vial.enableZoom(canvas);

  const BARS = [['egg', '🥚 Eggs', '#fbbf24'], ['l1', '🐛 L1', '#dfe6c0'], ['l2', '🐛 L2', '#cdd89a'], ['l3', '🐛 L3', '#a9bd5e'], ['pupa', '🟤 Pupae', '#c08552'], ['adult', '🪰 Adults', '#c084fc'], ['dead', '☠ Dead', '#ef4444']];
  document.getElementById('fsBars').innerHTML = BARS.map(([id, lbl, col]) =>
    `<div id="fsrow-${id}" style="display:none;align-items:center;gap:8px;padding:3px 0">
       <span style="font-size:11px;color:${col};font-weight:700;min-width:78px">${lbl}</span>
       <div style="flex:1;height:7px;background:#1e2a3a;border-radius:4px;overflow:hidden"><div id="fsbar-${id}" style="height:100%;width:0%;background:${col};border-radius:4px;transition:width .25s ease-out"></div></div>
       <span id="fsct-${id}" style="font-size:11px;color:#e2e8f0;font-family:monospace;font-weight:700;min-width:48px;text-align:right">0</span>
     </div>`).join('');

  const FOUNDERS = 6, BASE_FOOD = 5;       // 6 founder adults, 5 mL food
  let addedFood = 0, timeline = [], maxHrs = 48, simHrs = 0, speed = 0, raf = null, last = performance.now(), lastDom = 0;
  function rebuild() {
    timeline = buildFlyTimeline(BASE_FOOD + addedFood, FOUNDERS);
    let lastActive = 0;
    for (const s of timeline) if ((s.living ?? 0) > 0.5) lastActive = s.h;
    maxHrs = Math.min(70 * 24, Math.max(48, lastActive + 24));
  }
  rebuild();

  const $ = id => document.getElementById(id);
  function render(force) {
    const snap = flyTimelineAt(timeline, simHrs) || { byStage: {}, living: 0, eggs: 0, larvae: 0, adults: 0, dead: 0, foodPct: 100 };
    vial.setState(snap);
    const now = performance.now();
    if (!force && speed > 0 && now - lastDom < 180) return;
    lastDom = now;
    const by = snap.byStage || {};
    const dom = (by.adult > (by.l3 || 0) && by.adult > (by.pupa || 0)) ? 'adult' : (by.pupa > (by.l3 || 0)) ? 'pupa' : (by.l3 || by.l2 || by.l1) ? 'larva' : (by.egg ? 'egg' : 'adult');
    const stName = { egg: '🥚 Eggs', larva: '🐛 Larvae', pupa: '🟤 Pupae', adult: '🪰 Adults' }[dom] || '';
    $('fsStage').textContent = stName;
    $('fsTime').textContent = `${fmtH(simHrs)} · ${Math.round(simHrs)}h total`;
    const fp = Math.max(0, snap.foodPct);
    $('fsFood').textContent = `${fp.toFixed(0)}%`; $('fsFood').style.color = fp > 40 ? '#5a9e32' : fp > 15 ? '#c08020' : '#ef4444';
    $('fsEggs').textContent = Math.round(snap.eggs).toLocaleString();
    $('fsLarv').textContent = Math.round(snap.larvae).toLocaleString();
    $('fsPup').textContent = Math.round(by.pupa || 0).toLocaleString();
    $('fsAd').textContent = Math.round(snap.adults).toLocaleString();
    $('fsDead').textContent = Math.round(snap.dead).toLocaleString();
    $('fsScrub').value = (simHrs / maxHrs) * 100;
    const af = $('fsAddedFood'); if (af) af.textContent = addedFood > 0 ? `+${addedFood.toFixed(1)} mL added` : '';
    const counts = { egg: by.egg || 0, l1: by.l1 || 0, l2: by.l2 || 0, l3: by.l3 || 0, pupa: by.pupa || 0, adult: by.adult || 0, dead: snap.dead || 0 };
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    for (const [id] of BARS) { const c = Math.round(counts[id] || 0), row = $('fsrow-' + id); if (!row) continue; row.style.display = c > 0 ? 'flex' : 'none'; if (c > 0) { $('fsbar-' + id).style.width = ((counts[id] / total) * 100).toFixed(1) + '%'; $('fsct-' + id).textContent = c.toLocaleString(); } }
  }
  function tick(now) { const dt = (now - last) / 1000; last = now; if (speed > 0) { simHrs = Math.min(maxHrs, simHrs + dt * speed); if (simHrs >= maxHrs) { speed = 0; $('fsPlay').textContent = '▶'; } render(); } raf = requestAnimationFrame(tick); }
  raf = requestAnimationFrame(tick);

  body.querySelectorAll('.fs-speed').forEach(b => b.onclick = () => { speed = +b.dataset.spd; $('fsPlay').textContent = '⏸'; body.querySelectorAll('.fs-speed').forEach(x => { x.style.background = ''; x.style.color = ''; }); b.style.background = '#1e2a3a'; b.style.color = 'var(--accent,#00d4aa)'; });
  $('fsPlay').onclick = () => { if (speed > 0) { speed = 0; $('fsPlay').textContent = '▶'; } else { speed = 24; $('fsPlay').textContent = '⏸'; } };
  $('fsScrub').oninput = e => { speed = 0; $('fsPlay').textContent = '▶'; simHrs = (e.target.value / 100) * maxHrs; render(true); };
  $('fsReset').onclick = () => { speed = 0; $('fsPlay').textContent = '▶'; addedFood = 0; rebuild(); simHrs = 0; render(true); };
  $('fsAddFood').onclick = () => { addedFood = Math.round((addedFood + 0.5) * 10) / 10; rebuild(); simHrs = Math.min(simHrs, maxHrs); render(true); };

  render(true);
  // re-render when opened from the menu
  document.querySelectorAll('[data-droopen="flySim"]').forEach(b => b.addEventListener('click', () => setTimeout(() => render(true), 30)));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
