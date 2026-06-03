/**
 * pathwaysApp.js — "Pathways" tab.
 *
 * Renders the C. elegans aging / stress / dauer signalling network as an
 * INTERCONNECTED node-link graph (not separate lists), so shared hubs — DAF-16,
 * Longevity, Stress Resistance, Autophagy — visibly link the pathways together.
 * Structure follows the curated mermaid graph (2026-06-03).
 *
 * Layout: automatic layered DAG (longest-path layering + barycenter ordering), so
 * the graph re-lays-out cleanly if nodes/edges are added. Gene nodes auto-tag any
 * worm in the collection whose genotype involves that gene; tap a worm chip to open
 * its data (reuses the Worm Collection detail modal via window.WormTraceOpenWorm).
 */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// ── Graph nodes. type: root | pathway | gene | input | outcome | process ─────────
// gene nodes carry `genes` (symbols matched against worms). color tints pathway nodes.
const NODES = {
  aging:      { label:'Aging & Lifespan', type:'root' },

  iis:        { label:'Insulin / IGF-1 Signaling', type:'pathway', color:'#7c3aed' },
  tor:        { label:'TOR Signaling', type:'pathway', color:'#0891b2' },
  uprmt:      { label:'Mitochondrial Stress (UPRmt)', type:'pathway', color:'#ea580c' },
  dr:         { label:'Dietary Restriction', type:'pathway', color:'#ec4899' },
  stress:     { label:'Stress Response', type:'pathway', color:'#dc2626' },
  dauer:      { label:'Dauer Pathway', type:'pathway', color:'#2563eb' },

  // IIS
  daf2:  { label:'DAF-2', sub:'IGF-1 receptor', type:'gene', genes:['daf-2'] },
  age1:  { label:'AGE-1', sub:'PI3K', type:'gene', genes:['age-1'] },
  pdk1:  { label:'PDK-1', type:'gene', genes:['pdk-1'] },
  akt:   { label:'AKT-1 / AKT-2 / SGK-1', type:'gene', genes:['akt-1','akt-2','sgk-1'] },
  daf16: { label:'DAF-16', sub:'FOXO TF', type:'gene', genes:['daf-16'] },

  // TOR
  let363: { label:'LET-363', sub:'TOR', type:'gene', genes:['let-363'] },
  rsks1:  { label:'RSKS-1', sub:'S6K', type:'gene', genes:['rsks-1'] },
  proteinSynthesis: { label:'Protein synthesis', type:'outcome' },
  growth: { label:'Growth', type:'outcome' },

  // Autophagy
  autophagy: { label:'Autophagy', type:'process' },
  unc51: { label:'UNC-51', type:'gene', genes:['unc-51'] },
  bec1:  { label:'BEC-1', type:'gene', genes:['bec-1'] },
  lgg1:  { label:'LGG-1', type:'gene', genes:['lgg-1'] },
  cellularCleanup: { label:'Cellular cleanup', type:'outcome' },

  // UPRmt
  clk1:  { label:'clk-1', type:'gene', genes:['clk-1'] },
  isp1:  { label:'isp-1', type:'gene', genes:['isp-1'] },
  nuo6:  { label:'nuo-6', type:'gene', genes:['nuo-6'] },
  atfs1: { label:'ATFS-1', type:'gene', genes:['atfs-1'] },
  hsp6:  { label:'hsp-6', type:'gene', genes:['hsp-6'] },
  hsp60: { label:'hsp-60', type:'gene', genes:['hsp-60'] },

  // Oxidative
  skn1:  { label:'SKN-1', sub:'NRF2', type:'gene', genes:['skn-1'] },
  gst4:  { label:'gst-4', type:'gene', genes:['gst-4'] },
  gcs1:  { label:'gcs-1', type:'gene', genes:['gcs-1'] },
  detox: { label:'Detoxification', type:'outcome' },

  // Heat shock
  hsf1:  { label:'HSF-1', type:'gene', genes:['hsf-1'] },
  hsp16: { label:'hsp-16', type:'gene', genes:['hsp-16'] },
  hsp70: { label:'hsp-70', type:'gene', genes:['hsp-70'] },
  proteostasis: { label:'Proteostasis', type:'outcome' },

  // DR
  eat2:  { label:'eat-2', type:'gene', genes:['eat-2'] },
  aak2:  { label:'AAK-2', sub:'AMPK', type:'gene', genes:['aak-2'] },

  // Sirtuin
  sir21: { label:'SIR-2.1', sub:'sirtuin', type:'gene', genes:['sir-2.1','sir-2'] },

  // Dauer
  starvation: { label:'Starvation', type:'input' },
  crowding:   { label:'Crowding', type:'input' },
  heat:       { label:'High temperature', type:'input' },
  tgfb:  { label:'TGF-β branch', sub:'daf-7 / daf-1 / daf-3 / daf-5', type:'gene', genes:['daf-7','daf-1','daf-3','daf-5'] },
  daf12: { label:'DAF-12', type:'gene', genes:['daf-12'] },
  dauerLarva: { label:'Dauer larva', type:'outcome' },

  // Shared outcome hubs
  longevity:  { label:'Longevity ↑', type:'outcome' },
  stressRes:  { label:'Stress resistance ↑', type:'outcome' },
  dauerGenes: { label:'Dauer formation', type:'outcome' },
};

// ── Edges. {d:true}=dashed (inhibition). ─────────────────────────────────────────
const EDGES = [
  ['aging','iis'],['aging','tor'],['aging','uprmt'],['aging','dr'],['aging','stress'],['aging','dauer'],['aging','sir21'],
  // IIS
  ['iis','daf2'],['daf2','age1'],['age1','pdk1'],['pdk1','akt'],['akt','daf16',{d:true,label:'inhibits'}],
  ['daf16','longevity'],['daf16','stressRes'],['daf16','dauerGenes'],
  // TOR
  ['tor','let363'],['let363','rsks1'],['rsks1','proteinSynthesis'],['rsks1','growth'],['let363','autophagy',{d:true,label:'inhibits'}],
  // Autophagy
  ['autophagy','unc51'],['unc51','bec1'],['bec1','lgg1'],['lgg1','cellularCleanup'],['cellularCleanup','longevity'],
  // UPRmt
  ['uprmt','clk1'],['uprmt','isp1'],['uprmt','nuo6'],['clk1','atfs1'],['isp1','atfs1'],['nuo6','atfs1'],
  ['atfs1','hsp6'],['atfs1','hsp60'],['hsp6','longevity'],['hsp60','longevity'],
  // Oxidative
  ['stress','skn1'],['skn1','gst4'],['skn1','gcs1'],['gst4','detox'],['gcs1','detox'],['detox','stressRes'],
  // Heat shock
  ['stress','hsf1'],['hsf1','hsp16'],['hsf1','hsp70'],['hsp16','proteostasis'],['hsp70','proteostasis'],['proteostasis','longevity'],
  // DR
  ['dr','eat2'],['eat2','aak2'],['aak2','daf16'],['aak2','autophagy'],['aak2','stressRes'],
  // Sirtuin
  ['sir21','daf16'],['sir21','hsf1'],
  // Dauer
  ['dauer','starvation'],['dauer','crowding'],['dauer','heat'],['dauer','tgfb'],
  ['starvation','daf12'],['crowding','daf12'],['heat','daf12'],['tgfb','daf12'],
  ['daf12','dauerLarva'],['dauerLarva','stressRes'],['dauerLarva','longevity'],
];

// ── Automatic layered layout (computed once; geometry is worm-independent) ────────
const W = 162, NODE_H = 70, GAPX = 26, ROW = 122;
let LAYOUT = null;
function computeLayout() {
  const ids = Object.keys(NODES);
  const adj = {}, radj = {}, indeg = {};
  ids.forEach(i => { adj[i] = []; radj[i] = []; indeg[i] = 0; });
  for (const [a, b] of EDGES) { adj[a].push(b); radj[b].push(a); indeg[b]++; }
  // Kahn topological order
  const ind = { ...indeg }, q = ids.filter(i => ind[i] === 0), topo = [];
  while (q.length) { const n = q.shift(); topo.push(n); for (const m of adj[n]) if (--ind[m] === 0) q.push(m); }
  // longest-path layering
  const layer = {}; ids.forEach(i => layer[i] = 0);
  for (const n of topo) for (const p of radj[n]) layer[n] = Math.max(layer[n], layer[p] + 1);
  const layers = [];
  ids.forEach(i => { (layers[layer[i]] = layers[layer[i]] || []).push(i); });
  const topoIdx = {}; topo.forEach((n, i) => topoIdx[n] = i);
  layers.forEach(L => L.sort((a, b) => topoIdx[a] - topoIdx[b]));
  // barycenter ordering sweeps to reduce crossings
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

// Worm ↔ gene matching
function wormMatchesGene(w, gene) {
  const hay = `${w.gene || ''} ${w.genotype || ''} ${w.mutation || ''} ${w.name || ''}`.toLowerCase();
  const re = new RegExp(`(^|[^a-z0-9-])${gene.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9-]|$)`);
  return re.test(hay);
}
function wormsForNode(node, worms) {
  if (!node.genes) return [];
  const seen = new Set(), out = [];
  for (const g of node.genes) for (const w of worms) if (!seen.has(w.id) && wormMatchesGene(w, g)) { seen.add(w.id); out.push(w); }
  return out;
}

const TYPE_STYLE = {
  root:    { bg:'#042f2a', border:'#00d4aa', text:'#5eead4', fw:800 },
  pathway: null,  // uses node.color
  gene:    { bg:'#0f172a', border:'#334155', text:'#e2e8f0', fw:700 },
  input:   { bg:'#161b26', border:'#2d3748', text:'#94a3b8', fw:600 },
  outcome: { bg:'#1a1206', border:'#a16207', text:'#fbbf24', fw:700 },
  process: { bg:'#07210f', border:'#16a34a', text:'#4ade80', fw:700 },
};

function nodeHTML(id, worms) {
  const n = NODES[id], c = LAYOUT.coord[id];
  const matched = wormsForNode(n, worms);
  const st = n.type === 'pathway'
    ? { bg: `${n.color}22`, border: n.color, text: '#e2e8f0', fw: 800 }
    : TYPE_STYLE[n.type] || TYPE_STYLE.gene;
  const border = matched.length ? '#22d3ee' : st.border;
  const chips = matched.slice(0, 6).map(w =>
    `<button data-worm="${esc(w.id)}" title="${esc(w.name)} — tap for data" style="display:inline-flex;align-items:center;gap:3px;
      background:${w.color}33;border:1px solid ${w.color};border-radius:10px;padding:0 5px;margin:1px;cursor:pointer;font-size:8.5px;color:#e2e8f0;line-height:1.5">
      <span style="width:6px;height:6px;border-radius:50%;background:${w.color}"></span>${esc(w.name).slice(0,12)}</button>`).join('');
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
    fill="none" stroke="${stroke}" stroke-width="1.2" ${dash} marker-end="url(#pwArrow)"/>`;
}

let zoom = 1;
function render() {
  const root = document.getElementById('pathwaysBody');
  if (!root) return;
  if (!LAYOUT) computeLayout();
  const worms = (typeof window.WormTraceAllWorms === 'function') ? window.WormTraceAllWorms() : [];
  const tagged = new Set();
  Object.keys(NODES).forEach(id => wormsForNode(NODES[id], worms).forEach(w => tagged.add(w.id)));
  const edges = EDGES.map(([a, b, o]) => edgePath(a, b, o)).join('');
  const nodes = Object.keys(NODES).map(id => nodeHTML(id, worms)).join('');
  const svg = `<svg viewBox="0 0 ${LAYOUT.totalW} ${LAYOUT.totalH}" width="${LAYOUT.totalW * zoom}" height="${LAYOUT.totalH * zoom}" style="display:block">
    <defs><marker id="pwArrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#3a4658"/></marker></defs>
    ${edges}${nodes}</svg>`;
  root.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <span style="font-size:11px;color:#94a3b8">${tagged.size} of your worms mapped onto the network · tap a worm chip for its data</span>
      <span style="flex:1"></span>
      <button id="pwZoomOut" style="width:30px;height:30px;border-radius:7px;background:#1e2a3a;border:1px solid #2d3748;color:#cbd5e1;font-size:16px;cursor:pointer">−</button>
      <button id="pwZoomRst" style="height:30px;padding:0 10px;border-radius:7px;background:#1e2a3a;border:1px solid #2d3748;color:#cbd5e1;font-size:11px;cursor:pointer">Fit</button>
      <button id="pwZoomIn" style="width:30px;height:30px;border-radius:7px;background:#1e2a3a;border:1px solid #2d3748;color:#cbd5e1;font-size:16px;cursor:pointer">+</button>
    </div>
    <div style="font-size:10px;color:#64748b;margin-bottom:6px">Solid arrows = activation/flow · <span style="color:#b91c1c">red dashed</span> = inhibition. Shared hubs (DAF-16, Longevity, Stress resistance, Autophagy) link the pathways. Drag/scroll to pan.</div>
    <div id="pwScroll" style="overflow:auto;border:1px solid #1e2a3a;border-radius:12px;background:#0a0e1a;max-height:70vh;cursor:grab">${svg}</div>`;

  root.querySelectorAll('[data-worm]').forEach(b =>
    b.onclick = () => { if (typeof window.WormTraceOpenWorm === 'function') window.WormTraceOpenWorm(b.dataset.worm); });
  const sc = root.querySelector('#pwScroll');
  const MINZ = 0.4, MAXZ = 4;
  const applyZoom = z => { zoom = Math.max(MINZ, Math.min(MAXZ, z)); const s = root.querySelector('#pwScroll svg'); if (s) { s.setAttribute('width', LAYOUT.totalW * zoom); s.setAttribute('height', LAYOUT.totalH * zoom); } return zoom; };
  // Zoom keeping the point under (cx,cy) viewport coords fixed.
  const zoomAt = (nz, cx, cy) => {
    const r = sc.getBoundingClientRect();
    const px = (cx - r.left + sc.scrollLeft), py = (cy - r.top + sc.scrollTop);
    const old = zoom, applied = applyZoom(nz), k = applied / old;
    sc.scrollLeft = px * k - (cx - r.left);
    sc.scrollTop  = py * k - (cy - r.top);
  };
  const center = () => { const r = sc.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  root.querySelector('#pwZoomIn').onclick  = () => zoomAt(zoom * 1.25, ...center());
  root.querySelector('#pwZoomOut').onclick = () => zoomAt(zoom / 1.25, ...center());
  root.querySelector('#pwZoomRst').onclick = () => applyZoom((sc.clientWidth - 4) / LAYOUT.totalW);
  // Mouse-wheel zoom (toward cursor)
  sc.addEventListener('wheel', e => { e.preventDefault(); zoomAt(zoom * (e.deltaY < 0 ? 1.15 : 0.87), e.clientX, e.clientY); }, { passive: false });
  // Drag-to-pan (mouse)
  let down = false, sx = 0, sy = 0, sl = 0, stp = 0;
  sc.addEventListener('mousedown', e => { if (e.target.closest('[data-worm]')) return; down = true; sx = e.clientX; sy = e.clientY; sl = sc.scrollLeft; stp = sc.scrollTop; sc.style.cursor = 'grabbing'; });
  window.addEventListener('mousemove', e => { if (!down) return; sc.scrollLeft = sl - (e.clientX - sx); sc.scrollTop = stp - (e.clientY - sy); });
  window.addEventListener('mouseup', () => { down = false; sc.style.cursor = 'grab'; });
  // Pinch-to-zoom (touch)
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid  = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
  let pinch = 0;
  sc.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = dist(e.touches); }, { passive: true });
  sc.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinch) { e.preventDefault(); const d = dist(e.touches); zoomAt(zoom * d / pinch, ...mid(e.touches)); pinch = d; }
  }, { passive: false });
  sc.addEventListener('touchend', () => { pinch = 0; });
}

function init() {
  render();
  document.querySelectorAll('[data-tab="pathwaysTab"]').forEach(btn =>
    btn.addEventListener('click', () => setTimeout(render, 0)));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
