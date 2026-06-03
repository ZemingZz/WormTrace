/**
 * mobile.js — iPhone layout system.
 * Forces flex (not grid) on tab views so panels can properly fill height and scroll.
 */

const MOTION_PANELS = ['leftPanel', 'canvasWrap', 'rightPanel'];
const PLATE_PANELS  = ['platePanelList', 'platePanelDetail', 'platePanelRight'];

let activeTab         = 'plateTab';       // Plate Tracker is the default tab
let activeMotionPanel = 'canvasWrap';
let activePlatePanel  = 'platePanelList';

export function initMobile() {
  _watchViewportCross();           // re-init cleanly if the window crosses 768px later
  if (window.innerWidth >= 768) {
    document.getElementById('mobileNav').style.display = 'none';
    return;
  }
  _applyLayout();
  _bindEvents();
  _switchTab('plateTab', false);   // Start on Plate Tracker
  _updateHighlights();
}

// The mobile (one-panel) vs desktop (3-column grid) layout is chosen ONCE at load.
// The grid columns are set inline on the tab views, so if the window is later resized
// across the 768px breakpoint the old layout sticks — e.g. loading wide then viewing
// narrow leaves the 3-column grid overflowing/clipping. The layouts aren't built for
// live teardown, so the robust fix is to reload once when the breakpoint side actually
// flips. Debounced; guarded so it never loops (after reload the baseline matches).
function _watchViewportCross() {
  const wasMobile = window.innerWidth < 768;
  let t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if ((window.innerWidth < 768) !== wasMobile) location.reload();
    }, 250);
  });
}

window._mobileOnPlateSelected = () => {
  if (window.innerWidth < 768) {
    _showPlatePanel('platePanelDetail');
    _updateHighlights();
  }
};

// ── Layout setup ──────────────────────────────────────────────────────────────
function _applyLayout() {
  document.getElementById('mobileNav').style.display = 'flex';

  // Keep the desktop tabBar visible — style it for mobile via CSS
  // (Don't hide it — it's already in the correct position inside #app)

  // Compact session bar
  ['tagChips','tagInput','btnAddTag'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.querySelectorAll('.sbar-sep').forEach(el => el.style.display = 'none');

  // Add swipe-to-navigate gesture on the main content area
  _initSwipe();
  // Show swipe hint on first few visits
  setTimeout(_showSwipeHint, 1500);

  // CRITICAL: force tab views to flex-column so panels fill height and scroll
  ['motionTab','plateTab','countTab','collectionTab','pathwaysTab'].forEach(id => {
    const tv = document.getElementById(id);
    if (!tv) return;
    tv.style.flexDirection    = 'column';
    tv.style.gridTemplateColumns = 'none';
    tv.style.gridTemplateRows    = 'none';
  });

  // Hide all panels initially; _switchTab will show the right one
  [...MOTION_PANELS, ...PLATE_PANELS].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      document.getElementById('mobileNav').style.display = 'none';
    } else {
      document.getElementById('mobileNav').style.display = 'flex';
    }
  });
}

// ── Events ────────────────────────────────────────────────────────────────────
function _bindEvents() {
  // Desktop tab bar buttons — now visible on mobile, bind them here
  // Use false for clickTopBtn to avoid re-clicking the same button (infinite loop)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => _switchTab(btn.dataset.tab, false));
  });

  // Legacy mobile-tab-btn support
  document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => _switchTab(btn.dataset.tab, false));
  });
  document.querySelectorAll('[data-mpanel]').forEach(btn => {
    btn.addEventListener('click', () => {
      _showMotionPanel(btn.dataset.mpanel);
      _updateHighlights();
    });
  });
  document.querySelectorAll('[data-ppanel]').forEach(btn => {
    btn.addEventListener('click', () => {
      _showPlatePanel(btn.dataset.ppanel);
      _updateHighlights();
    });
  });
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function _switchTab(tabId, clickTopBtn) {
  activeTab = tabId;

  // Hide all tab views
  document.querySelectorAll('.tab-view').forEach(tv => {
    tv.style.display       = 'none';
    tv.style.flexDirection = 'column';
    tv.style.gridTemplateColumns = 'none';
  });

  // Show the active tab view as flex-column
  const activeView = document.getElementById(tabId);
  if (activeView) {
    activeView.style.display          = 'flex';
    activeView.style.flexDirection    = 'column';
    activeView.style.gridTemplateColumns = 'none';
    activeView.className = activeView.className; // preserve .active class
  }

  // Trigger the hidden desktop tab buttons so plateApp/app listeners fire
  if (clickTopBtn) {
    const topBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (topBtn) topBtn.click();
  } else {
    // Manually apply active class
    document.querySelectorAll('.tab-view').forEach(tv => tv.classList.remove('active'));
    if (activeView) activeView.classList.add('active');
  }

  // Panel navs
  const motionNav = document.getElementById('motionMobileNav');
  const plateNav  = document.getElementById('plateMobileNav');
  const mobileNav = document.getElementById('mobileNav');
  if (motionNav) motionNav.style.display = tabId === 'motionTab' ? 'flex' : 'none';
  if (plateNav)  plateNav.style.display  = tabId === 'plateTab'  ? 'flex' : 'none';

  // Restore last panel for this tab. Worm Counter is a single full-height panel
  // with no sub-panels, so hide the bottom panel switcher entirely for it.
  if (tabId === 'motionTab')      { _showMotionPanel(activeMotionPanel); if (mobileNav) mobileNav.style.display = 'flex'; }
  else if (tabId === 'plateTab')  { _showPlatePanel(activePlatePanel);   if (mobileNav) mobileNav.style.display = 'flex'; }
  else                            { if (mobileNav) mobileNav.style.display = 'none'; }

  _updateHighlights();
}

// ── Panel switching ───────────────────────────────────────────────────────────
function _showMotionPanel(panelId) {
  activeMotionPanel = panelId;
  MOTION_PANELS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === panelId) {
      el.style.display              = 'flex';
      el.style.flex                 = '1';
      el.style.minHeight            = '0';
      el.style.flexDirection        = 'column';
      el.style.overflowY            = 'auto';
      el.style.overflowX            = 'hidden';
      el.style.webkitOverflowScrolling = 'touch';
      el.scrollTop = 0;  // always start at top
    } else {
      el.style.display = 'none';
    }
  });
}

function _showPlatePanel(panelId) {
  activePlatePanel = panelId;
  PLATE_PANELS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === panelId) {
      el.style.display       = 'flex';
      el.style.flex          = '1';
      el.style.minHeight     = '0';
      el.style.flexDirection = 'column';
      el.style.overflowX     = 'hidden';
      // platePanelDetail: keep overflow:hidden so inner #plateDetail scrolls
      // and the canvas-collapse scroll listener fires correctly
      el.style.overflowY = id === 'platePanelDetail' ? 'hidden' : 'auto';
      el.style.webkitOverflowScrolling = 'touch';
      el.scrollTop = 0;

      // Show/hide back bar and update plate title
      const backBar = document.getElementById('plateBackBar');
      if (backBar) {
        backBar.style.display = id === 'platePanelDetail' ? 'flex' : 'none';
      }
    } else {
      el.style.display = 'none';
    }
  });
}

// ── Highlight sync ────────────────────────────────────────────────────────────
function _updateHighlights() {
  // Desktop tab bar (now visible on mobile too, styled via CSS)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });
  document.querySelectorAll('[data-mpanel]').forEach(btn => {
    btn.classList.toggle('mobile-nav-active', btn.dataset.mpanel === activeMotionPanel);
  });
  document.querySelectorAll('[data-ppanel]').forEach(btn => {
    btn.classList.toggle('mobile-nav-active', btn.dataset.ppanel === activePlatePanel);
  });
}

// ── Swipe hint arrow ─────────────────────────────────────────────────────────
function _showSwipeHint() {
  const SEEN_KEY = 'wt_swipe_hint_seen';
  const seen = parseInt(localStorage.getItem(SEEN_KEY) || '0');
  if (seen >= 3) return;  // shown enough times

  const hint = document.createElement('div');
  hint.id = 'swipeHint';
  hint.style.cssText =
    'position:fixed;bottom:calc(52px + env(safe-area-inset-bottom,0px) + 10px);' +
    'left:50%;transform:translateX(-50%);z-index:490;pointer-events:none;' +
    'display:flex;align-items:center;gap:8px;' +
    'background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);' +
    'border-radius:20px;padding:6px 14px;backdrop-filter:blur(8px);' +
    'animation:swipeHintIn 0.4s ease-out, swipeHintPulse 1.5s 0.5s ease-in-out infinite;';
  hint.innerHTML =
    '<span style="color:rgba(255,255,255,0.5);font-size:14px">←</span>' +
    '<span style="font-size:11px;color:rgba(255,255,255,0.6);font-weight:500">swipe to navigate</span>' +
    '<span style="color:rgba(255,255,255,0.5);font-size:14px">→</span>';

  document.body.appendChild(hint);
  localStorage.setItem(SEEN_KEY, String(seen + 1));

  // Auto-hide after 4 seconds
  setTimeout(() => {
    if (hint.parentNode) {
      hint.style.animation = 'swipeHintOut 0.3s ease-in forwards';
      setTimeout(() => hint.remove(), 300);
    }
  }, 4000);

  // Hide immediately on first swipe
  const onSwipe = () => { hint.remove(); document.removeEventListener('touchstart', onSwipe); };
  document.addEventListener('touchstart', onSwipe, { passive: true, once: true });

  // Inject keyframes
  if (!document.getElementById('swipe-hint-style')) {
    const s = document.createElement('style');
    s.id = 'swipe-hint-style';
    s.textContent = `
      @keyframes swipeHintIn    { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      @keyframes swipeHintOut   { from{opacity:1} to{opacity:0} }
      @keyframes swipeHintPulse { 0%,100%{opacity:0.8} 50%{opacity:1} }
    `;
    document.head.appendChild(s);
  }
}

// ── Swipe-to-navigate ────────────────────────────────────────────────────────
function _initSwipe() {
  let startX = 0, startY = 0, startTime = 0;
  const MIN_SWIPE = 60;    // px minimum horizontal distance
  const MAX_DURATION = 400; // ms max swipe time

  document.addEventListener('touchstart', e => {
    // Ignore swipes starting on inputs/buttons/selects
    const tag = e.target.tagName;
    if (['INPUT','SELECT','TEXTAREA','BUTTON'].includes(tag)) return;
    startX    = e.touches[0].clientX;
    startY    = e.touches[0].clientY;
    startTime = Date.now();
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!startX) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    const dt = Date.now() - startTime;
    startX = 0;

    // Only fire for fast, clearly horizontal swipes
    if (dt > MAX_DURATION) return;
    if (Math.abs(dx) < MIN_SWIPE) return;
    if (Math.abs(dy) > Math.abs(dx) * 0.8) return; // too vertical

    if (dx < 0) _panelStep(+1);  // swipe left → next panel
    else         _panelStep(-1); // swipe right → previous panel
  }, { passive: true });
}

function _panelStep(dir) {
  if (activeTab !== 'motionTab' && activeTab !== 'plateTab') return;  // Counter = single panel
  const panels = activeTab === 'motionTab' ? MOTION_PANELS : PLATE_PANELS;
  const current = activeTab === 'motionTab' ? activeMotionPanel : activePlatePanel;
  const idx = panels.indexOf(current);
  const next = idx + dir;
  if (next < 0 || next >= panels.length) return;
  if (activeTab === 'motionTab') _showMotionPanel(panels[next]);
  else                           _showPlatePanel(panels[next]);
  _updateHighlights();
}
