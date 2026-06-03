/**
 * plateUI.js — Plate Tracker tab: stage selector, inoculate toggle,
 * biohazard bin, Excel export, canvas visualisation.
 */

import { PlateTracker, MAX_PLATE_DAYS } from './PlateTracker.js?v=76';
import { PlateCanvas }       from './PlateCanvas.js?v=76';
import { showToast, showConfirm } from './Toast.js?v=76';
import { showFeedback }      from './Feedback.js?v=76';
import {
  STRAINS, getStages, getCurrentStage, fmtHours, fmtElapsed, cumulativeFeedHours,
  STAGE_FOOD_FACTOR, DAUER, adultLifespanHours, adultLifespanDays,
} from './LifeCycle.js?v=76';

export const pt = new PlateTracker();

let selectedPlateId      = null;
let _pendingImageDataUrl = null;
let _canvas              = null;
let activeBinId          = 'all';   // 'all' = every plate; otherwise a bin id
let _dragPlateIds        = null;    // plate ids currently being dragged onto a bin

// ── Init ──────────────────────────────────────────────────────────────────────
export function initPlateUI() {
  // Canvas
  const canvasEl = document.getElementById('plateCanvas');
  _canvas = new PlateCanvas(canvasEl);
  _canvas.start();
  _canvas.renderEmpty();
  _canvas.enableZoom(document.getElementById('plateCanvasWrap'));

  function resizeCanvas() {
    const wrap = document.getElementById('plateCanvasWrap');
    const w = wrap.clientWidth || 300;
    const h = wrap.clientHeight || 260;
    const size = Math.max(40, Math.min(w - 24, h - 24, 320));
    if (canvasEl.width !== size || canvasEl.height !== size) {
      canvasEl.width = size; canvasEl.height = size;
    }
  }
  document.querySelector('[data-tab="plateTab"]')?.addEventListener('click', () => {
    setTimeout(() => { resizeCanvas(); updateCanvas(); }, 50);
  });
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { resizeCanvas(); updateCanvas(); })
      .observe(document.getElementById('plateCanvasWrap'));
  }
  window.addEventListener('resize', () => { resizeCanvas(); updateCanvas(); });

  // ── Plate controls ──────────────────────────────────────────────────────────
  document.getElementById('btnAddPlate').addEventListener('click', () => {
    const count = pt.getAll().length + 1;
    const plate = pt.addPlate({ name: `Plate ${count}`, strainId: 'N2', tempC: 20 });
    if (activeBinId !== 'all') pt.setPlateBin(plate.id, activeBinId);   // add into the active bin
    selectedPlateId = plate.id;
    window._selectedPlateForTs = selectedPlateId;
    renderPlateList(); renderBinBadge(); renderPlateDetail();
  });

  // ── Move-to-bin (multi-select) ───────────────────────────────────────────────
  document.getElementById('moveToBinSelect')?.addEventListener('change', async e => {
    const val = e.target.value; e.target.value = '';
    const ids = window._getSelectedIds?.() || [];
    if (!val || !ids.length) return;
    let binId = val === '__none__' ? null : val;
    if (val === '__new__') {
      const name = await _textPrompt('New bin name', `Bin ${pt.getBins().length + 1}`);
      if (name === null) return;
      binId = pt.addBin(name.trim() || `Bin ${pt.getBins().length + 1}`).id;
    }
    for (const id of ids) pt.setPlateBin(id, binId);
    window._clearSelection?.();
    renderBinBar(); renderPlateList();
  });

  // ── Bridge: build a plate from a Worm Counter photo (called by countApp.js) ──
  // The labels ARE life-stages now, so each labelled stage becomes its own cohort
  // (one group of worms per stage) on the plate, preserving exactly what was marked.
  // The plate is auto-inoculated at the dominant stage so the cohorts run immediately
  // and the chosen stage persists (defaults to N2/20 °C — change after if needed).
  window.WormTraceAddPlateFromCounter = ({ counts = {}, imageDataUrl, sourceName, binId = null } = {}) => {
    const STAGE_KEYS = ['egg', 'l1', 'l2', 'l3', 'l4', 'adult'];   // dead → note only
    const stageCounts = STAGE_KEYS.map(id => ({ id, count: counts[id] || 0 })).filter(s => s.count > 0);
    const living = ['l1', 'l2', 'l3', 'l4', 'adult'].reduce((s, k) => s + (counts[k] || 0), 0);
    const n = pt.getAll().length + 1;
    const name = sourceName ? sourceName.replace(/\.[^.]+$/, '').slice(0, 40) : `Plate ${n}`;
    const plate = pt.addPlate({ name, strainId: 'N2', tempC: 20 });
    const bin = binId ?? (activeBinId !== 'all' ? activeBinId : null);
    if (bin) pt.setPlateBin(plate.id, bin);   // drop into the active bin
    const stages = getStages('N2', 20);
    const startHr = id => (stages.find(s => s.id === id) || { start: 0 }).start;
    // Dominant labelled stage = the plate's headline starting stage.
    const dom = stageCounts.slice().sort((a, b) => b.count - a.count)[0]?.id || 'egg';
    if (stageCounts.length) {
      // Inoculate at the dominant stage; its count becomes the base cohort
      // (materialised lazily by _ensureCohorts), then add a cohort per other stage.
      const domCount = counts[dom] || 0;
      pt.inoculate(plate.id, dom, startHr(dom));
      pt.update(plate.id, { wormCount: domCount });
      for (const s of stageCounts) if (s.id !== dom) pt.addCohort(plate.id, s.count, s.id, startHr(s.id));
    } else {
      pt.update(plate.id, { startingStageId: 'egg' });
    }
    const breakdown = STAGE_KEYS.filter(k => counts[k]).map(k => `${k.toUpperCase()} ${counts[k]}`)
      .concat(counts.dead ? [`dead ${counts.dead}`] : []).join(', ');
    pt.update(plate.id, { startingStageId: dom, notes: `From Worm Counter photo — ${breakdown || 'no marks'}` });
    // Attach the photo as an observation. NO stageId — that would set stageOverride
    // and pin the displayed stage, freezing the timeline.
    if (imageDataUrl) pt.addObservation(plate.id, { note: `Worm Counter source photo — ${breakdown}`, imageDataUrl });
    selectedPlateId = plate.id;
    window._selectedPlateForTs = selectedPlateId;
    renderPlateList(); renderBinBadge(); renderPlateDetail();
    return { id: plate.id, worms: living, cohorts: stageCounts.length, startStage: dom };
  };

  document.getElementById('plateStrainSelect').addEventListener('change', e => {
    if (!selectedPlateId) return;
    const sid = e.target.value;
    document.getElementById('customStrainWrap').classList.toggle('hidden', sid !== 'custom');
    pt.update(selectedPlateId, { strainId: sid });
    populateStartingStageSelect();
    renderStrainInfo(); renderPlateDetail(); renderPlateList(); updateCanvas();
  });

  document.getElementById('customStrainName').addEventListener('input', e => {
    if (!selectedPlateId) return;
    pt.update(selectedPlateId, { name: e.target.value || 'Custom' });
    renderPlateList();
  });

  document.getElementById('plateTempSelect').addEventListener('change', e => {
    if (!selectedPlateId) return;
    pt.update(selectedPlateId, { tempC: +e.target.value });
    populateStartingStageSelect();
    renderStrainInfo(); renderPlateDetail(); renderPlateList(); updateCanvas();
  });

  document.getElementById('plateNotesInput').addEventListener('input', e => {
    if (!selectedPlateId) return;
    pt.update(selectedPlateId, { notes: e.target.value });
  });

  // ── Worm count ──────────────────────────────────────────────────────────────
  document.getElementById('btnWormMinus').addEventListener('click', () => {
    if (!selectedPlateId) return;
    const p = pt.get(selectedPlateId);
    if (!p || p.wormCount <= 1) return;
    pt.update(selectedPlateId, { wormCount: p.wormCount - 1 });
    document.getElementById('wormCountInput').value = p.wormCount - 1;
    updateFoodDisplay(); updateCanvas();
  });
  document.getElementById('btnWormPlus').addEventListener('click', () => {
    if (!selectedPlateId) return;
    const p = pt.get(selectedPlateId);
    if (!p) return;
    const next = (p.wormCount ?? 1) + 1;
    pt.update(selectedPlateId, { wormCount: next });
    document.getElementById('wormCountInput').value = next;
    updateFoodDisplay(); updateCanvas();
  });
  document.getElementById('wormCountInput').addEventListener('change', e => {
    if (!selectedPlateId) return;
    const n = Math.max(1, Math.min(9999, parseInt(e.target.value) || 1));
    pt.update(selectedPlateId, { wormCount: n });
    e.target.value = n;
    updateFoodDisplay(); updateCanvas();
  });

  // ── Food ────────────────────────────────────────────────────────────────────
  document.getElementById('foodVolumeSlider').addEventListener('input', e => {
    if (!selectedPlateId) return;
    const ml = Math.round(+e.target.value * 100) / 100;
    document.getElementById('foodVolumeVal').textContent = `${ml.toFixed(2)} ml`;
    pt.update(selectedPlateId, { initialFood: ml });
    updateFoodDisplay(); updateCanvas();
  });
  document.getElementById('consumptionSelect').addEventListener('change', e => {
    if (!selectedPlateId) return;
    pt.update(selectedPlateId, { consumptionRate: e.target.value });
    updateFoodDisplay(); updateCanvas();
  });

  // ── Single toggle button: inoculate → discard ─────────────────────────────
  document.getElementById('btnMainAction').addEventListener('click', async () => {
    if (!selectedPlateId) {
      showToast('Select a plate from the list first', 'warn'); return;
    }
    const p = pt.get(selectedPlateId);
    if (!p) return;

    if (!p.inoculatedAt) {
      // ── Inoculate ──
      const stageId  = document.getElementById('startingStageSelect').value;
      const stages   = getStages(p.strainId, p.tempC);
      const stageDef = stages.find(s => s.id === stageId) ?? stages[0];
      pt.inoculate(selectedPlateId, stageId, stageDef.start);
      _setDiscardMode();
      renderTimerDisplay();
      renderTimeline(p);
      renderCurrentStageCard(p);
      updateFoodDisplay();
      renderEggSection();          // show egg tracker + laying countdown right away
      renderPlateList(); updateCanvas();
      showToast(`Inoculated! ${stageDef.name} stage · timer started`, 'success');
    } else {
      // ── Discard (with custom confirm dialog) ──
      const ok = await showConfirm(
        `Move "<strong>${escHtml(p.name)}</strong>" to the Biohazard Bin?<br><br>All data is preserved and can be restored at any time.`,
        '☣ Discard', 'Keep'
      );
      if (!ok) return;
      const binCount = pt.discardPlate(selectedPlateId);
      selectedPlateId = null;
      _canvas.renderEmpty();
      renderPlateList(); renderBinBadge(); renderPlateDetail();
      showToast('Plate moved to Biohazard Bin', 'info');
      if (binCount > 0 && binCount % 10 === 0) {
        const empty = await showConfirm(
          `Biohazard Bin has ${binCount} plates. Empty it permanently?`,
          '🗑 Empty Bin', 'Keep'
        );
        if (empty) { pt.emptyBin(); renderBinBadge(); }
      }
    }
  });

  // ── Restart timer ─────────────────────────────────────────────────────────
  document.getElementById('btnRestartTimer').addEventListener('click', async () => {
    if (!selectedPlateId) return;
    const ok = await showConfirm('Restart the inoculation timer? Egg counts will also be cleared.', '↺ Restart', 'Cancel');
    if (!ok) return;
    pt.resetInoculation(selectedPlateId);
    _setInoculateMode();
    renderPlateDetail(); renderPlateList(); updateCanvas();
  });

  // ── Biohazard bin drawer ────────────────────────────────────────────────────
  let _binInterval = null;

  function openBinDrawer() {
    document.getElementById('binDrawer').classList.add('open');
    renderBinList();
    _binInterval = setInterval(renderBinList, 1000);
  }
  function closeBinDrawer() {
    document.getElementById('binDrawer').classList.remove('open');
    clearInterval(_binInterval);
    _binInterval = null;
  }

  document.getElementById('btnOpenBin').addEventListener('click', () => {
    const isOpen = document.getElementById('binDrawer').classList.contains('open');
    isOpen ? closeBinDrawer() : openBinDrawer();
  });
  document.getElementById('btnCloseBin').addEventListener('click', closeBinDrawer);
  document.getElementById('btnEmptyBin').addEventListener('click', () => {
    const count = pt.getBinCount();
    if (!count) return;
    if (!confirm(`Permanently delete all ${count} plates from the Biohazard Bin? This cannot be undone.`)) return;
    pt.emptyBin();
    renderBinBadge();
    renderBinList();
  });

  // ── Egg count ───────────────────────────────────────────────────────────────
  document.getElementById('btnEggMinus').addEventListener('click', () => {
    if (!selectedPlateId) return;
    pt.adjustLastEggCount(selectedPlateId, -1);
    renderEggSection(); renderPlateList(); updateCanvas();
  });
  document.getElementById('btnEggPlus').addEventListener('click', () => {
    if (!selectedPlateId) return;
    pt.addEggCount(selectedPlateId, 1);
    renderEggSection(); renderPlateList(); updateCanvas();
  });
  document.getElementById('btnEggLog').addEventListener('click', () => {
    const val = parseInt(document.getElementById('eggManualInput').value, 10);
    if (isNaN(val) || val < 0) return;
    pt.addEggCount(selectedPlateId, val);
    document.getElementById('eggManualInput').value = '';
    renderEggSection(); renderPlateList(); updateCanvas();
  });

  // ── Save as Excel ───────────────────────────────────────────────────────────
  document.getElementById('btnSavePlateExcel').addEventListener('click', () => {
    if (!selectedPlateId) { showToast('Select a plate first', 'warn'); return; }
    exportPlateToExcel(selectedPlateId);
    setTimeout(() => showFeedback('single_plate_export'), 800);
  });

  // ── Observations ────────────────────────────────────────────────────────────
  document.getElementById('btnAddObservation').addEventListener('click', addObservation);
  document.getElementById('obsImageInput').addEventListener('change', handleObsImage);

  // ── Canvas collapse/expand toggle arrow ─────────────────────────────────────
  document.getElementById('canvasToggleArrow')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const wrap = document.getElementById('plateCanvasWrap');
    const collapsed = wrap.classList.toggle('canvas-collapsed');
    _syncToggleLabel(collapsed);
    if (!collapsed) setTimeout(() => _resizeAndRender(), 360);
  });

  // Auto-collapse canvas when scrolling form down
  document.getElementById('plateDetail')?.addEventListener('scroll', e => {
    const wrap = document.getElementById('plateCanvasWrap');
    if (!wrap) return;
    const collapsed = e.target.scrollTop > 60;
    if (wrap.classList.contains('canvas-collapsed') !== collapsed) {
      wrap.classList.toggle('canvas-collapsed', collapsed);
      _syncToggleLabel(collapsed);
    }
  });

  // Tapping the collapsed canvas strip expands it
  document.getElementById('plateCanvasWrap')?.addEventListener('click', () => {
    const wrap = document.getElementById('plateCanvasWrap');
    if (wrap.classList.contains('canvas-collapsed')) {
      wrap.classList.remove('canvas-collapsed');
      _syncToggleLabel(false);
      setTimeout(() => _resizeAndRender(), 360);
    }
  });

  // ── Add Worms (after inoculation, any stage) ────────────────────────────────
  document.getElementById('btnAddWorms')?.addEventListener('click', () => {
    if (selectedPlateId) showAddWormsModal(selectedPlateId);
  });

  // ── Transfer Worms ──────────────────────────────────────────────────────────
  document.getElementById('btnTransferWorms')?.addEventListener('click', () => {
    if (selectedPlateId) showTransferModal(selectedPlateId);
  });

  // ── Life stages info button ─────────────────────────────────────────────────
  document.getElementById('btnStagesInfo')?.addEventListener('click', () => {
    showStagesInfoModal(selectedPlateId);
  });

  // ── Back button (mobile) ──────────────────────────────────────────────────────
  document.getElementById('btnPlateBack')?.addEventListener('click', () => {
    // Navigate back to plate list
    const ppanelBtn = document.querySelector('[data-ppanel="platePanelList"]');
    if (ppanelBtn) ppanelBtn.click();
    else if (window._showPlatePanelFn) window._showPlatePanelFn('platePanelList');
  });

  // Status button → show status modal
  document.getElementById('btnPlateStatus')?.addEventListener('click', () => {
    if (selectedPlateId) showPlateStatusModal(selectedPlateId);
  });

  // ── 1-second live loop ──────────────────────────────────────────────────────
  // Update the selected plate's detail every second, and ONLY the live text in
  // the plate list (elapsed / food %) — avoids a full DOM rebuild + flicker.
  setInterval(() => {
    if (selectedPlateId) { renderTimerDisplay(); updateFoodDisplay(); updateCanvas(); renderEggSection(); }
    updatePlateListLive();
    _checkContamination();
  }, 1000);

  renderBinBadge();
}

/** Real-time 28-day check: prompt to bin a plate that's likely contaminated. */
let _contaminationBusy = false;
async function _checkContamination() {
  if (_contaminationBusy) return;
  for (const plate of pt.getAll()) {
    if (!plate.inoculatedAt || plate.contaminationPrompted) continue;
    const days = pt.elapsedSinceInoculation(plate.id) / 24;
    if (days >= MAX_PLATE_DAYS) {
      plate.contaminationPrompted = true;          // ask only once per plate
      pt.update(plate.id, { contaminationPrompted: true });
      _contaminationBusy = true;
      const ok = await showConfirm(
        `⚠ <strong>${escHtml(plate.name)}</strong> has been running for ${Math.floor(days)} days.<br><br>` +
        `After ~${MAX_PLATE_DAYS} days a plate is very likely <strong>contaminated</strong> (mold, other bacteria, starved/dead worms).<br><br>` +
        `Move it to the Biohazard Bin?`,
        '☣ Move to Bin', 'Keep'
      );
      if (ok) {
        const binCount = pt.discardPlate(plate.id);
        if (selectedPlateId === plate.id) { selectedPlateId = null; _canvas.renderEmpty(); }
        renderPlateList(); renderBinBadge(); renderPlateDetail();
        showToast('Plate moved to Biohazard Bin (28-day limit)', 'info');
      }
      _contaminationBusy = false;
      break;  // one prompt at a time
    }
  }
}

/** Lightweight per-second update of the plate list — patches elapsed time and
 *  food % text in place instead of rebuilding the whole list (no flicker). */
function updatePlateListLive() {
  const list = document.getElementById('plateList');
  if (!list) return;
  for (const plate of pt.getAll()) {
    const hrs = pt.elapsedHours(plate.id);
    const elEl = list.querySelector(`[data-elapsed="${plate.id}"]`);
    if (elEl) elEl.textContent = hrs !== null ? fmtElapsed(pt.elapsedMs(plate.id)) : 'Not started';
    const fEl = list.querySelector(`[data-foodpct="${plate.id}"]`);
    if (fEl) fEl.textContent = `${Math.round(pt.foodPercent(plate.id))}%`;
  }
}

// ── Canvas ────────────────────────────────────────────────────────────────────
/** Force the canvas to its correct pixel size, then re-render. Fixes the
 *  "stage only shows correctly after zoom" bug caused by stale canvas size. */
function _syncToggleLabel(collapsed) {
  const icon = document.getElementById('canvasToggleIcon');
  const lbl  = document.getElementById('canvasToggleLabel');
  if (icon) icon.textContent = collapsed ? '▼' : '▲';
  if (lbl)  lbl.textContent  = collapsed ? 'Show plate view' : 'Hide plate view';
}

/** Total eggs = auto-laid (simulated, adult worms) + manually logged. */
function effectiveEggs(plate) {
  if (!plate?.inoculatedAt) return 0;
  const hrs = pt.elapsedHours(plate.id) ?? 0;
  const stages = getStages(plate.strainId, plate.tempC);
  const adultStage = stages.find(s => s.id === 'adult') ?? stages[stages.length - 1];
  const maxEggs = (STRAINS[plate.strainId] ?? STRAINS.N2).maxEggs;
  // Egg-laying stops when food runs out
  const pop = computePopulation(plate, hrs);
  const layHrs = Math.min(hrs, pop.foodOutHrs);
  const laying = pt.eggLayingInfo(adultStage.start, layHrs, maxEggs, plate.wormCount ?? 1);
  return laying.predicted + pt.totalEggs(plate.id);
}

/**
 * Can this strain form dauer? Driven by the verified Daf classification in STRAINS:
 *  • 'daf-d' (daf-16, daf-3, daf-5) — Dauer-DEFECTIVE: DAF-16/FOXO is required for the
 *    dauer program, and DAF-3/DAF-5 are required in the TGF-β branch. These CANNOT
 *    form dauer and die under prolonged starvation instead.
 *  • 'wild' and 'daf-c' — form dauer under stress (daf-c constitutively; wild facultatively).
 *  (Gottlieb & Ruvkun 1994; WormBook dauer NBK535516; WormBook TGF-β signalling.)
 */
function canFormDauer(strainId) {
  return (STRAINS[strainId] ?? STRAINS.N2).dafClass !== 'daf-d';
}

/** Larvae commit to the dauer pathway during the late-L1 → L2d window (irreversible
 *  commitment at the L2d molt; Golden & Riddle 1984). Eggs hatch to L1 first; from
 *  L3 onward larvae & adults can no longer enter dauer and die under starvation.
 *  Window taken from DAUER.decisionStages. */
function stageCanEnterDauer(stageId) {
  return DAUER.decisionStages.includes(stageId);
}

/**
 * Population model with dauer + death (research-based, simplified).
 * Dauer biology: under starvation/crowding, larvae arrest as the stress-resistant
 * dauer larva (a modified L3) and can survive months without food. daf-16 mutants
 * cannot enter dauer and instead die during prolonged starvation (L1 arrest survival
 * is roughly 1–2 weeks). Returns counts at the given developmental hour.
 */
function computePopulation(plate, hrs) {
  const wormCount = plate.wormCount ?? 1;
  const initFood  = plate.initialFood ?? 0.5;
  const adultRate = PlateTracker.CONSUMPTION_ML_PER_HR?.[plate.consumptionRate ?? 'standard'] ?? 0.0001;
  const strainId  = plate.strainId, tempC = plate.tempC;

  // Stage-aware food-out: find the developmental hour where cumulative feeding
  // exhausts the food. cumulativeFeedHours is monotonic → simple scan.
  const targetFeed = initFood / (wormCount * adultRate);   // adult-equiv feed-hours available
  let foodOutHrs = Infinity;
  if (isFinite(targetFeed)) {
    for (let h = 0; h <= 40 * 24; h += 2) {
      if (cumulativeFeedHours(strainId, tempC, h) >= targetFeed) { foodOutHrs = h; break; }
    }
  }

  const { stage } = getCurrentStage(hrs, strainId, tempC);
  let alive = wormCount, dauer = 0, dead = 0, displayStageId = stage.id, note = '';

  if (hrs >= foodOutHrs) {
    const starvedHrs = hrs - foodOutHrs;
    // Fate fixed by the stage the worms were in WHEN food ran out (dauers freeze).
    const stageOut = getCurrentStage(foodOutHrs, strainId, tempC).stage;
    // Could these worms still commit to dauer when food ran out? (late-L1 → L2d window)
    const inDauerWindow = stageCanEnterDauer(stageOut.id) || stageOut.id === 'egg';
    if (inDauerWindow && canFormDauer(strainId)) {
      dauer = wormCount; alive = 0; displayStageId = 'dauer';
      note = '🍽 Food exhausted in the L1/L2d window → worms entered DAUER (stress-resistant arrest). They survive months until food returns.';
    } else {
      // Dauer-defective or past the decision window → starve. L1-arrest survives
      // ~1–2 weeks (DAUER.l1ArrestSurvivalHrs); older larvae/adults die sooner.
      const SURVIVAL = inDauerWindow ? DAUER.l1ArrestSurvivalHrs : 96;
      if (starvedHrs >= SURVIVAL) { dead = wormCount; alive = 0;
        note = inDauerWindow
          ? `☠ Food gone at L1/L2d & cannot form dauer (${strainId}, Daf-defective) → worms DIED of starvation.`
          : '☠ Food exhausted past the L2d window → worms can\'t form dauer and DIED of starvation.';
      } else {
        note = `⚠ Food exhausted (${stageOut.name}) — can't form dauer, dying in ~${fmtHours(SURVIVAL - starvedHrs)}.`;
      }
    }
  }
  return { alive, dauer, dead, displayStageId, foodOutHrs, note };
}

function _resizeAndRender(retries = 5) {
  const canvasEl = document.getElementById('plateCanvas');
  const wrap = document.getElementById('plateCanvasWrap');
  if (!canvasEl || !wrap) return;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  // If the panel hasn't laid out yet (0 size), retry on the next frame
  if ((w < 20 || h < 20) && retries > 0) {
    requestAnimationFrame(() => _resizeAndRender(retries - 1));
    return;
  }
  const size = Math.max(40, Math.min((w || 300) - 24, (h || 260) - 24, 320));
  if (size > 0 && (canvasEl.width !== size || canvasEl.height !== size)) {
    canvasEl.width = size;
    canvasEl.height = size;
  }
  updateCanvas();
}

function updateCanvas() {
  if (!_canvas) return;
  if (!selectedPlateId) { _canvas.renderEmpty(); return; }
  const plate = pt.get(selectedPlateId);
  if (!plate) { _canvas.renderEmpty(); return; }
  const hrs       = pt.elapsedHours(selectedPlateId) ?? 0;
  const sinceInoc = pt.elapsedSinceInoculation(selectedPlateId) ?? 0;   // timeline clock
  let { stage }   = getCurrentStage(hrs, plate.strainId, plate.tempC);

  // Real plate uses the SAME precomputed timeline (cached), indexed by hours
  // since inoculation → eggs hatch, generations develop, adults die, dauer/death.
  const snap = timelineAt(getTimeline(plate), sinceInoc)
    ?? { population: [], alive: plate.wormCount ?? 1, dauer: 0, eggs: 0, byStage: {} };
  let domId = stage.id, domMax = -1;
  for (const [id, n] of Object.entries(snap.byStage ?? {})) if (n > domMax) { domMax = n; domId = id; }
  if (snap.alive === 0 && snap.dauer > 0) domId = 'dauer';
  stage = domId === 'dauer'
    ? { id: 'dauer', name: 'Dauer Larva', icon: '💤', color: '#94a3b8' }
    : (getStages(plate.strainId, plate.tempC).find(s => s.id === domId) ?? stage);

  _canvas.setState({
    plate, hrsElapsed: hrs, stage,
    foodPct: pt.foodPercent(selectedPlateId),
    wormCount: snap.alive,
    totalEggs: snap.eggs,
    population: snap.population,
    inoculatedAt: plate.inoculatedAt,
  });
  const badge = document.getElementById('wormCountBadgeVal');
  if (badge) badge.textContent = snap.alive + snap.dauer;

  // Update back bar title
  const backTitle = document.getElementById('plateBackTitle');
  if (backTitle) backTitle.textContent = plate.name ?? '';
}

// ── Add Worms modal (any stage, after inoculation) ─────────────────────────────
function showAddWormsModal(plateId) {
  const plate = pt.get(plateId);
  if (!plate) return;

  const strainOpts = Object.values(STRAINS)
    .filter(s => s.id !== 'custom')
    .map(s => `<option value="${s.id}"${s.id === plate.strainId ? ' selected' : ''}>${s.label.split('—')[0].trim()}</option>`)
    .join('');

  const buildStageOpts = (strainId) => getStages(strainId, plate.tempC)
    .map(s => `<option value="${s.id}">${s.icon} ${s.name} (age ${fmtHours(s.start)})</option>`)
    .join('');

  const ov = _modalShell(`
    <h2 style="font-size:16px;font-weight:800;color:#e2e8f0;margin-bottom:14px">➕ Add Worms</h2>
    <p style="font-size:12px;color:#64748b;margin-bottom:14px">Add a group of worms — any strain, any stage. Each group is tracked separately.</p>
    <label class="ctrl-label">Strain / worm type</label>
    <select id="awStrain" style="margin-bottom:12px">${strainOpts}</select>
    <label class="ctrl-label">Number of worms</label>
    <input type="number" id="awCount" value="1" min="1" max="9999" style="margin-bottom:12px">
    <label class="ctrl-label">Current stage of these worms</label>
    <select id="awStage" style="margin-bottom:18px">${buildStageOpts(plate.strainId)}</select>
    <div style="display:flex;gap:10px">
      <button id="awCancel" class="btn-secondary" style="flex:1">Cancel</button>
      <button id="awAdd" class="btn-primary" style="flex:2">Add Worms</button>
    </div>`);

  // Rebuild stage options when strain changes
  ov.querySelector('#awStrain').onchange = (e) => {
    ov.querySelector('#awStage').innerHTML = buildStageOpts(e.target.value);
  };

  ov.querySelector('#awCancel').onclick = () => ov.remove();
  ov.querySelector('#awAdd').onclick = () => {
    const count   = Math.max(1, parseInt(ov.querySelector('#awCount').value) || 1);
    const strainId = ov.querySelector('#awStrain').value;
    const stageId = ov.querySelector('#awStage').value;
    const stDef   = getStages(strainId, plate.tempC).find(s => s.id === stageId);
    pt.addCohort(plateId, count, stageId, stDef.start, strainId);
    ov.remove();
    renderPlateDetail();
    renderPlateList();
    const sLabel = (STRAINS[strainId]?.label ?? strainId).split('—')[0].trim();
    showToast(`Added ${count} ${sLabel} ${stDef.name} worm(s)`, 'success');
  };
}

// ── Transfer Worms modal ───────────────────────────────────────────────────────
function showTransferModal(plateId) {
  const plate = pt.get(plateId);
  if (!plate) return;
  const cohorts = pt.getCohorts(plateId);
  if (!cohorts.length) { showToast('No worms to transfer', 'warn'); return; }

  const otherPlates = pt.getAll().filter(p => p.id !== plateId);
  if (!otherPlates.length) { showToast('Create another plate to transfer to', 'warn'); return; }

  const stages = getStages(plate.strainId, plate.tempC);
  const cohortOpts = cohorts.map(c => {
    const stDef = stages.find(s => s.id === c.startingStageId) ?? stages[0];
    return `<option value="${c.id}" data-max="${c.count}">${c.count} worm(s) — ${stDef.name}</option>`;
  }).join('');
  const plateOpts = otherPlates.map(p =>
    `<option value="${p.id}">${escHtml(p.name)} (${p.strainId}, ${p.tempC}°C)</option>`
  ).join('');

  const ov = _modalShell(`
    <h2 style="font-size:16px;font-weight:800;color:#e2e8f0;margin-bottom:14px">🔀 Transfer Worms</h2>
    <p style="font-size:12px;color:#64748b;margin-bottom:14px">Move worms to another plate. Their stage &amp; age travel with them.</p>
    <label class="ctrl-label">Which worms</label>
    <select id="tfCohort" style="margin-bottom:12px">${cohortOpts}</select>
    <label class="ctrl-label">How many</label>
    <input type="number" id="tfCount" value="1" min="1" style="margin-bottom:12px">
    <label class="ctrl-label">Transfer to plate</label>
    <select id="tfDest" style="margin-bottom:18px">${plateOpts}</select>
    <div style="display:flex;gap:10px">
      <button id="tfCancel" class="btn-secondary" style="flex:1">Cancel</button>
      <button id="tfDo" class="btn-primary" style="flex:2">Transfer</button>
    </div>`);

  // Update max when cohort changes
  const updateMax = () => {
    const opt = ov.querySelector('#tfCohort').selectedOptions[0];
    const max = parseInt(opt?.dataset.max) || 1;
    const inp = ov.querySelector('#tfCount');
    inp.max = max; if (+inp.value > max) inp.value = max;
  };
  ov.querySelector('#tfCohort').onchange = updateMax;
  updateMax();

  ov.querySelector('#tfCancel').onclick = () => ov.remove();
  ov.querySelector('#tfDo').onclick = () => {
    const cohortId = ov.querySelector('#tfCohort').value;
    const destId   = ov.querySelector('#tfDest').value;
    const count    = Math.max(1, parseInt(ov.querySelector('#tfCount').value) || 1);
    const res = pt.transferWorms(plateId, destId, cohortId, count);
    ov.remove();
    if (res.ok) {
      renderPlateDetail(); renderPlateList();
      showToast(`Transferred ${res.moved} worm(s) — age preserved`, 'success');
    } else {
      showToast(res.error ?? 'Transfer failed', 'error');
    }
  };
}

// ── Life stages explainer modal ────────────────────────────────────────────────
function showStagesInfoModal(plateId) {
  const plate = plateId ? pt.get(plateId) : null;
  const strainId = plate?.strainId ?? 'N2';
  const tempC = plate?.tempC ?? 20;
  const stages = getStages(strainId, tempC);
  const curStageId = plate?.inoculatedAt
    ? getCurrentStage(pt.elapsedHours(plateId) ?? 0, strainId, tempC).stage.id
    : null;

  const rows = stages.map(s => `
    <div style="background:${s.id===curStageId?s.color+'22':'#0f172a'};border:1px solid ${s.id===curStageId?s.color:'#1e2a3a'};
      border-radius:10px;padding:12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span style="font-size:24px">${s.icon}</span>
        <span style="font-size:14px;font-weight:800;color:${s.color}">${s.name}</span>
        ${s.id===curStageId?'<span style="font-size:9px;background:'+s.color+';color:#000;padding:2px 6px;border-radius:6px;font-weight:700;margin-left:auto">CURRENT</span>':''}
        <span style="font-size:10px;color:#64748b;${s.id===curStageId?'':'margin-left:auto'}">${fmtHours(s.start)}–${fmtHours(s.end)}</span>
      </div>
      <div style="font-size:12px;color:#94a3b8;line-height:1.5;margin-bottom:5px">${s.description}</div>
      <div style="font-size:10px;color:#64748b"><strong style="color:#94a3b8">Signs:</strong> ${s.visibleSigns}</div>
      <div style="font-size:10px;color:#64748b"><strong style="color:#94a3b8">Size:</strong> ${s.size}</div>
    </div>`).join('');

  const ov = document.createElement('div');
  ov.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:720;display:flex;' +
    'flex-direction:column;overflow-y:auto;padding:16px;animation:wlcIn 0.3s ease-out';
  ov.innerHTML = `
    <div style="max-width:440px;width:100%;margin:0 auto">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div style="flex:1">
          <div style="font-size:17px;font-weight:800;color:#e2e8f0">C. elegans Life Stages</div>
          <div style="font-size:11px;color:#64748b">${(STRAINS[strainId]?.label??strainId).split('—')[0].trim()} at ${tempC}°C</div>
        </div>
        <button id="siClose" style="background:#1e2a3a;border:none;color:#e2e8f0;font-size:18px;
          width:34px;height:34px;border-radius:50%;cursor:pointer;min-height:unset;padding:0">✕</button>
      </div>
      ${rows}
      <button id="siClose2" style="width:100%;padding:13px;border-radius:10px;background:#1e2a3a;
        border:1px solid #2d3748;color:#e2e8f0;font-size:14px;font-weight:700;cursor:pointer;margin-top:4px">Close</button>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelector('#siClose').onclick = () => ov.remove();
  ov.querySelector('#siClose2').onclick = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
}

/** Generic centered modal shell. Returns the overlay element. */
function _modalShell(innerHTML) {
  const ov = document.createElement('div');
  ov.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:700;display:flex;' +
    'align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
  ov.innerHTML = `<div style="background:#111827;border:1px solid #1e2a3a;border-radius:16px;
    padding:22px;max-width:360px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.8)">${innerHTML}</div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  return ov;
}

function showPlateStatusModal(plateId) {
  const plate = pt.get(plateId);
  if (!plate?.inoculatedAt) return;
  const hrs    = pt.elapsedHours(plateId) ?? 0;
  const stages = getStages(plate.strainId, plate.tempC);
  const { stage, progress, hoursInStage, hoursToNext } = getCurrentStage(hrs, plate.strainId, plate.tempC);
  const total  = stages[stages.length - 1].end;
  const pct    = Math.min(100, (hrs / total) * 100);
  const fp     = pt.foodPercent(plateId);
  const ms     = Date.now() - plate.inoculatedAt;
  const strain = STRAINS[plate.strainId] ?? STRAINS.N2;
  const eggs   = pt.totalEggs(plateId);
  const pop    = computePopulation(plate, hrs);   // dauer / dead status now

  // Build breakdown of all worm cohorts with their individual stages
  const cohortBreakdown = pt.getCohorts(plateId).map(c => {
    const cStrain = c.strainId ?? plate.strainId;
    const cStages = getStages(cStrain, plate.tempC);
    const ageHrs  = (Date.now() - plate.inoculatedAt) / 3_600_000 + (c.stageStartOffset ?? 0);
    const cs = getCurrentStage(ageHrs, cStrain, plate.tempC);
    return {
      count: c.count,
      stage: cs.stage,
      stagePct: Math.round(cs.progress * 100),
      ageHrs,
      strainLabel: (STRAINS[cStrain]?.label ?? cStrain).split('—')[0].trim(),
      originBadge: c.origin === 'transfer' ? '🔀 transferred'
                 : c.origin === 'added' ? '➕ added' : '🧫 original',
    };
  });

  // Remove any lingering status modal so queries never hit a stale duplicate
  document.getElementById('plateStatusModal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'plateStatusModal';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:700;' +
    'display:block;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
    'padding:16px 16px calc(110px + env(safe-area-inset-bottom,0px));' +
    'animation:wlcIn 0.3s cubic-bezier(0.34,1.56,0.64,1)';

  const foodColor = fp > 40 ? '#5a9e32' : fp > 15 ? '#c08020' : '#ef4444';
  const stagePct  = Math.round(progress * 100);

  overlay.innerHTML = `
    <div style="max-width:460px;width:100%;margin:0 auto">
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <button id="btnCloseStatus" style="background:none;border:none;color:var(--accent);
          font-size:15px;font-weight:700;cursor:pointer;width:auto;min-height:unset;padding:4px">
          ← Back
        </button>
        <div style="flex:1">
          <div style="font-size:17px;font-weight:800;color:#e2e8f0">${escHtml(plate.name)}</div>
          <div style="font-size:12px;color:#64748b">${strain.label.split('—')[0].trim()} · ${plate.tempC}°C</div>
        </div>
      </div>

      <!-- ═══ Growth Simulator (preview only — does NOT change the real plate) ═══ -->
      <div style="background:#0a1020;border:1.5px solid var(--accent);border-radius:14px;padding:14px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="font-size:13px;font-weight:800;color:var(--accent)">🔮 Growth Simulator</span>
          <span style="font-size:9px;color:#64748b;margin-left:auto">preview only — won't change your plate</span>
        </div>
        <canvas id="simCanvas" width="240" height="240" style="display:block;margin:0 auto 10px;border-radius:50%"></canvas>

        <!-- Sim readouts -->
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px">
          <span id="simStage" style="font-weight:700"></span>
          <span id="simTime" style="color:#64748b;font-family:monospace"></span>
        </div>
        <div style="display:flex;gap:9px;font-size:10px;color:#64748b;margin-bottom:6px;flex-wrap:wrap">
          <span>🍽 <span id="simFood" style="color:#5a9e32">100%</span></span>
          <span>🥚 <span id="simEggs" style="color:#fbbf24">0</span></span>
          <span>🐛 <span id="simWorms">${plate.wormCount ?? 1}</span></span>
          <span>💤 <span id="simDauer" style="color:#94a3b8">0</span></span>
          <span>☠ <span id="simDead" style="color:#ef4444">0</span></span>
        </div>
        <div id="simNote" style="font-size:9.5px;color:#f59e0b;min-height:12px;margin-bottom:8px;line-height:1.4"></div>

        <!-- Scrubber -->
        <input type="range" id="simScrub" min="0" max="100" value="0" style="width:100%;accent-color:var(--accent);margin-bottom:8px">

        <!-- Speed controls -->
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
          <button id="simPlay" class="sim-btn" style="background:var(--accent);color:#000">▶</button>
          ${[{x:1,r:4},{x:2,r:8},{x:3,r:12}].map(s => `<button class="sim-btn sim-speed" data-spd="${s.r}">${s.x}×</button>`).join('')}
          <button id="simReset" class="sim-btn" style="margin-left:auto">↺ Now</button>
        </div>
      </div>

      <!-- Big stage display (follows the simulator) -->
      <div id="simStageBox" style="background:${stage.color}11;border:1.5px solid ${stage.color}44;border-radius:14px;padding:20px;margin-bottom:16px;text-align:center">
        <div style="font-size:52px;margin-bottom:10px">${stage.icon}</div>
        <div style="font-size:20px;font-weight:900;color:${stage.color};margin-bottom:4px">${stage.name}</div>
        <div style="font-size:13px;color:#94a3b8;margin-bottom:14px">
          ${fmtHours(hoursInStage)} in stage
          ${hoursToNext > 0 ? `· next in ~${fmtHours(hoursToNext)}` : ''}
        </div>
        <div style="height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;margin-bottom:10px">
          <div style="height:100%;width:${stagePct}%;background:${stage.color};border-radius:4px;transition:width 0.3s"></div>
        </div>
        <div style="font-size:12px;color:#64748b">${stage.description}</div>
        <div style="font-size:11px;color:#475569;margin-top:8px;padding:8px;background:rgba(0,0,0,0.3);border-radius:8px;text-align:left">
          <strong style="color:#94a3b8">Visible signs:</strong> ${stage.visibleSigns}<br>
          <strong style="color:#94a3b8">Size:</strong> ${stage.size}
        </div>
      </div>

      <!-- Timeline -->
      <div style="background:#0f172a;border:1px solid #1e2a3a;border-radius:12px;padding:14px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Development Progress</div>
        <div style="display:flex;height:28px;border-radius:6px;overflow:hidden;margin-bottom:14px">
          ${stages.map(s => {
            const w = ((s.end - s.start) / total * 100).toFixed(2);
            const isCur = s.id === stage.id;
            return `<div style="width:${w}%;background:${s.color}${isCur?'cc':'33'};display:flex;align-items:center;justify-content:center;font-size:12px;
              border:1px solid ${s.color}66;${isCur?'outline:2px solid rgba(255,255,255,0.3)':''}" title="${s.name}">${s.icon}</div>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${stages.map(s => `<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:${s.color}22;color:${s.color};
            border:1px solid ${s.color}33">${s.icon} ${s.name.split(' ')[0]}</span>`).join('')}
        </div>
      </div>

      <!-- Stats grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div style="background:#0f172a;border:1px solid #1e2a3a;border-radius:10px;padding:12px">
          <div style="font-size:20px;font-weight:900;color:var(--accent);font-family:monospace">${fmtElapsed(ms)}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px">Time since inoculation</div>
        </div>
        <div style="background:#0f172a;border:1px solid #1e2a3a;border-radius:10px;padding:12px">
          <div style="font-size:20px;font-weight:900;color:${foodColor};font-family:monospace">${fp.toFixed(1)}%</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px">Food remaining</div>
        </div>
        <div style="background:#0f172a;border:1px solid #1e2a3a;border-radius:10px;padding:12px">
          <div style="font-size:20px;font-weight:900;color:#e2e8f0;font-family:monospace">${plate.wormCount ?? 1}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px">Worms on plate</div>
        </div>
        <div style="background:#0f172a;border:1px solid #1e2a3a;border-radius:10px;padding:12px">
          <div style="font-size:20px;font-weight:900;color:#fbbf24;font-family:monospace">${eggs}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px">Eggs laid</div>
        </div>
        <div style="background:#0f172a;border:1px solid #94a3b833;border-radius:10px;padding:12px">
          <div style="font-size:20px;font-weight:900;color:#94a3b8;font-family:monospace">${pop.dauer}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px">💤 Dauer worms</div>
        </div>
        <div style="background:#0f172a;border:1px solid ${pop.dead>0?'#ef444455':'#1e2a3a'};border-radius:10px;padding:12px">
          <div style="font-size:20px;font-weight:900;color:#ef4444;font-family:monospace">${pop.dead}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px">☠ Dead worms</div>
        </div>
      </div>
      ${pop.note ? `<div style="background:#1a1205;border:1px solid #f59e0b44;border-radius:10px;padding:10px;margin-bottom:14px;font-size:11px;color:#f59e0b;line-height:1.5">${pop.note}</div>` : ''}

      <!-- All worm groups breakdown -->
      <div style="background:#0f172a;border:1px solid #1e2a3a;border-radius:12px;padding:14px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">
          🐛 All Worm Groups (${cohortBreakdown.length})
        </div>
        ${cohortBreakdown.map(c => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #1e2a3a">
            <span style="font-size:20px">${c.stage.icon}</span>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:700;color:#e2e8f0">${c.count} worm${c.count!==1?'s':''} · ${c.stage.name}</div>
              <div style="font-size:10px;color:#64748b">${c.strainLabel} · ${c.originBadge} · age ${c.ageHrs.toFixed(1)}h</div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${c.stage.color}">${c.stagePct}%</span>
          </div>
        `).join('')}
      </div>

      <!-- Overall progress -->
      <div style="background:#0f172a;border:1px solid #1e2a3a;border-radius:10px;padding:12px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:11px;color:#64748b;font-weight:600">Overall development</span>
          <span style="font-size:13px;font-weight:800;color:var(--accent)">${pct.toFixed(1)}%</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px">
          <div style="height:100%;width:${pct.toFixed(1)}%;background:var(--accent);border-radius:3px;transition:width 0.3s"></div>
        </div>
        <div style="font-size:10px;color:#475569;margin-top:6px">Total cycle at ${plate.tempC}°C: ${fmtHours(total)}</div>
      </div>

      <button id="btnCloseStatus2" style="width:100%;padding:13px;border-radius:10px;background:#1e2a3a;border:1px solid #2d3748;color:#e2e8f0;font-size:14px;font-weight:700;cursor:pointer">
        Close Status
      </button>
    </div>`;

  document.body.appendChild(overlay);

  // ── Growth Simulator wiring (preview only) ──────────────────────────────────
  const sim = _initGrowthSimulator(plate, pt.elapsedSinceInoculation(plateId) ?? 0);

  const closeStatus = () => { sim?.destroy(); overlay.remove(); };
  document.getElementById('btnCloseStatus').onclick = closeStatus;
  document.getElementById('btnCloseStatus2').onclick = closeStatus;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeStatus(); });
}

/** Self-contained growth simulator for the status modal. Does NOT mutate the plate. */
/**
 * Multi-generation life-cycle model for the simulator.
 * Founding worms develop egg→adult, lay eggs that HATCH into a new generation
 * which repeats the cycle. Reproductive adults DIE at the end of their lifespan.
 * Bounded by generations & food. Returns a population breakdown at the given
 * developmental hour (from the founding cohort's egg = 0).
 *
 * Research basis (WormBook): generation time ~3 d (egg→egg-laying adult) at 20°C,
 * brood ~300 self-progeny over ~80 h, mean lifespan ~15–20 d. Without food larvae
 * arrest as dauer (or die in daf-16).
 */
/**
 * Stepwise life-cycle + food simulation over 28 days. Unlike the analytical
 * model, food is depleted by the ACTUAL growing population, so starvation (and
 * thus dauer at L1 / death) triggers realistically once offspring crowd the plate.
 * Precompute ONCE, then look up any time point. Returns an array of snapshots.
 */
function buildLifeTimeline(plate) {
  const strainId = plate.strainId, tempC = plate.tempC;
  const stages   = getStages(strainId, tempC);
  const adultStart = (stages.find(s => s.id === 'adult') ?? stages[stages.length - 1]).start;
  const eggDur   = stages[0].duration;
  const layWindow = 80;
  // Age-specific adult mortality (Gompertz): hazard μ(t) = A·e^(G·t) per day, t =
  // days into adulthood. N2 reference A≈0.0016/d, G≈0.23/d → median ~20 d, daily
  // death <1%/d in week 1 rising to ~6%/d by d15, ~19%/d by d20 (Olsen/Lithgow,
  // PMC2753291). We "temporally scale" per strain/temp so each strain's median
  // matches its adultLifespanDays — so longer-lived strains age more slowly.
  const GOMP_A = 0.0016, GOMP_G = 0.23;
  const kAging = Math.max(0.3, adultLifespanDays(strainId, tempC) / 20);
  // Dauer survival: dauers live off stored lipids and survive months without food,
  // far longer than adults (Klass & Hirsh 1976; up to ~4 months). After that they die.
  const DAUER_SURVIVAL = DAUER.survivalHoursMax;      // ~4 months (verified, LifeCycle.DAUER)
  const maxEggs  = (STRAINS[strainId] ?? STRAINS.N2).maxEggs;
  const adultRate = PlateTracker.CONSUMPTION_ML_PER_HR?.[plate.consumptionRate ?? 'standard'] ?? 0.0001;
  const canDauer = canFormDauer(strainId);
  const colorOf  = id => (stages.find(s => s.id === id)?.color ?? '#00d4aa');

  const DT = 6, MAX_H = 90 * 24, POP_CAP = 5e6;   // headroom so charts can auto-fit long-lived strains
  let food = plate.initialFood ?? 0.2;

  // Seed from ALL real cohorts (founding + user-added), each appearing at its
  // addedAtHrs with its own developmental age. This makes added worms show the
  // correct stage and count on the plate.
  const seeds = (pt.getCohorts(plate.id) ?? []).map(c => ({
    stageStartHr: c.stageStartHr ?? c.stageStartOffset ?? 0,
    addedAtHrs: c.addedAtHrs ?? 0,
    count: c.count,
  }));
  if (!seeds.length) seeds.push({ stageStartHr: plate.stageStartOffset ?? 0, addedAtHrs: 0, count: plate.wormCount ?? 1 });
  const pending = seeds.slice();   // not-yet-activated seeds

  // cohort: { age, count, dauer, dead, dauerAge }
  let cohorts = [];
  let agedDead = 0;                          // cumulative fractional old-age (Gompertz) deaths
  const snaps = [];
  const stageIdAt = age => getCurrentStage(age, strainId, tempC).stage.id;

  const layRate = maxEggs / layWindow;       // eggs per adult per hour
  for (let h = 0; h <= MAX_H; h += DT) {
    // 0) Activate any seed cohorts whose add-time has arrived (within this step,
    //    so worms added "now" — addedAtHrs ≈ 0 — appear immediately at h = 0).
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].addedAtHrs < h + DT) {
        const s = pending.splice(i, 1)[0];
        cohorts.push({ age: s.stageStartHr + Math.max(0, h - s.addedAtHrs), count: s.count, dauer: false, dead: false, dauerAge: 0 });
      }
    }

    // 1) SNAPSHOT the state AT hour h (before this step's events). This is why
    //    freshly-placed adults show ~0 eggs that then climb gradually (+1, +1).
    const byStage = {}; let alive = 0, dauer = 0, dead = 0, eggCrop = 0;
    for (const c of cohorts) {
      if (c.dead) { dead += c.count; continue; }
      if (c.dauer) { dauer += c.count; continue; }
      if (c.age < eggDur) continue;          // discrete egg-cohort: shown via crop
      const sid = stageIdAt(c.age);
      byStage[sid] = (byStage[sid] ?? 0) + c.count;
      alive += c.count;
      if (c.age >= adultStart && c.age <= adultStart + layWindow) {
        const timeLaying = c.age - adultStart;   // how long THIS cohort has laid
        eggCrop += c.count * layRate * Math.min(timeLaying, eggDur);
      }
    }
    dead += agedDead;   // include cumulative old-age (Gompertz) deaths
    const r1 = n => Math.round(n * 10) / 10;   // worm counts shown to 1 decimal place
    const eggStanding = r1(eggCrop);
    const population = Object.entries(byStage).map(([id, count]) => ({ stageId: id, color: colorOf(id), count: Math.round(count) }));
    if (dauer >= 1) population.push({ stageId: 'dauer', color: '#94a3b8', count: Math.round(dauer) });
    const byStageR = {}; for (const k in byStage) byStageR[k] = r1(byStage[k]);
    snaps.push({ h, population, byStage: byStageR, alive: r1(alive), dauer: r1(dauer),
      dead: r1(dead), eggs: eggStanding, foodPct: (food / (plate.initialFood ?? 0.2)) * 100 });

    // 2) Consume food (dauer & dead & eggs don't feed)
    let consume = 0;
    for (const c of cohorts) {
      if (c.dauer || c.dead) continue;
      consume += c.count * adultRate * (STAGE_FOOD_FACTOR[stageIdAt(c.age)] ?? 1) * DT;
    }
    const hadFood = food > 0;
    food = Math.max(0, food - consume);
    const foodOut = food <= 0;

    // 3) Reproduction (only while food available)
    if (hadFood) {
      const born = [];
      for (const c of cohorts) {
        if (c.dauer || c.dead) continue;
        if (c.age >= adultStart && c.age <= adultStart + layWindow) {
          const brood = c.count * layRate * DT;
          if (brood >= 1) born.push({ age: 0, count: Math.min(brood, POP_CAP), dauer: false, dead: false, dauerAge: 0 });
        }
      }
      cohorts.push(...born);
    }

    // 4) Starvation: larvae in the late-L1 → L2d decision window (or just-hatched)
    //    freeze as dauer; everything past the window (or Daf-defective) dies.
    if (foodOut) {
      for (const c of cohorts) {
        if (c.dauer || c.dead) continue;
        const sid = stageIdAt(c.age);
        if ((DAUER.decisionStages.includes(sid) || c.age < eggDur) && canDauer) c.dauer = true;
        else c.dead = true;
      }
    }

    // 5) Age the living (dauer arrested → don't age, but age their dauer clock);
    //    old-age death for adults, and dauer death after the survival limit.
    for (const c of cohorts) {
      if (c.dead) continue;
      if (c.dauer) { c.dauerAge += DT; if (c.dauerAge >= DAUER_SURVIVAL) c.dead = true; continue; }
      c.age += DT;
      // Age-specific old-age mortality: a FRACTION of each adult cohort dies each
      // step per the Gompertz hazard (rises with adult age) → smooth survival curve.
      if (c.age >= adultStart) {
        const ageDays = (c.age - adultStart) / 24;
        const mu = (GOMP_A / kAging) * Math.exp((GOMP_G / kAging) * ageDays);   // per day
        const d = c.count * (1 - Math.exp(-mu * (DT / 24)));
        c.count -= d; agedDead += d;
        if (c.count < 0.01) c.dead = true;   // negligible remainder → retire the cohort
      }
    }

    // 6) Merge cohorts to keep it fast (group living by ~age bucket; pool dauer/dead)
    if (cohorts.length > 300) {
      const buckets = {}; let dPool = 0, xPool = 0, dAgeMax = 0;
      for (const c of cohorts) {
        if (c.dead) { xPool += c.count; continue; }
        if (c.dauer) { dPool += c.count; dAgeMax = Math.max(dAgeMax, c.dauerAge ?? 0); continue; }
        const key = Math.round(c.age / DT);
        buckets[key] = (buckets[key] ?? 0) + c.count;
      }
      cohorts = Object.entries(buckets).map(([k, count]) => ({ age: +k * DT, count, dauer: false, dead: false, dauerAge: 0 }));
      if (dPool > 0) cohorts.push({ age: 0, count: dPool, dauer: true, dead: false, dauerAge: dAgeMax });
      if (xPool > 0) cohorts.push({ age: 0, count: xPool, dauer: false, dead: true, dauerAge: 0 });
    }
  }
  return snaps;
}

// Cache one timeline per plate-parameter signature (rebuild only when changed).
const _timelineCache = new Map();
function getTimeline(plate) {
  const key = `${plate.id}|${plate.strainId}|${plate.tempC}|${plate.wormCount}|${plate.initialFood}|${plate.consumptionRate}|${plate.stageStartOffset}`;
  const hit = _timelineCache.get(plate.id);
  if (hit && hit.key === key) return hit.snaps;
  const snaps = buildLifeTimeline(plate);
  _timelineCache.set(plate.id, { key, snaps });
  return snaps;
}

/** Look up the timeline snapshot nearest a developmental hour. */
function timelineAt(snaps, hrs) {
  if (!snaps || !snaps.length) return null;
  const DT = 6;
  const i = Math.max(0, Math.min(snaps.length - 1, Math.round(hrs / DT)));
  return snaps[i];
}

function simulateGenerations(plate, hrs) {
  const strainId  = plate.strainId;
  const tempC     = plate.tempC;
  const stages    = getStages(strainId, tempC);
  const stageById = Object.fromEntries(stages.map(s => [s.id, s]));
  const eggDur    = stageById.egg?.duration ?? 9;
  const adultStart = (stageById.adult ?? stages[stages.length - 1]).start;
  const layWindow  = 80;                         // hrs of active laying
  const lifespanFromEgg = adultStart + adultLifespanHours(strainId, tempC);  // strain/temp adult life → death
  const maxEggs   = (STRAINS[strainId] ?? STRAINS.N2).maxEggs;
  const foundCount = plate.wormCount ?? 1;

  const pop = computePopulation(plate, hrs);     // food/dauer/death gate
  const foodOutHrs = pop.foodOutHrs;

  // Build cohorts: founding gen + descendants. Each parent's brood is spread
  // across the laying window in sub-batches so eggs are continuously laid and
  // visibly hatch over time (not all at once).
  const cohorts = [{ birth: 0, count: foundCount, gen: 0 }];
  const MAX_GEN = 4, COHORT_CAP = 5000, SUB_BATCHES = 4;
  for (let gi = 0; gi < cohorts.length; gi++) {
    const c = cohorts[gi];
    if (c.gen >= MAX_GEN) continue;
    const layStart = c.birth + adultStart;
    if (layStart >= foodOutHrs) continue;          // no food → no viable progeny
    const broodEach = Math.min(maxEggs * c.count, COHORT_CAP) / SUB_BATCHES;
    if (broodEach < 1) continue;
    for (let b = 0; b < SUB_BATCHES; b++) {
      const childBirth = layStart + (layWindow * (b + 0.5) / SUB_BATCHES);
      if (childBirth < hrs + eggDur && childBirth < foodOutHrs) {
        cohorts.push({ birth: childBirth, count: broodEach, gen: c.gen + 1 });
      }
    }
  }

  // Tally population by stage at `hrs`
  const byStage = {};
  let dead = 0, dauer = 0, alive = 0, maxGenSeen = 0, layingAdults = 0;
  for (const c of cohorts) {
    const age = hrs - c.birth;
    if (age < 0) continue;                         // not laid yet
    maxGenSeen = Math.max(maxGenSeen, c.gen);
    if (age >= lifespanFromEgg) { dead += c.count; continue; }   // old age
    if (hrs >= foodOutHrs) {                        // food gone → arrest/death
      // Fate is fixed at the MOMENT food ran out — dauers freeze (don't age on).
      const ageAtOut = Math.max(0, foodOutHrs - c.birth);
      const csOut = getCurrentStage(ageAtOut, strainId, tempC).stage;
      const inDauerWindow = DAUER.decisionStages.includes(csOut.id) || ageAtOut < eggDur; // L1/L2d or egg→L1
      if (inDauerWindow && canFormDauer(strainId)) dauer += c.count;  // frozen dauer
      else dead += c.count;                          // L3+/adults or Daf-defective die
      continue;
    }
    if (age < eggDur) continue;   // still an egg — shown as dots, not a worm
    const cs = getCurrentStage(age, strainId, tempC).stage;
    byStage[cs.id] = (byStage[cs.id] ?? 0) + c.count;
    alive += c.count;
    // Count adults that are actively laying (for the egg standing-crop)
    if (age >= adultStart && age <= adultStart + layWindow) layingAdults += c.count;
  }

  // Eggs currently ON the plate = laid by active adults within the last eggDur
  // (standing crop, before they hatch). Smooth & always visible while laying.
  const eggsUnhatched = Math.round(layingAdults * (maxEggs / layWindow) * eggDur);

  // Build population array for the canvas (colour per stage)
  const population = Object.entries(byStage).map(([id, count]) => ({
    stageId: id, color: (stageById[id]?.color ?? '#00d4aa'), count,
  }));
  if (dauer > 0) population.push({ stageId: 'dauer', color: '#94a3b8', count: dauer });

  return { population, byStage, eggsUnhatched, dead, dauer, alive, generations: maxGenSeen + 1, foodOutHrs };
}

/** Clean vertical list of every stage on the plate, with counts & proportion bars. */
function renderPopulationBreakdown(snap, plate) {
  const stages = getStages(plate.strainId, plate.tempC);
  const order = ['egg','l1','l2','l3','l4','young_adult','adult','dauer'];
  const meta = id => stages.find(s => s.id === id)
    ?? { id, name: id === 'dauer' ? 'Dauer Larva' : id, icon: id === 'dauer' ? '💤' : '🐛', color: '#94a3b8' };

  // Assemble rows: eggs, each living stage, dauer, dead
  const rows = [];
  if (snap.eggs > 0) rows.push({ icon:'🥚', name:'Eggs (unhatched)', color:'#fbbf24', count: snap.eggs });
  for (const id of order) {
    if (id === 'dauer') continue;
    const n = Math.round(snap.byStage?.[id] ?? 0);
    if (n > 0) { const m = meta(id); rows.push({ icon:m.icon, name:m.name, color:m.color, count:n }); }
  }
  if (snap.dauer > 0) rows.push({ icon:'💤', name:'Dauer (arrested)', color:'#94a3b8', count: snap.dauer });
  if (snap.dead  > 0) rows.push({ icon:'☠', name:'Dead', color:'#ef4444', count: snap.dead });

  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  const totalAlive = snap.alive + snap.dauer;

  if (!rows.length) {
    return `<div style="padding:10px;text-align:center;color:#64748b;font-size:12px">No worms on the plate yet.</div>`;
  }

  return `
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px">
      <span style="font-size:12px;font-weight:800;color:#e2e8f0;text-transform:uppercase;letter-spacing:0.05em">Worms on Plate</span>
      <span style="font-size:11px;color:#64748b;margin-left:auto">${totalAlive.toLocaleString()} alive · ${snap.eggs.toLocaleString()} eggs</span>
    </div>
    ${rows.map(r => {
      const pct = (r.count / total) * 100;
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0">
        <span style="font-size:16px;width:20px;text-align:center">${r.icon}</span>
        <span style="font-size:12px;color:${r.color};font-weight:700;min-width:120px">${r.name}</span>
        <div style="flex:1;height:8px;background:#1e2a3a;border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct.toFixed(1)}%;background:${r.color};border-radius:4px"></div>
        </div>
        <span style="font-size:12px;color:#e2e8f0;font-family:monospace;font-weight:700;min-width:54px;text-align:right">${r.count.toLocaleString()}</span>
      </div>`;
    }).join('')}`;
}

function _initGrowthSimulator(plate, startHrs) {
  // Scope ALL queries to the current modal so stale duplicates never interfere
  const root = document.getElementById('plateStatusModal');
  if (!root) return null;
  const $ = id => root.querySelector('#' + id);
  const canvas = $('simCanvas');
  if (!canvas) return null;

  const stages    = getStages(plate.strainId, plate.tempC);
  const totalHrs  = stages[stages.length - 1].end;
  const adultStage = stages.find(s => s.id === 'adult') ?? stages[stages.length - 1];
  // Cap the simulation at 30 days. You can watch eggs hatch, generations grow,
  // and adults die of age (long-lived strains persist much longer).
  const maxHrs    = 30 * 24;
  const maxEggs   = (STRAINS[plate.strainId] ?? STRAINS.N2).maxEggs;
  const initFood  = plate.initialFood ?? 0.5;
  const rate      = PlateTracker.CONSUMPTION_ML_PER_HR?.[plate.consumptionRate ?? 'standard'] ?? 0.0001;
  const wormCount = plate.wormCount ?? 1;
  const offset    = plate.stageStartOffset ?? 0;

  const simCanvas = new PlateCanvas(canvas);
  simCanvas._noAutoSize = true;   // keep its fixed 240×240 size
  simCanvas.start();

  // Precompute the full 28-day population/food timeline ONCE (food depletes from
  // the real growing population → realistic hatching, dauer, death).
  const timeline = buildLifeTimeline(plate);

  let simHrs = startHrs;
  let speed  = 0;             // 0 = paused
  let raf    = null;
  let last   = performance.now();

  function simFoodPct(hrs) {
    const sinceInoc = Math.max(0, hrs - offset);
    const remaining = Math.max(0, initFood - wormCount * rate * sinceInoc);
    return initFood > 0 ? (remaining / initFood) * 100 : 0;
  }

  function render() {
    const cs = getCurrentStage(simHrs, plate.strainId, plate.tempC);
    let stage = cs.stage;
    // Population from the precomputed stepwise timeline (realistic food depletion)
    const snap = timelineAt(timeline, simHrs) ?? { population: [], alive: 0, dauer: 0, dead: 0, eggs: 0, foodPct: 100 };
    const foodPct = Math.max(0, snap.foodPct);

    // Pick the dominant living stage for the labels / big box
    let domId = stage.id, domMax = -1;
    for (const [id, n] of Object.entries(snap.byStage ?? {})) if (n > domMax) { domMax = n; domId = id; }
    if (snap.alive === 0 && snap.dauer > 0) domId = 'dauer';
    const domStage = domId === 'dauer'
      ? { id:'dauer', name:'Dauer Larva', icon:'💤', color:'#94a3b8',
          description:'Stress-resistant, non-feeding arrest. Survives until food returns.',
          visibleSigns:'Darker, slender, non-feeding.', size:'~500 µm slender' }
      : (stages.find(s => s.id === domId) ?? stage);
    stage = domStage;

    const st = { plate, hrsElapsed: simHrs, stage, foodPct,
      wormCount: snap.alive, totalEggs: snap.eggs,
      population: snap.population, inoculatedAt: plate.inoculatedAt };
    simCanvas.setState(st);
    simCanvas._render(st);

    const note = snap.dead > 0 && snap.alive === 0 && snap.dauer === 0
        ? '☠ All worms died (starvation / old age).'
      : snap.dauer > 0
        ? '💤 L1 larvae entered DAUER after food ran out — they survive until refed.'
      : (Object.keys(snap.byStage ?? {}).length > 1
        ? '🔄 Multiple generations developing — eggs hatching into new cycles.' : '');

    $('simStage').textContent = `${stage.icon} ${stage.name}`;
    $('simStage').style.color = stage.color;
    $('simTime').textContent  = fmtHours(simHrs);
    $('simFood').textContent  = `${foodPct.toFixed(0)}%`;
    $('simFood').style.color  = foodPct > 40 ? '#5a9e32' : foodPct > 15 ? '#c08020' : '#ef4444';
    $('simEggs').textContent  = snap.eggs;
    $('simWorms').textContent = snap.alive;
    $('simDauer').textContent = snap.dauer;
    $('simDead').textContent  = snap.dead;
    $('simNote').textContent  = note;
    $('simScrub').value       = (simHrs / maxHrs) * 100;

    // Big box → CLEAN VERTICAL breakdown of every stage present on the plate
    const box = $('simStageBox');
    if (box) {
      box.style.background  = '#0f172a';
      box.style.borderColor = '#1e2a3a';
      box.style.textAlign   = 'left';
      box.innerHTML = renderPopulationBreakdown(snap, plate);
    }
  }

  function tick(now) {
    const dt = (now - last) / 1000; last = now;
    if (speed > 0) {
      simHrs = Math.min(maxHrs, simHrs + dt * speed);   // speed = sim-hours per real-second
      if (simHrs >= maxHrs) { speed = 0; _setPlay(false); }
      render();
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  function _setPlay(playing) {
    $('simPlay').textContent = playing ? '⏸' : '▶';
  }

  // Speed buttons
  root.querySelectorAll('.sim-speed').forEach(btn => {
    btn.onclick = () => {
      speed = +btn.dataset.spd;
      _setPlay(true);
      root.querySelectorAll('.sim-speed').forEach(b => b.style.background = '');
      btn.style.background = '#1e2a3a';
      btn.style.color = 'var(--accent)';
      root.querySelectorAll('.sim-speed').forEach(b => { if (b!==btn) b.style.color=''; });
    };
  });

  $('simPlay').onclick = () => {
    if (speed > 0) { speed = 0; _setPlay(false); }
    else { speed = 4; _setPlay(true); }   // default resume speed
  };

  $('simScrub').oninput = (e) => {
    speed = 0; _setPlay(false);
    simHrs = (e.target.value / 100) * maxHrs;
    render();
  };

  $('simReset').onclick = () => {
    speed = 0; _setPlay(false);
    simHrs = startHrs;
    render();
  };

  render();

  return {
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      simCanvas.stop();
    },
  };
}

// ── Plate list ────────────────────────────────────────────────────────────────

// In-app text prompt — native prompt() is blocked in sandboxed/PWA webviews
// ("prompt() is not supported"), so we use a small overlay with an input instead.
// Resolves to the entered string, or null if cancelled.
function _textPrompt(title, defaultVal = '') {
  return new Promise(resolve => {
    document.getElementById('wtTextPrompt')?.remove();
    const ov = document.createElement('div');
    ov.id = 'wtTextPrompt';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:900;display:flex;' +
      'align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:#0f172a;border:1.5px solid var(--accent);border-radius:14px;padding:18px;max-width:320px;width:100%">
        <div style="font-size:13px;font-weight:700;color:#e2e8f0;margin-bottom:10px">${escHtml(title)}</div>
        <input id="wtTextPromptInput" type="text" value="${escHtml(defaultVal)}"
          style="width:100%;padding:9px 11px;font-size:16px;border:1px solid var(--border);border-radius:8px;background:#0a0e1a;color:#e2e8f0;margin-bottom:12px;box-sizing:border-box">
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="wtTextPromptCancel" class="btn-secondary btn-sm" style="width:auto">Cancel</button>
          <button id="wtTextPromptOk" class="btn-primary btn-sm" style="width:auto">OK</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const input = document.getElementById('wtTextPromptInput');
    setTimeout(() => { input.focus(); input.select(); }, 30);
    const done = val => { ov.remove(); resolve(val); };
    document.getElementById('wtTextPromptOk').onclick = () => done(input.value);
    document.getElementById('wtTextPromptCancel').onclick = () => done(null);
    ov.onclick = e => { if (e.target === ov) done(null); };
    input.onkeydown = e => { if (e.key === 'Enter') done(input.value); else if (e.key === 'Escape') done(null); };
  });
}

// Touch long-press drag → move a plate into a bin. HTML5 drag-and-drop never
// fires on touchscreens, so on touch we run our own: hold a card ~320ms to pick
// it up (a ghost follows the finger), drag over a bin chip, release to drop.
// Mouse still uses native HTML5 DnD; these touch handlers are inert with a mouse.
function _attachTouchDrag(card) {
  let lpTimer = null, dragging = false, ghost = null, ids = null, curChip = null, sx = 0, sy = 0;
  const LP = 320, CANCEL = 12;

  const begin = (x, y) => {
    const sel = window._getSelectedIds?.() || [];
    ids = sel.includes(card.dataset.pid) ? sel : [card.dataset.pid];
    dragging = true;
    if (navigator.vibrate) navigator.vibrate(15);
    ghost = card.cloneNode(true);
    ghost.style.cssText = `position:fixed;z-index:950;pointer-events:none;opacity:0.88;width:${card.offsetWidth}px;` +
      'box-shadow:0 10px 26px rgba(0,0,0,0.6);transform:scale(1.03);left:0;top:0;margin:0';
    if (ids.length > 1) {
      const badge = document.createElement('div');
      badge.textContent = ids.length;
      badge.style.cssText = 'position:absolute;top:-8px;right:-8px;background:var(--accent);color:#000;font-size:11px;' +
        'font-weight:800;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center';
      ghost.appendChild(badge);
    }
    document.body.appendChild(ghost);
    card.style.opacity = '0.4';
    moveGhost(x, y);
  };
  const moveGhost = (x, y) => { if (ghost) { ghost.style.left = `${x - ghost.offsetWidth / 2}px`; ghost.style.top = `${y - 24}px`; } };
  const hover = (x, y) => {
    if (ghost) ghost.style.visibility = 'hidden';
    const chip = document.elementFromPoint(x, y)?.closest('.bin-chip');
    if (ghost) ghost.style.visibility = '';
    if (chip === curChip) return;
    if (curChip) curChip.style.outline = '';
    curChip = chip;
    if (curChip) { curChip.style.outline = '2px solid var(--accent)'; curChip.style.outlineOffset = '1px'; }
  };
  const drop = (x, y) => {
    if (ghost) ghost.style.visibility = 'hidden';
    const chip = document.elementFromPoint(x, y)?.closest('.bin-chip');
    if (chip && ids) {
      const target = chip.dataset.binid === 'all' ? null : chip.dataset.binid;
      for (const id of ids) pt.setPlateBin(id, target);
      window._clearSelection?.();
      const binName = target ? (pt.getBins().find(b => b.id === target)?.name ?? 'bin') : 'Unfiled';
      showToast(`Moved ${ids.length} plate${ids.length !== 1 ? 's' : ''} → ${binName}`);
      renderPlateList();
    }
  };
  const finish = () => {
    dragging = false;
    if (ghost) { ghost.remove(); ghost = null; }
    if (curChip) { curChip.style.outline = ''; curChip = null; }
    card.style.opacity = ''; ids = null;
  };

  card.addEventListener('touchstart', e => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
    lpTimer = setTimeout(() => begin(t.clientX, t.clientY), LP);
  }, { passive: true });
  card.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (!dragging) { if (Math.hypot(t.clientX - sx, t.clientY - sy) > CANCEL) clearTimeout(lpTimer); return; }
    e.preventDefault();   // stop the list scrolling while a card is picked up
    moveGhost(t.clientX, t.clientY); hover(t.clientX, t.clientY);
  }, { passive: false });
  card.addEventListener('touchend', e => {
    clearTimeout(lpTimer);
    if (!dragging) return;
    const t = e.changedTouches[0]; drop(t.clientX, t.clientY); finish();
  });
  card.addEventListener('touchcancel', () => { clearTimeout(lpTimer); finish(); });
}

// ── Bins (groups) UI ─────────────────────────────────────────────────────────
function renderBinBar() {
  const bar = document.getElementById('binBar');
  if (!bar) return;
  // Small boxes, 3 per row, each = a drop target (class "bin-chip" for the DnD code).
  bar.style.display = 'grid';
  bar.style.gridTemplateColumns = 'repeat(3, 1fr)';
  const bins = pt.getBins();
  const box = (id, name, count, active) =>
    `<button class="bin-chip" data-binid="${id}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;` +
    `padding:7px 4px;min-height:46px;border-radius:10px;cursor:pointer;text-align:center;overflow:hidden;` +
    `border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};background:${active ? '#0d2a22' : '#0f172a'}">` +
    `<span style="font-size:11px;font-weight:${active ? 700 : 600};color:${active ? 'var(--accent)' : '#cbd5e1'};` +
    `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${name}</span>` +
    `<span style="font-size:9px;color:var(--muted)">${count} plate${count !== 1 ? 's' : ''}</span></button>`;
  let html = box('all', 'All', pt.getAll().length, activeBinId === 'all');
  for (const b of bins) html += box(b.id, escHtml(b.name), pt.binPlateCount(b.id), activeBinId === b.id);
  html += `<button id="btnNewBin" style="display:flex;align-items:center;justify-content:center;gap:4px;padding:7px 4px;min-height:46px;` +
    `border-radius:10px;border:1px dashed var(--border);background:none;color:var(--muted);cursor:pointer;font-size:11px">➕ Bin</button>`;
  if (activeBinId !== 'all' && bins.some(b => b.id === activeBinId)) {
    html += `<div style="grid-column:1 / -1;display:flex;gap:6px;align-items:center;margin-top:2px">` +
      `<button id="btnSimBin" style="flex:1;font-size:11px;padding:6px;border-radius:8px;border:1px solid var(--accent);background:none;color:var(--accent);cursor:pointer">🔮 Simulate bin</button>` +
      `<button id="btnRenameBin" title="Rename bin" style="font-size:13px;padding:5px 9px;border:1px solid var(--border);border-radius:8px;background:none;color:var(--muted);cursor:pointer">✎</button>` +
      `<button id="btnDeleteBin" title="Delete bin" style="font-size:13px;padding:5px 9px;border:1px solid var(--border);border-radius:8px;background:none;color:#f87171;cursor:pointer">🗑</button>` +
      `</div>`;
  }
  bar.innerHTML = html;

  bar.querySelectorAll('.bin-chip').forEach(c => {
    c.addEventListener('click', () => { activeBinId = c.dataset.binid; renderPlateList(); });
    // Drop target: drag plate cards here to move them into this bin ('all' → Unfiled).
    c.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; c.style.outline = '2px solid var(--accent)'; c.style.outlineOffset = '1px'; });
    c.addEventListener('dragleave', () => { c.style.outline = ''; });
    c.addEventListener('drop', e => {
      e.preventDefault(); c.style.outline = '';
      const ids = _dragPlateIds || (e.dataTransfer.getData('text/plain') || '').split(',').filter(Boolean);
      if (!ids.length) return;
      const target = c.dataset.binid === 'all' ? null : c.dataset.binid;   // drop on All = Unfiled
      for (const id of ids) pt.setPlateBin(id, target);
      window._clearSelection?.();
      const binName = target ? (pt.getBins().find(b => b.id === target)?.name ?? 'bin') : 'Unfiled';
      showToast(`Moved ${ids.length} plate${ids.length !== 1 ? 's' : ''} → ${binName}`);
      renderPlateList();
    });
  });
  document.getElementById('btnNewBin')?.addEventListener('click', async () => {
    const name = await _textPrompt('Name this bin', `Bin ${pt.getBins().length + 1}`);
    if (name === null) return;
    const b = pt.addBin(name.trim() || `Bin ${pt.getBins().length + 1}`);
    activeBinId = b.id; renderPlateList();
  });
  document.getElementById('btnRenameBin')?.addEventListener('click', async () => {
    const b = pt.getBins().find(x => x.id === activeBinId); if (!b) return;
    const name = await _textPrompt('Rename bin', b.name);
    if (name === null || !name.trim()) return;
    pt.renameBin(b.id, name.trim()); renderBinBar();
  });
  document.getElementById('btnDeleteBin')?.addEventListener('click', async () => {
    const b = pt.getBins().find(x => x.id === activeBinId); if (!b) return;
    const ok = await showConfirm(`Delete bin "<strong>${escHtml(b.name)}</strong>"?<br><br>Its ${pt.binPlateCount(b.id)} plate(s) move to <em>All / Unfiled</em> — they are NOT deleted.`, '🗑 Delete bin', 'Keep');
    if (!ok) return;
    pt.deleteBin(b.id); activeBinId = 'all'; renderPlateList();
  });
  document.getElementById('btnSimBin')?.addEventListener('click', () => openBinSimulator(activeBinId));
  _populateMoveToBin();
}

function _populateMoveToBin() {
  const sel = document.getElementById('moveToBinSelect');
  if (!sel) return;
  sel.innerHTML = `<option value="">Move to…</option><option value="__none__">— Unfiled —</option>` +
    pt.getBins().map(b => `<option value="${b.id}">${escHtml(b.name)}</option>`).join('') +
    `<option value="__new__">➕ New bin…</option>`;
}

// ── Bin status bar — compact live aggregate shown when a bin is active ────────
function renderBinStatusBar() {
  const el = document.getElementById('binStatus');
  if (!el) return;
  if (activeBinId === 'all') { el.style.display = 'none'; return; }
  const plates = pt.getPlatesInBin(activeBinId);
  if (!plates.length) { el.style.display = 'none'; return; }
  let worms = 0, eggs = 0, lowFood = 101, inoc = 0;
  for (const p of plates) {
    worms += p.wormCount ?? 0;
    eggs  += pt.totalEggs(p.id);
    if (p.inoculatedAt) { inoc++; lowFood = Math.min(lowFood, pt.foodPercent(p.id)); }
  }
  el.style.display = 'block';
  el.innerHTML = `🧫 ${plates.length} plate${plates.length !== 1 ? 's' : ''} · 🐛 ${worms} worms · 🥚 ${eggs} eggs` +
    (inoc ? ` · 🍽 lowest food <b style="color:${lowFood > 40 ? '#5a9e32' : lowFood > 15 ? '#c08020' : '#ef4444'}">${Math.round(lowFood)}%</b>` : ' · not inoculated');
}

// ── Bin Simulator — aggregate growth preview across all plates in a bin ───────
// Mirrors the single-plate Growth Simulator: builds each plate's life timeline,
// then sums population-by-stage / eggs / dauer / dead at each scrub hour. Preview
// only — never mutates plate data.
function openBinSimulator(binId) {
  const bin = pt.getBins().find(b => b.id === binId);
  const plates = pt.getPlatesInBin(binId);
  if (!plates.length) { showToast('This bin has no plates to simulate.'); return; }

  const sims = plates.map(p => {
    const st = getStages(p.strainId, p.tempC);
    const adultStartHrs = (st.find(s => s.id === 'adult') ?? st[st.length - 1]).start;
    return {
      plate: p,
      snaps: buildLifeTimeline(p),
      start: pt.elapsedSinceInoculation(p.id) ?? 0,   // dev-hours since inoculation (0 = not started)
      inoc: !!p.inoculatedAt,
      adultStartHrs,                                   // dev-hour adulthood begins (for the aging curve)
      kAge: Math.max(0.3, adultLifespanDays(p.strainId, p.tempC) / 20),  // Gompertz time-scale vs N2
    };
  });
  // Gompertz constants (N2 adult mortality, per day) — also used by the survival curve.
  const GA = 0.0016, GG = 0.23;
  const r1 = n => Math.round(n * 10) / 10;   // worm counts shown to 1 decimal place
  // Auto-fit the x-axis: run until the longest-lived strain's survival reaches ~2%,
  // so the full curve is visible. Rounded up to a tidy number, clamped 20–85 days.
  const TAU2 = Math.log(1 + (GG / GA) * Math.log(50)) / GG;   // adult-days to ~2% survival (k=1)
  const devNow = s => s.start + (s.plate.stageStartOffset ?? 0);   // founders' current dev-age (hrs)
  const tailDays = s => TAU2 * s.kAge + Math.max(0, (s.adultStartHrs - devNow(s)) / 24);
  const graphDays = Math.min(85, Math.max(20, Math.ceil(Math.max(...sims.map(tailDays)) / 10) * 10));
  const MAX_T = graphDays * 24;
  const dStep = graphDays <= 45 ? 10 : 20;   // x-axis tick spacing (days)

  const stages = getStages('N2', 20);
  const nameOf  = id => (stages.find(s => s.id === id)?.name ?? id);
  const colorOf = id => (stages.find(s => s.id === id)?.color ?? '#94a3b8');
  const SHORT = { egg: 'Egg', l1: 'L1', l2: 'L2', l3: 'L3', l4: 'L4', young_adult: 'YA', adult: 'Adult', dauer: 'Dauer' };
  const ORDER = ['egg', 'l1', 'l2', 'l3', 'l4', 'young_adult', 'adult', 'dauer'];
  const devIdx = id => Math.max(0, ['egg', 'l1', 'l2', 'l3', 'l4', 'young_adult', 'adult'].indexOf(id));
  const foodColor = p => p > 40 ? '#5a9e32' : p > 15 ? '#c08020' : '#ef4444';

  // ── Per-plate snapshot at scrub-hour T ───────────────────────────────────────
  function perPlateAt(T) {
    return sims.map(s => {
      const snap = s.inoc ? timelineAt(s.snaps, s.start + T) : s.snaps[0];
      const byStage = snap ? { ...snap.byStage } : {};
      const alive = snap?.alive ?? 0, eggs = snap?.eggs ?? 0, dauer = snap?.dauer ?? 0, dead = snap?.dead ?? 0;
      const foodPct = s.inoc ? Math.max(0, Math.min(100, snap?.foodPct ?? 100)) : 100;
      let domStage = null, domN = 0, sumIdx = 0, sumN = 0;
      for (const k in byStage) { if (byStage[k] > domN) { domN = byStage[k]; domStage = k; } sumIdx += devIdx(k) * byStage[k]; sumN += byStage[k]; }
      return { name: s.plate.name, inoc: s.inoc, byStage, alive, eggs, dauer, dead, foodPct,
        pop: alive + dauer, domStage, meanIdx: sumN ? sumIdx / sumN : 0, seeded: s.plate.wormCount ?? 0 };
    });
  }
  const aggregate = pp => {
    const byStage = {}; let alive = 0, eggs = 0, dauer = 0, dead = 0, seeded = 0;
    for (const p of pp) { for (const k in p.byStage) byStage[k] = (byStage[k] || 0) + p.byStage[k]; alive += p.alive; eggs += p.eggs; dauer += p.dauer; dead += p.dead; seeded += p.seeded; }
    return { byStage, alive, eggs, dauer, dead, seeded };
  };

  // ── Outlier detection — robust median ± k·MAD (Hampel), the field-standard
  // for biological assays. Resistant to a crashed/contaminated plate distorting
  // the threshold the way mean ± σ does. Only meaningful with ≥3 plates. ────────
  function outliers(pp) {
    const out = [];
    if (pp.length < 3) return out;
    const median = arr => { const s = [...arr].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
    const robust = vals => { const m = median(vals); const mad = 1.4826 * median(vals.map(v => Math.abs(v - m))); return { m, mad }; };  // scaled MAD ≈ σ
    const K = 3;   // ~3 robust σ
    const food = robust(pp.map(p => p.foodPct));
    const dev = robust(pp.map(p => p.meanIdx));
    const pop = robust(pp.map(p => p.pop));
    for (const p of pp) {
      if (food.mad > 4 && p.foodPct < food.m - K * food.mad) out.push(`🍽 <b>${escHtml(p.name)}</b> low food (${p.foodPct.toFixed(0)}% vs median ${food.m.toFixed(0)}%) — starving fastest`);
      if (dev.mad > 0.3 && p.meanIdx > dev.m + K * dev.mad) out.push(`⏩ <b>${escHtml(p.name)}</b> ahead of group (mostly ${SHORT[p.domStage] ?? '—'})`);
      else if (dev.mad > 0.3 && p.meanIdx < dev.m - K * dev.mad) out.push(`⏪ <b>${escHtml(p.name)}</b> lagging (mostly ${SHORT[p.domStage] ?? '—'})`);
      if (pop.mad > 2 && p.pop > pop.m + K * pop.mad) out.push(`📈 <b>${escHtml(p.name)}</b> overgrown (${p.pop} vs median ${pop.m.toFixed(0)})`);
      else if (pop.mad > 2 && p.pop < pop.m - K * pop.mad) out.push(`📉 <b>${escHtml(p.name)}</b> low population (${p.pop} vs median ${pop.m.toFixed(0)})`);
      const dFrac = p.pop ? p.dauer / p.pop : 0;
      if (dFrac > 0.5 && p.dauer >= 2) out.push(`💤 <b>${escHtml(p.name)}</b> ${(dFrac * 100).toFixed(0)}% in dauer — stressed`);
      const mFrac = (p.pop + p.dead) ? p.dead / (p.pop + p.dead) : 0;
      if (mFrac > 0.3 && p.dead >= 2) out.push(`☠ <b>${escHtml(p.name)}</b> ${(mFrac * 100).toFixed(0)}% dead — high mortality`);
      if (p.inoc && p.pop === 0 && p.dead > 0) out.push(`⚠ <b>${escHtml(p.name)}</b> — all worms gone (crashed)`);
    }
    return out;
  }

  document.getElementById('binSimModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'binSimModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.93);z-index:710;display:block;' +
    'overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 16px calc(110px + env(safe-area-inset-bottom,0px));' +
    'animation:wlcIn 0.3s cubic-bezier(0.34,1.56,0.64,1)';
  const sec = t => `<div style="font-size:10px;font-weight:800;letter-spacing:0.06em;color:#64748b;text-transform:uppercase;margin:0 0 6px 2px">${t}</div>`;
  overlay.innerHTML = `
    <div style="max-width:500px;width:100%;margin:0 auto">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <button id="btnCloseBinSim" style="background:none;border:none;color:var(--accent);font-size:15px;font-weight:700;cursor:pointer;width:auto;min-height:unset;padding:4px">← Back</button>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:800;color:#e2e8f0">🔮 Bin Simulator — ${escHtml(bin?.name ?? 'Bin')}</div>
          <div style="font-size:11px;color:#64748b">${plates.length} plate${plates.length !== 1 ? 's' : ''} · preview only — won't change your plates</div>
        </div>
      </div>

      <!-- Control + summary band -->
      <div style="background:#0a1020;border:1.5px solid var(--accent);border-radius:14px;padding:13px;margin-bottom:14px;position:sticky;top:0;z-index:2">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px">
          <span id="binSimTime" style="font-weight:800;color:var(--accent);font-size:13px"></span>
          <span id="binSimTotals" style="color:#cbd5e1;font-size:11px"></span>
        </div>
        <div id="binSimBar" style="display:flex;height:16px;border-radius:8px;overflow:hidden;background:rgba(255,255,255,0.05);margin-bottom:7px"></div>
        <div id="binSimSub" style="font-size:10px;color:#94a3b8;line-height:1.5;margin-bottom:10px"></div>
        <input type="range" id="binSimScrub" min="0" max="${MAX_T}" value="0" style="width:100%;accent-color:var(--accent);margin-bottom:7px">
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
          <button id="binSimPlay" class="sim-btn" style="background:var(--accent);color:#000">▶</button>
          ${[{ x: 1, r: 6 }, { x: 2, r: 24 }, { x: 3, r: 72 }].map(s => `<button class="sim-btn binsim-speed" data-spd="${s.r}">${s.x}×</button>`).join('')}
          <button id="binSimReset" class="sim-btn" style="margin-left:auto">↺ Now</button>
        </div>
      </div>

      <div id="binSimOutliersWrap" style="margin-bottom:14px;display:none">
        ${sec('⚠ Outliers & alerts')}
        <div id="binSimOutliers" style="background:#1a1206;border:1px solid #7c5e1a;border-radius:12px;padding:10px"></div>
      </div>

      <div style="margin-bottom:14px">
        ${sec('Per plate — worms by stage, food, dauer')}
        <div id="binSimPlates"></div>
      </div>

      <div style="margin-bottom:6px">
        ${sec('Survival curve — % alive over time (lifespan model)')}
        <div id="binSimSurvival" style="background:#ffffff;border:1px solid var(--border);border-radius:12px;padding:6px"></div>
      </div>

      <div style="margin-bottom:6px">
        ${sec('Dauer — % of living worms in dauer (per plate, at current time)')}
        <div id="binSimDauer" style="background:#ffffff;border:1px solid var(--border);border-radius:12px;padding:6px"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = id => document.getElementById(id);

  // ── Survival curve geometry + data ───────────────────────────────────────────
  // Survival = living (alive + dauer) ÷ (living + dead) × 100 at each time, sampled
  // across the shared "from now" timeline. One polyline per plate; long-lived strains
  // (fewer age-deaths) sit higher. A dashed marker tracks the scrub position.
  // Kaplan–Meier publication style: white background, black axes, stepped lines,
  // right-side legend. Palette chosen to read on white (mirrors typical KM figures).
  const SURV_PALETTE = ['#16a34a', '#db2777', '#7c3aed', '#2563eb', '#6b7280', '#b91c1c', '#0891b2', '#ea580c', '#65a30d', '#9333ea'];
  const SV = { W: 520, H: 250, x0: 46, x1: 338, y0: 18, y1: 208, yMax: 105 };
  const survX = t => SV.x0 + (Math.min(t, MAX_T) / MAX_T) * (SV.x1 - SV.x0);
  const survY = pct => SV.y0 + (1 - pct / SV.yMax) * (SV.y1 - SV.y0);
  // Survival = a proper lifespan-assay aging curve: founders age and die per the
  // strain's Gompertz hazard μ(τ)=(A/k)·e^((G/k)τ) (τ = days as adult), so deaths
  // accrue gradually by daily probability rather than all at once. Assumes worms
  // are maintained/fed (the standard survival-assay condition); the dashed dauer
  // line below reflects the actual food/population dynamics. N2: A≈0.0016, G≈0.23/d.
  const survAt = (s, t) => {
    if (!s.inoc) return 100;
    const adultDays = (devNow(s) + t - s.adultStartHrs) / 24;   // days into adulthood at scrub time t
    if (adultDays <= 0) return 100;                              // not yet adult → full survival
    const S = Math.exp(-(GA / GG) * (Math.exp((GG / s.kAge) * adultDays) - 1));
    return 100 * S;
  };
  const dauerAt = (s, t) => {   // % of living worms that are in dauer
    if (!s.inoc) return 0;
    const snap = timelineAt(s.snaps, s.start + t);
    if (!snap) return 0;
    const living = snap.alive + snap.dauer;
    return living > 0 ? (snap.dauer / living) * 100 : 0;
  };
  const stepPath = fn => {   // stepped polyline points for a value-function over time
    let p = '', prev = null;
    for (let t = 0; t <= MAX_T; t += 12) {
      const X = survX(t), Y = survY(fn(t));
      p += (prev === null ? '' : `${X.toFixed(1)},${prev.toFixed(1)} `) + `${X.toFixed(1)},${Y.toFixed(1)} `;
      prev = Y;
    }
    return p.trim();
  };
  // Generic KM-style chart: one solid line per plate of valFn, axes, legend, marker.
  function buildChart(containerId, valFn, markerId, yTitle) {
    const A = '#111';
    let g = `<rect x="0" y="0" width="${SV.W}" height="${SV.H}" fill="#ffffff"/>`;
    for (const pct of [0, 25, 50, 75, 100]) {
      const yy = survY(pct);
      g += `<line x1="${SV.x0 - 4}" y1="${yy}" x2="${SV.x0}" y2="${yy}" stroke="${A}" stroke-width="1"/>` +
        `<text x="${SV.x0 - 7}" y="${yy + 3}" font-size="9" fill="${A}" text-anchor="end">${pct}</text>`;
    }
    for (let d = 0; d * 24 <= MAX_T; d += dStep) {
      const xx = survX(d * 24);
      g += `<line x1="${xx}" y1="${SV.y1}" x2="${xx}" y2="${SV.y1 + 4}" stroke="${A}" stroke-width="1"/>` +
        `<text x="${xx}" y="${SV.y1 + 15}" font-size="9" fill="${A}" text-anchor="middle">${d}</text>`;
    }
    g += `<line x1="${SV.x0}" y1="${SV.y0}" x2="${SV.x0}" y2="${SV.y1}" stroke="${A}" stroke-width="1.2"/>` +
      `<line x1="${SV.x0}" y1="${SV.y1}" x2="${SV.x1}" y2="${SV.y1}" stroke="${A}" stroke-width="1.2"/>` +
      `<text x="${(SV.x0 + SV.x1) / 2}" y="${SV.y1 + 32}" font-size="11" fill="${A}" text-anchor="middle">Survival time (days)</text>` +
      `<text x="13" y="${(SV.y0 + SV.y1) / 2}" font-size="11" fill="${A}" text-anchor="middle" transform="rotate(-90 13 ${(SV.y0 + SV.y1) / 2})">${yTitle}</text>`;
    let lines = '', legend = '';
    sims.forEach((s, i) => {
      const col = SURV_PALETTE[i % SURV_PALETTE.length];
      lines += `<polyline points="${stepPath(t => valFn(s, t))}" fill="none" stroke="${col}" stroke-width="1.8"/>`;
      const ly = SV.y0 + 8 + i * 15;
      legend += `<line x1="${SV.x1 + 14}" y1="${ly}" x2="${SV.x1 + 32}" y2="${ly}" stroke="${col}" stroke-width="2.6"/>` +
        `<text x="${SV.x1 + 37}" y="${ly + 3}" font-size="9" fill="${A}">${escHtml(s.plate.name).slice(0, 18)}</text>`;
    });
    const marker = `<line id="${markerId}" x1="${SV.x0}" y1="${SV.y0}" x2="${SV.x0}" y2="${SV.y1}" stroke="#888" stroke-width="1" stroke-dasharray="3 2"/>`;
    $(containerId).innerHTML =
      `<svg viewBox="0 0 ${SV.W} ${SV.H}" width="100%" style="display:block;border-radius:6px">${g}${lines}${legend}${marker}</svg>`;
  }
  const buildCharts = () => {
    buildChart('binSimSurvival', survAt, 'binSimSurvMarker', 'Percent survival');
  };
  // Dauer = a BAR chart (one bar per plate) of the % in dauer AT the scrub time T;
  // redrawn each frame so the bars rise/fall as you scrub. Pairs with the survival line.
  function renderDauerBars(T) {
    const A = '#111';
    const slot = (SV.x1 - SV.x0) / Math.max(1, sims.length);
    const barW = Math.min(60, slot * 0.6);
    let g = `<rect x="0" y="0" width="${SV.W}" height="${SV.H}" fill="#ffffff"/>`;
    for (const pct of [0, 25, 50, 75, 100]) {
      const yy = survY(pct);
      g += `<line x1="${SV.x0}" y1="${yy}" x2="${SV.x1}" y2="${yy}" stroke="#eee" stroke-width="1"/>` +
        `<text x="${SV.x0 - 7}" y="${yy + 3}" font-size="9" fill="${A}" text-anchor="end">${pct}</text>`;
    }
    g += `<line x1="${SV.x0}" y1="${SV.y0}" x2="${SV.x0}" y2="${SV.y1}" stroke="${A}" stroke-width="1.2"/>` +
      `<line x1="${SV.x0}" y1="${SV.y1}" x2="${SV.x1}" y2="${SV.y1}" stroke="${A}" stroke-width="1.2"/>` +
      `<text x="13" y="${(SV.y0 + SV.y1) / 2}" font-size="11" fill="${A}" text-anchor="middle" transform="rotate(-90 13 ${(SV.y0 + SV.y1) / 2})">Percent in dauer</text>`;
    sims.forEach((s, i) => {
      const col = SURV_PALETTE[i % SURV_PALETTE.length];
      const pct = dauerAt(s, T);
      const cx = SV.x0 + slot * (i + 0.5);
      const by = survY(pct), bh = SV.y1 - by;
      g += `<rect x="${(cx - barW / 2).toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" fill="${col}" rx="2"/>`;
      if (pct >= 1) g += `<text x="${cx.toFixed(1)}" y="${(by - 3).toFixed(1)}" font-size="9" fill="${A}" text-anchor="middle">${r1(pct)}%</text>`;
      g += `<text x="${cx.toFixed(1)}" y="${SV.y1 + 13}" font-size="8" fill="${A}" text-anchor="middle">${escHtml(s.plate.name).slice(0, 9)}</text>`;
    });
    $('binSimDauer').innerHTML =
      `<svg viewBox="0 0 ${SV.W} ${SV.H}" width="100%" style="display:block;border-radius:6px">${g}</svg>`;
  }

  function renderAt(T) {
    const pp = perPlateAt(T);
    const a = aggregate(pp);
    $('binSimTime').textContent = T <= 0 ? 'Now' : `+${fmtHours(T)} from now`;
    $('binSimTotals').innerHTML = `🐛 <b style="color:#e2e8f0">${r1(a.alive)}</b> &nbsp; 🥚 ${r1(a.eggs)} &nbsp; 💤 ${r1(a.dauer)} &nbsp; ☠ ${r1(a.dead)}`;

    // Stacked stage distribution bar (whole bin)
    const segs = ORDER.filter(id => a.byStage[id] > 0);
    const totLiving = segs.reduce((s, id) => s + a.byStage[id], 0);
    $('binSimBar').innerHTML = totLiving
      ? segs.map(id => `<div title="${nameOf(id)}: ${r1(a.byStage[id])}" style="width:${(a.byStage[id] / totLiving * 100).toFixed(1)}%;background:${colorOf(id)}"></div>`).join('')
      : '<div style="width:100%;display:flex;align-items:center;justify-content:center;font-size:9px;color:#64748b">no live worms</div>';

    // Sub-metrics: growth, food spread, synchrony
    const popNow = a.alive + a.dauer;
    const growth = a.seeded ? popNow / a.seeded : 1;
    const inocFoods = pp.filter(p => p.inoc).map(p => p.foodPct);
    const foodTxt = inocFoods.length ? `food ${Math.round(Math.min(...inocFoods))}–${Math.round(Math.max(...inocFoods))}%` : 'not inoculated';
    const lowFood = pp.filter(p => p.inoc && p.foodPct <= 15).length;
    const doms = [...new Set(pp.filter(p => p.domStage).map(p => p.domStage))].sort((x, y) => devIdx(x) - devIdx(y));
    const sync = doms.length === 0 ? 'no worms' : doms.length === 1 ? `synchronized — all ${SHORT[doms[0]]}` : `mixed ${SHORT[doms[0]]}→${SHORT[doms[doms.length - 1]]}`;
    // Reference adult lifespan per distinct strain in the bin (strain × its temp)
    const strainTemps = [...new Map(sims.map(s => [s.plate.strainId, s.plate.tempC]))];
    const lifeTxt = strainTemps.map(([sid, t]) => `${sid} ~${adultLifespanDays(sid, t)}d`).join(' · ');
    $('binSimSub').innerHTML =
      `🐛 ${r1(popNow)} worms${a.seeded ? ` (from ${a.seeded} seeded${growth >= 1.1 ? `, ×${growth.toFixed(1)}` : ''})` : ''} · 🍽 ${foodTxt}${lowFood ? ` · <b style="color:#ef4444">${lowFood} starving</b>` : ''}` +
      `<br>🔄 ${sync}<br>⏳ adult lifespan: ${lifeTxt}`;

    // Per-plate cards: each worm type counted, food bar, dauer/dead/eggs
    $('binSimPlates').innerHTML = pp.map(p => {
      const chips = ORDER.filter(id => p.byStage[id] > 0).map(id =>
        `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:${colorOf(id)}22;color:${colorOf(id)};border:1px solid ${colorOf(id)}55">${SHORT[id]} ${p.byStage[id]}</span>`).join('');
      const badges = [p.eggs ? `🥚 ${p.eggs}` : '', p.dauer ? `<span style="color:#94a3b8">💤 ${p.dauer}</span>` : '', p.dead ? `<span style="color:#ef4444">☠ ${p.dead}</span>` : ''].filter(Boolean).join(' &nbsp; ');
      return `<div style="background:#0f172a;border:1px solid var(--border);border-radius:10px;padding:8px 10px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
          <span style="font-size:12px;font-weight:700;color:#e2e8f0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.name)}</span>
          <span style="font-size:10px;color:#64748b">🐛 ${r1(p.pop)}</span>
          ${badges ? `<span style="font-size:10px;color:#64748b">${badges}</span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${chips || '<span style="font-size:10px;color:#64748b">no live worms</span>'}</div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:9px;color:#64748b;width:34px">🍽 ${p.inoc ? '' : 'n/a'}</span>
          <div style="flex:1;height:7px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${p.inoc ? p.foodPct.toFixed(0) : 100}%;background:${foodColor(p.foodPct)};border-radius:4px"></div>
          </div>
          <span style="font-size:10px;color:#94a3b8;width:32px;text-align:right">${p.inoc ? p.foodPct.toFixed(0) + '%' : '—'}</span>
        </div>
      </div>`;
    }).join('');

    // Outliers / alerts
    const al = outliers(pp);
    $('binSimOutliersWrap').style.display = al.length ? 'block' : 'none';
    if (al.length) $('binSimOutliers').innerHTML = al.map(t => `<div style="font-size:11px;color:#fcd34d;line-height:1.5;margin-bottom:3px">${t}</div>`).join('');

    // Move the survival-curve "now" marker; redraw the dauer bars at this time
    const mk = $('binSimSurvMarker');
    if (mk) { const xx = survX(T).toFixed(1); mk.setAttribute('x1', xx); mk.setAttribute('x2', xx); }
    renderDauerBars(T);
  }

  let simT = 0, playing = false, rate = 6, rafId = null, lastTs = null;
  const stop = () => { playing = false; lastTs = null; $('binSimPlay').textContent = '▶'; if (rafId) cancelAnimationFrame(rafId); rafId = null; };
  const step = ts => {
    if (lastTs == null) lastTs = ts;
    const dt = (ts - lastTs) / 1000; lastTs = ts;
    simT = Math.min(MAX_T, simT + dt * rate);   // rate = sim-hours per real second
    $('binSimScrub').value = simT; renderAt(simT);
    if (simT >= MAX_T) { stop(); return; }
    rafId = requestAnimationFrame(step);
  };
  $('binSimScrub').oninput = e => { if (playing) stop(); simT = +e.target.value; renderAt(simT); };
  $('binSimPlay').onclick = () => { if (playing) stop(); else { playing = true; $('binSimPlay').textContent = '⏸'; rafId = requestAnimationFrame(step); } };
  overlay.querySelectorAll('.binsim-speed').forEach(b => b.onclick = () => { rate = +b.dataset.spd; });
  $('binSimReset').onclick = () => { stop(); simT = 0; $('binSimScrub').value = 0; renderAt(0); };
  $('btnCloseBinSim').onclick = () => { stop(); overlay.remove(); };

  buildCharts();   // static per-plate curves (markers track scrub in renderAt)
  renderAt(0);
}

export function renderPlateList() {
  renderBinBar();
  renderBinStatusBar();
  const list = document.getElementById('plateList');
  const plates = activeBinId === 'all' ? pt.getAll() : pt.getPlatesInBin(activeBinId);
  if (!plates.length) {
    list.innerHTML = `<div class="section-empty">${activeBinId === 'all'
      ? 'No plates yet.<br>Click "+ Add Plate".'
      : 'This bin is empty.<br>Add a plate, or move plates in via multi-select.'}</div>`;
    return;
  }
  list.innerHTML = plates.map(plate => {
    const hrs        = pt.elapsedHours(plate.id);
    const strain     = STRAINS[plate.strainId] ?? STRAINS.custom;
    const inocd      = hrs !== null;
    const foodPct    = Math.round(pt.foodPercent(plate.id));
    const totalEggs  = pt.totalEggs(plate.id);
    const isSel      = selectedPlateId === plate.id;
    const isMultiSel = window._getSelectedIds?.()?.includes(plate.id);

    let stageName = '—', stageIcon = '⏳', stageColor = '#64748b';
    if (inocd) {
      const { stage } = getCurrentStage(hrs, plate.strainId, plate.tempC);
      stageName = stage.name; stageIcon = stage.icon; stageColor = stage.color;
    }
    const elapsed = inocd ? fmtElapsed(pt.elapsedMs(plate.id)) : 'Not started';
    const foodBar = `<div class="mini-food-bar"><div style="width:${foodPct}%;background:${foodPct>40?'#5a9e32':foodPct>15?'#c08020':'#ef4444'}"></div></div>`;
    const selClass = isSel ? ' selected' : '';
    const multiClass = isMultiSel ? ' multi-checked' : '';

    return `<div class="plate-item${selClass}${multiClass}" data-pid="${plate.id}" draggable="true" style="position:relative;padding-top:10px">
      <!-- Subtle select checkbox — top right, blends in -->
      <button class="plate-sel-check ${isMultiSel?'checked':''}" data-sid="${plate.id}" title="Select plate">
        ${isMultiSel ? '✓' : ''}
      </button>

      <div class="plate-item-header">
        <span style="font-size:15px">${stageIcon}</span>
        <span class="plate-name">${escHtml(plate.name)}</span>
        <span class="plate-temp-badge">${plate.tempC}°C</span>
      </div>
      <div style="font-size:10px;color:#60a5fa;margin-bottom:3px">${strain.label.split('—')[0].trim()}</div>
      <div class="plate-meta">
        <span class="stage-badge" style="background:${stageColor}22;color:${stageColor};border:1px solid ${stageColor}44">${stageName}</span>
        <span class="plate-elapsed" data-elapsed="${plate.id}">${elapsed}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
        ${foodBar}
        <span style="font-size:10px;color:var(--muted);white-space:nowrap" data-foodpct="${plate.id}">${foodPct}%</span>
        ${plate.wormCount > 1 ? `<span style="font-size:10px;color:var(--muted)">${plate.wormCount}🐛</span>` : ''}
      </div>
      ${totalEggs > 0 ? `<div style="font-size:10px;color:#fbbf24;margin-top:2px">🥚 ${totalEggs} eggs</div>` : ''}
      <!-- Action row: biohazard only appears when plate is checked -->
      <div class="plate-card-actions">
        <button class="plate-action-view" data-vid="${plate.id}">🔬 View Plate</button>
        ${isMultiSel ? `<button class="plate-del-btn" data-del="${plate.id}" title="Discard this plate">☣ Discard</button>` : ''}
      </div>
    </div>`;
  }).join('');

  // Clicking card body → select plate
  list.querySelectorAll('.plate-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.plate-card-actions')) return;
      selectedPlateId = el.dataset.pid;
      window._selectedPlateForTs = selectedPlateId;
      document.getElementById('btnAnalyzeGrowth').disabled = false;
      renderPlateList(); renderPlateDetail(); updateCanvas();
    });
    // Drag a plate card onto a bin chip (or "All") to move it. If the dragged
    // plate is part of the current multi-selection, all selected plates move.
    el.addEventListener('dragstart', e => {
      const sel = window._getSelectedIds?.() || [];
      const ids = sel.includes(el.dataset.pid) ? sel : [el.dataset.pid];
      _dragPlateIds = ids;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ids.join(','));
      el.style.opacity = '0.5';
    });
    el.addEventListener('dragend', () => { el.style.opacity = ''; _dragPlateIds = null; });
    _attachTouchDrag(el);   // touchscreen long-press drag (mouse uses HTML5 DnD above)
  });

  // View Plate — single click: set plate, navigate immediately, then update
  list.querySelectorAll('.plate-action-view').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      selectedPlateId = btn.dataset.vid;
      window._selectedPlateForTs = selectedPlateId;
      // Navigate FIRST so the detail panel is visible when it renders
      if (window._mobileOnPlateSelected) window._mobileOnPlateSelected();
      // Then populate content
      renderPlateDetail();
      updateCanvas();
      // Refresh list last (avoids re-creating buttons before navigation fires)
      renderPlateList();
    });
  });

  // Select checkbox (small top-right box) → toggle multi-select
  list.querySelectorAll('.plate-sel-check').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (window._multiSelectToggle) window._multiSelectToggle(btn.dataset.sid);
      renderPlateList();
    });
  });

  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const p = pt.get(btn.dataset.del);
      const ok = await showConfirm(`Move "<strong>${escHtml(p?.name)}</strong>" to Biohazard Bin?`, '☣ Discard', 'Keep');
      if (!ok) return;
      const binCount = pt.discardPlate(btn.dataset.del);
      if (selectedPlateId === btn.dataset.del) { selectedPlateId = null; _canvas.renderEmpty(); }
      renderPlateList(); renderBinBadge(); renderPlateDetail();
      showToast('Plate moved to Biohazard Bin', 'info');
      if (binCount > 0 && binCount % 10 === 0) {
        const empty = await showConfirm(`Biohazard Bin has ${binCount} plates. Empty permanently?`, '🗑 Empty', 'Keep');
        if (empty) { pt.emptyBin(); renderBinBadge(); }
      }
    });
  });
}

// ── Biohazard bin ─────────────────────────────────────────────────────────────
function renderBinBadge() {
  const n = pt.getBinCount();
  const badge   = document.getElementById('binBadge');
  const subtext = document.getElementById('binSubtext');
  badge.textContent   = n > 0 ? n : '';
  badge.style.display = n > 0 ? 'flex' : 'none';
  if (subtext) subtext.textContent = n === 0 ? 'Empty' : `${n} plate${n !== 1 ? 's' : ''} inside`;
}

function renderBinList() {
  const el = document.getElementById('binList');
  const plates = pt.getBin();
  if (!plates.length) {
    el.innerHTML = '<div class="section-empty">Biohazard Bin is empty.</div>';
    return;
  }

  // Preserve scroll position across rapid 1s redraws
  const scrollTop = el.scrollTop;

  el.innerHTML = plates.map(p => {
    const strain    = STRAINS[p.strainId]?.label.split('—')[0].trim() ?? p.strainId;
    const discDate  = new Date(p.discardedAt).toLocaleDateString();
    const hrs       = pt.elapsedHoursAny(p.id);
    const ms        = pt.elapsedMsAny(p.id);
    const inocd     = hrs !== null;

    let stageLine = '';
    let timerLine = '';
    if (inocd) {
      const { stage } = getCurrentStage(hrs, p.strainId, p.tempC);
      stageLine = `<div class="bin-timer-stage" style="color:${stage.color}">
        ${stage.icon} ${stage.name}
      </div>`;
      timerLine = `<div class="bin-timer-clock">⏱ ${fmtElapsed(ms)}</div>`;
    } else {
      timerLine = `<div style="font-size:10px;color:var(--muted)">Not inoculated</div>`;
    }

    return `<div class="bin-item" data-bid="${p.id}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <div style="font-size:12px;font-weight:600;flex:1">${escHtml(p.name)}</div>
        <span style="font-size:10px;background:#1e2a3a;color:var(--muted);padding:1px 6px;border-radius:8px">${p.tempC}°C</span>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px">${strain} · Discarded ${discDate}</div>
      ${stageLine}
      ${timerLine}
      <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
        <button class="btn-secondary btn-sm bin-restore" data-bid="${p.id}" style="width:auto;flex:1">↩ Restore</button>
        <button class="btn-secondary btn-sm bin-export"  data-bid="${p.id}" style="width:auto">⬇ XLS</button>
        <button class="btn-danger   btn-sm bin-delete"   data-bid="${p.id}" style="width:auto">✕</button>
      </div>
    </div>`;
  }).join('');

  el.scrollTop = scrollTop;

  el.querySelectorAll('.bin-restore').forEach(btn => {
    btn.addEventListener('click', () => {
      pt.restoreFromBin(btn.dataset.bid);
      renderPlateList(); renderBinBadge(); renderBinList();
    });
  });
  el.querySelectorAll('.bin-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Permanently delete this plate? The timer stops and data is gone forever.')) return;
      pt.deleteFromBin(btn.dataset.bid);
      renderBinBadge(); renderBinList();
    });
  });
  el.querySelectorAll('.bin-export').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = pt.getBin().find(x => x.id === btn.dataset.bid);
      if (p) exportPlateDataToExcel(p);
    });
  });
}

// ── Plate detail ──────────────────────────────────────────────────────────────
export function renderPlateDetail() {
  const detailEl = document.getElementById('plateDetail');
  const emptyEl  = document.getElementById('plateDetailEmpty');
  if (!selectedPlateId) {
    detailEl.classList.add('hidden'); emptyEl.classList.remove('hidden'); return;
  }
  const plate = pt.get(selectedPlateId);
  if (!plate) { detailEl.classList.add('hidden'); emptyEl.classList.remove('hidden'); return; }

  detailEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  document.getElementById('plateStrainSelect').value = plate.strainId;
  document.getElementById('customStrainWrap').classList.toggle('hidden', plate.strainId !== 'custom');
  document.getElementById('customStrainName').value = plate.name;
  document.getElementById('plateTempSelect').value   = plate.tempC;
  document.getElementById('wormCountInput').value    = plate.wormCount ?? 1;

  const food = plate.initialFood ?? 0.2;
  document.getElementById('foodVolumeSlider').value  = food;
  document.getElementById('foodVolumeVal').textContent = `${food.toFixed(2)} ml`;
  // Auto-set consumption rate based on strain
  const autoRate = _autoConsumptionRate(plate.strainId);
  pt.update(selectedPlateId, { consumptionRate: autoRate });
  document.getElementById('consumptionSelect').value = autoRate;
  // Update display text
  const rateLabels = { low: 'low (dietary restriction)', standard: 'standard', high: 'high' };
  const dispEl = document.getElementById('consumptionDisplay');
  if (dispEl) dispEl.textContent = `auto (${rateLabels[autoRate] ?? autoRate})`;
  document.getElementById('plateNotesInput').value   = plate.notes ?? '';

  const inocd = plate.inoculatedAt !== null;

  // Show canvas toggle arrow + cohort section only after inoculation
  document.getElementById('canvasToggleArrow')?.classList.toggle('hidden', !inocd);
  document.getElementById('cohortSection')?.classList.toggle('hidden', !inocd);

  if (!inocd) {
    _setInoculateMode();
    populateStartingStageSelect();
    document.getElementById('foodRemainingDisplay').textContent = `${food.toFixed(1)} ml (full)`;
    document.getElementById('foodRemainingBar').style.width = '100%';
    document.getElementById('foodETA').textContent = '';
  } else {
    _setDiscardMode();
    renderTimerDisplay();
    renderTimeline(plate);
    renderCurrentStageCard(plate);
    updateFoodDisplay();
    renderCohorts(plate);
  }

  renderEggSection();
  renderObservations(plate);
  renderStrainInfo();

  // Make sure the canvas is expanded (not stuck collapsed) and render reliably.
  const wrap = document.getElementById('plateCanvasWrap');
  if (wrap?.classList.contains('canvas-collapsed')) {
    wrap.classList.remove('canvas-collapsed');
    _syncToggleLabel(false);
  }
  // Render across the next frames so it shows immediately (not only after a click)
  requestAnimationFrame(() => _resizeAndRender());
}

// ── Worm cohorts UI ────────────────────────────────────────────────────────────
function renderCohorts(plate) {
  const el = document.getElementById('cohortList');
  if (!el) return;
  const cohorts = pt.getCohorts(plate.id);
  if (!cohorts.length) {
    el.innerHTML = '<div class="section-empty" style="padding:6px;font-size:11px">No worm groups yet.</div>';
    return;
  }
  el.innerHTML = cohorts.map(c => {
    const cStrain = c.strainId ?? plate.strainId;
    const cStages = getStages(cStrain, plate.tempC);
    const stDef = cStages.find(s => s.id === c.startingStageId) ?? cStages[0];
    const ageHrs = plate.inoculatedAt
      ? ((Date.now() - plate.inoculatedAt) / 3_600_000 + (c.stageStartOffset ?? 0))
      : (c.stageStartOffset ?? 0);
    const { stage } = getCurrentStage(ageHrs, cStrain, plate.tempC);
    const strainLabel = (STRAINS[cStrain]?.label ?? cStrain).split('—')[0].trim();
    const originBadge = c.origin === 'transfer' ? '🔀 transferred'
                      : c.origin === 'added' ? '➕ added' : '🧫 original';
    return `<div style="background:#0f172a;border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:5px">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:14px">${stage.icon}</span>
        <span style="font-weight:700;font-size:13px;color:var(--text)">${c.count} ${strainLabel}</span>
        <span style="font-size:10px;color:${stage.color};margin-left:auto">${stage.name}</span>
      </div>
      <div style="font-size:9px;color:var(--muted);margin-top:3px">${originBadge} · started as ${stDef.name} · age ${ageHrs.toFixed(1)}h</div>
    </div>`;
  }).join('');
}

// ── Button mode helpers ────────────────────────────────────────────────────────
function _setInoculateMode() {
  const btn = document.getElementById('btnMainAction');
  btn.textContent = '🧫 Inoculate Plate — Start Timer';
  btn.className   = 'btn-main-action inoculate-mode';
  document.getElementById('btnRestartTimer').classList.add('hidden');
  document.getElementById('stageSelectWrap').classList.remove('hidden');
  document.getElementById('timerSection').classList.add('hidden');
  document.getElementById('plateTimeline').innerHTML =
    '<div class="section-empty" style="padding:8px">Inoculate to start timer.</div>';
  document.getElementById('curStageCard').innerHTML = '';
  document.getElementById('canvasToggleArrow')?.classList.add('hidden');
  document.getElementById('cohortSection')?.classList.add('hidden');
}

function _setDiscardMode() {
  const btn = document.getElementById('btnMainAction');
  btn.textContent = '☣ Discard Plate — Move to Biohazard Bin';
  btn.className   = 'btn-main-action discard-mode';
  document.getElementById('btnRestartTimer').classList.remove('hidden');
  document.getElementById('stageSelectWrap').classList.add('hidden');
  document.getElementById('timerSection').classList.remove('hidden');
  document.getElementById('canvasToggleArrow')?.classList.remove('hidden');
  document.getElementById('cohortSection')?.classList.remove('hidden');
  // Render cohorts for the current plate
  if (selectedPlateId) { const p = pt.get(selectedPlateId); if (p) renderCohorts(p); }
}

// ── Stage selector for inoculation ────────────────────────────────────────────
function populateStartingStageSelect() {
  const plate = selectedPlateId ? pt.get(selectedPlateId) : null;
  const sel = document.getElementById('startingStageSelect');
  if (!plate || !sel) return;
  const stages = getStages(plate.strainId, plate.tempC);
  sel.innerHTML = stages.map(s =>
    `<option value="${s.id}">${s.icon} ${s.name} (starts at ${fmtHours(s.start)})</option>`
  ).join('');
  sel.value = plate.startingStageId ?? 'egg';
}

// ── Timer display ─────────────────────────────────────────────────────────────
function renderTimerDisplay() {
  if (!selectedPlateId) return;
  const ms = pt.elapsedMs(selectedPlateId);
  if (ms === null) return;
  const plate = pt.get(selectedPlateId);
  if (!plate) return;
  const hrs   = pt.elapsedHours(selectedPlateId) ?? 0;
  const total = getStages(plate.strainId, plate.tempC).reduce((s, st) => s + st.duration, 0);
  const pct   = Math.min(100, (hrs / total) * 100);
  document.getElementById('timerDisplay').textContent = fmtElapsed(ms);
  document.getElementById('timerProgressFill').style.width = `${pct.toFixed(2)}%`;
  document.getElementById('timerPct').textContent = `${pct.toFixed(1)}% of development cycle`;
  const stageEl = document.getElementById('timerStageLabel');
  if (stageEl) {
    const { stage } = getCurrentStage(hrs, plate.strainId, plate.tempC);
    stageEl.textContent = `${stage.icon} ${stage.name}`;
    stageEl.style.color = stage.color;
  }
}

// ── Food display ──────────────────────────────────────────────────────────────
function updateFoodDisplay() {
  if (!selectedPlateId) return;
  const plate = pt.get(selectedPlateId);
  if (!plate) return;
  const remaining = pt.foodRemaining(selectedPlateId);
  const pct       = pt.foodPercent(selectedPlateId);
  const hoursLeft = pt.hoursUntilEmpty(selectedPlateId);
  const color     = pct > 40 ? '#5a9e32' : pct > 15 ? '#c08020' : '#ef4444';
  document.getElementById('foodRemainingDisplay').textContent =
    `${remaining.toFixed(3)} ml remaining (${pct.toFixed(0)}%)`;
  document.getElementById('foodRemainingBar').style.cssText =
    `width:${pct.toFixed(1)}%;background:${color};height:100%;border-radius:3px;transition:width 1s,background 1s`;
  const etaEl = document.getElementById('foodETA');
  if (etaEl) {
    etaEl.textContent = pct <= 0 ? '⚠ Food exhausted!'
      : isFinite(hoursLeft) ? `Empty in ~${fmtHours(hoursLeft)}`
      : '';
    etaEl.style.color = pct < 20 ? '#f59e0b' : 'var(--muted)';
  }
}

// ── Timeline ──────────────────────────────────────────────────────────────────
function renderTimeline(plate) {
  const hrs = pt.elapsedHours(plate.id);
  if (hrs === null) return;
  const stages = getStages(plate.strainId, plate.tempC);
  const total  = stages[stages.length - 1].end;
  const { stage: cur } = getCurrentStage(hrs, plate.strainId, plate.tempC);
  const pct = Math.min(100, (hrs / total) * 100);
  document.getElementById('plateTimeline').innerHTML = `
    <div class="tl-track">
      ${stages.map(s => {
        const w = ((s.end - s.start) / total * 100).toFixed(2);
        const isCur = s.id === cur.id;
        return `<div class="tl-segment${isCur?' current':''}"
          style="width:${w}%;background:${s.color}${isCur?'cc':'33'};border:1px solid ${s.color}66"
          title="${s.name}: ${fmtHours(s.start)}–${fmtHours(s.end)}"><span class="tl-label">${s.icon}</span></div>`;
      }).join('')}
      <div class="tl-cursor" style="left:${pct}%"></div>
    </div>
    <div class="tl-labels">
      ${stages.map(s => {
        const lP = (((s.start+(s.end-s.start)/2)/total)*100).toFixed(1);
        return `<div class="tl-lbl-item" style="left:${lP}%">${s.name.split(' ')[0]}</div>`;
      }).join('')}
    </div>
    <div style="font-size:10px;color:var(--muted);text-align:right;margin-top:2px">
      Total at ${plate.tempC}°C: ${fmtHours(total)}
    </div>`;
}

function renderCurrentStageCard(plate) {
  const hrs = pt.elapsedHours(plate.id);
  if (hrs === null) return;
  const { stage, progress, hoursInStage, hoursToNext } = getCurrentStage(hrs, plate.strainId, plate.tempC);
  const pct = Math.round(progress * 100);
  const dauerWarn = stage.isDauer
    ? `<div class="dauer-alert">⏸ Dauer — worms in survival mode. Provide food or lower temperature to resume.</div>` : '';
  document.getElementById('curStageCard').innerHTML = `
    <div class="stage-card" style="border-color:${stage.color}44">
      ${dauerWarn}
      <div class="stage-card-header">
        <span style="font-size:26px">${stage.icon}</span>
        <div style="flex:1">
          <div class="stage-card-name" style="color:${stage.color}">${stage.name}</div>
          <div class="stage-card-time">${fmtHours(hoursInStage)} in this stage${hoursToNext>0?` · next in ~${fmtHours(hoursToNext)}`:''}</div>
        </div>
      </div>
      <div class="stage-progress-bar"><div class="stage-progress-fill" style="width:${pct}%;background:${stage.color}"></div></div>
      <div class="stage-card-desc">${stage.description}</div>
      <div class="stage-card-signs"><strong>Visible signs:</strong> ${stage.visibleSigns}</div>
      <div class="stage-card-size"><strong>Expected size:</strong> ${stage.size}</div>
    </div>`;
}

// ── Egg section ───────────────────────────────────────────────────────────────
function renderEggSection() {
  const eggSection = document.getElementById('eggSection');
  if (!selectedPlateId) { eggSection.classList.add('hidden'); return; }
  const plate = pt.get(selectedPlateId);
  if (!plate?.inoculatedAt) { eggSection.classList.add('hidden'); return; }
  const hrs = pt.elapsedHours(selectedPlateId);
  const { stage } = getCurrentStage(hrs, plate.strainId, plate.tempC);
  // Always show the egg tracker once inoculated (shows a countdown to laying onset
  // before worms reach adulthood, then the live laying timer once they're adults).
  eggSection.classList.remove('hidden');

  const counts  = plate.eggCounts;
  const manualTotal = pt.totalEggs(selectedPlateId);
  const strainDef = STRAINS[plate.strainId] ?? STRAINS.N2;
  const maxEggs = strainDef.maxEggs;
  const stages  = getStages(plate.strainId, plate.tempC);
  const adultStage = stages.find(s => s.id === 'adult') ?? stages[stages.length - 1];

  // Simulated auto egg-laying once worms reach reproductive adult
  const laying = pt.eggLayingInfo(adultStage.start, hrs, maxEggs, plate.wormCount ?? 1);
  // Displayed total = auto-predicted + any manually logged
  const total = laying.predicted + manualTotal;
  const pct   = Math.min(100, (total / laying.totalExpected) * 100);

  // Pre-adulthood: show countdown to when egg-laying begins
  const hrsToLaying = adultStage.start - hrs;
  const nextWrap = document.getElementById('nextEggWrap');
  if (hrsToLaying > 0) {
    // Not laying yet — show time until adulthood / first egg
    nextWrap.style.display = '';
    document.getElementById('nextEggCountdown').textContent = `egg-laying in ~${fmtHours(hrsToLaying)}`;
    const lifeProgress = Math.min(100, (hrs / adultStage.start) * 100);
    document.getElementById('nextEggFill').style.width = `${lifeProgress.toFixed(1)}%`;
  } else if (laying.isLaying && laying.secsToNext != null) {
    nextWrap.style.display = '';
    const secs = Math.max(0, laying.secsToNext);
    document.getElementById('nextEggCountdown').textContent =
      secs >= 60 ? `${Math.floor(secs/60)}m ${Math.round(secs%60)}s` : `${secs.toFixed(0)}s`;
    document.getElementById('nextEggFill').style.width = `${laying.nextFracPct.toFixed(1)}%`;
  } else {
    document.getElementById('nextEggCountdown').textContent = laying.done ? 'laying complete' : 'not yet laying';
    document.getElementById('nextEggFill').style.width = laying.done ? '100%' : '0%';
  }

  // Average rate over the laying period
  const rate = laying.isLaying || laying.done
    ? `${laying.ratePerHr.toFixed(1)} eggs/hr (avg)`
    : '—';

  document.getElementById('eggTotalDisplay').textContent = total;
  document.getElementById('eggRateDisplay').textContent  = rate;
  document.getElementById('eggProgressFill').style.width = `${pct.toFixed(1)}%`;
  document.getElementById('eggMaxDisplay').textContent   = `/ ~${laying.totalExpected} expected`;
  document.getElementById('eggHistory').innerHTML = counts.length === 0
    ? '<div style="font-size:11px;color:var(--muted)">No counts logged yet.</div>'
    : [...counts].reverse().slice(0, 6).map(c => {
        const hrsIn = ((c.time - plate.inoculatedAt) / 3_600_000 + (plate.stageStartOffset ?? 0)).toFixed(1);
        return `<div style="font-size:11px;display:flex;gap:8px;padding:3px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--muted)">${new Date(c.time).toLocaleTimeString()}</span>
          <span style="color:#fbbf24">+${c.count} 🥚</span>
          <span style="color:var(--muted)">total ${c.cumulative}</span>
          <span style="color:var(--muted);margin-left:auto">${hrsIn}h</span>
        </div>`;
      }).join('');
}

// ── Strain info ───────────────────────────────────────────────────────────────
function renderStrainInfo() {
  const el = document.getElementById('strainInfoPanel');
  if (!selectedPlateId) { el.innerHTML = ''; return; }
  const plate  = pt.get(selectedPlateId);
  if (!plate) { el.innerHTML = ''; return; }
  const strain = STRAINS[plate.strainId] ?? STRAINS.N2;
  const isDauerTemp = strain.dauerTemps?.includes(plate.tempC);
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <div style="width:10px;height:10px;border-radius:50%;background:${strain.color};flex-shrink:0"></div>
      <strong style="font-size:12px">${strain.label}</strong>
    </div>
    <div style="font-size:11px;color:var(--text);line-height:1.5;margin-bottom:4px">${strain.phenotype}</div>
    ${isDauerTemp ? `<div class="dauer-alert" style="font-size:11px">⚠ At ${plate.tempC}°C this strain enters dauer. Use 20°C for normal development.</div>` : ''}
    <div style="font-size:10px;color:var(--muted);line-height:1.6">
      <div><strong>Lifespan at 20°C:</strong> ${strain.lifespan20C}</div>
      <div><strong>Max progeny:</strong> ~${strain.maxEggs}</div>
      <div><strong>Dauer:</strong> ${strain.dauerNotes}</div>
      <div style="margin-top:2px;font-style:italic">${strain.refs}</div>
    </div>`;
}

// ── Observations ──────────────────────────────────────────────────────────────
function renderObservations(plate) {
  const el = document.getElementById('obsList');
  if (!plate.observations.length) {
    el.innerHTML = '<div class="section-empty">No observations yet.</div>';
    return;
  }
  el.innerHTML = [...plate.observations].reverse().map(obs => {
    const hrs = plate.inoculatedAt
      ? (((obs.time - plate.inoculatedAt) / 3_600_000) + (plate.stageStartOffset ?? 0)).toFixed(1) : '—';
    const img = obs.imageDataUrl ? `<img src="${obs.imageDataUrl}" class="obs-img" alt="">` : '';
    const sb  = obs.stageId ? `<span class="obs-stage-badge">${obs.stageId.toUpperCase()}</span>` : '';
    return `<div class="obs-card">
      <div class="obs-header">
        <span class="obs-time">${new Date(obs.time).toLocaleString()}</span>
        <span class="obs-elapsed">${hrs}h</span>${sb}
        <button class="obs-del" data-oid="${obs.id}">✕</button>
      </div>${img}
      ${obs.note ? `<div class="obs-note">${escHtml(obs.note)}</div>` : ''}
    </div>`;
  }).join('');
  el.querySelectorAll('.obs-del').forEach(btn => {
    btn.addEventListener('click', () => {
      pt.deleteObservation(selectedPlateId, btn.dataset.oid);
      renderPlateDetail();
    });
  });
}

function addObservation() {
  if (!selectedPlateId) return;
  const note    = document.getElementById('obsNoteInput').value.trim();
  const stageId = document.getElementById('obsStageSelect').value || null;
  pt.addObservation(selectedPlateId, { note, imageDataUrl: _pendingImageDataUrl, stageId });
  document.getElementById('obsNoteInput').value = '';
  document.getElementById('obsImageInput').value = '';
  document.getElementById('obsImagePreview').classList.add('hidden');
  _pendingImageDataUrl = null;
  renderPlateDetail(); renderPlateList();
}

function handleObsImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    _pendingImageDataUrl = ev.target.result;
    const prev = document.getElementById('obsImagePreview');
    prev.src = _pendingImageDataUrl;
    prev.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

// ── Excel export ──────────────────────────────────────────────────────────────
function exportPlateToExcel(plateId) {
  const plate = pt.get(plateId);
  if (!plate) return;
  exportPlateDataToExcel(plate);
}

function exportPlateDataToExcel(plate) {
  const strain  = STRAINS[plate.strainId] ?? STRAINS.N2;
  const stages  = getStages(plate.strainId, plate.tempC);
  const hrs     = pt.elapsedHours(plate.id) ?? 0;
  const { stage: curStage } = getCurrentStage(hrs, plate.strainId, plate.tempC);
  const totalEggs = pt.totalEggs(plate.id);
  const foodPct   = pt.foodPercent(plate.id).toFixed(1);
  const foodRem   = pt.foodRemaining(plate.id).toFixed(3);

  // Build HTML-based Excel (works in Excel, LibreOffice, Google Sheets)
  const th = (t) => `<th style="background:#1e3a5f;color:#fff;padding:6px 10px;border:1px solid #ccc">${escHtml(String(t))}</th>`;
  const td = (t) => `<td style="padding:5px 10px;border:1px solid #ddd">${escHtml(String(t ?? ''))}</td>`;
  const h2 = (t) => `<tr><td colspan="4" style="background:#0f2744;color:#00d4aa;font-size:14px;font-weight:bold;padding:8px 10px;border:1px solid #ccc">${escHtml(t)}</td></tr>`;

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8">
    <style>table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px}
    body{font-family:Arial,sans-serif}</style>
    </head><body>
    <p style="font-size:16px;font-weight:bold;color:#0f2744">WormTrace — Plate Export</p>
    <p style="color:#666">Generated: ${new Date().toLocaleString()}</p><br>
    <table>`;

  // ── Section 1: Summary ──────────────────────────────────────────────────────
  html += h2('1. Plate Summary');
  const summary = [
    ['Plate Name', plate.name],
    ['Strain', strain.label],
    ['Temperature', `${plate.tempC}°C`],
    ['Worm Count', plate.wormCount ?? 1],
    ['Starting Stage', plate.startingStageId ?? 'egg'],
    ['Initial Food Volume', `${(plate.initialFood ?? 0.5).toFixed(1)} ml`],
    ['Food Remaining', `${foodRem} ml (${foodPct}%)`],
    ['Consumption Rate', plate.consumptionRate ?? 'standard'],
    ['Inoculated At', plate.inoculatedAt ? new Date(plate.inoculatedAt).toLocaleString() : 'Not started'],
    ['Elapsed (developmental)', fmtHours(hrs)],
    ['Current Stage', curStage.name],
    ['Total Eggs Laid', totalEggs],
    ['Strain Lifespan (20°C)', strain.lifespan20C],
    ['Max Expected Progeny', `~${strain.maxEggs}`],
    ['Lab Notes', plate.notes ?? ''],
  ];
  summary.forEach(([k, v]) => { html += `<tr>${th(k)}${td(v)}</tr>`; });

  // ── Section 2: Development timeline ─────────────────────────────────────────
  html += h2('2. Expected Development Timeline');
  html += `<tr>${th('Stage')}${th('Start (hr)')}${th('End (hr)')}${th('Duration (hr)')}${th('Description')}</tr>`;
  stages.forEach(s => {
    html += `<tr>${td(`${s.icon} ${s.name}`)}${td(s.start.toFixed(1))}${td(s.end.toFixed(1))}${td(s.duration.toFixed(1))}${td(s.description)}</tr>`;
  });

  // ── Section 3: Observations ──────────────────────────────────────────────────
  html += h2('3. Observation Log');
  if (plate.observations.length) {
    html += `<tr>${th('Timestamp')}${th('Developmental Hour')}${th('Stage Confirmed')}${th('Note')}</tr>`;
    plate.observations.forEach(obs => {
      const obsHrs = plate.inoculatedAt
        ? (((obs.time - plate.inoculatedAt) / 3_600_000) + (plate.stageStartOffset ?? 0)).toFixed(1)
        : '—';
      html += `<tr>${td(new Date(obs.time).toLocaleString())}${td(obsHrs)}${td(obs.stageId ?? '—')}${td(obs.note ?? '')}</tr>`;
    });
  } else {
    html += `<tr><td colspan="4" style="color:#999;padding:5px 10px;border:1px solid #ddd">No observations logged.</td></tr>`;
  }

  // ── Section 4: Egg counts ────────────────────────────────────────────────────
  html += h2('4. Egg Count Log');
  if (plate.eggCounts.length) {
    html += `<tr>${th('Timestamp')}${th('Developmental Hour')}${th('Count (session)')}${th('Cumulative Total')}</tr>`;
    plate.eggCounts.forEach(ec => {
      const ecHrs = plate.inoculatedAt
        ? (((ec.time - plate.inoculatedAt) / 3_600_000) + (plate.stageStartOffset ?? 0)).toFixed(1)
        : '—';
      html += `<tr>${td(new Date(ec.time).toLocaleString())}${td(ecHrs)}${td(ec.count)}${td(ec.cumulative)}</tr>`;
    });
  } else {
    html += `<tr><td colspan="4" style="color:#999;padding:5px 10px;border:1px solid #ddd">No egg counts logged.</td></tr>`;
  }

  // ── Section 5: Strain reference ──────────────────────────────────────────────
  html += h2('5. Strain Reference');
  const strainInfo = [
    ['Strain ID', strain.id],
    ['Full Label', strain.label],
    ['Phenotype', strain.phenotype],
    ['Dauer Conditions', strain.dauerNotes],
    ['References', strain.refs],
  ];
  strainInfo.forEach(([k, v]) => { html += `<tr>${th(k)}${td(v)}</tr>`; });

  html += `</table></body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const name = `${plate.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.xls`;
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** Auto-set consumption rate based on strain characteristics */
function _autoConsumptionRate(strainId) {
  // eat-2 has dietary restriction — lower consumption
  if (strainId === 'eat-2') return 'low';
  // daf-2 has slow pharyngeal pumping — slightly below standard
  if (strainId === 'daf-2') return 'low';
  // Gravid adults / large worms — standard or high
  return 'standard';
}
