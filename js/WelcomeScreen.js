/**
 * WelcomeScreen.js — first-launch welcome screen with onboarding instructions.
 * Shown once; localStorage key 'wt_welcomed' suppresses it on return visits.
 */

const KEY = 'wt_welcomed';

const STEPS = [
  {
    icon: '🎥',
    title: 'Movement Tracker',
    desc: 'Upload a video of your worms. WormTrace automatically detects and tracks each worm across frames, building trajectories and extracting movement features.',
    tip: 'Tap "Video" in the bottom nav to see the live tracking canvas.',
  },
  {
    icon: '📊',
    title: 'Pattern Recognition',
    desc: 'Click a worm on screen, scrub to a behaviour you want to capture, then press Capture Pattern. The app uses Dynamic Time Warping to find other worms with matching movement.',
    tip: 'Name patterns like "omega turn", "forward crawl", or "reversal" for easy reference.',
  },
  {
    icon: '🧫',
    title: 'Plate Tracker',
    desc: 'Add your experiment plates, choose the strain (N2, daf-2, dpy-13…) and incubation temperature. The app calculates expected developmental stages from published timing data.',
    tip: 'Tap "Inoculate Plate — Start Timer" to begin real-time development tracking.',
  },
  {
    icon: '⏱',
    title: 'Development Timeline',
    desc: 'Watch plates progress Egg → L1 → L2 → L3 → L4 → Young Adult → Reproductive Adult. Stage timings adjust automatically for your temperature (10°C, 15°C, 20°C, 25°C).',
    tip: '25°C is ~1.8× faster than 20°C. daf-2 worms are slower and enter dauer at 25°C.',
  },
  {
    icon: '📋',
    title: 'Compare & Export',
    desc: 'Tap the ☐ checkbox on each plate card to select it, then hit Compare for side-by-side charts of development, food, and egg counts. Export any plate as Excel.',
    tip: 'Upload real microscopy data (CSV) to compare against the simulated predictions.',
  },
];

export function checkWelcome() {
  if (localStorage.getItem(KEY)) return;
  showWelcomeScreen();
}

export function resetWelcome() {
  localStorage.removeItem(KEY);
}

// ── Welcome screen ─────────────────────────────────────────────────────────────
function showWelcomeScreen() {
  const overlay = _makeOverlay('welcomeScreen');
  overlay.innerHTML = `
    <div class="wlc-box">
      <div class="wlc-logo">🔬</div>
      <h1 class="wlc-title">WormTrace</h1>
      <p class="wlc-sub">C. elegans movement &amp; plate tracker</p>
      <p class="wlc-sub2">Science-grade tracking in your pocket</p>

      <div class="wlc-actions">
        <button id="btnWlcNew" class="wlc-btn-primary">
          👋 I'm New — Show Me How
        </button>
        <button id="btnWlcSkip" class="wlc-btn-secondary">
          ✓ I Know the App — Let's Go
        </button>
      </div>

      <div class="wlc-version">
        WormTrace v1.0 · Built for C. elegans research<br>
        <span style="color:#475569">Developed by Dr. Kailiang Jia, Zeming Zhang,<br>
        Victoria Daroch &amp; Christian Fior · Built using Claude</span>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  _injectStyles();

  document.getElementById('btnWlcNew').onclick   = () => showInstructions(overlay);
  document.getElementById('btnWlcSkip').onclick  = () => _dismiss(overlay);
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
            : `<button id="btnWlcFinish" class="wlc-btn-primary" style="flex:2">Start WormTrace 🚀</button>`}
        </div>

        <button id="btnWlcSkipAll" class="wlc-skip">Skip instructions</button>
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
