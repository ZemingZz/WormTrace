/**
 * plateApp.js — orchestrates the Plate Tracker tab, life cycle reference,
 * growth troubleshooter, and session management UI.
 */

import { initPlateUI, renderPlateList, renderPlateDetail, pt } from './plateUI.js?v=147';
import { STRAINS, getStages, getCurrentStage, fmtHours } from './LifeCycle.js?v=147';
import { Troubleshooter }       from './Troubleshooter.js?v=147';
import { SessionManager }       from './SessionManager.js?v=147';
import { showToast, showConfirm } from './Toast.js?v=147';
import { checkWelcome }          from './WelcomeScreen.js?v=147';
import { showFeedback }          from './Feedback.js?v=147';
import { RealWorldData, POINT_SCHEMA } from './RealWorldData.js?v=147';
import { MLEngine }        from './MLEngine.js?v=147';
import { ExportManager }   from './ExportManager.js?v=147';
import { drawComparisonChart } from './ComparisonChart.js?v=147';
import { openCompareModal }   from './CompareCharts.js?v=147';

const ml = new MLEngine();
const em = new ExportManager(pt);

// ── Multi-plate selection state ────────────────────────────────────────────
const selectedPlateIds = new Set();

export function togglePlateSelection(id) {
  if (selectedPlateIds.has(id)) selectedPlateIds.delete(id);
  else selectedPlateIds.add(id);
  renderMultiSelectBar();
}

function renderMultiSelectBar() {
  const bar  = document.getElementById('multiSelectBar');
  const n    = selectedPlateIds.size;
  bar.classList.toggle('hidden', n === 0);
  document.getElementById('multiSelectCount').textContent = `${n} plate${n!==1?'s':''} selected`;
}

window._multiSelectToggle = togglePlateSelection;
window._getSelectedIds    = () => [...selectedPlateIds];
window._clearSelection    = () => { selectedPlateIds.clear(); renderMultiSelectBar(); };

const ts  = new Troubleshooter();
const sm  = new SessionManager();

let currentSessionId = null;
let currentSessionTags = [];

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(target).classList.add('active');

    if (target === 'plateTab') {
      renderLifeCycleReference(20);
    }
  });
});

// ── Session bar toggle (⚙ button next to logo) ────────────────────────────────
const _btnToggleSB = document.getElementById('btnToggleSessionBar');
if (_btnToggleSB) _btnToggleSB.onclick = () => {
  document.getElementById('sessionBar')?.classList.toggle('collapsed');
};

// ── Session management ────────────────────────────────────────────────────────
document.getElementById('btnSessions').addEventListener('click', () => {
  document.getElementById('sessionDrawer').classList.toggle('open');
  renderSessionList();
});
document.getElementById('btnCloseDrawer').addEventListener('click', () => {
  document.getElementById('sessionDrawer').classList.remove('open');
});

document.getElementById('btnSaveSession').addEventListener('click', () => {
  const name = document.getElementById('sessionNameInput').value.trim() || 'Session';
  if (!currentSessionId) {
    currentSessionId = sm.createSession({ name, tags: currentSessionTags });
  } else {
    sm.update(currentSessionId, { name, tags: currentSessionTags });
  }
  document.getElementById('btnExportCSV').disabled  = false;
  document.getElementById('btnExportJSON').disabled = false;
  showFlash('Session saved ✓');
  renderSessionList();
});

document.getElementById('btnAddTag').addEventListener('click', addTag);
document.getElementById('tagInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTag();
});

function addTag() {
  const val = document.getElementById('tagInput').value.trim();
  if (!val || currentSessionTags.includes(val)) { document.getElementById('tagInput').value = ''; return; }
  currentSessionTags.push(val);
  document.getElementById('tagInput').value = '';
  renderTagChips();
}

function renderTagChips() {
  document.getElementById('tagChips').innerHTML = currentSessionTags.map(t =>
    `<span class="tag-chip active" data-tag="${t}">${t} <span class="rm">✕</span></span>`
  ).join('');
  document.getElementById('tagChips').querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentSessionTags = currentSessionTags.filter(t => t !== chip.dataset.tag);
      renderTagChips();
    });
  });
}

document.getElementById('btnExportCSV').addEventListener('click', () => {
  if (!currentSessionId) return;
  const url = sm.exportCSV(currentSessionId);
  if (url) downloadUrl(url, `wormtrace_${currentSessionId}.csv`);
});
document.getElementById('btnExportJSON').addEventListener('click', () => {
  if (!currentSessionId) return;
  const url = sm.exportJSON(currentSessionId);
  if (url) downloadUrl(url, `wormtrace_${currentSessionId}.json`);
});

function renderSessionList() {
  const el = document.getElementById('sessionList');
  const sessions = sm.getAll();
  if (!sessions.length) {
    el.innerHTML = '<div class="section-empty">No sessions saved yet.</div>';
    return;
  }
  el.innerHTML = sessions.map(s => {
    const d = new Date(s.updatedAt).toLocaleDateString();
    return `<div class="session-item">
      <div class="session-item-name">${escHtml(s.name)}</div>
      <div class="session-item-meta">${d} · ${s.videoName || 'no video'}</div>
      <div class="session-item-tags">${s.tags.map(t => `<span class="tag-chip">${t}</span>`).join('')}</div>
      <div class="session-item-actions">
        <button class="btn-secondary btn-sm" data-load="${s.id}">Load</button>
        <button class="btn-secondary btn-sm" data-csv="${s.id}">CSV</button>
        <button class="btn-secondary btn-sm" data-json="${s.id}">JSON</button>
        <button class="btn-danger btn-sm" data-del="${s.id}">Del</button>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-csv]').forEach(b => {
    b.addEventListener('click', () => {
      const url = sm.exportCSV(b.dataset.csv);
      if (url) downloadUrl(url, `wormtrace_${b.dataset.csv}.csv`);
    });
  });
  el.querySelectorAll('[data-json]').forEach(b => {
    b.addEventListener('click', () => {
      const url = sm.exportJSON(b.dataset.json);
      if (url) downloadUrl(url, `wormtrace_${b.dataset.json}.json`);
    });
  });
  el.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', () => {
      sm.delete(b.dataset.del);
      if (currentSessionId === b.dataset.del) currentSessionId = null;
      renderSessionList();
    });
  });
}

// ── Growth troubleshooter ─────────────────────────────────────────────────────
document.getElementById('btnAnalyzeGrowth').addEventListener('click', () => {
  const plateId = window._selectedPlateForTs;
  if (!plateId) return;
  const plate = pt.get(plateId);
  if (!plate) return;

  const hrs = pt.elapsedHours(plateId);
  if (hrs === null) {
    document.getElementById('growthTsPanel').innerHTML =
      '<div class="ts-issue warn"><div class="ts-issue-msg">Plate has not been inoculated yet. Click "Inoculate Plate" to start the timer.</div></div>';
    return;
  }

  const { stage: cur } = getCurrentStage(hrs, plate.strainId ?? plate.strain, plate.tempC);
  const obsCount = plate.observations.length;
  const stageOverride = plate.stageOverride;

  const el = document.getElementById('growthTsPanel');
  let html = `<div class="ts-issue ${stageOverride && stageOverride !== cur.id ? 'warn' : 'ok'}">
    <div style="font-weight:600;font-size:12px">Growth Analysis: ${plate.name}</div>
    <div class="ts-issue-msg">
      Expected stage: <strong>${cur.name}</strong> (${fmtHours(hrs)} elapsed at ${plate.tempC}°C)<br>
      ${stageOverride ? `Last observed stage: <strong>${stageOverride.toUpperCase()}</strong>` : 'No stage confirmed by observation yet.'}
    </div>`;

  if (stageOverride && stageOverride !== cur.id) {
    html += `<div class="ts-issue-msg" style="color:var(--warn);margin-top:4px">
      ⚠ Observed stage differs from expected. Possible causes:<br>
      • Temperature sensor inaccuracy — check actual incubator temp<br>
      • Plate started earlier/later than recorded<br>
      • Starvation (L1 arrest) or stress-induced dauer
    </div>`;
  } else if (!stageOverride) {
    html += `<div class="ts-issue-msg" style="color:var(--muted);margin-top:4px">
      Tip: Log an observation with the observed stage to enable deviation detection.
    </div>`;
  } else {
    html += `<div class="ts-issue-msg" style="color:var(--success);margin-top:4px">
      ✓ Observed stage matches expected. Growth appears on track.
    </div>`;
  }

  html += `<div class="ts-issue-msg" style="margin-top:4px;color:var(--muted)">
    ${obsCount} observation${obsCount !== 1 ? 's' : ''} logged.
  </div></div>`;

  // Temperature effect tip
  html += temperatureTip(plate.tempC);
  el.innerHTML = html;
});

function temperatureTip(tempC) {
  const tips = {
    10: '<div class="ts-issue info"><div class="ts-issue-msg">🧊 At 10°C development is ~3.3× slower than 20°C. Check plates daily at minimum. Dauer formation risk increases.</div></div>',
    15: '<div class="ts-issue info"><div class="ts-issue-msg">🌡 At 15°C development is ~1.6× slower than standard. Good for observing slow-progressing phenotypes.</div></div>',
    20: '<div class="ts-issue ok"><div class="ts-issue-msg">✓ 20°C is the standard lab temperature for N2. All life cycle times are at baseline.</div></div>',
    25: '<div class="ts-issue info"><div class="ts-issue-msg">🔥 At 25°C development is ~1.8× faster. Near the upper thermal limit for N2 — avoid prolonged exposure above 26°C.</div></div>',
  };
  return tips[tempC] ?? '';
}

// ── Life cycle reference panel ────────────────────────────────────────────────
let _lcTemp = 20, _lcStrain = 'N2';

function renderLifeCycleReference(tempC = _lcTemp, strainId = _lcStrain) {
  _lcTemp = tempC; _lcStrain = strainId;
  const stages = getStages(strainId, tempC);
  const el = document.getElementById('lcReference');
  const strain = STRAINS[strainId] ?? STRAINS.N2;

  // Update active state on buttons
  document.querySelectorAll('.lc-temp-btn').forEach(b => {
    b.classList.toggle('active', +b.dataset.t === tempC);
  });

  el.innerHTML = `
    ${stages.map(s => `
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;padding:8px;background:#0f172a;border-radius:6px;border-left:3px solid ${s.color}">
        <span style="font-size:18px;flex-shrink:0">${s.icon}</span>
        <div>
          <div style="font-size:12px;font-weight:600;color:${s.color}">${s.name}</div>
          <div style="font-size:10px;color:var(--muted)">${fmtHours(s.start)} – ${fmtHours(s.end)} (${fmtHours(s.duration)})</div>
          <div style="font-size:11px;color:var(--text);margin-top:2px">${s.description}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">${s.visibleSigns}</div>
          ${s.size ? `<div style="font-size:10px;color:#60a5fa;margin-top:2px">📏 ${s.size}</div>` : ''}
          ${s.isDauer ? `<div class="dauer-alert" style="margin-top:4px">Dauer is a survival stage — development resumes when conditions improve.</div>` : ''}
        </div>
      </div>
    `).join('')}
    <div style="font-size:10px;color:var(--muted);margin-top:4px;line-height:1.5">
      <strong style="color:var(--text)">${strain.label}</strong><br>
      Lifespan at 20°C: ${strain.lifespan20C}<br>
      ${strain.refs ? `Sources: ${strain.refs}<br>` : ''}
      Q10 embryo≈2.8, larval≈2.5 (Boyle et al. 2022)
    </div>
  `;
}

// ── Collapsible sections ──────────────────────────────────────────────────────
function initCollapsible(toggleId, bodyId, storageKey, defaultOpen = false) {
  const toggle = document.getElementById(toggleId);
  const body   = document.getElementById(bodyId);
  if (!toggle || !body) return;

  // Restore saved state; default to closed to save space
  const saved = localStorage.getItem(storageKey);
  const isOpen = saved !== null ? saved === 'true' : defaultOpen;
  if (isOpen) { toggle.classList.add('open'); body.classList.add('open'); }
  toggle.setAttribute('aria-expanded', String(isOpen));

  toggle.addEventListener('click', () => {
    const nowOpen = toggle.classList.toggle('open');
    body.classList.toggle('open', nowOpen);
    toggle.setAttribute('aria-expanded', String(nowOpen));
    localStorage.setItem(storageKey, String(nowOpen));
  });
}

// ── Strain dropdowns ──────────────────────────────────────────────────────────
// Populate the strain <select>s from STRAINS so adding a strain in LifeCycle.js
// automatically appears everywhere (no more hand-maintained hardcoded <option>s).
function populateStrainSelects() {
  const entries = Object.values(STRAINS);
  const plateSel = document.getElementById('plateStrainSelect');
  if (plateSel) {
    const prev = plateSel.value;
    // Full labels; 'custom' kept last (its own definition already sorts after the rest).
    plateSel.innerHTML = entries
      .map(s => `<option value="${s.id}">${s.label}</option>`).join('');
    if ([...plateSel.options].some(o => o.value === prev)) plateSel.value = prev;
  }
  const lcSel = document.getElementById('lcStrainSelect');
  if (lcSel) {
    const prev = lcSel.value;
    // Reference view: short ids, exclude the user-defined 'custom' (no reference data).
    lcSel.innerHTML = entries.filter(s => s.id !== 'custom')
      .map(s => `<option value="${s.id}">${s.id}</option>`).join('');
    if ([...lcSel.options].some(o => o.value === prev)) lcSel.value = prev;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
window._wtPopulateStrainSelects = populateStrainSelects;   // let collection-added strains refresh the dropdowns
populateStrainSelects();
initPlateUI();
// Initial render of the plate list + detail. Without this, returning users
// (welcome screen suppressed) land on an empty list with no "View Plate" buttons —
// the 1-second live loop only patches existing cards, it never builds them.
renderPlateList();
renderPlateDetail();
// Show welcome screen on first visit
checkWelcome();
renderLifeCycleReference(20, 'N2');

// Collapsible: Life Cycle Reference (closed by default)
initCollapsible('lcRefToggle', 'lcRefBody', 'wt_lc_open', false);

// Collapsible: Growth Troubleshooter (closed by default)
initCollapsible('tsRefToggle', 'tsRefBody', 'wt_ts_open', false);

// Wire up life cycle reference temp buttons and strain selector
document.querySelectorAll('.lc-temp-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    renderLifeCycleReference(+btn.dataset.t, _lcStrain);
  });
});
document.getElementById('lcStrainSelect').addEventListener('change', e => {
  renderLifeCycleReference(_lcTemp, e.target.value);
});

// Wire up tab switch to re-render LC reference
document.querySelector('[data-tab="plateTab"]').addEventListener('click', () => {
  renderLifeCycleReference(_lcTemp, _lcStrain);
});

// Wire up plate selection for growth TS
document.getElementById('plateList').addEventListener('click', () => {
  setTimeout(() => {
    const sel = document.querySelector('.plate-item.selected');
    if (sel) {
      window._selectedPlateForTs = sel.dataset.pid;
      document.getElementById('btnAnalyzeGrowth').disabled = false;
    }
  }, 50);
});

// ── Compare plates ────────────────────────────────────────────────────────────
document.getElementById('btnComparePlates').addEventListener('click', () => {
  openCompareModal([...pt.getAll(), ...pt.getBin()], pt);
});

// ── View Plate button (mobile: navigate to plate detail) ──────────────────────
document.getElementById('btnViewPlate').addEventListener('click', () => {
  if (window._mobileOnPlateSelected) window._mobileOnPlateSelected();
  else if (window._selectedPlateForTs) {
    document.querySelector('[data-ppanel="platePanelDetail"]')?.click();
  }
});

// ── Multi-plate export bar ────────────────────────────────────────────────────
document.getElementById('btnExportSelected').addEventListener('click', () => {
  const ids = [...selectedPlateIds];
  if (!ids.length) return;
  em.exportMultiplePlates(ids);
  // Show feedback prompt after export
  setTimeout(() => showFeedback('plate_export'), 800);
});

document.getElementById('btnDeselectAll').addEventListener('click', () => {
  selectedPlateIds.clear();
  renderMultiSelectBar();
  renderPlateList();
});

document.getElementById('btnSelectAll').addEventListener('click', () => {
  pt.getAll().forEach(p => selectedPlateIds.add(p.id));
  renderMultiSelectBar();
  renderPlateList();
});

// ── Real-world data upload ────────────────────────────────────────────────────
document.getElementById('realDataInput').addEventListener('change', e => {
  const file  = e.target.files[0];
  const pid   = window._selectedPlateForTs || document.querySelector('.plate-item.selected')?.dataset?.pid;
  if (!file || !pid) { alert('Select a plate first, then upload data.'); return; }

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const points = RealWorldData.import(pid, ev.target.result, file.name);
      renderRealDataSection(pid);
      renderMLPanel();
      showFlash2(`Imported ${points.length} data points for the selected plate.`);
    } catch(err) {
      alert('Import error: ' + err.message + '\n\nDownload the template CSV to see the expected format.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btnDownloadTemplate').addEventListener('click', () => {
  RealWorldData.downloadTemplate();
});

// ── ML panel ─────────────────────────────────────────────────────────────────
document.getElementById('btnTrainML').addEventListener('click', () => {
  const allPlates = [...pt.getAll(), ...pt.getBin()];
  const result = ml.train(allPlates);
  renderMLPanel();
  document.getElementById('mlTrainResult').textContent = result.summary;
  document.getElementById('mlTrainResult').style.color = result.totalPoints > 0 ? 'var(--success)' : 'var(--warn)';
});

document.getElementById('btnExportDataset').addEventListener('click', () => {
  const n = em.exportTrainingDataset('all');
  showFlash2(`Exported ML dataset with ${n} rows.`);
});

document.getElementById('btnExportContribution').addEventListener('click', () => {
  const n = em.exportContribution('all');
  showFlash2(`Exported contribution package (${n} plate${n!==1?'s':''} with real data).`);
});

document.getElementById('btnImportCommunity').addEventListener('click', () => {
  document.getElementById('communityModelInput').click();
});

document.getElementById('communityModelInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const result = ml.importCommunityPackage(ev.target.result);
      renderMLPanel();
      showFlash2(`Merged ${result.merged} correction factors from community model.`);
    } catch(err) { alert('Import failed: ' + err.message); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btnResetML').addEventListener('click', () => {
  if (!confirm('Reset all learned correction factors? This cannot be undone.')) return;
  ml.resetCorrections();
  renderMLPanel();
  showFlash2('ML corrections reset to baseline.');
});

// ── Real data recording form ──────────────────────────────────────────────────
function renderRealDataSection(plateId) {
  const el = document.getElementById('realDataSection');
  if (!plateId) {
    el.innerHTML = '<div class="section-empty">Select a plate to record observations.</div>';
    return;
  }

  const plate    = pt.get(plateId);
  const realData = RealWorldData.get(plateId) ?? [];
  const hasData  = realData.length > 0;
  const currentHrs = pt.elapsedHoursAny?.(plateId) ?? pt.elapsedHours?.(plateId) ?? 0;
  const stages   = plate ? getStages(plate.strainId, plate.tempC) : [];
  const { stage: curStage } = plate
    ? getCurrentStage(currentHrs || 0, plate.strainId, plate.tempC)
    : { stage: { id: 'egg', name: 'Egg' } };

  const stageOptions = [
    ['', '— select —'],
    ['egg','🥚 Egg / Embryo'],['l1','🐛 L1 Larva'],['l2','🐛 L2 Larva'],
    ['l3','🐛 L3 Larva'],['l4','🐛 L4 Larva'],['young_adult','🦠 Young Adult'],
    ['adult','🦠 Reproductive Adult'],['dauer','⏸ Dauer Larva'],
  ].map(([v,l]) => `<option value="${v}"${v===curStage.id?' selected':''}>${l}</option>`).join('');

  const motilityOptions = [
    ['','— select —'],['active','Active (forward)'],['reduced','Reduced'],
    ['omega_turns','Omega turns'],['backward','Backward'],['sluggish','Sluggish'],['static','Static / paralyzed'],
  ].map(([v,l]) => `<option value="${v}">${l}</option>`).join('');

  el.innerHTML = `
    <!-- ── Status bar ── -->
    <div class="rwd-status-bar">
      ${hasData
        ? `<span class="tag active">✓ ${realData.length} point${realData.length!==1?'s':''} recorded</span>`
        : `<span class="tag rwd-warn">⚠ No data yet</span>`}
      <button class="btn-secondary btn-sm rwd-btn" id="btnUploadReal" style="width:auto">⬆ Import CSV</button>
      ${hasData ? `<button class="btn-secondary btn-sm rwd-btn" id="btnShowChart" style="width:auto">📊 Chart</button>` : ''}
      ${hasData ? `<button class="btn-danger btn-sm rwd-btn" id="btnClearReal" style="width:auto">✕</button>` : ''}
    </div>

    <!-- ── Comparison chart (collapsible) ── -->
    <div id="comparisonChartWrap" class="hidden" style="margin-bottom:6px">
      <canvas id="comparisonChart" style="width:100%;border-radius:6px;display:block"></canvas>
    </div>

    <!-- ── Data entry form ── -->
    <div class="rwd-form">
      <div class="rwd-form-title">Record Observation</div>

      <!-- Time row with auto-fill -->
      <div class="rwd-row-wide">
        <label class="rwd-label">Time <span class="rwd-req">*</span></label>
        <div style="display:flex;gap:4px;align-items:center">
          <input type="number" id="rdTime" class="rwd-input" step="0.1" min="0"
            value="${currentHrs ? currentHrs.toFixed(2) : ''}" placeholder="hours">
          <span class="rwd-unit">h</span>
          <button class="btn-secondary btn-sm rwd-btn" id="btnUseNow" style="width:auto;font-size:10px" title="Use current plate elapsed time">⏱ Now</button>
        </div>
      </div>

      <!-- Stage -->
      <div class="rwd-row-wide">
        <label class="rwd-label">Stage <span class="rwd-req">*</span></label>
        <select id="rdStage" class="rwd-input">${stageOptions}</select>
      </div>

      <!-- 2-column grid for numeric fields -->
      <div class="rwd-grid">
        <div class="rwd-field">
          <label class="rwd-label">Body length</label>
          <div class="rwd-input-unit"><input type="number" id="rdLength" class="rwd-input" min="0" step="1" placeholder="e.g. 250"><span class="rwd-unit">μm</span></div>
        </div>
        <div class="rwd-field">
          <label class="rwd-label">Body width</label>
          <div class="rwd-input-unit"><input type="number" id="rdWidth" class="rwd-input" min="0" step="1" placeholder="optional"><span class="rwd-unit">μm</span></div>
        </div>
        <div class="rwd-field">
          <label class="rwd-label">Eggs counted</label>
          <div class="rwd-input-unit"><input type="number" id="rdEggs" class="rwd-input" min="0" step="1" placeholder="0"></div>
        </div>
        <div class="rwd-field">
          <label class="rwd-label">Food estimate</label>
          <div class="rwd-input-unit"><input type="number" id="rdFood" class="rwd-input" min="0" max="100" step="1" placeholder="e.g. 80"><span class="rwd-unit">%</span></div>
        </div>
        <div class="rwd-field">
          <label class="rwd-label">Worms / field</label>
          <div class="rwd-input-unit"><input type="number" id="rdDensity" class="rwd-input" min="0" step="1" placeholder="count"></div>
        </div>
        <div class="rwd-field">
          <label class="rwd-label">Actual temp</label>
          <div class="rwd-input-unit"><input type="number" id="rdTemp" class="rwd-input" min="0" max="37" step="0.1" placeholder="${plate?.tempC??20}"><span class="rwd-unit">°C</span></div>
        </div>
      </div>

      <!-- Motility -->
      <div class="rwd-row-wide">
        <label class="rwd-label">Motility</label>
        <select id="rdMotility" class="rwd-input">${motilityOptions}</select>
      </div>

      <!-- Fluorescence -->
      <div class="rwd-row-wide">
        <label class="rwd-label">Fluorescence</label>
        <input type="text" id="rdFluor" class="rwd-input" placeholder="e.g. GFP+, RFP signal weak (optional)">
      </div>

      <!-- Notes -->
      <div class="rwd-row-wide">
        <label class="rwd-label">Notes</label>
        <input type="text" id="rdNotes" class="rwd-input" placeholder="Anything notable about this observation">
      </div>

      <button class="btn-primary" id="btnAddDataPoint" style="margin-top:4px">+ Record Observation</button>
    </div>

    <!-- ── Recorded data table ── -->
    ${hasData ? `
    <div class="rwd-table-wrap">
      <div class="rwd-form-title" style="margin-bottom:6px">
        Recorded Data
        <span style="color:var(--muted);font-weight:400;font-size:10px">  ${realData.length} point${realData.length!==1?'s':''}</span>
      </div>
      <div class="rwd-table-scroll">
        <table class="rwd-table">
          <thead><tr>
            <th>Time</th><th>Stage</th><th>Length</th><th>Eggs</th>
            <th>Food</th><th>Motility</th><th>Notes</th><th></th>
          </tr></thead>
          <tbody>
            ${[...realData].reverse().map(p => `
              <tr class="${p.stage_observed === curStage.id ? 'rwd-row-current' : ''}">
                <td class="rwd-mono">${p.time_hours.toFixed(1)}h</td>
                <td>${p.stage_observed||'—'}</td>
                <td>${p.worm_length_um ? p.worm_length_um+'μm' : '—'}</td>
                <td>${p.eggs_counted ?? '—'}</td>
                <td>${p.food_pct != null ? p.food_pct+'%' : '—'}</td>
                <td>${p.motility||'—'}</td>
                <td class="rwd-notes">${escHtml(p.notes||'')}</td>
                <td><button class="rwd-del-btn" data-del="${p.id}" title="Delete">✕</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
  `;

  // ── Wire up events ──────────────────────────────────────────────────────────

  // Auto-fill current time
  el.querySelector('#btnUseNow')?.addEventListener('click', () => {
    const hrs = pt.elapsedHoursAny?.(plateId) ?? pt.elapsedHours?.(plateId) ?? 0;
    document.getElementById('rdTime').value = (hrs || 0).toFixed(2);
  });

  // Add data point
  el.querySelector('#btnAddDataPoint')?.addEventListener('click', () => {
    const time = parseFloat(document.getElementById('rdTime').value);
    const stage = document.getElementById('rdStage').value;
    if (isNaN(time) || time < 0) { showFlash2('Please enter a valid time in hours.'); return; }
    if (!stage) { showFlash2('Please select the observed developmental stage.'); return; }

    RealWorldData.addPoint(plateId, {
      time_hours:         time,
      stage_observed:     stage,
      worm_length_um:     document.getElementById('rdLength').value,
      worm_width_um:      document.getElementById('rdWidth').value,
      eggs_counted:       document.getElementById('rdEggs').value,
      food_pct:           document.getElementById('rdFood').value,
      motility:           document.getElementById('rdMotility').value,
      population_density: document.getElementById('rdDensity').value,
      actual_temp_c:      document.getElementById('rdTemp').value,
      fluorescence:       document.getElementById('rdFluor').value,
      notes:              document.getElementById('rdNotes').value,
    });

    // Clear form (keep time + stage for rapid multi-entry)
    ['rdLength','rdWidth','rdEggs','rdFood','rdDensity','rdTemp','rdFluor','rdNotes']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    renderRealDataSection(plateId);
    renderMLPanel();
    showFlash2('Observation recorded ✓');
  });

  // Enter key on notes field → add
  el.querySelector('#rdNotes')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') el.querySelector('#btnAddDataPoint')?.click();
  });

  // Import CSV
  el.querySelector('#btnUploadReal')?.addEventListener('click', () => {
    window._selectedPlateForTs = plateId;
    document.getElementById('realDataInput').click();
  });

  // Clear all
  el.querySelector('#btnClearReal')?.addEventListener('click', () => {
    if (!confirm(`Delete all ${realData.length} recorded data points for this plate?`)) return;
    RealWorldData.delete(plateId);
    renderRealDataSection(plateId);
    renderMLPanel();
  });

  // Delete individual point
  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      RealWorldData.deletePoint(plateId, btn.dataset.del);
      renderRealDataSection(plateId);
      renderMLPanel();
    });
  });

  // Toggle comparison chart
  el.querySelector('#btnShowChart')?.addEventListener('click', () => {
    const wrap = document.getElementById('comparisonChartWrap');
    wrap.classList.toggle('hidden');
    if (!wrap.classList.contains('hidden') && plate) {
      const canvas = document.getElementById('comparisonChart');
      canvas.width  = wrap.clientWidth || 260;
      canvas.height = 180;
      drawComparisonChart(canvas, stages, realData, currentHrs || 0);
    }
  });
}

function renderMLPanel() {
  const el   = document.getElementById('mlStatusPanel');
  const corr = ml.getCorrections();
  const keys = Object.keys(corr);

  if (!keys.length) {
    el.innerHTML = `<div style="font-size:11px;color:var(--muted)">
      No corrections learned yet. Upload real-world data to plates, then click "Train".
    </div>`;
    return;
  }

  el.innerHTML = keys.map(key => {
    const [strain, temp] = key.split(':');
    const stages = corr[key];
    const rows = Object.entries(stages).map(([sid, f]) => {
      const color = f > 1.1 ? '#f59e0b' : f < 0.9 ? '#60a5fa' : 'var(--success)';
      return `<div style="display:flex;justify-content:space-between;font-size:10px;padding:1px 0">
        <span style="color:var(--muted)">${sid}</span>
        <span style="color:${color};font-family:monospace">${f.toFixed(3)}×</span>
      </div>`;
    }).join('');
    return `<div style="background:#0f172a;border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:4px">
      <div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:4px">${strain} @ ${temp}°C</div>
      ${rows}
    </div>`;
  }).join('');
}

// Wire plate selection → real data section updates
document.getElementById('plateList').addEventListener('click', () => {
  setTimeout(() => {
    const sel = document.querySelector('.plate-item.selected');
    if (sel) renderRealDataSection(sel.dataset.pid);
  }, 80);
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function downloadUrl(url, filename) {
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showFlash(msg) {
  const el = document.getElementById('infoMsg');
  if (!el) return;
  el.textContent = msg; el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

function showFlash2(msg) {
  const el = document.getElementById('mlFlash');
  if (!el) return;
  el.textContent = msg; el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 4000);
}

// Expose sm for app.js to save tracking data
window._sessionManager = sm;
window._getCurrentSessionId = () => currentSessionId;
window._setCurrentSessionId = id => { currentSessionId = id; };
