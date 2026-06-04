/**
 * flyStockApp.js — "Stock Collection" for the Drosophila project.
 * Parallel to collectionApp.js (worms) but self-contained: own overlay (#flyStock),
 * own localStorage (drosophila_stock_v1), own catalog. Shows aging-relevant lab stocks
 * with STANDARDIZED data (genotype, median lifespan, chromosome, pathway, BDSC#, source).
 * The user can edit any field (persists), add their own stock, "Standardize" to drop
 * edits, and compare lifespans on a survival curve. Lifespan values are representative
 * medians from the cited papers — absolute lifespan is strongly diet/temperature/
 * background-dependent (noted on each long-lived mutant).
 */
import { showToast, showConfirm } from './Toast.js?v=136';

const KEY = 'drosophila_stock_v1';
const BASE_LIFESPAN = 50;   // Canton-S median (days) — baseline for long/short classification

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// ── Built-in, research-backed catalog (aging-focused). lifespanDays = representative
//    median at ~25 °C on standard food; see each stock's source + notes. ───────────
const CATALOG = [
  {
    id: 'cantons', name: 'Canton-S', color: '#38bdf8',
    genotype: 'wild-type (Canton-S)', lifespanDays: 50, chromosome: '—',
    pathway: '— (wild-type reference)', bdsc: '64349', tempC: 25, sex: 'mixed',
    phenotype: 'Standard wild-type reference strain.',
    notes: 'One of the most widely used wild-type reference strains. Median lifespan ~50 d under standard conditions; used as the control in most aging studies. As in most strains, females typically outlive males.',
    refName: 'Iliadi & Boulianne (2017) age-dependent performance, Canton-S vs w1118',
    refUrl: 'https://www.sciencedirect.com/science/article/abs/pii/S109564331730003X',
  },
  {
    id: 'oregonr', name: 'Oregon-R', color: '#34d399',
    genotype: 'wild-type (Oregon-R)', lifespanDays: 55, chromosome: '—',
    pathway: '— (wild-type reference)', bdsc: '5', tempC: 25, sex: 'mixed',
    phenotype: 'Wild-type reference; longer-lived than Canton-S in several studies.',
    notes: 'A second classic wild-type strain. Reported to live longer and decline in locomotion later than Canton-S; useful as an independent wild-type reference.',
    refName: 'Bhandari et al. — wild-type strains as models of faster/slower aging (PMC11122303)',
    refUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11122303/',
  },
  {
    id: 'w1118', name: 'w1118', color: '#a78bfa',
    genotype: 'w[1118]', lifespanDays: 54, chromosome: 'X',
    pathway: '— (eye-pigment ABC transporter)', bdsc: '3605', tempC: 25, sex: 'mixed',
    phenotype: 'White eyes — partial deletion of the white gene.',
    notes: 'The standard genetic background for most transgenic lines (so it is the correct control for them). Derived from an Oregon-R background. white is more than an eye marker — it has broad effects, so always compare transgenics to a matched w[1118]. Females generally outlive males (meta-analysis: Wit et al. 2013).',
    refName: 'Ferreiro et al. (2017) age-dependent performance in Canton-S vs w1118',
    refUrl: 'https://www.sciencedirect.com/science/article/abs/pii/S109564331730003X',
  },
  {
    id: 'chico1', name: 'chico¹', color: '#f59e0b',
    genotype: 'chico[1]', lifespanDays: 68, lifespanF: 68, lifespanM: 50, chromosome: '2',
    pathway: 'Insulin/IGF signaling (IIS) — insulin-receptor substrate (IRS)', bdsc: '', tempC: 25, sex: 'female-biased',
    phenotype: 'Small body; heterozygous females are long-lived.',
    notes: 'Mutation of the only fly IRS (chico) extends median lifespan ~+36% (heterozygotes) up to ~+48% (homozygous females), with reduced body size/fecundity. SEX-SPECIFIC: the extension is largely in FEMALES — complete loss has little/no effect (can even shorten life) in males (≈ control). Values are representative & background-dependent.',
    refName: 'Clancy et al. (2001) Extension of lifespan by loss of CHICO — Science 292:104',
    refUrl: 'https://www.science.org/doi/10.1126/science.1057991',
  },
  {
    id: 'inr', name: 'InR (hypomorph)', color: '#fb7185',
    genotype: 'InR[E19]/InR[GVf]', lifespanDays: 85, lifespanF: 85, lifespanM: 55, chromosome: '3',
    pathway: 'Insulin/IGF signaling (IIS) — insulin-like receptor', bdsc: '', tempC: 25, sex: 'female-biased',
    phenotype: 'Dwarf, developmentally delayed; heteroallelic females very long-lived.',
    notes: 'Heteroallelic InR dwarf FEMALES can live up to ~85% longer than controls (juvenile-hormone deficient); the effect is largely female-specific, with little extension in males (≈ control). Magnitude is allele-/background-dependent — values are representative.',
    refName: 'Tatar et al. (2001) A mutant Drosophila insulin receptor extends life span — Science 292:107',
    refUrl: 'https://www.science.org/doi/10.1126/science.1057987',
  },
  {
    id: 'dfoxo', name: 'dFOXO (fat-body OE)', color: '#22d3ee',
    genotype: 'UAS-dfoxo / +; (adult fat-body GAL4)', lifespanDays: 62, lifespanF: 62, lifespanM: 55, chromosome: 'varies',
    pathway: 'Insulin/IGF signaling (IIS) — FOXO (gain of function)', bdsc: '', tempC: 25, sex: 'female-biased',
    phenotype: 'Increased stress resistance; extended lifespan.',
    notes: 'Over-expressing dFOXO in the adult fat body extends lifespan (~+20–50%) — dFOXO is the key longevity effector downstream of reduced IIS. Reported most strongly in FEMALES (weaker in males). Requires a GAL4 driver; magnitude depends on driver/diet.',
    refName: 'Giannakou et al. (2004) Long-lived Drosophila with over-expressed dFOXO in adult fat body — Science 305:361',
    refUrl: 'https://www.science.org/doi/10.1126/science.1098219',
  },
  {
    id: 'mth', name: 'methuselah', color: '#c084fc',
    genotype: 'mth[1]', lifespanDays: 67, chromosome: '3',
    pathway: 'GPCR (Methuselah) — stress signaling', bdsc: '', tempC: 25, sex: 'mixed',
    phenotype: 'Increased resistance to starvation, heat and oxidative stress.',
    notes: 'Loss-of-function in the GPCR methuselah extends average lifespan ~+35% with enhanced stress resistance. Representative value; background-dependent.',
    refName: 'Lin, Seroude & Benzer (1998) Extended life-span and stress resistance in the Drosophila mutant methuselah — Science 282:943',
    refUrl: 'https://www.science.org/doi/10.1126/science.282.5390.943',
  },
  {
    id: 'indy', name: 'Indy', color: '#facc15',
    genotype: 'Indy[206]', lifespanDays: 70, chromosome: '2',
    pathway: 'Krebs-cycle intermediate transporter (I’m Not Dead Yet)', bdsc: '', tempC: 25, sex: 'mixed',
    phenotype: 'Altered intermediary metabolism (caloric-restriction-like).',
    notes: 'Mutations in Indy (a dicarboxylate transporter) were reported to roughly double average lifespan; later work showed the effect is highly sensitive to genetic background and diet. Treat the magnitude with caution.',
    refName: 'Rogina et al. (2000) Extended life-span conferred by cotransporter gene mutations in Drosophila — Science 290:2137',
    refUrl: 'https://www.science.org/doi/10.1126/science.290.5499.2137',
  },
];
const BUILTIN = Object.fromEntries(CATALOG.map(r => [r.id, { ...r, custom: false }]));
const BUILTIN_IDS = CATALOG.map(r => r.id);

// Required to be "complete" (appears in the survival comparison + Complete section).
const REQUIRED_KEYS = ['genotype', 'lifespanDays'];

const FIELDS = [
  { k: 'genotype',     label: 'Genotype',              type: 'text',   required: true },
  { k: 'lifespanDays', label: 'Median lifespan (days)', type: 'number', step: '1', required: true },
  { k: 'lifespanF',    label: '♀ Female lifespan (days)', type: 'number', step: '1' },
  { k: 'lifespanM',    label: '♂ Male lifespan (days)',   type: 'number', step: '1' },
  { k: 'pathway',      label: 'Pathway / gene role',   type: 'text' },
  { k: 'chromosome',   label: 'Chromosome',            type: 'text' },
  { k: 'bdsc',         label: 'BDSC stock #',          type: 'text' },
  { k: 'tempC',        label: 'Temperature (°C)',      type: 'number', step: '1' },
  { k: 'sex',          label: 'Lifespan sex (overall)', type: 'text' },
  { k: 'phenotype',    label: 'Phenotype',             type: 'text' },
];

// Lifespan for the chosen sex view: 'all' = overall median; 'F'/'M' fall back to overall.
let selSex = 'all';   // survival-curve sex view
function lifeForSex(w, sex) {
  if (sex === 'F') return (w.lifespanF != null && w.lifespanF > 0) ? w.lifespanF : w.lifespanDays;
  if (sex === 'M') return (w.lifespanM != null && w.lifespanM > 0) ? w.lifespanM : w.lifespanDays;
  return w.lifespanDays;
}

function lifeClass(days) {
  if (days >= BASE_LIFESPAN * 1.15) return { label: 'Long-lived',  color: '#34d399' };
  if (days <= BASE_LIFESPAN * 0.85) return { label: 'Short-lived', color: '#f87171' };
  return { label: 'Normal lifespan', color: '#94a3b8' };
}

const baseRecord = id => BUILTIN[id] || null;
function complete(w) {
  return w.genotype != null && String(w.genotype).trim() !== '' && w.lifespanDays != null && w.lifespanDays > 0;
}
function missingRequired(w) {
  return FIELDS.filter(f => f.required).filter(f =>
    f.k === 'lifespanDays' ? (w.lifespanDays == null || !(w.lifespanDays > 0))
      : (w[f.k] == null || String(w[f.k]).trim() === '')).map(f => f.label);
}

// ── Persistence ──
function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { overrides: raw.overrides || {}, custom: Array.isArray(raw.custom) ? raw.custom : [] };
  } catch { return { overrides: {}, custom: [] }; }
}
function saveState(st) { localStorage.setItem(KEY, JSON.stringify(st)); }
let state = loadState();

function allStocks() {
  const builtin = BUILTIN_IDS.map(id => {
    const ov = state.overrides[id] || {};
    return { ...BUILTIN[id], ...ov, _edited: Object.keys(ov).length > 0 };
  });
  const custom = state.custom.map(c => ({ ...c, custom: true, _edited: false }));
  return [...builtin, ...custom];
}

function onEdit(id, field, rawVal, isCustom) {
  let val = rawVal;
  const fmeta = FIELDS.find(f => f.k === field);
  if (fmeta?.type === 'number') { val = rawVal === '' ? null : Number(rawVal); if (Number.isNaN(val)) return; }
  if (isCustom) {
    const w = state.custom.find(c => c.id === id);
    if (w) w[field] = val;
  } else {
    state.overrides[id] = { ...(state.overrides[id] || {}), [field]: val };
    const std = baseRecord(id);
    if (std && std[field] === val) {
      delete state.overrides[id][field];
      if (Object.keys(state.overrides[id]).length === 0) delete state.overrides[id];
    }
  }
  saveState(state);
  render();
}

async function standardizeAll() {
  const ok = await showConfirm(
    '⚠️ Standardize ALL stocks?<br><br>This resets every built-in stock back to the ' +
    'research-standard data and <b>permanently discards all of your edits</b>. ' +
    'Your custom-added stocks are kept. This cannot be undone.',
    'Yes, standardize', 'Cancel');
  if (!ok) return;
  state.overrides = {};
  saveState(state); render();
  showToast('All built-in stocks reset to standardized data.', 'success');
}
async function resetOne(id) {
  const ok = await showConfirm(
    `Reset <b>${esc(baseRecord(id)?.name || id)}</b> to standardized data? Your edits to this stock will be lost.`,
    'Reset', 'Cancel');
  if (!ok) return;
  delete state.overrides[id];
  saveState(state); render();
  showToast('Stock reset to standardized data.', 'success');
}
async function deleteCustom(id) {
  const ok = await showConfirm('Delete this custom stock? This cannot be undone.', 'Delete', 'Cancel');
  if (!ok) return;
  state.custom = state.custom.filter(c => c.id !== id);
  saveState(state); render();
  showToast('Custom stock deleted.', 'success');
}

function openAddStock() {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1600;display:flex;' +
    'align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(4px);overflow-y:auto';
  const fld = (id, label, ph, type = 'text') =>
    `<label style="display:block;font-size:11px;color:#94a3b8;margin:8px 0 2px">${label}</label>
     <input id="${id}" type="${type}" placeholder="${ph}" style="width:100%;padding:9px;border-radius:8px;
       background:#0f172a;border:1px solid #2d3748;color:#e2e8f0;font-size:13px;box-sizing:border-box">`;
  overlay.innerHTML = `
    <div style="background:#111827;border:1px solid #1e2a3a;border-radius:16px;padding:20px;
                max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.8);margin:auto">
      <div style="font-size:15px;font-weight:700;color:#00d4aa;margin-bottom:4px">➕ Add your own stock</div>
      <div style="font-size:11px;color:#64748b;margin-bottom:6px">Only a name is needed to save. <b style="color:#f87171">*</b> fields are required for the survival comparison.</div>
      ${fld('asName', 'Name <span style="color:#f87171">*</span>', 'e.g. my-line')}
      ${fld('asGeno', 'Genotype <span style="color:#f87171">*</span>', 'e.g. w[1118]; UAS-x / +')}
      ${fld('asLife', 'Median lifespan (days) <span style="color:#f87171">*</span>', 'e.g. 50', 'number')}
      ${fld('asLifeF', '♀ Female lifespan (days, if known)', 'e.g. 55', 'number')}
      ${fld('asLifeM', '♂ Male lifespan (days, if known)', 'e.g. 48', 'number')}
      ${fld('asPath', 'Pathway / gene role', 'e.g. IIS — FOXO')}
      ${fld('asChr', 'Chromosome', 'e.g. 2')}
      ${fld('asBdsc', 'BDSC stock #', 'e.g. 3605')}
      ${fld('asTemp', 'Temperature (°C)', 'e.g. 25', 'number')}
      ${fld('asNotes', 'Notes', 'anything else')}
      <div style="display:flex;gap:10px;margin-top:16px">
        <button id="asCancel" style="flex:1;padding:11px;border-radius:8px;background:#1e2a3a;
          border:1px solid #2d3748;color:#94a3b8;font-size:13px;font-weight:600;cursor:pointer;min-height:44px">Cancel</button>
        <button id="asSave" style="flex:1;padding:11px;border-radius:8px;background:#00d4aa;border:none;
          color:#000;font-size:13px;font-weight:700;cursor:pointer;min-height:44px">Add stock</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const val = id => overlay.querySelector('#' + id).value.trim();
  const num = id => { const v = val(id); return v === '' ? null : Number(v); };
  const close = () => overlay.remove();
  overlay.querySelector('#asCancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#asSave').onclick = () => {
    const name = val('asName');
    if (!name) { showToast('Please enter a name for the stock.', 'warn'); return; }
    const palette = ['#22d3ee','#a3e635','#f472b6','#fb923c','#c084fc','#facc15','#4ade80'];
    state.custom.push({
      id: 'custom_' + Date.now().toString(36),
      name,
      genotype: val('asGeno'),
      lifespanDays: num('asLife'),
      lifespanF: num('asLifeF'),
      lifespanM: num('asLifeM'),
      pathway: val('asPath') || 'Unknown',
      chromosome: val('asChr') || '',
      bdsc: val('asBdsc') || '',
      tempC: num('asTemp'),
      sex: '', phenotype: '', notes: val('asNotes'),
      refName: 'User-added', refUrl: '',
      color: palette[state.custom.length % palette.length],
      custom: true,
    });
    saveState(state); close(); render();
    showToast(`Added "${esc(name)}" to your collection.`, 'success');
  };
}

// ── Survival / lifespan curve (Gompertz). One line per stock; long-lived → short-lived. ──
const GA = 0.0016, GG = 0.23;
function survivalSVG(list0, sex) {
  const lv = w => lifeForSex(w, sex);
  const list = list0.filter(w => lv(w) != null && lv(w) > 0)
    .sort((a, b) => lv(b) - lv(a));
  if (!list.length) return '<div style="font-size:12px;color:#64748b;padding:10px">No lifespan data to plot.</div>';
  const SV = { W: 520, H: 250, x0: 46, x1: 320, y0: 16, y1: 206, yMax: 105 };
  const maxK = Math.max(...list.map(w => lv(w) / BASE_LIFESPAN));
  const TAU2 = Math.log(1 + (GG / GA) * Math.log(50)) / GG;
  const maxDays = Math.min(140, Math.max(60, Math.ceil((TAU2 * maxK * BASE_LIFESPAN / 20) / 10) * 10));
  const dStep = maxDays <= 80 ? 20 : 30;
  const X = d => SV.x0 + (Math.min(d, maxDays) / maxDays) * (SV.x1 - SV.x0);
  const Y = pct => SV.y0 + (1 - pct / SV.yMax) * (SV.y1 - SV.y0);
  const surv = (k, d) => 100 * Math.exp(-(GA / GG) * (Math.exp((GG / k) * d) - 1));
  const A = '#111';
  let g = `<rect x="0" y="0" width="${SV.W}" height="${SV.H}" fill="#ffffff"/>`;
  for (const pct of [0, 25, 50, 75, 100]) {
    const yy = Y(pct);
    g += `<line x1="${SV.x0 - 4}" y1="${yy}" x2="${SV.x0}" y2="${yy}" stroke="${A}" stroke-width="1"/>` +
      `<text x="${SV.x0 - 7}" y="${yy + 3}" font-size="9" fill="${A}" text-anchor="end">${pct}</text>`;
  }
  for (let d = 0; d <= maxDays; d += dStep) {
    const xx = X(d);
    g += `<line x1="${xx}" y1="${SV.y1}" x2="${xx}" y2="${SV.y1 + 4}" stroke="${A}" stroke-width="1"/>` +
      `<text x="${xx}" y="${SV.y1 + 15}" font-size="9" fill="${A}" text-anchor="middle">${d}</text>`;
  }
  g += `<line x1="${SV.x0}" y1="${SV.y0}" x2="${SV.x0}" y2="${SV.y1}" stroke="${A}" stroke-width="1.2"/>` +
    `<line x1="${SV.x0}" y1="${SV.y1}" x2="${SV.x1}" y2="${SV.y1}" stroke="${A}" stroke-width="1.2"/>` +
    `<text x="${(SV.x0 + SV.x1) / 2}" y="${SV.y1 + 32}" font-size="11" fill="${A}" text-anchor="middle">Adult age (days)</text>` +
    `<text x="13" y="${(SV.y0 + SV.y1) / 2}" font-size="11" fill="${A}" text-anchor="middle" transform="rotate(-90 13 ${(SV.y0 + SV.y1) / 2})">Percent survival</text>`;
  let lines = '', legend = '';
  const rowH = Math.max(7, Math.min(15, (SV.y1 - SV.y0 - 4) / list.length));
  const lfs = rowH < 10 ? 7 : 9;
  list.forEach((w, i) => {
    const days = lv(w);
    const k = days / 20;
    const lc = lifeClass(days);
    let pts = '';
    for (let d = 0; d <= maxDays; d += Math.max(0.5, maxDays / 120)) pts += `${X(d).toFixed(1)},${Y(surv(k, d)).toFixed(1)} `;
    lines += `<polyline points="${pts.trim()}" fill="none" stroke="${w.color}" stroke-width="1.7"/>`;
    const ly = SV.y0 + 6 + i * rowH;
    legend += `<line x1="${SV.x1 + 12}" y1="${ly}" x2="${SV.x1 + 26}" y2="${ly}" stroke="${w.color}" stroke-width="2.4"/>` +
      `<circle cx="${SV.x1 + 32}" cy="${ly}" r="2.6" fill="${lc.color}"/>` +
      `<text x="${SV.x1 + 38}" y="${ly + 3}" font-size="${lfs}" fill="${A}">${esc(w.name).slice(0, 16)} ` +
      `<tspan fill="${lc.color}" font-weight="700">${days}d</tspan></text>`;
  });
  return `<svg viewBox="0 0 ${SV.W} ${SV.H}" width="100%" style="display:block;border-radius:6px">${g}${lines}${legend}</svg>`;
}

function originBadge(w, small) {
  const fs = small ? 8 : 9, pad = small ? '2px 6px' : '2px 7px', r = small ? 9 : 10;
  const chip = (c, bg, t) => `<span style="font-size:${fs}px;font-weight:800;color:${c};background:${bg};padding:${pad};border-radius:${r}px">${t}</span>`;
  if (w.custom) return chip('#22d3ee', '#0c2d33', 'CUSTOM');
  if (w._edited) return chip('#f59e0b', '#2a2105', 'EDITED');
  return '';
}

function tileHTML(w) {
  const lc = w.lifespanDays != null ? lifeClass(w.lifespanDays) : { label: 'Unknown', color: '#64748b' };
  const life = w.lifespanDays != null ? `${w.lifespanDays} d` : '—';
  const ok = complete(w);
  const lock = ok ? '<span style="font-size:9px;color:#64748b">tap ›</span>'
    : '<span style="font-size:9px;font-weight:700;color:#f59e0b">⚠ needs data</span>';
  return `
    <div class="worm-tile" data-open="${esc(w.id)}" style="aspect-ratio:1/1;cursor:pointer;
      background:linear-gradient(160deg, ${w.color}2e, ${w.color}0d);
      border:1.5px solid ${ok ? w.color + '66' : '#f59e0b66'};
      border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:5px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="width:14px;height:14px;border-radius:50%;background:${w.color};box-shadow:0 0 8px ${w.color}99;flex-shrink:0"></span>
        <span style="flex:1"></span>${originBadge(w, true)}
      </div>
      <div style="font-size:15px;font-weight:800;color:#f1f5f9;line-height:1.15;flex:1;display:flex;align-items:center;word-break:break-word">${esc(w.name)}</div>
      <div style="display:flex;align-items:baseline;gap:6px">
        <span style="font-size:21px;font-weight:800;color:#e2e8f0">${life}</span>
        <span style="font-size:10px;font-weight:700;color:${lc.color}">${lc.label}</span>
      </div>
      ${(w.lifespanF != null || w.lifespanM != null)
        ? `<div style="font-size:10px;font-weight:700;color:#cbd5e1">♀ ${w.lifespanF != null ? w.lifespanF + 'd' : '—'} · ♂ ${w.lifespanM != null ? w.lifespanM + 'd' : '—'}</div>` : ''}
      <div style="font-size:10px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🧬 ${esc(w.genotype || '—')}</div>
      <div style="text-align:right">${lock}</div>
    </div>`;
}

function fieldInputHTML(w, f) {
  const v = w[f.k] ?? '';
  const missing = f.required && (w[f.k] == null || String(w[f.k]).trim() === '');
  const border = missing ? '#7f1d1d' : '#243042';
  const star = f.required ? ' <span style="color:#f87171">*</span>' : '';
  const common = `data-id="${esc(w.id)}" data-field="${f.k}" data-custom="${w.custom ? 1 : 0}" ` +
    `style="width:100%;padding:7px 8px;border-radius:7px;background:#0f172a;border:1px solid ${border};color:#e2e8f0;font-size:12px;box-sizing:border-box"`;
  return `<div><label style="display:block;font-size:10px;color:#64748b;margin-bottom:2px">${f.label}${star}</label><input ${common} type="${f.type}" ${f.step ? `step="${f.step}"` : ''} value="${esc(v)}"></div>`;
}

function detailBodyHTML(w) {
  const lc = w.lifespanDays != null ? lifeClass(w.lifespanDays) : { label: 'Unknown', color: '#64748b' };
  const reqHTML = FIELDS.filter(f => f.required).map(f => fieldInputHTML(w, f)).join('');
  const optHTML = FIELDS.filter(f => !f.required).map(f => fieldInputHTML(w, f)).join('');
  const ok = complete(w);
  const miss = missingRequired(w);
  const banner = ok
    ? `<div style="font-size:11px;font-weight:700;color:#34d399;background:#052e22;border:1px solid #16734f;border-radius:8px;padding:7px 10px;margin-bottom:10px">✅ Complete — included in the survival comparison.</div>`
    : `<div style="font-size:11px;font-weight:700;color:#fbbf24;background:#2a2105;border:1px solid #7c5e1a;border-radius:8px;padding:7px 10px;margin-bottom:10px">⚠ Not all information entered. Enter the required field${miss.length > 1 ? 's' : ''} (${esc(miss.join(', '))}) to include this stock in the comparison.</div>`;
  const action = w.custom
    ? `<button data-del="${esc(w.id)}" style="font-size:11px;background:#2a0808;border:1px solid #5b1d1d;color:#f87171;border-radius:7px;padding:8px 11px;cursor:pointer">🗑 Delete</button>`
    : (w._edited ? `<button data-reset="${esc(w.id)}" style="font-size:11px;background:#1e2a3a;border:1px solid #2d3748;color:#94a3b8;border-radius:7px;padding:8px 11px;cursor:pointer">♻ Reset</button>` : '');
  const src = w.refUrl
    ? `<a href="${esc(w.refUrl)}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:underline">${esc(w.refName || 'source')} ↗</a>`
    : (w.refName ? esc(w.refName) : '');
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="width:16px;height:16px;border-radius:50%;background:${w.color};box-shadow:0 0 8px ${w.color}99;flex-shrink:0"></span>
      <div style="font-size:16px;font-weight:800;color:#f1f5f9;flex:1">${esc(w.name)}</div>
      ${originBadge(w, false)}
      <span style="font-size:10px;font-weight:700;color:${lc.color};border:1px solid ${lc.color};border-radius:10px;padding:2px 8px">${lc.label}</span>
    </div>
    ${banner}
    <div style="font-size:10px;font-weight:800;color:#f87171;letter-spacing:.04em;margin:2px 0 5px">REQUIRED *</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">${reqHTML}</div>
    <div style="font-size:10px;font-weight:800;color:#64748b;letter-spacing:.04em;margin:2px 0 5px">OPTIONAL DETAILS</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${optHTML}</div>
    ${w.phenotype ? `<div style="font-size:10px;color:#94a3b8;margin-top:9px;line-height:1.5"><b style="color:#cbd5e1">Phenotype:</b> ${esc(w.phenotype)}</div>` : ''}
    ${w.notes ? `<div style="font-size:10px;color:#64748b;margin-top:6px;line-height:1.5"><b>Notes:</b> ${esc(w.notes)}</div>` : ''}
    ${src ? `<div style="font-size:10px;color:#64748b;margin-top:6px">📚 Source: ${src}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:14px;align-items:center;flex-wrap:wrap">
      ${action}
      <span style="flex:1"></span>
      <button id="stockDetailClose" style="font-size:13px;font-weight:700;background:#243042;border:none;color:#cbd5e1;border-radius:8px;padding:8px 14px;cursor:pointer;min-height:40px">Done</button>
    </div>`;
}

let openDetailId = null;
function paintDetail() {
  const ov = document.getElementById('stockDetailOverlay');
  if (!ov) return;
  const w = allStocks().find(x => x.id === openDetailId);
  if (!w) { closeDetail(); return; }
  const box = ov.querySelector('#stockDetailBox');
  box.innerHTML = detailBodyHTML(w);
  box.querySelectorAll('[data-field]').forEach(inp =>
    inp.addEventListener('change', () => onEdit(inp.dataset.id, inp.dataset.field, inp.value, inp.dataset.custom === '1')));
  box.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => resetOne(b.dataset.reset));
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteCustom(b.dataset.del));
  box.querySelector('#stockDetailClose').onclick = closeDetail;
}
function openDetail(id) {
  openDetailId = id;
  let ov = document.getElementById('stockDetailOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'stockDetailOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1600;display:flex;' +
      'align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(4px);overflow-y:auto';
    ov.innerHTML = `<div id="stockDetailBox" style="background:#111827;border:1px solid #1e2a3a;border-radius:16px;
      padding:18px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.8);margin:auto"></div>`;
    ov.addEventListener('click', e => { if (e.target === ov) closeDetail(); });
    document.body.appendChild(ov);
  }
  paintDetail();
}
function closeDetail() { openDetailId = null; document.getElementById('stockDetailOverlay')?.remove(); }

function render() {
  const root = document.getElementById('flyStockBody');
  if (!root) return;
  const stocks = allStocks();
  const editedCount = stocks.filter(w => w._edited).length;
  const ready = stocks.filter(complete);
  const needData = stocks.filter(w => !complete(w));
  const grid = list => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:11px">${list.map(tileHTML).join('')}</div>`;
  const section = (title, color, sub, list) => !list.length ? '' : `
    <div style="margin-top:6px">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px">
        <span style="font-size:13px;font-weight:800;color:${color}">${title}</span>
        <span style="font-size:11px;color:#64748b">${list.length}</span>
      </div>
      <div style="font-size:10px;color:#64748b;margin-bottom:8px;line-height:1.35">${sub}</div>
      ${grid(list)}
    </div>`;
  root.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:4px">
      <button id="btnAddStock" style="background:var(--accent,#00d4aa);color:#04201a;border:none;border-radius:9px;
        padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer">➕ Add my own stock</button>
      <button id="btnStandardize" style="background:#1e2a3a;color:#cbd5e1;border:1px solid #2d3748;border-radius:9px;
        padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer">♻ Standardize all (reset edits)</button>
      ${editedCount ? `<span style="font-size:11px;color:#f59e0b">${editedCount} stock${editedCount > 1 ? 's' : ''} edited</span>` : ''}
    </div>

    <div style="background:#fff;border:1px solid #1e2a3a;border-radius:12px;padding:8px 8px 4px">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:2px 4px 0">
        <span style="font-size:12px;font-weight:700;color:#0f172a">📈 Lifespan / survival comparison</span>
        <span style="flex:1"></span>
        ${[['all', 'Combined'], ['F', '♀ Female'], ['M', '♂ Male']].map(([k, l]) =>
          `<button data-sex="${k}" style="width:auto;min-height:unset;cursor:pointer;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;
            ${selSex === k ? 'background:#0f172a;border:1px solid #0f172a;color:#fff' : 'background:#eef2f7;border:1px solid #cbd5e1;color:#475569'}">${l}</button>`).join('')}
      </div>
      <div style="font-size:10px;color:#475569;padding:1px 4px 4px;line-height:1.35">Modelled survival curves from each stock's ${selSex === 'F' ? '<b>female</b>' : selSex === 'M' ? '<b>male</b>' : 'median'} lifespan (food always available, no reproduction). ${selSex !== 'all' ? 'Stocks without a sex-specific value fall back to their overall median. ' : ''}Legend ordered <b>long-lived → short-lived</b>; dot = <span style="color:#16a34a;font-weight:700">●&nbsp;long</span> / <span style="color:#64748b;font-weight:700">●&nbsp;normal</span> / <span style="color:#dc2626;font-weight:700">●&nbsp;short</span> vs Canton-S (~50 d). Absolute lifespan is diet/temperature/background-dependent.</div>
      ${survivalSVG(stocks, selSex)}
    </div>

    ${section('✅ Complete stocks', '#34d399', 'Genotype + median lifespan entered — included in the comparison above.', ready)}
    ${section('⚠ Stocks needing data', '#f59e0b', 'Missing genotype or lifespan — fill it in to include in the comparison.', needData)}`;

  root.querySelector('#btnAddStock').onclick = openAddStock;
  root.querySelector('#btnStandardize').onclick = standardizeAll;
  root.querySelectorAll('[data-sex]').forEach(b => b.onclick = () => { selSex = b.dataset.sex; render(); });
  root.querySelectorAll('[data-open]').forEach(t => t.onclick = () => openDetail(t.dataset.open));
  if (openDetailId) paintDetail();
}

// Shared with the fly Pathways tab (built next): the stock list + open-detail.
window.DrosoAllStocks = allStocks;
window.DrosoOpenStock = openDetail;

function init() {
  const fs = document.getElementById('flyStock');
  if (!fs) return;
  fs.querySelector('.le-home')?.addEventListener('click', () => {
    fs.style.display = 'none';
    if (typeof window.WormTraceShowDrosoHome === 'function') window.WormTraceShowDrosoHome();
    else { const h = document.getElementById('homeScreen'); if (h) h.style.display = 'flex'; }
  });
  render();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
