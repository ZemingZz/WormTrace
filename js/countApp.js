/**
 * countApp.js — Worm Counter & Labeler tab. Upload plate photo(s), auto pre-fill
 * with the detector, then hand-correct by tapping (zoomed in) — built for clumped
 * plates. Export the image + labels as a training file for later upload.
 */
import { WormCounter } from './WormCounter.js?v=143';
import { WormLabeler, LABEL_CATS } from './WormLabeler.js?v=143';
import { WormLearner } from './WormLearner.js?v=143';

const counter = new WormCounter();
const learner = new WormLearner();
const $ = id => document.getElementById(id);

let labeler = null;
let images = [];     // { id, name, imgEl, thumbUrl, points: [] }
let selected = -1;

// Permissive detector settings used to gather CANDIDATE blobs for training/smart
// pre-fill — deliberately loose so eggs/debris are captured as negatives.
const TRAIN_OPTS = { sensitivity: 16, minArea: 12, maxArea: 12000, minAspect: 1.0, blurRadius: 16 };
const WORM_CATS = ['l1', 'l2', 'l3', 'l4', 'adult'];   // living-worm stages (egg/dead aren't "worms to count")
const wormTotal = c => WORM_CATS.reduce((s, k) => s + (c[k] || 0), 0);   // living worms in a counts object

function detectorOpts() {
  return { sensitivity: +$('countSens').value, minArea: +$('countMin').value, maxArea: +$('countMax').value };
}
function nearestPoint(pts, x, y, r) {
  let best = r, hit = null;
  for (const p of pts) { const d = Math.hypot(p.x - x, p.y - y); if (d < best) { best = d; hit = p; } }
  return hit;
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initCountTab() {
  labeler = new WormLabeler($('labelCanvas'));
  labeler.onChange = renderCounts;

  buildPalette();

  $('btnCountUpload')?.addEventListener('click', () => $('countFileInput').click());
  $('countFileInput')?.addEventListener('change', onUpload);

  $('btnModeAdd')?.addEventListener('click', () => setMode('add'));
  $('btnModeErase')?.addEventListener('click', () => setMode('erase'));
  $('btnZoomIn')?.addEventListener('click', () => labeler.zoomBy(1.4));
  $('btnZoomOut')?.addEventListener('click', () => labeler.zoomBy(1 / 1.4));
  $('btnZoomReset')?.addEventListener('click', () => labeler.resetView());
  $('btnPrefill')?.addEventListener('click', prefill);
  $('btnLabelClear')?.addEventListener('click', () => {
    if (confirm('Clear all marks on this photo?')) labeler.clear();
  });
  $('btnLabelExport')?.addEventListener('click', exportTraining);
  $('btnLabelImport')?.addEventListener('click', () => $('labelImportInput').click());
  $('labelImportInput')?.addEventListener('change', onImport);

  // ── Send this photo's count into the Plate Tracker ──
  $('btnCountToPlate')?.addEventListener('click', addAsPlate);

  // ── In-app learning ──
  $('btnConfirmTrain')?.addEventListener('click', confirmTrain);
  $('btnModelExport')?.addEventListener('click', exportModel);
  $('btnModelImport')?.addEventListener('click', () => $('modelImportInput').click());
  $('modelImportInput')?.addEventListener('change', onModelImport);
  $('btnModelReset')?.addEventListener('click', () => {
    if (confirm('Reset the learned model? This erases all training on this device.')) {
      learner.reset(); renderLearnPanel(); flash('Model reset.');
    }
  });
  renderLearnPanel();

  ['countSens', 'countMin', 'countMax'].forEach(id => {
    $(id)?.addEventListener('input', () => {
      $('countSensVal').textContent = $('countSens').value;
      $('countMinVal').textContent  = $('countMin').value;
      $('countMaxVal').textContent  = $('countMax').value;
    });
  });
}

// ── Category palette ────────────────────────────────────────────────────────
function buildPalette() {
  const el = $('catPalette');
  el.innerHTML = Object.entries(LABEL_CATS).map(([k, v]) =>
    `<button class="cat-chip${k === labeler.cat ? ' active' : ''}" data-cat="${k}">
       <span class="swatch" style="background:${v.color}"></span>${v.label}</button>`).join('');
  el.querySelectorAll('.cat-chip').forEach(b => b.addEventListener('click', () => {
    el.querySelectorAll('.cat-chip').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    labeler.setCategory(b.dataset.cat);
    setMode('add');
  }));
}

function setMode(mode) {
  labeler.setMode(mode);
  $('btnModeAdd').classList.toggle('active', mode === 'add');
  $('btnModeErase').classList.toggle('active', mode === 'erase');
}

// ── Upload / thumbnails ─────────────────────────────────────────────────────
function onUpload(e) {
  const files = [...e.target.files]; e.target.value = '';
  if (!files.length) return;
  let pending = files.length;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        images.push({ id: `${file.name}_${images.length}`, name: file.name, imgEl: img, thumbUrl: ev.target.result, points: [] });
        if (--pending === 0) selectImage(images.length - 1);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderThumbs() {
  const wrap = $('countThumbs');
  wrap.innerHTML = images.map((im, i) => `
    <div class="count-thumb" data-i="${i}" style="position:relative;width:52px;height:52px;border-radius:6px;overflow:hidden;
      border:2px solid ${i === selected ? 'var(--accent)' : 'transparent'};cursor:pointer;flex-shrink:0">
      <img src="${im.thumbUrl}" style="width:100%;height:100%;object-fit:cover">
      ${im.points.length ? `<span style="position:absolute;bottom:0;right:0;background:rgba(0,0,0,.7);color:#00d4aa;font-size:9px;font-weight:700;padding:0 3px">${im.points.length}</span>` : ''}
      <button data-del="${i}" style="position:absolute;top:0;right:0;background:rgba(0,0,0,.6);color:#f87171;border:none;font-size:10px;width:14px;height:14px;cursor:pointer;padding:0">✕</button>
    </div>`).join('');
  wrap.querySelectorAll('.count-thumb').forEach(el => el.addEventListener('click', e => {
    if (e.target.dataset.del != null) {
      images.splice(+e.target.dataset.del, 1);
      if (selected >= images.length) selected = images.length - 1;
      selected >= 0 ? selectImage(selected) : showEmpty();
      return;
    }
    selectImage(+el.dataset.i);
  }));
}

function selectImage(i) {
  selected = i;
  const im = images[i];
  $('countEmpty').style.display = 'none';
  $('labelWrap').style.display = 'flex';
  labeler.setImage(im.imgEl, im.name);
  labeler.points = im.points;     // share the array so edits persist per-image
  labeler.render(); renderCounts();
  renderThumbs();
}

function showEmpty() {
  $('labelWrap').style.display = 'none';
  $('countEmpty').style.display = 'block';
  renderThumbs();
}

// ── Counts overlay ──────────────────────────────────────────────────────────
function renderCounts() {
  if (selected >= 0) renderThumbs();
  const c = labeler.counts();
  const order = ['egg', 'l1', 'l2', 'l3', 'l4', 'adult', 'dead'];
  const rows = order.filter(k => c[k] > 0)
    .map(k => `<span style="color:${LABEL_CATS[k].color}">●</span> ${LABEL_CATS[k].label}: <b>${c[k]}</b>`);
  const total = WORM_CATS.reduce((s, k) => s + (c[k] || 0), 0);   // living worms = L1..Adult
  $('labelCounts').innerHTML =
    `<div style="font-weight:800;color:#00d4aa">${total} worms</div>` +
    (rows.length ? rows.join('<br>') : '<span style="color:#94a3b8">tap to mark</span>');
}

// ── Smart pre-fill — uses the LEARNED model when trained, else raw detector ───
function prefill() {
  if (selected < 0) return;
  const im = images[selected];
  const smart = learner.ready();
  const res = counter.count(im.imgEl, smart ? TRAIN_OPTS : detectorOpts());
  const matchR = 12 / res.scale;
  let added = 0, rejected = 0;
  for (const b of res.blobs) {
    const x = b.cx / res.scale, y = b.cy / res.scale;
    if (labeler.points.some(q => Math.hypot(q.x - x, q.y - y) < matchR)) continue;
    if (smart) {
      // Model is reliable for WORM-vs-not (egg/debris), but NOT for size class:
      // features are size-normalized per image, so baby/juvenile/large aren't
      // separable. Use it only to keep/reject worms; mark all as generic 'l4'
      // and let the user re-tag by stage (L1–L4 / Adult) by hand.
      const pred = learner.predict(learner.featureVec(b, res));
      if (!WORM_CATS.includes(pred.cat)) { rejected++; continue; }   // model says egg/debris
    }
    labeler.points.push({ x, y, cat: 'l4' });
    added++;
  }
  labeler.render(); labeler.onChange?.(labeler.counts());
  flash(smart
    ? `🧠 Learned model added ${added} worms (skipped ${rejected} as egg/debris). All marked L4 — re-tag by stage (L1–L4 / Adult), then Confirm & Train.`
    : `Auto pre-fill added ${added} marks (raw detector). Mark missed worms by stage, then Confirm & Train to teach the model.`);
}

// ── Add as Plate — create a Plate Tracker plate from this photo's count ──────
function addAsPlate() {
  if (selected < 0) { flash('Upload and mark a photo first.'); return; }
  const c = labeler.counts();
  const marked = ['egg', 'l1', 'l2', 'l3', 'l4', 'adult'].reduce((s, k) => s + (c[k] || 0), 0);
  if (marked === 0) { flash('No worms/eggs marked yet — tap to mark (or ✨ pre-fill), then try again.'); return; }
  if (typeof window.WormTraceAddPlateFromCounter !== 'function') { flash('Plate Tracker isn’t ready — open the Plate Tracker tab once, then retry.'); return; }
  const im = images[selected];
  const res = window.WormTraceAddPlateFromCounter({ counts: c, imageDataUrl: im.thumbUrl, sourceName: im.name });
  document.querySelector('[data-tab="plateTab"]')?.click();   // jump to the Plate Tracker
  flash(`🧫 Created a plate — ${res.worms} worm${res.worms !== 1 ? 's' : ''} across ${res.cohorts} stage${res.cohorts !== 1 ? 's' : ''} (dominant ${res.startStage.toUpperCase()}), one cohort per stage. Inoculated at N2/20°C — change strain/temp on the plate if needed.`);
}

// ── Confirm & Train — commit this image's labels into the learner ────────────
function confirmTrain() {
  if (selected < 0) { flash('Upload a photo first.'); return; }
  const im = images[selected];
  if (!labeler.points.length) { flash('Mark some worms first (use ✨ pre-fill, then fix).'); return; }
  const res = counter.count(im.imgEl, TRAIN_OPTS);   // permissive candidates
  const matchR = Math.max(12, (res.medianMajor / res.scale) * 0.8);
  const rows = res.blobs.map(b => {
    const x = b.cx / res.scale, y = b.cy / res.scale;
    const near = nearestPoint(labeler.points, x, y, matchR);
    return { f: learner.featureVec(b, res), cat: near ? near.cat : 'none' };
  });
  // Update the on-device model (deduped) so Smart pre-fill keeps improving.
  learner.addExamples(rows);
  renderLearnPanel();

  // AUTO-SAVE a STANDALONE training file for THIS image only — one file per click,
  // each independent (values do NOT add up across images).
  const data = labeler.getData();          // { type, image (with dataUrl), labels, counts }
  data.rows = rows;                         // this image's feature examples only
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const base = (im.name || 'plate').replace(/\.[^.]+$/, '');
  download(`wormtrace-train_${base}_${stamp}.json`, JSON.stringify(data));

  const c = labeler.counts();
  flash(`✓ Saved "wormtrace-train_${base}_${stamp}.json" — ${wormTotal(c)} worms, ${rows.length} examples (this image only). Load the next photo to keep going.`);
}

function renderLearnPanel() {
  const el = $('learnStats'); if (!el) return;
  const s = learner.stats();
  if (!s.examples) { el.innerHTML = '<span style="color:#94a3b8">No training yet — mark a photo and tap “Confirm &amp; train”.</span>'; return; }
  const acc = s.accuracy != null ? `${Math.round(s.accuracy * 100)}%` : '—';
  const cats = WORM_CATS.concat('none').filter(c => s.byCat[c])
    .map(c => `${c === 'none' ? 'egg/debris' : c}: ${s.byCat[c]}`).join(' · ');
  el.innerHTML =
    `<b style="color:#00d4aa">${s.images}</b> images · <b style="color:#00d4aa">${s.examples}</b> examples · self-accuracy <b>${acc}</b>` +
    (learner.ready() ? ' · <span style="color:#22c55e">model active ✓</span>' : ' · <span style="color:#fbbf24">needs more data</span>') +
    `<br><span style="color:#64748b">${cats}</span>`;
}

// ── Model export / merge / —──────────────────────────────────────────────────
function exportModel() {
  const s = learner.stats();
  if (!s.examples) { flash('Nothing to export — train on a photo first.'); return; }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  download(`wormtrace-model_${s.images}img_${s.examples}ex_${stamp}.json`, JSON.stringify(learner.export()));
  flash(`Exported model (${s.images} images, ${s.examples} examples). Share or send this to pool training data.`);
}
function onModelImport(e) {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const before = learner.stats().examples;
      learner.importMerge(JSON.parse(ev.target.result));
      renderLearnPanel();
      flash(`Merged model — added ${learner.stats().examples - before} examples. Now ${learner.stats().examples} total.`);
    } catch (err) { flash('Merge failed: ' + err.message); }
  };
  reader.readAsText(file);
}

// ── Export / import training file ───────────────────────────────────────────
function exportTraining() {
  if (selected < 0) return;
  const data = labeler.getData();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const base = (images[selected].name || 'plate').replace(/\.[^.]+$/, '');
  download(`wormtrace-train_${base}_${stamp}.json`, JSON.stringify(data));
  const c = data.counts;
  flash(`Exported ${data.labels.length} labels (${wormTotal(c)} worms) + image. Send this .json back as training material.`);
}

function onImport(e) {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const obj = JSON.parse(ev.target.result);
      if (obj.type !== 'wormtrace-training' || !obj.image?.dataUrl) throw new Error('Not a WormTrace training file.');
      const img = new Image();
      img.onload = () => {
        images.push({ id: `import_${images.length}`, name: obj.image.name || 'imported', imgEl: img, thumbUrl: obj.image.dataUrl, points: [] });
        selectImage(images.length - 1);
        labeler.loadData(obj, img);
        images[selected].points = labeler.points;
        renderCounts(); renderThumbs();
        flash(`Loaded ${obj.labels?.length || 0} labels from file.`);
      };
      img.src = obj.image.dataUrl;
    } catch (err) { flash('Import failed: ' + err.message); }
  };
  reader.readAsText(file);
}

function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function flash(msg) { const el = $('countSaveMsg'); if (el) el.textContent = msg; }

// ── Init (module scripts are deferred → DOM ready) ──────────────────────────
initCountTab();
