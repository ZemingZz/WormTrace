/**
 * collectionApp.js — "Worm Collection" tab.
 *
 * A catalog of every strain the lab works with, showing STANDARDIZED research data
 * (lifespan, mutation/allele, mutated pathway, reproductive brood, growth time,
 * dauer class). The user can:
 *   • edit any metric per worm (persists to localStorage),
 *   • add their own worm,
 *   • press "Standardize all" to wipe their edits back to the research values
 *     (with a warning that their custom configuration will be lost),
 *   • compare lifespans on a survival curve (moved here from the bin simulator).
 *
 * Standard values are assembled from LifeCycle.js (the single source of research
 * data); user edits are stored as OVERRIDES on top, so "Standardize" = drop overrides.
 */
import { STRAINS, adultLifespanDays, getStages, registerStrain } from './LifeCycle.js?v=137';
import { showToast, showConfirm } from './Toast.js?v=137';
import { WORM_CATALOG } from './wormCatalog.js?v=137';

const KEY = 'wormtrace_collection_v1';
const N2_LIFESPAN = 23;   // baseline for long-lived / short-lived classification

// Built-in strain ids captured at load (before any imported worm is registered into
// STRAINS), so the catalog UI never confuses a registered import for a built-in.
const BUILTIN_IDS = Object.keys(STRAINS).filter(id => id !== 'custom');

// ── REQUIRED for a plate: a plate's simulation can't be faked without these. ─────
// Everything else (mutation, pathway, brood, growth…) is OPTIONAL — the sim falls
// back to sensible N2-like defaults. A worm missing any required field can live in
// the collection but CANNOT be put on a plate.
const REQUIRED_KEYS = ['lifespanDays', 'dauerClass'];
const N2_EGG_TO_ADULT_H = (() => {
  const a = getStages('N2', 20).find(s => s.id === 'adult');
  return a ? a.start : 78;
})();

// ── Mutated-pathway reference (gene → pathway). Sourced from the strain notes
//    in LifeCycle.js + WormBook (IIS = insulin/IGF-1 signaling). ───────────────
const PATHWAY = {
  'N2':     '— (wild-type reference)',
  'dpy-13': 'Cuticle collagen (structural)',
  'daf-2':  'Insulin/IGF-1 signaling (IIS) — receptor',
  'daf-7':  'TGF-β (DAF-7) signaling — ligand',
  'daf-1':  'TGF-β signaling — type-I receptor',
  'daf-16': 'Insulin/IGF-1 signaling (IIS) — FOXO effector',
  'daf-3':  'TGF-β signaling — co-SMAD',
  'daf-5':  'TGF-β signaling — Sno/Ski',
  'eat-2':  'Dietary restriction (nAChR / pharyngeal pumping)',
  'age-1':  'Insulin/IGF-1 signaling (IIS) — PI3K',
  'custom': 'Unknown',
};

const DAUER_LABEL = {
  'wild':  'Facultative (stress-induced)',
  'daf-c': 'Dauer-constitutive (Daf-c)',
  'daf-d': 'Dauer-defective (Daf-d)',
};
// Reverse: a (possibly user-edited) dauer label → dafClass for the simulation.
function textToDaf(text) {
  const s = String(text || '').toLowerCase();
  if (s.includes('constitutive') || s.includes('daf-c')) return 'daf-c';
  if (s.includes('defective')    || s.includes('daf-d')) return 'daf-d';
  if (s.includes('facultative')  || s.includes('wild') || s.includes('normal')) return 'wild';
  return null;   // undetermined → not plate-ready
}
const DAUER_OPTIONS = ['', ...Object.values(DAUER_LABEL)];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// ── Lifespan classification (long-lived / short-lived vs N2) ───────────────────
function lifeClass(days) {
  if (days >= N2_LIFESPAN * 1.15) return { label: 'Long-lived',  color: '#34d399' };
  if (days <= N2_LIFESPAN * 0.85) return { label: 'Short-lived', color: '#f87171' };
  return { label: 'Normal lifespan', color: '#94a3b8' };
}

// ── Build the STANDARD (research) record for a built-in strain ─────────────────
function standardRecord(id) {
  const s = STRAINS[id];
  if (!s) return null;
  const allele = (s.label.match(/\(([^)]+)\)/) || [])[1] || '';
  const stages = getStages(id, 20);
  const adult  = stages.find(st => st.id === 'adult');
  const eggToAdultH = adult ? Math.round(adult.start) : null;   // hrs egg→adulthood @20°C
  return {
    id,
    name:        s.label.split('—')[0].trim(),          // e.g. "N2 (Bristol)"
    gene:        id === 'N2' ? '— (wild-type)' : id,
    allele:      id === 'N2' ? 'Bristol (background)' : allele,
    mutation:    id === 'N2' ? 'none (wild-type)' : `${id}(${allele})`,
    pathway:     PATHWAY[id] ?? 'Unknown',
    lifespanDays: adultLifespanDays(id, 20),
    lifespanText: s.lifespan20C ?? '',
    broodSize:   s.maxEggs ?? null,                      // total self-brood (eggs)
    eggToAdultH,
    dauerClass:  DAUER_LABEL[s.dafClass] ?? s.dafClass,
    phenotype:   s.phenotype ?? '',
    notes:       s.notes ?? '',
    refs:        s.refs ?? '',
    color:       s.color ?? '#64748b',
    custom:      false,
  };
}

// ── Imported worms (from the curated spreadsheet) ────────────────────────────────
// Keyed by id; shaped like a collection record. These are NOT built-ins — many are
// missing required data (reporters/tools) and so are not plate-ready until filled in.
const IMPORTED = Object.fromEntries(WORM_CATALOG.map(r => [r.id, { ...r, custom: false, imported: true }]));

/** The base (un-edited) record for any non-custom worm: built-in standard or imported. */
function baseRecord(id) {
  if (BUILTIN_IDS.includes(id)) return standardRecord(id);
  return IMPORTED[id] || null;
}

/** A worm is plate-ready when every REQUIRED field is present & usable. */
function plateReady(w) {
  for (const k of REQUIRED_KEYS) {
    if (k === 'lifespanDays') { if (w.lifespanDays == null || !(w.lifespanDays > 0)) return false; }
    else if (k === 'dauerClass') { if (!textToDaf(w.dauerClass)) return false; }
    else if (w[k] == null || w[k] === '') return false;
  }
  return true;
}
/** Which required fields are still missing (for the "please enter…" message). */
function missingRequired(w) {
  return FIELDS.filter(f => f.required).filter(f =>
    f.k === 'dauerClass' ? !textToDaf(w.dauerClass)
      : f.k === 'lifespanDays' ? (w.lifespanDays == null || !(w.lifespanDays > 0))
      : (w[f.k] == null || w[f.k] === '')).map(f => f.label);
}

// ── Persistence ───────────────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { overrides: raw.overrides || {}, custom: Array.isArray(raw.custom) ? raw.custom : [] };
  } catch { return { overrides: {}, custom: [] }; }
}
function saveState(st) { localStorage.setItem(KEY, JSON.stringify(st)); }

let state = loadState();

/** Effective list = built-ins, then imported (sheet), each with edits applied; then custom. */
function allWorms() {
  const apply = (base, src) => {
    const ov = state.overrides[base.id] || {};
    return { ...base, ...ov, _edited: Object.keys(ov).length > 0, source: src };
  };
  const builtin  = BUILTIN_IDS.map(id => apply(standardRecord(id), 'builtin'));
  const imported = Object.values(IMPORTED).map(r => apply(r, 'imported'));
  const custom   = state.custom.map(c => ({ ...c, custom: true, _edited: false, source: 'custom' }));
  return [...builtin, ...imported, ...custom];
}

// Editable fields. `required:true` = essential for a plate (gates plate-adding);
// the rest are optional (sim defaults to N2-like). type 'dauer' renders a <select>.
const FIELDS = [
  { k: 'lifespanDays', label: 'Lifespan (days @20°C)', type: 'number', step: '1', required: true },
  { k: 'dauerClass',   label: 'Dauer status',          type: 'dauer',  required: true },
  { k: 'mutation',     label: 'Mutation / allele',     type: 'text' },
  { k: 'pathway',      label: 'Pathway mutated',       type: 'text' },
  { k: 'broodSize',    label: 'Reproductive brood (eggs)', type: 'number', step: '5' },
  { k: 'eggToAdultH',  label: 'Growth: egg→adult (hrs @20°C)', type: 'number', step: '1' },
];

// ── Field edit handler ─────────────────────────────────────────────────────────
function onEdit(id, field, rawVal, isCustom) {
  let val = rawVal;
  const fmeta = FIELDS.find(f => f.k === field);
  if (fmeta?.type === 'number') { val = rawVal === '' ? null : Number(rawVal); if (Number.isNaN(val)) return; }

  if (isCustom) {
    const w = state.custom.find(c => c.id === id);
    if (w) w[field] = val;
  } else {
    state.overrides[id] = { ...(state.overrides[id] || {}), [field]: val };
    // If the edited value equals the standard again, drop it so the "edited" badge clears.
    const std = baseRecord(id);
    if (std && std[field] === val) {
      delete state.overrides[id][field];
      if (Object.keys(state.overrides[id]).length === 0) delete state.overrides[id];
    }
  }
  saveState(state);
  render();
}

// ── Standardize (reset edits) ──────────────────────────────────────────────────
async function standardizeAll() {
  const ok = await showConfirm(
    '⚠️ Standardize ALL worms?<br><br>This resets every built-in worm back to the ' +
    'research-standard data and <b>permanently discards all of your edits</b>. ' +
    'Your custom-added worms are kept. This cannot be undone.',
    'Yes, standardize', 'Cancel');
  if (!ok) return;
  state.overrides = {};
  saveState(state);
  render();
  showToast('All built-in worms reset to standardized data.', 'success');
}

async function resetOne(id) {
  const ok = await showConfirm(
    `Reset <b>${esc(baseRecord(id)?.name || id)}</b> to standardized data? Your edits to this worm will be lost.`,
    'Reset', 'Cancel');
  if (!ok) return;
  delete state.overrides[id];
  saveState(state);
  render();
  showToast('Worm reset to standardized data.', 'success');
}

async function deleteCustom(id) {
  const ok = await showConfirm('Delete this custom worm? This cannot be undone.', 'Delete', 'Cancel');
  if (!ok) return;
  state.custom = state.custom.filter(c => c.id !== id);
  saveState(state);
  render();
  showToast('Custom worm deleted.', 'success');
}

// ── Add a worm to a new plate (gated on required data) ───────────────────────────
function addToPlate(id) {
  const w = allWorms().find(x => x.id === id);
  if (!w) return;
  if (!plateReady(w)) {
    const miss = missingRequired(w);
    showToast('Not all information has been entered. Please enter the required information' +
      (miss.length ? ` (${esc(miss.join(', '))})` : '') + ' to add this worm to a plate.', 'warn', 6000);
    return;
  }
  if (typeof window.WormTraceAddPlateFromCollection !== 'function') {
    showToast('Plate Tracker isn’t ready — open the Plate Tracker tab once, then retry.', 'warn');
    return;
  }
  // Imported/custom worms aren't built into the sim — register them first so the
  // plate's growth/survival uses their lifespan, dauer class, brood & growth.
  if (w.source !== 'builtin') {
    registerStrain({
      id: w.id, label: w.name, color: w.color,
      dafClass: textToDaf(w.dauerClass),
      maxEggs: w.broodSize ?? 300,
      lifespanDays20C: w.lifespanDays,
      globalScale: w.eggToAdultH ? +(w.eggToAdultH / N2_EGG_TO_ADULT_H).toFixed(3) : 1.0,
      lifespanText: w.lifespanText, notes: w.notes, phenotype: w.phenotype, refs: w.refs,
    });
  }
  window.WormTraceAddPlateFromCollection({ strainId: w.id, name: w.name });
  closeDetail();
  (document.querySelector('.tab-btn[data-tab="plateTab"]') ||
   document.querySelector('.mobile-tab-btn[data-tab="plateTab"]'))?.click();
  showToast(`Added “${esc(w.name)}” to a new plate.`, 'success');
}

// ── Add-your-own-worm modal ────────────────────────────────────────────────────
function openAddWorm() {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:950;display:flex;' +
    'align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(4px);overflow-y:auto';
  const fld = (id, label, ph, type = 'text') =>
    `<label style="display:block;font-size:11px;color:#94a3b8;margin:8px 0 2px">${label}</label>
     <input id="${id}" type="${type}" placeholder="${ph}" style="width:100%;padding:9px;border-radius:8px;
       background:#0f172a;border:1px solid #2d3748;color:#e2e8f0;font-size:13px;box-sizing:border-box">`;
  overlay.innerHTML = `
    <div style="background:#111827;border:1px solid #1e2a3a;border-radius:16px;padding:20px;
                max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.8);margin:auto">
      <div style="font-size:15px;font-weight:700;color:#00d4aa;margin-bottom:4px">➕ Add your own worm</div>
      <div style="font-size:11px;color:#64748b;margin-bottom:6px">Only a name is needed to save. <b style="color:#f87171">*</b> fields are required to put the worm on a plate.</div>
      ${fld('awName', 'Name <span style="color:#f87171">*</span>', 'e.g. my-strain (xy12)')}
      ${fld('awLife', 'Lifespan (days @20°C) <span style="color:#f87171">*</span>', 'e.g. 21', 'number')}
      <label style="display:block;font-size:11px;color:#94a3b8;margin:8px 0 2px">Dauer status <span style="color:#f87171">*</span></label>
      <select id="awDauer" style="width:100%;padding:9px;border-radius:8px;background:#0f172a;
        border:1px solid #2d3748;color:#e2e8f0;font-size:13px">
        <option value="">— not set —</option>
        <option value="Facultative (stress-induced)">Facultative (stress-induced)</option>
        <option value="Dauer-constitutive (Daf-c)">Dauer-constitutive (Daf-c)</option>
        <option value="Dauer-defective (Daf-d)">Dauer-defective (Daf-d)</option>
      </select>
      ${fld('awMut', 'Mutation / allele', 'e.g. xy12')}
      ${fld('awPath', 'Pathway mutated', 'e.g. Insulin/IGF-1 signaling')}
      ${fld('awBrood', 'Reproductive brood (eggs)', 'e.g. 300', 'number')}
      ${fld('awGrow', 'Growth: egg→adult (hrs @20°C)', 'e.g. 78', 'number')}
      ${fld('awNotes', 'Notes', 'anything else')}
      <div style="display:flex;gap:10px;margin-top:16px">
        <button id="awCancel" style="flex:1;padding:11px;border-radius:8px;background:#1e2a3a;
          border:1px solid #2d3748;color:#94a3b8;font-size:13px;font-weight:600;cursor:pointer;min-height:44px">Cancel</button>
        <button id="awSave" style="flex:1;padding:11px;border-radius:8px;background:#00d4aa;border:none;
          color:#000;font-size:13px;font-weight:700;cursor:pointer;min-height:44px">Add worm</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const val = id => overlay.querySelector('#' + id).value.trim();
  const num = id => { const v = val(id); return v === '' ? null : Number(v); };
  const close = () => overlay.remove();
  overlay.querySelector('#awCancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#awSave').onclick = () => {
    const name = val('awName');
    if (!name) { showToast('Please enter a name for the worm.', 'warn'); return; }
    const palette = ['#22d3ee','#a3e635','#f472b6','#fb923c','#c084fc','#facc15','#4ade80'];
    state.custom.push({
      id: 'custom_' + Date.now().toString(36),
      name,
      gene: name.split('(')[0].trim(),
      allele: (name.match(/\(([^)]+)\)/) || [])[1] || '',
      mutation: val('awMut') || '—',
      pathway: val('awPath') || 'Unknown',
      lifespanDays: num('awLife'),
      lifespanText: num('awLife') != null ? `~${num('awLife')} days (user)` : 'Unknown',
      broodSize: num('awBrood'),
      eggToAdultH: num('awGrow'),
      dauerClass: overlay.querySelector('#awDauer').value,
      phenotype: '', notes: val('awNotes'), refs: 'User-added',
      color: palette[state.custom.length % palette.length],
      custom: true,
    });
    saveState(state);
    close();
    render();
    showToast(`Added "${esc(name)}" to your collection.`, 'success');
  };
}

// ── Survival / lifespan curve (Gompertz) — moved here from the bin simulator ────
// Pure lifespan-assay model: food always available, no reproduction. One line per
// worm, using its (possibly edited) lifespan. x = adult age in days.
const GA = 0.0016, GG = 0.23;
function survivalSVG(worms) {
  const list = worms.filter(w => w.lifespanDays != null && w.lifespanDays > 0)
    .sort((a, b) => b.lifespanDays - a.lifespanDays);   // long-lived → short-lived
  if (!list.length) return '<div style="font-size:12px;color:#64748b;padding:10px">No lifespan data to plot.</div>';
  const SV = { W: 520, H: 250, x0: 46, x1: 330, y0: 16, y1: 206, yMax: 105 };
  const maxK = Math.max(...list.map(w => w.lifespanDays / 20));
  // Days until the longest-lived strain reaches ~2% survival.
  const TAU2 = Math.log(1 + (GG / GA) * Math.log(50)) / GG;
  const maxDays = Math.min(90, Math.max(20, Math.ceil((TAU2 * maxK) / 10) * 10));
  const dStep = maxDays <= 45 ? 10 : 20;
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
  const rowH = Math.max(7, Math.min(14, (SV.y1 - SV.y0 - 4) / list.length));   // adaptive: never overflow
  const lfs  = rowH < 10 ? 7 : 9;
  list.forEach((w, i) => {
    const k = w.lifespanDays / 20;
    const lc = lifeClass(w.lifespanDays);   // green=long, grey=normal, red=short
    let pts = '';
    for (let d = 0; d <= maxDays; d += Math.max(0.5, maxDays / 120)) pts += `${X(d).toFixed(1)},${Y(surv(k, d)).toFixed(1)} `;
    lines += `<polyline points="${pts.trim()}" fill="none" stroke="${w.color}" stroke-width="1.7"/>`;
    const ly = SV.y0 + 6 + i * rowH;
    // class dot + name + lifespan in days, the days tinted by long/normal/short class.
    legend += `<line x1="${SV.x1 + 12}" y1="${ly}" x2="${SV.x1 + 26}" y2="${ly}" stroke="${w.color}" stroke-width="2.4"/>` +
      `<circle cx="${SV.x1 + 32}" cy="${ly}" r="2.6" fill="${lc.color}"/>` +
      `<text x="${SV.x1 + 38}" y="${ly + 3}" font-size="${lfs}" fill="${A}">${esc(w.name).slice(0, 15)} ` +
      `<tspan fill="${lc.color}" font-weight="700">${w.lifespanDays}d</tspan></text>`;
  });
  return `<svg viewBox="0 0 ${SV.W} ${SV.H}" width="100%" style="display:block;border-radius:6px">${g}${lines}${legend}</svg>`;
}

// ── Short Dauer label for the tile face ──────────────────────────────────────────
function dauerShort(w) {
  const d = (w.dauerClass || '').toLowerCase();
  if (d.includes('constitutive')) return 'Daf-c · forms dauer';
  if (d.includes('defective'))    return 'Daf-d · no dauer';
  if (d.includes('facultative'))  return 'Facultative dauer';
  return w.dauerClass || '—';
}

// Origin badge (custom / imported / edited) shown on tiles and in the detail header.
function originBadge(w, small) {
  const fs = small ? 8 : 9, pad = small ? '2px 6px' : '2px 7px', r = small ? 9 : 10;
  const chip = (c, bg, t) => `<span style="font-size:${fs}px;font-weight:800;color:${c};background:${bg};padding:${pad};border-radius:${r}px">${t}</span>`;
  if (w.custom) return chip('#22d3ee', '#0c2d33', 'CUSTOM');
  if (w.source === 'imported') return chip('#a78bfa', '#1e1b3a', 'IMPORTED');
  if (w._edited) return chip('#f59e0b', '#2a2105', 'EDITED');
  return '';
}

// ── Square summary tile (name · lifespan + class · Dauer). Click → detail modal. ──
function tileHTML(w) {
  const lc   = w.lifespanDays != null ? lifeClass(w.lifespanDays) : { label: 'Unknown', color: '#64748b' };
  const life = w.lifespanDays != null ? `${w.lifespanDays} d` : '—';
  const ready = plateReady(w);
  const lock = ready ? '<span style="font-size:9px;color:#64748b">tap ›</span>'
    : '<span style="font-size:9px;font-weight:700;color:#f59e0b">⚠ needs data</span>';
  return `
    <div class="worm-tile" data-open="${esc(w.id)}" style="aspect-ratio:1/1;cursor:pointer;
      background:linear-gradient(160deg, ${w.color}2e, ${w.color}0d);
      border:1.5px solid ${ready ? w.color + '66' : '#f59e0b66'};
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
      <div style="font-size:10px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">💤 ${esc(dauerShort(w))}</div>
      <div style="text-align:right">${lock}</div>
    </div>`;
}

// One editable field (text / number / dauer-select). Required-but-empty → red border.
function fieldInputHTML(w, f) {
  const v = w[f.k] ?? '';
  const missing = f.required && (f.k === 'dauerClass' ? !textToDaf(w.dauerClass)
    : (w[f.k] == null || w[f.k] === ''));
  const border = missing ? '#7f1d1d' : '#243042';
  const star = f.required ? ' <span style="color:#f87171">*</span>' : '';
  const common = `data-id="${esc(w.id)}" data-field="${f.k}" data-custom="${w.custom ? 1 : 0}" ` +
    `style="width:100%;padding:7px 8px;border-radius:7px;background:#0f172a;border:1px solid ${border};color:#e2e8f0;font-size:12px;box-sizing:border-box"`;
  const control = f.type === 'dauer'
    ? `<select ${common}>${DAUER_OPTIONS.map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${o || '— not set —'}</option>`).join('')}</select>`
    : `<input ${common} type="${f.type}" ${f.step ? `step="${f.step}"` : ''} value="${esc(v)}">`;
  return `<div><label style="display:block;font-size:10px;color:#64748b;margin-bottom:2px">${f.label}${star}</label>${control}</div>`;
}

// Read-only reference data imported from the spreadsheet (shown only for fields present).
function referenceHTML(w) {
  const rows = [
    ['Median lifespan', w.medianText],
    ['Max lifespan',    w.maxText],
    ['vs N2',           w.relN2],
    ['Survival shape',  w.curveShape],
    ['Temperature',     w.tempC ? `${w.tempC}°C` : ''],
    ['Food',            w.foodSource],
    ['Sample size',     w.sampleN],
    ['Category',        w.category],
    ['Background',      w.background],
    ['Confidence',      w.confidence],
  ].filter(([, v]) => v != null && String(v).trim() !== '');
  const src = w.url
    ? `<a href="${esc(w.url)}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:underline">view source ↗</a>`
    : (w.refs ? esc(w.refs) : '');
  if (!rows.length && !src) return '';
  const cells = rows.map(([k, v]) =>
    `<div style="font-size:10px;line-height:1.45"><span style="color:#64748b">${k}:</span> <span style="color:#cbd5e1">${esc(v)}</span></div>`).join('');
  return `
    <div style="font-size:10px;font-weight:800;color:#64748b;letter-spacing:.04em;margin:13px 0 5px">REFERENCE DATA (from spreadsheet)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px">${cells}</div>
    ${src ? `<div style="font-size:10px;color:#64748b;margin-top:6px">Source: ${src}</div>` : ''}`;
}

// ── Full-stats body (shown in the detail modal) ──────────────────────────────────
function detailBodyHTML(w) {
  const lc = w.lifespanDays != null ? lifeClass(w.lifespanDays) : { label: 'Unknown', color: '#64748b' };
  const reqHTML = FIELDS.filter(f => f.required).map(f => fieldInputHTML(w, f)).join('');
  const optHTML = FIELDS.filter(f => !f.required).map(f => fieldInputHTML(w, f)).join('');
  const ready = plateReady(w);
  const miss = missingRequired(w);
  const banner = ready
    ? `<div style="font-size:11px;font-weight:700;color:#34d399;background:#052e22;border:1px solid #16734f;border-radius:8px;padding:7px 10px;margin-bottom:10px">✅ Plate-ready — all required information entered.</div>`
    : `<div style="font-size:11px;font-weight:700;color:#fbbf24;background:#2a2105;border:1px solid #7c5e1a;border-radius:8px;padding:7px 10px;margin-bottom:10px">⚠ Not all information entered. Enter the required field${miss.length > 1 ? 's' : ''} (${esc(miss.join(', '))}) to add this worm to a plate.</div>`;
  const action = w.custom
    ? `<button data-del="${esc(w.id)}" style="font-size:11px;background:#2a0808;border:1px solid #5b1d1d;color:#f87171;border-radius:7px;padding:8px 11px;cursor:pointer">🗑 Delete</button>`
    : (w._edited ? `<button data-reset="${esc(w.id)}" style="font-size:11px;background:#1e2a3a;border:1px solid #2d3748;color:#94a3b8;border-radius:7px;padding:8px 11px;cursor:pointer">♻ Reset</button>` : '');
  const plateBtn = `<button data-plate="${esc(w.id)}" style="font-size:12px;font-weight:700;border-radius:8px;padding:8px 14px;cursor:pointer;min-height:40px;` +
    (ready ? 'background:#00d4aa;border:none;color:#04201a' : 'background:#1e2a3a;border:1px solid #3a3050;color:#94a3b8') + `">🧫 Add to plate</button>`;
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="width:16px;height:16px;border-radius:50%;background:${w.color};box-shadow:0 0 8px ${w.color}99;flex-shrink:0"></span>
      <div style="font-size:16px;font-weight:800;color:#f1f5f9;flex:1">${esc(w.name)}</div>
      ${originBadge(w, false)}
      <span style="font-size:10px;font-weight:700;color:${lc.color};border:1px solid ${lc.color};border-radius:10px;padding:2px 8px">${lc.label}</span>
    </div>
    ${banner}
    <div style="font-size:10px;font-weight:800;color:#f87171;letter-spacing:.04em;margin:2px 0 5px">REQUIRED FOR PLATE *</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">${reqHTML}</div>
    <div style="font-size:10px;font-weight:800;color:#64748b;letter-spacing:.04em;margin:2px 0 5px">OPTIONAL DETAILS</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${optHTML}</div>
    ${referenceHTML(w)}
    ${w.phenotype ? `<div style="font-size:10px;color:#94a3b8;margin-top:9px;line-height:1.5"><b style="color:#cbd5e1">Phenotype:</b> ${esc(w.phenotype)}</div>` : ''}
    ${w.notes ? `<div style="font-size:10px;color:#64748b;margin-top:6px;line-height:1.5"><b>Notes:</b> ${esc(w.notes)}${w.refs ? ` <span style="color:#475569">· ${esc(w.refs)}</span>` : ''}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:14px;align-items:center;flex-wrap:wrap">
      ${action}
      <span style="flex:1"></span>
      ${plateBtn}
      <button id="wormDetailClose" style="font-size:13px;font-weight:700;background:#243042;border:none;color:#cbd5e1;border-radius:8px;padding:8px 14px;cursor:pointer;min-height:40px">Done</button>
    </div>`;
}

// ── Detail modal (click a tile to open; stays in sync as you edit) ────────────────
let openDetailId = null;

function paintDetail() {
  const ov = document.getElementById('wormDetailOverlay');
  if (!ov) return;
  const w = allWorms().find(x => x.id === openDetailId);
  if (!w) { closeDetail(); return; }
  const box = ov.querySelector('#wormDetailBox');
  box.innerHTML = detailBodyHTML(w);
  box.querySelectorAll('[data-field]').forEach(inp =>   // inputs AND selects
    inp.addEventListener('change', () =>
      onEdit(inp.dataset.id, inp.dataset.field, inp.value, inp.dataset.custom === '1')));
  box.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => resetOne(b.dataset.reset));
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteCustom(b.dataset.del));
  box.querySelectorAll('[data-plate]').forEach(b => b.onclick = () => addToPlate(b.dataset.plate));
  box.querySelector('#wormDetailClose').onclick = closeDetail;
}

function openDetail(id) {
  openDetailId = id;
  let ov = document.getElementById('wormDetailOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'wormDetailOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:950;display:flex;' +
      'align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(4px);overflow-y:auto';
    ov.innerHTML = `<div id="wormDetailBox" style="background:#111827;border:1px solid #1e2a3a;border-radius:16px;
      padding:18px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.8);margin:auto"></div>`;
    ov.addEventListener('click', e => { if (e.target === ov) closeDetail(); });
    document.body.appendChild(ov);
  }
  paintDetail();
}
function closeDetail() {
  openDetailId = null;
  document.getElementById('wormDetailOverlay')?.remove();
}

// ── Top-level render ────────────────────────────────────────────────────────────
function render() {
  const root = document.getElementById('collectionBody');
  if (!root) return;
  const worms = allWorms();
  const editedCount = worms.filter(w => w._edited).length;
  // Group: usable (plate-ready) worms first, then worms still needing required data.
  const ready    = worms.filter(plateReady);
  const needData = worms.filter(w => !plateReady(w));
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
      <button id="btnAddWorm" style="background:var(--accent,#00d4aa);color:#04201a;border:none;border-radius:9px;
        padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer">➕ Add my own worm</button>
      <button id="btnStandardize" style="background:#1e2a3a;color:#cbd5e1;border:1px solid #2d3748;border-radius:9px;
        padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer">♻ Standardize all (reset edits)</button>
      ${editedCount ? `<span style="font-size:11px;color:#f59e0b">${editedCount} worm${editedCount > 1 ? 's' : ''} edited</span>` : ''}
    </div>

    <div style="background:#fff;border:1px solid #1e2a3a;border-radius:12px;padding:8px 8px 4px">
      <div style="font-size:12px;font-weight:700;color:#0f172a;padding:2px 4px 0">📈 Lifespan / survival comparison</div>
      <div style="font-size:10px;color:#475569;padding:1px 4px 4px;line-height:1.35">Pure lifespan-assay model — assumes food always available &amp; no reproduction. Legend ordered <b>long-lived → short-lived</b>; the dot marks <span style="color:#16a34a;font-weight:700">●&nbsp;long</span> / <span style="color:#64748b;font-weight:700">●&nbsp;normal</span> / <span style="color:#dc2626;font-weight:700">●&nbsp;short</span> vs N2.</div>
      ${survivalSVG(worms)}
    </div>

    ${section('✅ Usable worms', '#34d399', 'Plate-ready — all required information entered.', ready)}
    ${section('⚠ Worms needing data', '#f59e0b', 'Missing required info (lifespan or dauer) — fill it in to use on a plate.', needData)}`;

  root.querySelector('#btnAddWorm').onclick = openAddWorm;
  root.querySelector('#btnStandardize').onclick = standardizeAll;
  root.querySelectorAll('[data-open]').forEach(t => t.onclick = () => openDetail(t.dataset.open));
  if (openDetailId) paintDetail();   // keep an open detail modal in sync after re-render
}

// Shared with the Pathways tab: the effective worm list + a way to open a worm's detail.
window.WormTraceAllWorms = allWorms;
window.WormTraceOpenWorm = openDetail;

// ── Init: render now + whenever the Collection tab is shown ─────────────────────
function init() {
  render();
  document.querySelectorAll('[data-tab="collectionTab"]').forEach(btn =>
    btn.addEventListener('click', () => setTimeout(render, 0)));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
