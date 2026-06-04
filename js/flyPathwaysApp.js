/**
 * flyPathwaysApp.js — "Pathways" for the Drosophila project.
 * Parallel to pathwaysApp.js (worms). Renders the Drosophila aging signalling network
 * (Insulin/IGF [IIS] → dFOXO, TOR → S6K/4E-BP & autophagy, dietary restriction, and
 * stress/longevity genes) as an interconnected node-link graph. Gene nodes auto-tag
 * any stock in the Stock Collection whose genotype/name involves that gene; tap a stock
 * chip to open its data (window.DrosoOpenStock). Sources are linked under the graph and
 * collected on the Literature page (Drosophila tab).
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// ── Nodes. type: root | pathway | gene | input | outcome | process ──
const NODES = {
  aging: { label: 'Aging & Lifespan', type: 'root' },

  iis:    { label: 'Insulin / IGF Signaling (IIS)', type: 'pathway', color: '#7c3aed' },
  tor:    { label: 'TOR Signaling', type: 'pathway', color: '#0891b2' },
  dr:     { label: 'Dietary Restriction', type: 'pathway', color: '#ec4899' },
  stress: { label: 'Stress / longevity genes', type: 'pathway', color: '#dc2626' },

  // IIS branch
  dilps: { label: 'DILPs', sub: 'insulin-like peptides', type: 'gene', genes: ['dilp', 'ilp'] },
  inr:   { label: 'InR', sub: 'insulin-like receptor', type: 'gene', genes: ['InR'] },
  chico: { label: 'chico', sub: 'insulin-receptor substrate', type: 'gene', genes: ['chico'] },
  pi3k:  { label: 'PI3K (Dp110)', sub: 'Pi3K92E', type: 'gene', genes: ['Pi3K92E', 'Dp110'] },
  pten:  { label: 'Pten', sub: 'negative regulator', type: 'gene', genes: ['Pten'] },
  akt:   { label: 'Akt1', sub: 'protein kinase B', type: 'gene', genes: ['Akt1', 'Akt'] },
  foxo:  { label: 'dFOXO', sub: 'FOXO transcription factor', type: 'gene', genes: ['foxo', 'dfoxo'] },
  thor:  { label: '4E-BP (Thor)', sub: 'translation repressor', type: 'gene', genes: ['Thor', '4E-BP'] },

  // TOR branch
  nutrients: { label: 'Amino acids / nutrients', type: 'input' },
  tsc:    { label: 'Tsc1 / Tsc2 (gig)', sub: 'TOR inhibitor complex', type: 'gene', genes: ['Tsc1', 'Tsc2', 'gig'] },
  rheb:   { label: 'Rheb', type: 'gene', genes: ['Rheb'] },
  torc1:  { label: 'TORC1', sub: 'Tor / raptor', type: 'gene', genes: ['Tor', 'raptor'] },
  s6k:    { label: 'S6K', sub: 'ribosomal S6 kinase', type: 'gene', genes: ['S6k', 'S6K'] },
  autophagy: { label: 'Autophagy (Atg)', type: 'process', genes: ['Atg1', 'Atg'] },
  growth: { label: 'Protein synthesis / growth', type: 'outcome' },

  // DR + other longevity genes
  sir2: { label: 'Sir2', sub: 'sirtuin', type: 'gene', genes: ['Sir2'] },
  indy: { label: 'Indy', sub: 'metabolite transporter', type: 'gene', genes: ['Indy'] },
  mth:  { label: 'Methuselah (mth)', sub: 'stress GPCR', type: 'gene', genes: ['mth', 'methuselah'] },

  // shared outcome hubs
  longevity: { label: 'Longevity ↑', type: 'outcome' },
  stressRes: { label: 'Stress resistance ↑', type: 'outcome' },
};

// ── Edges. {d:true}=dashed (inhibition / reduction). ──
const EDGES = [
  ['aging', 'iis'], ['aging', 'tor'], ['aging', 'dr'], ['aging', 'stress'],
  // IIS
  ['iis', 'dilps'], ['dilps', 'inr'], ['inr', 'chico'], ['chico', 'pi3k'],
  ['pten', 'pi3k', { d: true, label: 'inhibits' }], ['pi3k', 'akt'],
  ['akt', 'foxo', { d: true, label: 'inhibits' }],
  ['foxo', 'thor'], ['foxo', 'longevity'], ['foxo', 'stressRes'], ['thor', 'longevity'],
  // TOR
  ['tor', 'nutrients'], ['nutrients', 'torc1'],
  ['tsc', 'rheb', { d: true, label: 'inhibits' }], ['rheb', 'torc1'],
  ['torc1', 's6k'], ['s6k', 'growth'],
  ['torc1', 'autophagy', { d: true, label: 'inhibits' }], ['autophagy', 'longevity'],
  ['torc1', 'thor', { d: true, label: 'inhibits' }],
  // DR
  ['dr', 'sir2'], ['dr', 'indy'], ['dr', 'foxo'], ['dr', 'torc1', { d: true, label: 'reduces' }],
  ['sir2', 'longevity'], ['indy', 'longevity'],
  // stress
  ['stress', 'mth'], ['mth', 'stressRes'], ['mth', 'longevity'],
];

// ── Linked literature (also shown on the Literature page, Drosophila tab) ──
const REFS = [
  { t: 'IIS & TOR signalling network in ageing (review)', a: 'Partridge, Alic, Bjedov & Piper (2011) Exp. Gerontol. 46:376', u: 'https://www.sciencedirect.com/science/article/pii/S0531556510002925' },
  { t: 'chico extends lifespan', a: 'Clancy et al. (2001) Science 292:104', u: 'https://www.science.org/doi/10.1126/science.1057991' },
  { t: 'Insulin receptor (InR) extends lifespan', a: 'Tatar et al. (2001) Science 292:107', u: 'https://www.science.org/doi/10.1126/science.1057987' },
  { t: 'dFOXO over-expression extends lifespan', a: 'Giannakou et al. (2004) Science 305:361', u: 'https://www.science.org/doi/10.1126/science.1098219' },
  { t: 'TOR / S6K modulation extends lifespan', a: 'Kapahi et al. (2004) Curr. Biol. 14:885', u: 'https://pubmed.ncbi.nlm.nih.gov/15186745/' },
  { t: 'Sir2 mediates dietary-restriction longevity', a: 'Rogina & Helfand (2004) PNAS 101:15998', u: 'https://www.pnas.org/doi/10.1073/pnas.0404184101' },
];

// ── Automatic layered layout ──
const W = 168, NODE_H = 70, GAPX = 26, ROW = 122;
let LAYOUT = null;
function computeLayout() {
  const ids = Object.keys(NODES);
  const adj = {}, radj = {}, indeg = {};
  ids.forEach(i => { adj[i] = []; radj[i] = []; indeg[i] = 0; });
  for (const [a, b] of EDGES) { adj[a].push(b); radj[b].push(a); indeg[b]++; }
  const ind = { ...indeg }, q = ids.filter(i => ind[i] === 0), topo = [];
  while (q.length) { const n = q.shift(); topo.push(n); for (const m of adj[n]) if (--ind[m] === 0) q.push(m); }
  const layer = {}; ids.forEach(i => layer[i] = 0);
  for (const n of topo) for (const p of radj[n]) layer[n] = Math.max(layer[n], layer[p] + 1);
  const layers = [];
  ids.forEach(i => { (layers[layer[i]] = layers[layer[i]] || []).push(i); });
  const topoIdx = {}; topo.forEach((n, i) => topoIdx[n] = i);
  layers.forEach(L => L.sort((a, b) => topoIdx[a] - topoIdx[b]));
  const pos = {}; layers.forEach(L => L.forEach((n, i) => pos[n] = i));
  for (let s = 0; s < 6; s++) {
    const down = s % 2 === 0;
    const order = down ? layers.map((_, i) => i) : layers.map((_, i) => i).reverse();
    for (const li of order) {
      const L = layers[li]; if (!L) continue;
      const nb = n => (down ? radj[n] : adj[n]);
      const bary = n => { const ns = nb(n); return ns.length ? ns.reduce((s2, x) => s2 + pos[x], 0) / ns.length : pos[n]; };
      L.sort((a, b) => bary(a) - bary(b));
      L.forEach((n, i) => pos[n] = i);
    }
  }
  const maxCount = Math.max(...layers.map(L => (L ? L.length : 0)));
  const totalW = maxCount * (W + GAPX) + GAPX;
  const coord = {};
  layers.forEach((L, li) => {
    if (!L) return;
    const rowW = L.length * (W + GAPX);
    const off = (totalW - rowW) / 2 + GAPX / 2;
    L.forEach((n, i) => { coord[n] = { x: off + i * (W + GAPX), y: 14 + li * ROW }; });
  });
  LAYOUT = { coord, totalW, totalH: 14 + layers.length * ROW + 10 };
}

// Stock ↔ gene matching (uses genotype + name).
function stockMatchesGene(w, gene) {
  const hay = `${w.name || ''} ${w.genotype || ''} ${w.gene || ''} ${w.mutation || ''}`.toLowerCase();
  const re = new RegExp(`(^|[^a-z0-9-])${gene.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9-]|$)`);
  return re.test(hay);
}
function stocksForNode(node, stocks) {
  if (!node.genes) return [];
  const seen = new Set(), out = [];
  for (const g of node.genes) for (const w of stocks) if (!seen.has(w.id) && stockMatchesGene(w, g)) { seen.add(w.id); out.push(w); }
  return out;
}

const TYPE_STYLE = {
  root:    { bg: '#042f2a', border: '#00d4aa', text: '#5eead4', fw: 800 },
  pathway: null,
  gene:    { bg: '#0f172a', border: '#334155', text: '#e2e8f0', fw: 700 },
  input:   { bg: '#161b26', border: '#2d3748', text: '#94a3b8', fw: 600 },
  outcome: { bg: '#1a1206', border: '#a16207', text: '#fbbf24', fw: 700 },
  process: { bg: '#07210f', border: '#16a34a', text: '#4ade80', fw: 700 },
};

function nodeHTML(id, stocks) {
  const n = NODES[id], c = LAYOUT.coord[id];
  const matched = stocksForNode(n, stocks);
  const st = n.type === 'pathway'
    ? { bg: `${n.color}22`, border: n.color, text: '#e2e8f0', fw: 800 }
    : TYPE_STYLE[n.type] || TYPE_STYLE.gene;
  const border = matched.length ? '#22d3ee' : st.border;
  const chips = matched.slice(0, 6).map(w =>
    `<button data-stock="${esc(w.id)}" title="${esc(w.name)} — tap for data" style="display:inline-flex;align-items:center;gap:3px;
      background:${w.color}33;border:1px solid ${w.color};border-radius:10px;padding:0 5px;margin:1px;cursor:pointer;font-size:8.5px;color:#e2e8f0;line-height:1.5">
      <span style="width:6px;height:6px;border-radius:50%;background:${w.color}"></span>${esc(w.name).slice(0, 12)}</button>`).join('');
  return `<foreignObject x="${c.x}" y="${c.y}" width="${W}" height="${NODE_H}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:${W}px;height:${NODE_H}px;overflow:hidden;
      background:${st.bg};border:1.5px solid ${border};border-radius:10px;padding:5px 7px;display:flex;flex-direction:column;gap:1px">
      <div style="font-size:12.5px;font-weight:${st.fw};color:${st.text};line-height:1.12">${esc(n.label)}</div>
      ${n.sub ? `<div style="font-size:9px;color:#64748b;line-height:1.1">${esc(n.sub)}</div>` : ''}
      ${chips ? `<div style="display:flex;flex-wrap:wrap;margin-top:1px">${chips}${matched.length > 6 ? `<span style="font-size:8px;color:#64748b">+${matched.length - 6}</span>` : ''}</div>` : ''}
    </div></foreignObject>`;
}

function edgePath(a, b, opt) {
  const ca = LAYOUT.coord[a], cb = LAYOUT.coord[b];
  if (!ca || !cb) return '';
  const x1 = ca.x + W / 2, y1 = ca.y + NODE_H, x2 = cb.x + W / 2, y2 = cb.y;
  const my = (y1 + y2) / 2;
  const stroke = opt && opt.d ? '#b91c1c' : '#3a4658';
  const dash = opt && opt.d ? 'stroke-dasharray="4 3"' : '';
  return `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} C${x1.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}"
    fill="none" stroke="${stroke}" stroke-width="1.2" ${dash} marker-end="url(#flyArrow)"/>`;
}

let zoom = 1;
function render() {
  const root = document.getElementById('flyPathBody');
  if (!root) return;
  if (!LAYOUT) computeLayout();
  const stocks = (typeof window.DrosoAllStocks === 'function') ? window.DrosoAllStocks() : [];
  const tagged = new Set();
  Object.keys(NODES).forEach(id => stocksForNode(NODES[id], stocks).forEach(w => tagged.add(w.id)));
  const edges = EDGES.map(([a, b, o]) => edgePath(a, b, o)).join('');
  const nodes = Object.keys(NODES).map(id => nodeHTML(id, stocks)).join('');
  const svg = `<svg viewBox="0 0 ${LAYOUT.totalW} ${LAYOUT.totalH}" width="${LAYOUT.totalW * zoom}" height="${LAYOUT.totalH * zoom}" style="display:block">
    <defs><marker id="flyArrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#3a4658"/></marker></defs>
    ${edges}${nodes}</svg>`;
  const refsHTML = REFS.map(r =>
    `<div style="font-size:10px;line-height:1.5;margin-bottom:3px"><a href="${esc(r.u)}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:underline">${esc(r.t)} ↗</a> <span style="color:#64748b">— ${esc(r.a)}</span></div>`).join('');
  root.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <span style="font-size:11px;color:#94a3b8">${tagged.size} of your stocks mapped onto the network · tap a stock chip for its data</span>
      <span style="flex:1"></span>
      <button id="flyZoomOut" style="width:30px;height:30px;border-radius:7px;background:#1e2a3a;border:1px solid #2d3748;color:#cbd5e1;font-size:16px;cursor:pointer">−</button>
      <button id="flyZoomRst" style="height:30px;padding:0 10px;border-radius:7px;background:#1e2a3a;border:1px solid #2d3748;color:#cbd5e1;font-size:11px;cursor:pointer">Fit</button>
      <button id="flyZoomIn" style="width:30px;height:30px;border-radius:7px;background:#1e2a3a;border:1px solid #2d3748;color:#cbd5e1;font-size:16px;cursor:pointer">+</button>
    </div>
    <div style="font-size:10px;color:#64748b;margin-bottom:6px">Solid arrows = activation/flow · <span style="color:#b91c1c">red dashed</span> = inhibition. Reduced IIS &amp; TOR both converge on dFOXO, autophagy and 4E-BP to extend life. Drag/scroll to pan, pinch/scroll to zoom.</div>
    <div id="flyPwScroll" style="overflow:auto;border:1px solid #1e2a3a;border-radius:12px;background:#0a0e1a;max-height:64vh;cursor:grab">${svg}</div>
    <div style="margin-top:12px">
      <div style="font-size:10px;font-weight:800;color:#64748b;letter-spacing:.04em;margin-bottom:5px">📚 PATHWAY LITERATURE</div>
      ${refsHTML}
    </div>`;

  root.querySelectorAll('[data-stock]').forEach(b =>
    b.onclick = () => { if (typeof window.DrosoOpenStock === 'function') window.DrosoOpenStock(b.dataset.stock); });
  const sc = root.querySelector('#flyPwScroll');
  const MINZ = 0.4, MAXZ = 4;
  const applyZoom = z => { zoom = Math.max(MINZ, Math.min(MAXZ, z)); const s = root.querySelector('#flyPwScroll svg'); if (s) { s.setAttribute('width', LAYOUT.totalW * zoom); s.setAttribute('height', LAYOUT.totalH * zoom); } return zoom; };
  const zoomAt = (nz, cx, cy) => {
    const r = sc.getBoundingClientRect();
    const px = (cx - r.left + sc.scrollLeft), py = (cy - r.top + sc.scrollTop);
    const old = zoom, applied = applyZoom(nz), k = applied / old;
    sc.scrollLeft = px * k - (cx - r.left);
    sc.scrollTop = py * k - (cy - r.top);
  };
  const center = () => { const r = sc.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  root.querySelector('#flyZoomIn').onclick = () => zoomAt(zoom * 1.25, ...center());
  root.querySelector('#flyZoomOut').onclick = () => zoomAt(zoom / 1.25, ...center());
  root.querySelector('#flyZoomRst').onclick = () => applyZoom((sc.clientWidth - 4) / LAYOUT.totalW);
  sc.addEventListener('wheel', e => { e.preventDefault(); zoomAt(zoom * (e.deltaY < 0 ? 1.15 : 0.87), e.clientX, e.clientY); }, { passive: false });
  let down = false, sx = 0, sy = 0, sl = 0, stp = 0;
  sc.addEventListener('mousedown', e => { if (e.target.closest('[data-stock]')) return; down = true; sx = e.clientX; sy = e.clientY; sl = sc.scrollLeft; stp = sc.scrollTop; sc.style.cursor = 'grabbing'; });
  window.addEventListener('mousemove', e => { if (!down) return; sc.scrollLeft = sl - (e.clientX - sx); sc.scrollTop = stp - (e.clientY - sy); });
  window.addEventListener('mouseup', () => { down = false; sc.style.cursor = 'grab'; });
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
  let pinch = 0;
  sc.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = dist(e.touches); }, { passive: true });
  sc.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinch) { e.preventDefault(); const d = dist(e.touches); zoomAt(zoom * d / pinch, ...mid(e.touches)); pinch = d; }
  }, { passive: false });
  sc.addEventListener('touchend', () => { pinch = 0; });
  // Fit on first paint.
  setTimeout(() => { if (sc) applyZoom((sc.clientWidth - 4) / LAYOUT.totalW); }, 0);
}

function init() {
  const fp = document.getElementById('flyPath');
  if (!fp) return;
  fp.querySelector('.le-home')?.addEventListener('click', () => {
    fp.style.display = 'none';
    if (typeof window.WormTraceShowDrosoHome === 'function') window.WormTraceShowDrosoHome();
    else { const h = document.getElementById('homeScreen'); if (h) h.style.display = 'flex'; }
  });
  // Re-render whenever the Pathways tool is opened (picks up new/edited stocks).
  document.querySelectorAll('[data-droopen="flyPath"]').forEach(b => b.addEventListener('click', () => setTimeout(render, 30)));
  render();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
