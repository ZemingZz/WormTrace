/**
 * CompareCharts.js — side-by-side plate comparison charts.
 * Draws onto a single canvas: dev progress, food, stage, eggs.
 */
import { getStages, getCurrentStage, fmtHours } from './LifeCycle.js?v=65';
import { showToast } from './Toast.js?v=65';

const COLOURS = ['#00d4aa','#7c3aed','#f59e0b','#ef4444','#3b82f6'];

/**
 * Research-backed C. elegans reference values (WormBook / WormAtlas):
 *  • Self-fertilizing hermaphrodite brood size: ~300 progeny (N2, 20°C)
 *  • Generation time (egg → egg-laying adult): ~3 days at 20°C (~65 h)
 *  • Mean adult lifespan: ~15–20 days at 20°C
 *  • Adult body length: ~1 mm (1000 µm)
 */
const REF = {
  broodSize:       300,    // expected self-progeny
  genTimeHrs:      65,     // egg → reproductive adult @20°C
  adultLengthUm:   1000,
};

export function renderCompareCharts(canvas, plates, pt) {
  if (!plates.length) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#05080f';
  ctx.fillRect(0, 0, W, H);

  const PAD = 14;

  // Precompute plate data with researched metrics
  const data = plates.map((p, i) => {
    const hrs    = pt.elapsedHoursAny?.(p.id) ?? pt.elapsedHours?.(p.id) ?? 0;
    const stages = getStages(p.strainId, p.tempC);
    const total  = stages[stages.length - 1].end;
    const { stage } = getCurrentStage(hrs || 0, p.strainId, p.tempC);
    return {
      name:    (p.name || 'Plate').slice(0, 14),
      color:   COLOURS[i % COLOURS.length],
      devPct:  Math.min(100, (hrs / Math.max(total, 1)) * 100),
      foodPct: Math.max(0, Math.min(100, pt.foodPercent(p.id))),
      eggs:    pt.totalEggs(p.id),
      broodPct: Math.min(100, (pt.totalEggs(p.id) / REF.broodSize) * 100),
      maturity: Math.min(100, (hrs / REF.genTimeHrs) * 100),  // % to reproductive maturity
      stage:   stage.name,
      stageIcon: stage.icon,
      hrs,
      worms:   p.wormCount ?? 1,
    };
  });

  // Metric sections — each drawn as a labelled horizontal bar group
  const METRICS = [
    { title: '📈 Developmental Progress', sub: '% through full life cycle',     get: d => d.devPct,   fmt: v => v.toFixed(0)+'%' },
    { title: '🌡 Maturity', sub: '% to reproductive adult (~65h @20°C)',        get: d => d.maturity, fmt: v => v.toFixed(0)+'%' },
    { title: '🍽 Bacterial Lawn (food)', sub: '% OP50 remaining',               get: d => d.foodPct,  fmt: v => v.toFixed(0)+'%' },
    { title: '🥚 Brood Size', sub: 'eggs laid vs ~300 expected (N2)',           get: d => d.broodPct, fmt: (v,d) => d.eggs+' eggs' },
  ];

  // Layout: each metric = title + sub + N stacked bars. Plate name ABOVE each
  // bar (full width) so nothing is cut off.
  const barH      = 18;
  const rowGap    = 4;
  const titleH    = 30;
  const sectionGap = 10;
  const sectionH  = titleH + plates.length * (barH + rowGap) + sectionGap;
  let y = PAD;

  for (const m of METRICS) {
    // Title + subtitle
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(m.title, PAD, y + 12);
    ctx.fillStyle = '#475569';
    ctx.font = '9px sans-serif';
    ctx.fillText(m.sub, PAD, y + 24);

    let by = y + titleH;
    const barX = PAD;
    const barW = W - PAD * 2;

    for (const d of data) {
      // Track
      ctx.fillStyle = '#13202f';
      _roundRect(ctx, barX, by, barW, barH, 4);
      ctx.fill();

      // Fill
      const val = Math.max(0, Math.min(100, m.get(d)));
      const fillW = (val / 100) * barW;
      if (fillW > 0) {
        ctx.fillStyle = d.color + 'cc';
        _roundRect(ctx, barX, by, fillW, barH, 4);
        ctx.fill();
      }

      // Plate name (left, inside bar)
      ctx.textAlign = 'left';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(d.name, barX + 6, by + barH / 2 + 3.5);

      // Value (right, inside bar)
      ctx.textAlign = 'right';
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(m.fmt(val, d), barX + barW - 6, by + barH / 2 + 3.5);

      by += barH + rowGap;
    }

    y += sectionH;
  }

  // Footer reference note
  ctx.textAlign = 'left';
  ctx.fillStyle = '#334155';
  ctx.font = 'italic 8.5px sans-serif';
  ctx.fillText('Refs: WormBook / WormAtlas — N2 brood ~300, gen time ~3d @20°C', PAD, H - 8);
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Open the compare modal, populate plate checkboxes, render charts on confirm. */
export function openCompareModal(allPlates, pt) {
  // Validate BEFORE creating any overlay — prevents dim screen bug
  const activePlates = allPlates.filter(p => p.inoculatedAt);
  if (activePlates.length < 2) {
    showToast('Inoculate at least 2 plates first to compare them', 'warn');
    return;
  }

  let modal = document.getElementById('compareModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'compareModal';
    modal.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:600;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow-y:auto;padding:16px';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="width:100%;max-width:520px;background:#111827;border-radius:14px;padding:18px;margin-top:20px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
        <h2 style="font-size:16px;font-weight:800;flex:1;color:#e2e8f0">📊 Compare Plates</h2>
        <button id="btnCloseCompare" style="background:none;border:none;color:#64748b;font-size:22px;cursor:pointer;width:auto;min-height:unset;padding:0 4px">✕</button>
      </div>
      <p style="font-size:12px;color:#64748b;margin-bottom:12px">Select 2–4 inoculated plates to compare:</p>
      <div id="comparePlateList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
        ${activePlates.map(p => {
          const hrs = pt.elapsedHoursAny?.(p.id) ?? 0;
          const { stage } = getCurrentStage(hrs, p.strainId, p.tempC);
          return `<label style="display:flex;align-items:center;gap:10px;background:#0f172a;border:1px solid #1e2a3a;border-radius:8px;padding:10px;cursor:pointer">
            <input type="checkbox" data-cid="${p.id}" style="width:18px;height:18px;accent-color:#00d4aa;flex-shrink:0">
            <span style="font-weight:600;color:#e2e8f0;flex:1">${p.name}</span>
            <span style="font-size:11px;color:#64748b">${stage.icon} ${stage.name} · ${p.tempC}°C</span>
          </label>`;
        }).join('')}
      </div>
      <button id="btnRenderCompare" style="width:100%;background:#00d4aa;color:#000;font-weight:800;font-size:14px;padding:12px;border-radius:8px;border:none;cursor:pointer;margin-bottom:10px">
        Generate Comparison Charts
      </button>
      <canvas id="compareCanvas" style="width:100%;border-radius:10px;display:none"></canvas>
    </div>`;

  modal.style.display = 'flex';

  document.getElementById('btnCloseCompare').onclick = () => modal.style.display = 'none';

  document.getElementById('btnRenderCompare').onclick = () => {
    const checked = [...modal.querySelectorAll('input[type=checkbox]:checked')];
    if (checked.length < 2) { showToast('Select at least 2 plates', 'warn'); return; }
    if (checked.length > 4) { showToast('Select at most 4 plates', 'warn'); return; }

    const selectedIds = checked.map(c => c.dataset.cid);
    const selected = selectedIds.map(id =>
      activePlates.find(p => p.id === id)
    ).filter(Boolean);

    const canvas = document.getElementById('compareCanvas');
    const cw = Math.min(window.innerWidth - 64, 520);
    // Height = 4 metrics × (title + bars) + footer
    const n = selected.length;
    const sectionH = 30 + n * (18 + 4) + 10;
    canvas.width  = cw;
    canvas.height = 14 + sectionH * 4 + 20;
    canvas.style.display = 'block';

    renderCompareCharts(canvas, selected, pt);
    canvas.scrollIntoView({ behavior: 'smooth' });
  };
}
