/**
 * yeastSimApp.js — Saccharomyces cerevisiae "Growth Simulator" (the yeast analogue of
 * the worm plate / fly vial view). An animated culture FLASK (turbidity + dividing cells)
 * plus an OD600 + viability curve, driven by a deterministic growth/chronological-aging
 * model: lag → exponential → stationary → chronological decline. Controls: play/scrub/
 * speed, add-glucose, total-hours readout. Preview only, self-contained (#yeastSim).
 */
const fmtH = h => { h = Math.max(0, Math.round(h)); const d = Math.floor(h / 24), r = h % 24; return d > 0 ? `${d}d ${r}h` : `${r}h`; };

// Deterministic growth (logistic OD) + chronological-survival timeline.
function buildYeastTimeline(glucosePct) {
  const DT = 1, MAX_H = 16 * 24;              // 1-h steps, up to 16 days
  const r = Math.LN2 / 1.6;                   // doubling time ~1.6 h (log phase, 30 °C)
  const lag = 2;                              // ~2 h lag
  const OD0 = 0.05;
  const K = Math.max(0.5, 1.5 * glucosePct);  // carrying capacity (max OD) scales with glucose
  // time to ~saturation (OD = 0.95K)
  const tSat = lag + Math.log((0.95 * K / OD0) * ((K - OD0) / (K * 0.05))) / r;
  const clsMid = tSat + 8 * 24;              // chronological survival: ~8 d median into stationary
  const snaps = [];
  for (let h = 0; h <= MAX_H; h += DT) {
    const od = h < lag ? OD0 : K / (1 + ((K - OD0) / OD0) * Math.exp(-r * (h - lag)));
    // viability: 100% through growth + early stationary, then accelerating decline (CLS)
    let viab = 100;
    if (h > tSat + 24) {
      const x = (h - clsMid) / (1.6 * 24);
      viab = 100 / (1 + Math.exp(x));        // sigmoid down, ~0 well after clsMid
    }
    const phase = h < lag ? 'lag' : od < 0.92 * K ? 'exponential (log)' : viab > 95 ? 'stationary' : viab > 5 ? 'stationary — declining' : 'dead';
    snaps.push({ h, od: Math.round(od * 100) / 100, viab: Math.round(viab * 10) / 10, phase, K });
  }
  return snaps;
}
const yAt = (snaps, h) => snaps[Math.min(snaps.length - 1, Math.max(0, Math.round(h)))] || null;

// ── Flask + curve canvas ───────────────────────────────────────────────────────
class YeastFlask {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this._t = 0; this._raf = null; this._snap = null; this._cells = []; }
  start() { if (this._raf) return; const loop = () => { this._t++; if (this._snap) this._render(this._snap); this._raf = requestAnimationFrame(loop); }; this._raf = requestAnimationFrame(loop); }
  stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } }
  setState(s) { this._snap = s; }

  _render(snap) {
    const c = this.canvas, ctx = c.getContext('2d'), W = c.width, H = c.height, t = this._t;
    ctx.clearRect(0, 0, W, H);
    const sc = W / 320;
    // ── Flask (left) ──
    const fx = 12 * sc, ftop = 18 * sc, fbot = H - 16 * sc, neckW = 26 * sc, baseW = 96 * sc, cxF = fx + baseW / 2;
    const odFrac = Math.max(0, Math.min(1, snap.od / (snap.K || 3)));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cxF - neckW / 2, ftop); ctx.lineTo(cxF - neckW / 2, ftop + 26 * sc);
    ctx.lineTo(fx, fbot - 10 * sc); ctx.quadraticCurveTo(fx, fbot, fx + 10 * sc, fbot);
    ctx.lineTo(fx + baseW - 10 * sc, fbot); ctx.quadraticCurveTo(fx + baseW, fbot, fx + baseW, fbot - 10 * sc);
    ctx.lineTo(cxF + neckW / 2, ftop + 26 * sc); ctx.lineTo(cxF + neckW / 2, ftop); ctx.closePath();
    ctx.clip();
    // liquid: more turbid (cream/opaque) as OD rises; browner as it dies
    const dead = 100 - (snap.viab ?? 100);
    const liqTop = ftop + 26 * sc + (1 - 0.78) * (fbot - ftop - 26 * sc);   // fixed liquid level ~78%
    const rr = Math.round(220 - dead * 0.5), gg = Math.round(210 - dead * 0.9), bb = Math.round(170 - dead * 0.9);
    const op = 0.18 + 0.62 * odFrac;
    ctx.fillStyle = `rgba(${rr},${gg},${bb},${op})`;
    ctx.fillRect(fx, liqTop, baseW, fbot - liqTop);
    // dividing cells (count scales with OD)
    const nCell = Math.min(Math.round(2 + odFrac * 90), 100);
    this._cells = this._cells || [];
    while (this._cells.length < nCell) this._cells.push({ x: fx + 8 + Math.random() * (baseW - 16), y: liqTop + 6 + Math.random() * (fbot - liqTop - 12), ph: Math.random() * 7 });
    if (this._cells.length > nCell) this._cells.length = nCell;
    for (const cell of this._cells) {
      cell.x += Math.sin(t * 0.03 + cell.ph) * 0.15; cell.y += Math.cos(t * 0.025 + cell.ph) * 0.12;
      const rad = 2.0 * sc;
      ctx.fillStyle = dead > 60 ? 'rgba(150,130,90,0.7)' : 'rgba(245,238,210,0.95)';
      ctx.beginPath(); ctx.arc(cell.x, cell.y, rad, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cell.x + rad * 0.9, cell.y - rad * 0.6, rad * 0.6, 0, 7); ctx.fill();   // bud
    }
    ctx.restore();
    // flask outline
    ctx.beginPath();
    ctx.moveTo(cxF - neckW / 2, ftop); ctx.lineTo(cxF - neckW / 2, ftop + 26 * sc);
    ctx.lineTo(fx, fbot - 10 * sc); ctx.quadraticCurveTo(fx, fbot, fx + 10 * sc, fbot);
    ctx.lineTo(fx + baseW - 10 * sc, fbot); ctx.quadraticCurveTo(fx + baseW, fbot, fx + baseW, fbot - 10 * sc);
    ctx.lineTo(cxF + neckW / 2, ftop + 26 * sc); ctx.lineTo(cxF + neckW / 2, ftop); ctx.closePath();
    ctx.strokeStyle = 'rgba(180,200,220,0.4)'; ctx.lineWidth = 2; ctx.stroke();

    // ── OD600 + viability curve (right) ──
    const gx = fx + baseW + 22 * sc, gy = ftop + 6, gw = W - gx - 12 * sc, gh = fbot - gy - 14 * sc;
    ctx.fillStyle = '#0a0e1a'; ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = '#1e2a3a'; ctx.lineWidth = 1; ctx.strokeRect(gx, gy, gw, gh);
    const snaps = this._snaps, maxH = this._maxHrs || (16 * 24);
    if (snaps && snaps.length) {
      const Kc = snaps[0].K || 3;
      const X = h => gx + Math.min(h, maxH) / maxH * gw;
      const Yod = od => gy + gh - (od / Kc) * gh * 0.92;
      const Yv = v => gy + gh - (v / 100) * gh * 0.92;
      // viability (grey)
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let h = 0; h <= maxH; h += 6) { const s = yAt(snaps, h); const x = X(h), y = Yv(s.viab); h === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
      // OD (green)
      ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2; ctx.beginPath();
      for (let h = 0; h <= maxH; h += 6) { const s = yAt(snaps, h); const x = X(h), y = Yod(s.od); h === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
      // current-time marker
      const mx = X(snap.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(mx, gy); ctx.lineTo(mx, gy + gh); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#34d399'; ctx.beginPath(); ctx.arc(mx, Yod(snap.od), 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#64748b'; ctx.font = `${9 * sc}px sans-serif`; ctx.textAlign = 'left';
      ctx.fillText('OD600', gx + 4, gy + 11); ctx.fillStyle = '#94a3b8'; ctx.fillText('viability', gx + 4, gy + 22);
    }
  }
}

function init() {
  const root = document.getElementById('yeastSim');
  if (!root) return;
  root.querySelector('.le-home')?.addEventListener('click', () => {
    root.style.display = 'none';
    if (typeof window.WormTraceShowYeastHome === 'function') window.WormTraceShowYeastHome();
    else { const h = document.getElementById('homeScreen'); if (h) h.style.display = 'flex'; }
  });
  const body = document.getElementById('yeastSimBody');
  if (!body) return;
  body.innerHTML = `
    <div class="le-intro">Watch a yeast culture grow in a flask: cells divide through lag → exponential → stationary phase as the medium clouds (OD600 rises), then chronological survival declines in long stationary phase. Preview only.</div>
    <canvas id="ysCanvas" width="320" height="200" style="width:100%;max-width:420px;background:#070b14;border:1px solid #1e2a3a;border-radius:14px;display:block;margin-bottom:10px"></canvas>
    <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:6px"><span id="ysPhase" style="font-weight:700;color:#34d399"></span><span id="ysTime" style="color:#64748b;font-family:monospace"></span></div>
    <div style="display:flex;gap:12px;font-size:11px;color:#64748b;margin-bottom:8px;flex-wrap:wrap">
      <span>📈 OD600 <span id="ysOd" style="color:#34d399;font-weight:700">0.05</span></span>
      <span>❤️ viability <span id="ysViab" style="color:#e2e8f0;font-weight:700">100%</span></span>
    </div>
    <input type="range" id="ysScrub" min="0" max="100" value="0" style="width:100%;accent-color:var(--accent,#00d4aa);margin-bottom:8px">
    <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
      <button id="ysPlay" class="sim-btn" style="background:var(--accent,#00d4aa);color:#04201a">▶</button>
      ${[{ x: 1, r: 4 }, { x: 2, r: 12 }, { x: 3, r: 36 }].map(s => `<button class="sim-btn ys-speed" data-spd="${s.r}">${s.x}×</button>`).join('')}
      <button id="ysReset" class="sim-btn" style="margin-left:auto">↺</button>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button id="ysAddGlu" class="sim-btn" style="flex:1;background:#0d2a22;border:1px solid #16734f;color:#34d399">🍬 Add glucose (+0.5%)</button>
      <span id="ysGlu" style="font-size:10px;color:#64748b;white-space:nowrap"></span>
    </div>
    <div style="font-size:10px;color:#475569;margin-top:8px;line-height:1.5">Model: doubling ~1.6 h in log phase at 30 °C; OD600 plateaus at a carrying capacity set by the glucose; chronological survival then declines over ~days in stationary phase. Schematic preview.</div>`;

  const canvas = document.getElementById('ysCanvas');
  const flask = new YeastFlask(canvas); flask.start();
  let glucose = 2, timeline = [], maxHrs = 48, simHrs = 0, speed = 0, raf = null, last = performance.now(), lastDom = 0;
  function rebuild() {
    timeline = buildYeastTimeline(glucose);
    let lastActive = 0;
    for (const s of timeline) if ((s.viab ?? 0) > 0.5) lastActive = s.h;
    maxHrs = Math.min(16 * 24, Math.max(48, lastActive + 24));
    flask._snaps = timeline; flask._maxHrs = maxHrs;
  }
  rebuild();
  const $ = id => document.getElementById(id);
  function render(force) {
    const s = yAt(timeline, simHrs) || { od: 0.05, viab: 100, phase: 'lag', h: 0, K: 3 };
    flask.setState(s); flask._snaps = timeline; flask._maxHrs = maxHrs;
    const now = performance.now();
    if (!force && speed > 0 && now - lastDom < 180) return;
    lastDom = now;
    $('ysPhase').textContent = s.phase;
    $('ysTime').textContent = `${fmtH(simHrs)} · ${Math.round(simHrs)}h total`;
    $('ysOd').textContent = s.od.toFixed(2);
    $('ysViab').textContent = `${Math.round(s.viab)}%`;
    $('ysViab').style.color = s.viab > 60 ? '#34d399' : s.viab > 20 ? '#c08020' : '#ef4444';
    $('ysScrub').value = (simHrs / maxHrs) * 100;
    const g = $('ysGlu'); if (g) g.textContent = `glucose ${glucose.toFixed(1)}%`;
  }
  function tick(now) { const dt = (now - last) / 1000; last = now; if (speed > 0) { simHrs = Math.min(maxHrs, simHrs + dt * speed); if (simHrs >= maxHrs) { speed = 0; $('ysPlay').textContent = '▶'; } render(); } raf = requestAnimationFrame(tick); }
  raf = requestAnimationFrame(tick);

  body.querySelectorAll('.ys-speed').forEach(b => b.onclick = () => { speed = +b.dataset.spd; $('ysPlay').textContent = '⏸'; body.querySelectorAll('.ys-speed').forEach(x => { x.style.background = ''; x.style.color = ''; }); b.style.background = '#1e2a3a'; b.style.color = 'var(--accent,#00d4aa)'; });
  $('ysPlay').onclick = () => { if (speed > 0) { speed = 0; $('ysPlay').textContent = '▶'; } else { speed = 12; $('ysPlay').textContent = '⏸'; } };
  $('ysScrub').oninput = e => { speed = 0; $('ysPlay').textContent = '▶'; simHrs = (e.target.value / 100) * maxHrs; render(true); };
  $('ysReset').onclick = () => { speed = 0; $('ysPlay').textContent = '▶'; glucose = 2; rebuild(); simHrs = 0; render(true); };
  $('ysAddGlu').onclick = () => { glucose = Math.round((glucose + 0.5) * 10) / 10; rebuild(); simHrs = Math.min(simHrs, maxHrs); render(true); };
  render(true);
  document.querySelectorAll('[data-yeopen="yeastSim"]').forEach(b => b.addEventListener('click', () => setTimeout(() => render(true), 30)));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
