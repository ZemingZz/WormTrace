/**
 * ComparisonChart.js — canvas chart overlaying simulated stage timeline
 * against real-world observation data points.
 */
export function drawComparisonChart(canvas, stages, realPoints, currentHrs) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = { top: 16, right: 16, bottom: 36, left: 90 };
  const CW  = W - PAD.left - PAD.right;
  const CH  = H - PAD.top  - PAD.bottom;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#05080f';
  ctx.fillRect(0, 0, W, H);

  const stageIds   = stages.map(s => s.id);
  const totalHours = stages[stages.length - 1].end;
  const maxHours   = Math.max(totalHours, ...realPoints.map(p => p.time_hours), 1) * 1.05;

  const xOf = h  => PAD.left + (h / maxHours) * CW;
  const yOf = si => PAD.top  + (si / (stageIds.length - 1)) * CH;

  // ── Grid lines ────────────────────────────────────────────────────────────
  ctx.strokeStyle = '#1e2a3a';
  ctx.lineWidth   = 1;
  for (let i = 0; i < stageIds.length; i++) {
    ctx.beginPath();
    ctx.moveTo(PAD.left, yOf(i));
    ctx.lineTo(PAD.left + CW, yOf(i));
    ctx.stroke();
  }

  // X tick marks every 24h
  ctx.fillStyle = '#64748b';
  ctx.font      = '9px monospace';
  ctx.textAlign = 'center';
  for (let h = 0; h <= maxHours; h += 24) {
    const x = xOf(h);
    ctx.fillText(h < 48 ? `${h}h` : `${(h/24).toFixed(0)}d`, x, H - 6);
    ctx.strokeStyle = '#1e2a3a';
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + CH); ctx.stroke();
  }

  // ── Y axis labels ─────────────────────────────────────────────────────────
  ctx.textAlign = 'right';
  stages.forEach((s, i) => {
    ctx.fillStyle = s.color;
    ctx.font      = '9px sans-serif';
    ctx.fillText(`${s.icon} ${s.name.split(' ')[0]}`, PAD.left - 4, yOf(i) + 3);
  });

  // ── Simulated stage bands ─────────────────────────────────────────────────
  for (const stage of stages) {
    const si  = stageIds.indexOf(stage.id);
    const x0  = xOf(stage.start);
    const x1  = xOf(stage.end);
    const y   = yOf(si);
    const yH  = CH / (stageIds.length - 1);

    ctx.fillStyle = stage.color + '22';
    ctx.fillRect(x0, y - yH * 0.4, x1 - x0, yH * 0.8);

    ctx.strokeStyle = stage.color + '88';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, y); ctx.lineTo(x1, y);
    ctx.stroke();

    // Stage boundary tick
    ctx.strokeStyle = stage.color + '55';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, PAD.top);
    ctx.lineTo(x0, PAD.top + CH);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Current time marker ────────────────────────────────────────────────────
  if (currentHrs > 0) {
    const cx = xOf(currentHrs);
    ctx.strokeStyle = '#00d4aa';
    ctx.lineWidth   = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, PAD.top);
    ctx.lineTo(cx, PAD.top + CH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle   = '#00d4aa';
    ctx.font        = '9px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('now', cx, PAD.top - 4);
  }

  // ── Real-world data points ────────────────────────────────────────────────
  for (const pt of realPoints) {
    const si = stageIds.indexOf(pt.stage_observed);
    if (si < 0) continue;

    const x = xOf(pt.time_hours);
    const y = yOf(si);

    // Find simulated stage at this time
    const simStage = stages.find(s => pt.time_hours >= s.start && pt.time_hours < s.end)
                  ?? stages[stages.length - 1];
    const match    = simStage.id === pt.stage_observed;

    // Outer ring: match=cyan, mismatch=orange
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle   = match ? '#00d4aa33' : '#f59e0b33';
    ctx.fill();
    ctx.strokeStyle = match ? '#00d4aa' : '#f59e0b';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = match ? '#00d4aa' : '#f59e0b';
    ctx.fill();

    // Vertical line to simulated stage (deviation indicator)
    if (!match) {
      const siSim = stageIds.indexOf(simStage.id);
      if (siSim >= 0) {
        const ySim = yOf(siSim);
        ctx.strokeStyle = '#f59e0b55';
        ctx.lineWidth   = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, ySim);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // ── Legend ────────────────────────────────────────────────────────────────
  const lx = PAD.left + CW - 120;
  const ly = PAD.top + 6;
  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(lx - 4, ly - 4, 130, 38);
  ctx.strokeStyle = '#1e2a3a';
  ctx.lineWidth   = 1;
  ctx.strokeRect(lx - 4, ly - 4, 130, 38);

  [[8, ly + 8,  '#00d4aa', '● Matches simulated'],
   [8, ly + 22, '#f59e0b', '● Deviates from sim']].forEach(([ox, oy, col, label]) => {
    ctx.fillStyle = col;
    ctx.font      = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, lx + ox, oy);
  });
}
