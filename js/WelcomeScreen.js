/**
 * WelcomeScreen.js — first-launch INTRODUCTION, shown BEFORE the version chooser.
 * Branded splash + a short carousel introducing WormTrace and its two versions
 * (WormLab Light vs Full WormTrace). Call showIntro(onDone) from the launch flow;
 * onDone() runs after the user finishes or skips (→ the version chooser).
 * localStorage key 'wt_welcomed' suppresses the legacy in-app auto-popup.
 */

const KEY = 'wt_welcomed';

const STEPS = [
  {
    icon: '🧫',
    title: 'Welcome to WormTrace',
    desc: 'A <i>Caenorhabditis elegans</i> (roundworm) toolkit for both the classroom and the research bench — track plates, count worms, model strains, and run experiments.',
    tip: 'It comes in two versions — you’ll choose one in a moment.',
  },
  {
    icon: '🎓',
    title: 'WormLab — the Light version',
    desc: 'A classroom worm lab. Students make a profile, join a group, track their plates and count worms in photos. Teachers watch every group live, run growth simulations, and set up genetic crosses (F1 → F2 → F3).',
    tip: 'Pick “WormLab — Light” for a genetics course or a quick worm tracker.',
  },
  {
    icon: '🧪',
    title: 'Full WormTrace',
    desc: 'The complete research lab: strain & stock collections, interactive aging pathways, scalable protocols & assays, and growth simulators — plus the 🪰 Drosophila (fly) and 🧫 yeast projects.',
    tip: 'Pick “Full WormTrace” for the whole research toolkit.',
  },
  {
    icon: '🧬',
    title: 'C. elegans in 30 seconds',
    desc: 'A ~1 mm soil nematode with a fast ~3-day life cycle (egg → L1–L4 → adult), self-fertilizing hermaphrodites plus rare males, and a survival “dauer” stage — which makes it a genetics & aging workhorse.',
    tip: 'Next: choose your version. You can switch anytime.',
  },
];

let _onDone = null;

export function checkWelcome() {
  // Legacy auto-popup (used if the launch flow didn't run). The launch sets
  // 'wt_welcomed' so this normally returns early and the new intro owns onboarding.
  if (localStorage.getItem(KEY)) return;
  showIntro(() => {});
}

export function resetWelcome() {
  localStorage.removeItem(KEY);
}

/** Show the introduction, then call onDone() (e.g. to open the version chooser). */
export function showIntro(onDone) {
  _onDone = onDone || function () {};
  const overlay = _makeOverlay('welcomeScreen');
  overlay.innerHTML = `
    <div class="wlc-box">
      <div class="wlc-logo">🧫</div>
      <h1 class="wlc-title">WormTrace</h1>
      <p class="wlc-sub">A C. elegans lab — classroom + research</p>
      <p class="wlc-sub2">Next you’ll choose WormLab (Light) or Full WormTrace</p>

      <div class="wlc-actions">
        <button id="btnWlcNew" class="wlc-btn-primary">
          👋 Show me around
        </button>
        <button id="btnWlcSkip" class="wlc-btn-secondary">
          Skip intro →
        </button>
      </div>

      <div class="wlc-version">
        WormTrace · Biotastic Lab<br>
        <span style="color:#475569">Developed by Dr. Kailiang Jia, Zeming Zhang,<br>
        Victoria Daroch &amp; Christian Fior · Built using Claude</span>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  _injectStyles();

  document.getElementById('btnWlcNew').onclick  = () => showInstructions(overlay);
  document.getElementById('btnWlcSkip').onclick = () => _dismiss(overlay);
}

// ── Instructions (step carousel) ─────────────────────────────────────────────
function showInstructions(overlay) {
  let step = 0;

  const render = () => {
    const s = STEPS[step];
    const dots = STEPS.map((_, i) =>
      `<div class="wlc-dot${i === step ? ' active' : ''}"></div>`
    ).join('');

    overlay.innerHTML = `
      <div class="wlc-box">
        <div class="wlc-dots">${dots}</div>

        <div class="wlc-step-icon">${s.icon}</div>
        <h2 class="wlc-step-title">${s.title}</h2>
        <p class="wlc-step-desc">${s.desc}</p>
        <div class="wlc-tip">💡 ${s.tip}</div>

        <div class="wlc-nav">
          ${step > 0
            ? `<button id="btnWlcBack" class="wlc-btn-secondary wlc-btn-sm">← Back</button>`
            : '<div></div>'}
          ${step < STEPS.length - 1
            ? `<button id="btnWlcNext" class="wlc-btn-primary" style="flex:2">Next →</button>`
            : `<button id="btnWlcFinish" class="wlc-btn-primary" style="flex:2">Choose my version →</button>`}
        </div>

        <button id="btnWlcSkipAll" class="wlc-skip">Skip intro</button>
      </div>`;

    document.getElementById('btnWlcBack')?.addEventListener('click', () => { step--; render(); });
    document.getElementById('btnWlcNext')?.addEventListener('click', () => { step++; render(); });
    document.getElementById('btnWlcFinish')?.addEventListener('click', () => _dismiss(overlay));
    document.getElementById('btnWlcSkipAll')?.addEventListener('click', () => _dismiss(overlay));
  };

  render();
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function _makeOverlay(id) {
  let el = document.getElementById(id);
  if (el) el.remove();
  el = document.createElement('div');
  el.id = id;
  el.className = 'wlc-overlay';
  return el;
}

function _dismiss(overlay) {
  localStorage.setItem(KEY, 'true');
  overlay.classList.add('wlc-fade-out');
  setTimeout(() => overlay.remove(), 350);
  const cb = _onDone; _onDone = null;
  if (cb) setTimeout(cb, 360);
}

function _injectStyles() {
  if (document.getElementById('wlc-styles')) return;
  const s = document.createElement('style');
  s.id = 'wlc-styles';
  s.textContent = `
.wlc-overlay {
  position: fixed; inset: 0; z-index: 3000;
  background: linear-gradient(160deg, #0a0e1a 0%, #0d1a2e 50%, #0a0e1a 100%);
  display: flex; align-items: center; justify-content: center; padding: 20px;
  animation: wlcIn 0.4s ease-out;
}
.wlc-overlay.wlc-fade-out { animation: wlcOut 0.35s ease-in forwards; }
@keyframes wlcIn  { from{opacity:0;transform:scale(0.97)} to{opacity:1;transform:scale(1)} }
@keyframes wlcOut { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(0.96)} }

.wlc-box {
  max-width: 400px; width: 100%;
  display: flex; flex-direction: column; align-items: center; gap: 0; text-align: center;
}
.wlc-logo { font-size: 60px; margin-bottom: 12px; }
.wlc-title { font-size: 32px; font-weight: 900; color: #00d4aa; letter-spacing: -0.02em; margin-bottom: 6px; }
.wlc-sub   { font-size: 15px; color: #94a3b8; margin-bottom: 2px; }
.wlc-sub2  { font-size: 12px; color: #475569; margin-bottom: 36px; }
.wlc-version { font-size: 11px; color: #334155; margin-top: 20px; }

.wlc-actions { display: flex; flex-direction: column; gap: 10px; width: 100%; }

.wlc-btn-primary {
  width: 100%; padding: 15px; border-radius: 12px;
  background: #00d4aa; border: none; color: #000;
  font-size: 15px; font-weight: 800; cursor: pointer;
  box-shadow: 0 0 30px rgba(0,212,170,0.3);
  transition: all 0.15s; min-height: 52px;
}
.wlc-btn-primary:hover { background: #00e6b8; box-shadow: 0 0 40px rgba(0,212,170,0.5); }
.wlc-btn-secondary {
  width: 100%; padding: 14px; border-radius: 12px;
  background: #111827; border: 1px solid #1e2a3a; color: #94a3b8;
  font-size: 14px; font-weight: 600; cursor: pointer;
  transition: all 0.15s; min-height: 50px;
}
.wlc-btn-secondary:hover { border-color: #00d4aa44; color: #e2e8f0; }
.wlc-btn-sm { flex: 1; padding: 13px; font-size: 14px; }

/* Step view */
.wlc-dots { display: flex; gap: 6px; justify-content: center; margin-bottom: 28px; }
.wlc-dot  { width: 6px; height: 6px; border-radius: 3px; background: #1e2a3a; transition: all 0.3s; }
.wlc-dot.active { width: 22px; background: #00d4aa; }
.wlc-step-icon  { font-size: 56px; margin-bottom: 16px; }
.wlc-step-title { font-size: 22px; font-weight: 800; color: #e2e8f0; margin-bottom: 14px; }
.wlc-step-desc  { font-size: 14px; color: #94a3b8; line-height: 1.7; margin-bottom: 18px; }
.wlc-tip {
  width: 100%; background: #0d2a22; border: 1px solid rgba(0,212,170,0.25);
  border-radius: 10px; padding: 12px 14px; font-size: 12px; color: #00d4aa;
  text-align: left; line-height: 1.5; margin-bottom: 24px;
}
.wlc-nav  { display: flex; gap: 10px; width: 100%; }
.wlc-skip {
  width: 100%; margin-top: 10px; padding: 10px; background: none; border: none;
  color: #475569; font-size: 12px; cursor: pointer; min-height: unset; transition: color 0.15s;
}
.wlc-skip:hover { color: #64748b; }
  `;
  document.head.appendChild(s);
}
