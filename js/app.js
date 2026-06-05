import { VideoProcessor } from './VideoProcessor.js?v=149';
import { WormDetector }   from './WormDetector.js?v=149';
import { WormTracker }    from './WormTracker.js?v=149';
import { PatternEngine }  from './PatternEngine.js?v=149';
import { Renderer }       from './Renderer.js?v=149';
import { Troubleshooter } from './Troubleshooter.js?v=149';

const ts = new Troubleshooter();

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  videoLoaded: false,
  bgBuilt: false,
  playing: false,
  processingVideo: false,
  selectedWormId: null,
  captureMode: false,
  captureStart: null,
  captureEnd: null,
  scale: 1,       // canvas-to-display scale
  offsetX: 0,
  offsetY: 0,
  frameCache: [], // {t, detections} for scrubbing
  rafId: null,
  currentFrame: 0,
};

// ── Core modules ──────────────────────────────────────────────────────────────
const vp  = new VideoProcessor();
const det = new WormDetector({ minArea: 30, maxArea: 4000, minAspect: 1.1 });
const trk = new WormTracker({ maxGapFrames: 10, maxMatchDist: 60 });
const pe  = new PatternEngine();
const renderer = new Renderer(document.getElementById('overlayCanvas'));

// ── DOM refs ──────────────────────────────────────────────────────────────────
const videoEl       = document.getElementById('videoEl');
const mainCanvas    = document.getElementById('mainCanvas');
const selCanvas     = document.getElementById('selectionOverlay');
const dropZone      = document.getElementById('dropZone');
const vcBar         = document.getElementById('vcBar');
const seekBar       = document.getElementById('seekBar');
const timeDisplay   = document.getElementById('timeDisplay');
const statusBadge   = document.getElementById('statusBadge');
const captureHint   = document.getElementById('captureHint');
const wormList      = document.getElementById('wormList');
const patternList   = document.getElementById('patternList');
const modal         = document.getElementById('modal');
const statWorms     = document.getElementById('statWorms');
const statPatterns  = document.getElementById('statPatterns');
const statMatches   = document.getElementById('statMatches');
const statFrames    = document.getElementById('statFrames');

const mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });
const selCtx  = selCanvas.getContext('2d');

// ── Threshold controls ────────────────────────────────────────────────────────
const thresholdSlider   = document.getElementById('thresholdSlider');
const thresholdVal      = document.getElementById('thresholdVal');
const similaritySlider  = document.getElementById('similaritySlider');
const similarityVal     = document.getElementById('similarityVal');
const minAreaInput      = document.getElementById('minAreaInput');
const maxAreaInput      = document.getElementById('maxAreaInput');

thresholdSlider.addEventListener('input', () => {
  thresholdVal.textContent = thresholdSlider.value;
});
similaritySlider.addEventListener('input', () => {
  similarityVal.textContent = (similaritySlider.value / 100).toFixed(2);
  pe.setSimilarityThreshold(similaritySlider.value / 100);
  reScoreAll();
});
minAreaInput.addEventListener('change', () => { det.minArea = +minAreaInput.value; });
maxAreaInput.addEventListener('change', () => { det.maxArea = +maxAreaInput.value; });

// ── File upload ───────────────────────────────────────────────────────────────
document.getElementById('videoInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) loadVideo(file);
});

// Drag-and-drop
const wrap = document.getElementById('canvasWrap');
wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.style.outline = '2px dashed var(--accent)'; });
wrap.addEventListener('dragleave', () => { wrap.style.outline = ''; });
wrap.addEventListener('drop', e => {
  e.preventDefault(); wrap.style.outline = '';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('video/')) loadVideo(file);
});

async function loadVideo(file) {
  setStatus('processing', 'Loading video…');
  const url = URL.createObjectURL(file);
  videoEl.src = url;

  await new Promise(resolve => {
    videoEl.addEventListener('loadedmetadata', resolve, { once: true });
  });

  const W = videoEl.videoWidth, H = videoEl.videoHeight;
  vp.setSize(W, H);

  // Size the main canvas to video native size, display via CSS
  mainCanvas.width  = W; mainCanvas.height  = H;
  selCanvas.width   = W; selCanvas.height   = H;
  renderer.setSize(W, H);

  dropZone.classList.add('hidden');
  vcBar.classList.remove('hidden');

  seekBar.max = videoEl.duration;

  setStatus('processing', 'Building background model…');
  await vp.buildBackground(videoEl, 15, p => {
    document.getElementById('bgProgress').style.width = `${p * 100}%`;
  });

  trk.reset();
  state.frameCache = [];
  state.currentFrame = 0;
  state.videoLoaded = true;
  state.bgBuilt = true;

  await preprocessVideo();
  setStatus('ready', `Ready — ${state.frameCache.length} frames`);

  document.getElementById('btnPlay').disabled         = false;
  document.getElementById('btnCapture').disabled      = false;
  document.getElementById('btnReprocess').disabled    = false;
  document.getElementById('btnAutoOptimize').disabled = false;
  document.getElementById('btnRunTS').disabled        = false;

  renderFrame(0);
}

// Pre-process the full video to build tracks
async function preprocessVideo() {
  setStatus('processing', 'Tracking worms…');
  trk.reset();
  state.frameCache = [];
  state.currentFrame = 0;

  const dur = videoEl.duration;
  const fps = 15;  // process at 15fps max for performance
  const step = 1 / fps;
  const total = Math.floor(dur / step);

  for (let i = 0; i < total; i++) {
    const t = i * step;
    await seekVideo(t);
    const frame = vp.grabFrame(videoEl);
    let mask = vp.foregroundMask(frame, +thresholdSlider.value);
    mask = vp.open(mask, 1);
    mask = vp.close(mask, 2);
    const blobs = det.detect(mask, vp.width, vp.height);
    trk.update(blobs, t);
    state.frameCache.push({ t, detections: blobs });
    state.currentFrame = i;

    document.getElementById('bgProgress').style.width = `${(i / total) * 100}%`;
    if (i % 10 === 0) await nextTick();  // yield to UI
  }

  // Score all tracks against all patterns
  reScoreAll();
  renderWormList();
  renderPatternList();
  updateStats();
}

function reScoreAll() {
  const patterns = pe.getAllPatterns();
  if (patterns.length === 0) {
    for (const t of trk.getAll()) { t.bestMatch = null; }
    return;
  }

  for (const track of trk.getAll()) {
    const scores = pe.scoreTrack(track);
    let best = null;
    for (const [pid, score] of scores) {
      if (pe.isMatch(score) && (!best || score > best.score)) {
        const pat = pe.getPattern(pid);
        best = { patternId: pid, patternName: pat.name, score };
      }
    }
    track.bestMatch = best;
  }
}

// ── Playback ──────────────────────────────────────────────────────────────────
document.getElementById('btnPlay').addEventListener('click', togglePlay);
document.getElementById('btnStop').addEventListener('click', () => {
  state.playing = false;
  videoEl.pause();
  cancelAnimationFrame(state.rafId);
  document.getElementById('btnPlay').textContent = '▶ Play';
});

seekBar.addEventListener('input', () => {
  videoEl.currentTime = +seekBar.value;
  renderFrame(closestFrameIdx(+seekBar.value));
});

function togglePlay() {
  state.playing = !state.playing;
  document.getElementById('btnPlay').textContent = state.playing ? '⏸ Pause' : '▶ Play';
  if (state.playing) playLoop();
}

function playLoop() {
  if (!state.playing) return;
  renderFrame(closestFrameIdx(videoEl.currentTime));
  seekBar.value = videoEl.currentTime;
  timeDisplay.textContent = fmt(videoEl.currentTime) + ' / ' + fmt(videoEl.duration);
  if (videoEl.paused) videoEl.play();
  state.rafId = requestAnimationFrame(playLoop);
}

function renderFrame(frameIdx) {
  const fc = state.frameCache[frameIdx];
  if (!fc) return;

  // Draw video frame
  videoEl.currentTime = fc.t;
  mainCtx.drawImage(videoEl, 0, 0);

  const activeTracks = trk.getAll().filter(t => {
    const last = t.trajectory[t.trajectory.length - 1];
    return last && Math.abs(last.t - fc.t) < 1.5;
  });

  renderer.drawTracks(activeTracks, frameIdx, state.selectedWormId, pe);
  timeDisplay.textContent = fmt(fc.t) + ' / ' + fmt(videoEl.duration);
}

// ── Worm selection ────────────────────────────────────────────────────────────
selCanvas.addEventListener('click', e => {
  if (!state.videoLoaded) return;
  const { vx, vy } = canvasCoords(e);
  const hit = findNearestWorm(vx, vy);
  if (hit) {
    state.selectedWormId = hit.id;
    renderWormList();
    showInfo(`Selected Worm ${hit.id} — ${hit.trajectory.length} frames tracked`);
  }
});

selCanvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const touch = e.touches[0];
  const fake = { clientX: touch.clientX, clientY: touch.clientY };
  selCanvas.dispatchEvent(new MouseEvent('click', fake));
}, { passive: false });

function findNearestWorm(vx, vy) {
  let best = null, bestD = 40;
  for (const track of trk.getAll()) {
    const last = track.trajectory[track.trajectory.length - 1];
    if (!last) continue;
    const d = Math.sqrt((last.x - vx) ** 2 + (last.y - vy) ** 2);
    if (d < bestD) { bestD = d; best = track; }
  }
  return best;
}

// ── Capture pattern ───────────────────────────────────────────────────────────
document.getElementById('btnCapture').addEventListener('click', () => {
  if (!state.selectedWormId) { showInfo('Select a worm first by clicking on it.'); return; }
  state.captureMode = true;
  state.captureStart = null;
  state.captureEnd = null;
  captureHint.classList.remove('hidden');
  captureHint.textContent = 'Set start time → click "Mark Start"';
  document.getElementById('btnMarkStart').disabled = false;
  document.getElementById('btnMarkEnd').disabled = true;
  document.getElementById('btnSavePattern').disabled = true;
});

document.getElementById('btnMarkStart').addEventListener('click', () => {
  state.captureStart = videoEl.currentTime;
  document.getElementById('startMark').textContent = fmt(state.captureStart);
  document.getElementById('btnMarkEnd').disabled = false;
  captureHint.textContent = `Start: ${fmt(state.captureStart)} — now seek to end & click "Mark End"`;
});

document.getElementById('btnMarkEnd').addEventListener('click', () => {
  state.captureEnd = videoEl.currentTime;
  if (state.captureEnd <= state.captureStart) {
    showInfo('End time must be after start time.'); return;
  }
  document.getElementById('endMark').textContent = fmt(state.captureEnd);
  document.getElementById('btnSavePattern').disabled = false;
  captureHint.textContent = `Window: ${fmt(state.captureStart)} → ${fmt(state.captureEnd)} — click "Save Pattern"`;
});

document.getElementById('btnSavePattern').addEventListener('click', () => {
  openModal();
});

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal() {
  document.getElementById('patternNameInput').value = `Pattern ${pe.getAllPatterns().length + 1}`;
  modal.classList.remove('hidden');
  document.getElementById('patternNameInput').focus();
}

document.getElementById('btnModalCancel').addEventListener('click', closeModal);
document.getElementById('btnModalSave').addEventListener('click', savePattern);
document.getElementById('patternNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') savePattern();
  if (e.key === 'Escape') closeModal();
});

function savePattern() {
  const name = document.getElementById('patternNameInput').value.trim();
  if (!name) return;

  const track = trk.tracks.get(state.selectedWormId);
  if (!track) { closeModal(); return; }

  const colors = ['#7c3aed','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6'];
  const color = colors[pe.getAllPatterns().length % colors.length];

  const pat = pe.definePattern(name, color, track, state.captureStart, state.captureEnd);
  if (!pat) { showInfo('Not enough data in that time window. Try a longer range.'); closeModal(); return; }

  closeModal();
  state.captureMode = false;
  captureHint.classList.add('hidden');

  reScoreAll();
  renderWormList();
  renderPatternList();
  updateStats();
  showInfo(`Pattern "${name}" saved — scanning all worms…`);
}

function closeModal() {
  modal.classList.add('hidden');
  document.getElementById('btnMarkStart').disabled = true;
  document.getElementById('btnMarkEnd').disabled = true;
  document.getElementById('btnSavePattern').disabled = true;
}

// ── Reprocess button ──────────────────────────────────────────────────────────
document.getElementById('btnReprocess').addEventListener('click', () => {
  if (!state.bgBuilt) return;
  preprocessVideo().then(() => {
    setStatus('ready', `Ready — ${state.frameCache.length} frames`);
    renderWormList();
    renderPatternList();
    updateStats();
  });
});

// ── Render UI lists ───────────────────────────────────────────────────────────
function renderWormList() {
  const tracks = trk.getAll();
  if (tracks.length === 0) {
    wormList.innerHTML = '<div class="section-empty">No worms detected yet</div>';
    return;
  }

  wormList.innerHTML = tracks.map(t => {
    const last = t.trajectory[t.trajectory.length - 1];
    const dur = last ? (last.t - t.firstTime).toFixed(1) : '0';
    const matchInfo = t.bestMatch
      ? `<span class="worm-badge match">${t.bestMatch.patternName} ${Math.round(t.bestMatch.score * 100)}%</span>`
      : '<span class="worm-badge">no match</span>';
    const refBadge = pe.getAllPatterns().some(p => p.wormId === t.id)
      ? '<span class="worm-badge ref">ref</span>' : '';
    const sel = state.selectedWormId === t.id ? ' selected' : '';

    return `<div class="worm-item${sel}" data-id="${t.id}">
      <span class="worm-dot" style="background:${t.color}"></span>
      <div class="worm-info">
        <div class="worm-name">Worm ${t.id} ${refBadge}</div>
        <div class="worm-meta">${t.trajectory.length} pts · ${dur}s</div>
      </div>
      ${matchInfo}
    </div>`;
  }).join('');

  wormList.querySelectorAll('.worm-item').forEach(el => {
    el.addEventListener('click', () => {
      state.selectedWormId = +el.dataset.id;
      renderWormList();
    });
  });
}

function renderPatternList() {
  const patterns = pe.getAllPatterns();
  if (patterns.length === 0) {
    patternList.innerHTML = '<div class="section-empty">No patterns defined yet.<br>Select a worm and click "Capture Pattern".</div>';
    return;
  }

  const matchCounts = {};
  for (const t of trk.getAll()) {
    if (t.bestMatch) matchCounts[t.bestMatch.patternId] = (matchCounts[t.bestMatch.patternId] || 0) + 1;
  }

  patternList.innerHTML = patterns.map(p => {
    const mc = matchCounts[p.id] || 0;
    return `<div class="pattern-card" data-pid="${p.id}">
      <div class="p-header">
        <span class="p-color" style="background:${p.color}"></span>
        <span class="p-name">${p.name}</span>
        <button class="p-del" data-del="${p.id}">✕</button>
      </div>
      <div class="p-meta">Worm ${p.wormId} · ${fmt(p.t0)}–${fmt(p.t1)}</div>
      <div class="p-matches">${mc} worm${mc !== 1 ? 's' : ''} match this pattern</div>
      <div class="p-actions">
        <button class="btn-secondary btn-sm" data-highlight="${p.id}">Highlight</button>
      </div>
    </div>`;
  }).join('');

  patternList.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      pe.deletePattern(+btn.dataset.del);
      reScoreAll();
      renderPatternList();
      renderWormList();
      updateStats();
    });
  });
}

function updateStats() {
  const tracks = trk.getAll();
  const matches = tracks.filter(t => t.bestMatch).length;
  statWorms.textContent    = tracks.length;
  statPatterns.textContent = pe.getAllPatterns().length;
  statMatches.textContent  = matches;
  statFrames.textContent   = state.frameCache.length;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function canvasCoords(e) {
  const rect = selCanvas.getBoundingClientRect();
  const scaleX = selCanvas.width  / rect.width;
  const scaleY = selCanvas.height / rect.height;
  return {
    vx: (e.clientX - rect.left) * scaleX,
    vy: (e.clientY - rect.top)  * scaleY,
  };
}

function closestFrameIdx(t) {
  if (state.frameCache.length === 0) return 0;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < state.frameCache.length; i++) {
    const d = Math.abs(state.frameCache[i].t - t);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function seekVideo(t) {
  return new Promise(resolve => {
    const onSeeked = () => { videoEl.removeEventListener('seeked', onSeeked); resolve(); };
    videoEl.addEventListener('seeked', onSeeked);
    videoEl.currentTime = Math.min(t, videoEl.duration - 0.01);
  });
}

function fmt(s) {
  const m = Math.floor(s / 60), sec = (s % 60).toFixed(1).padStart(4, '0');
  return `${m}:${sec}`;
}

function nextTick() { return new Promise(r => setTimeout(r, 0)); }

function setStatus(type, msg) {
  statusBadge.className = type;
  statusBadge.textContent = msg;
}

function showInfo(msg) {
  document.getElementById('infoMsg').textContent = msg;
  document.getElementById('infoMsg').style.opacity = '1';
  clearTimeout(showInfo._t);
  showInfo._t = setTimeout(() => { document.getElementById('infoMsg').style.opacity = '0'; }, 4000);
}

// ── Troubleshooter ────────────────────────────────────────────────────────────
document.getElementById('btnRunTS').addEventListener('click', () => {
  const tracks = trk.getAll();
  const report = ts.analyzeTracking(tracks, state.frameCache.length, +thresholdSlider.value);
  renderTsReport(report);
  document.getElementById('btnAutoFix').disabled = !report.issues.some(i => i.action);
});

document.getElementById('btnAutoFix').addEventListener('click', () => {
  const tracks = trk.getAll();
  const report = ts.analyzeTracking(tracks, state.frameCache.length, +thresholdSlider.value);
  const topFix = report.issues.find(i => i.action);
  if (!topFix) return;

  if (topFix.action.type === 'threshold') {
    const newVal = Math.max(5, Math.min(80, +thresholdSlider.value + topFix.action.delta));
    thresholdSlider.value = newVal;
    thresholdVal.textContent = newVal;
    showInfo(`Auto-fix: threshold → ${newVal}. Re-running tracking…`);
    ts.confirmSuggestion(topFix.code);
    preprocessVideo().then(() => {
      setStatus('ready', `Ready — ${state.frameCache.length} frames`);
      const newReport = ts.analyzeTracking(trk.getAll(), state.frameCache.length, newVal);
      renderTsReport(newReport);
    });
  }
});

document.getElementById('btnAutoOptimize').addEventListener('click', async () => {
  if (!state.bgBuilt) return;
  setStatus('processing', 'Auto-tuning threshold…');
  showInfo('Sampling frames to find optimal threshold…');

  // Grab 5 sample frames from the cache
  const step = Math.max(1, Math.floor(state.frameCache.length / 5));
  const sampleFrames = [];
  for (let i = 0; i < state.frameCache.length; i += step) {
    await seekVideo(state.frameCache[i].t);
    sampleFrames.push(vp.grabFrame(videoEl));
    if (sampleFrames.length >= 5) break;
  }

  const result = await ts.autoOptimizeThreshold(vp, det, sampleFrames, p => {
    document.getElementById('bgProgress').style.width = `${p * 100}%`;
  });

  thresholdSlider.value = result.bestThreshold;
  thresholdVal.textContent = result.bestThreshold;
  showInfo(`Auto-tuned threshold → ${result.bestThreshold}. Re-running tracking…`);
  setStatus('processing', 'Tracking worms with optimized threshold…');

  await preprocessVideo();
  setStatus('ready', `Ready — ${state.frameCache.length} frames`);

  const report = ts.analyzeTracking(trk.getAll(), state.frameCache.length, result.bestThreshold);
  renderTsReport(report);
});

function renderTsReport(report) {
  const el = document.getElementById('tsPanel');
  const gradeClass = `grade-${report.grade}`;

  let html = `<div class="ts-score-ring">
    <div class="ts-grade ${gradeClass}">${report.grade}</div>
    <div>
      <div style="font-weight:600;font-size:13px">Quality Score: ${Math.round(report.score * 100)}%</div>
      <div style="font-size:11px;color:var(--muted)">Threshold: ${report.threshold}</div>
    </div>
  </div>`;

  for (const issue of report.issues) {
    const hasAction = !!issue.action;
    html += `<div class="ts-issue ${issue.severity}">
      <div class="ts-issue-msg">${issue.msg}</div>
      ${hasAction ? `<div class="ts-issue-actions">
        <button class="ts-btn-apply" data-code="${issue.code}" data-delta="${issue.action?.delta ?? 0}" data-type="${issue.action?.type}">Apply Fix</button>
        <button class="ts-btn-no" data-rej="${issue.code}">Not helpful</button>
      </div>` : ''}
    </div>`;
  }

  el.innerHTML = html;

  el.querySelectorAll('.ts-btn-apply').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type, delta = +btn.dataset.delta;
      if (type === 'threshold') {
        const newVal = Math.max(5, Math.min(80, +thresholdSlider.value + delta));
        thresholdSlider.value = newVal;
        thresholdVal.textContent = newVal;
        showInfo(`Applied fix: threshold → ${newVal}`);
        ts.confirmSuggestion(btn.dataset.code);
      }
    });
  });

  el.querySelectorAll('.ts-btn-no').forEach(btn => {
    btn.addEventListener('click', () => {
      ts.rejectSuggestion(btn.dataset.rej);
      btn.textContent = 'Noted';
      btn.disabled = true;
    });
  });
}

// ── PWA install ───────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('btnInstall').style.display = 'block';
});
document.getElementById('btnInstall').addEventListener('click', () => {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
});
