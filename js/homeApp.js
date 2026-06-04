/**
 * homeApp.js — Biotastic Lab launcher + C. elegans sub-home navigation.
 *
 * Layered launcher overlays over #app (the tabbed C. elegans app, always laid out
 * underneath): #homeScreen (Biotastic Lab, z1500) → #celegansHome (the C. elegans
 * tool menu, z1450) → #labExp / #labLit (project overlays, z1400). Picking a tool
 * box hides the overlays to reveal #app with that tab active. The header 🏠 button
 * returns to the C. elegans menu.
 */
const $el = id => document.getElementById(id);
const showEl = id => { const e = $el(id); if (e) e.style.display = 'flex'; };
const hideEl = id => { const e = $el(id); if (e) e.style.display = 'none'; };

const ALL_OVERLAYS = ['homeScreen', 'celegansHome', 'labExp', 'labLit', 'drosophilaHome', 'flyExp', 'flyStock', 'flyPath', 'flyCulture'];
function showApp() { ALL_OVERLAYS.forEach(hideEl); window.dispatchEvent(new Event('resize')); }
function showBiotastic() { ALL_OVERLAYS.forEach(hideEl); showEl('homeScreen'); }
function showCele() { ALL_OVERLAYS.forEach(hideEl); showEl('celegansHome'); }
function showDroso() { ALL_OVERLAYS.forEach(hideEl); showEl('drosophilaHome'); }
window.WormTraceShowCeleHome = showCele;        // used by experimentsApp's back button
window.WormTraceShowDrosoHome = showDroso;      // used by flyExperimentsApp's back button

function openTab(tabId) {
  showApp();
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.click();   // fires both desktop + mobile tab handlers
}

function init() {
  // Biotastic Lab boxes
  const hs = $el('homeScreen');
  if (hs) hs.querySelectorAll('[data-open-app]').forEach(b => b.addEventListener('click', () => {
    const which = b.dataset.openApp;
    if (which === 'celegans') showCele();
    else if (which === 'drosophila') showDroso();
    else if (which === 'literature') { hideEl('homeScreen'); showEl('labLit'); }
  }));

  // Drosophila home boxes
  const dh = $el('drosophilaHome');
  if (dh) {
    dh.querySelectorAll('[data-droback]').forEach(b => b.addEventListener('click', showBiotastic));
    dh.querySelectorAll('[data-droexp]').forEach(b => b.addEventListener('click', () => { hideEl('drosophilaHome'); showEl('flyExp'); }));
    dh.querySelectorAll('[data-droopen]').forEach(b => b.addEventListener('click', () => {
      hideEl('drosophilaHome'); showEl(b.dataset.droopen);
      const tab = b.dataset.drotab;   // optionally jump straight to a sub-tab
      if (tab) { const ov = $el(b.dataset.droopen); ov?.querySelector(`.le-tab[data-letab="${tab}"]`)?.click(); }
    }));
    dh.querySelectorAll('[data-drosoon]').forEach(b => b.addEventListener('click', () => {
      const m = $el('droMsg');
      if (m) { m.textContent = `🚧 ${b.dataset.drosoon} — coming next.`; clearTimeout(dh._t); dh._t = setTimeout(() => { m.textContent = ''; }, 3500); }
    }));
  }

  // C. elegans home boxes
  const ce = $el('celegansHome');
  if (ce) {
    ce.querySelectorAll('[data-cetab]').forEach(b => b.addEventListener('click', () => openTab(b.dataset.cetab)));
    ce.querySelectorAll('[data-ceexp]').forEach(b => b.addEventListener('click', () => { hideEl('celegansHome'); showEl('labExp'); }));
    ce.querySelectorAll('[data-ceback]').forEach(b => b.addEventListener('click', showBiotastic));
  }

  // Header: remove "WormTrace", add back button + round home icon + centered section title
  const header = document.querySelector('header');
  if (header && !$el('btnHome')) {
    header.style.position = 'relative';

    // Drop the old "WormTrace" title block entirely.
    const h1 = header.querySelector('h1');
    const titleBlock = h1 ? h1.closest('div') : null;
    if (titleBlock) titleBlock.remove();

    // ← 🏠 C. Elegans back button (to the C. elegans tool menu) — with home icon
    const btn = document.createElement('button');
    btn.id = 'btnHome'; btn.type = 'button'; btn.title = 'C. elegans menu'; btn.textContent = '← 🏠 C. Elegans';
    btn.style.cssText = 'width:auto;flex:0 0 auto;align-self:center;background:#1e2a3a;border:1px solid #2d3748;' +
      'color:var(--accent,#00d4aa);border-radius:8px;height:34px;padding:0 16px;font-size:15px;font-weight:700;' +
      'cursor:pointer;min-height:unset;white-space:nowrap;margin-right:6px';
    btn.addEventListener('click', showCele);

    // Centered title showing the current section's name
    const ttl = document.createElement('div');
    ttl.id = 'hdrTitle';
    ttl.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'font-weight:800;font-size:16px;color:#e8eef5;pointer-events:none;white-space:nowrap';

    // Ergonomic layout: navigation on the left, title centered, tools grouped on the right.
    const toggle = $el('btnToggleSessionBar');
    const badge = $el('statusBadge');
    header.insertBefore(btn, header.firstChild);              // back button → far left
    if (toggle && badge) header.insertBefore(toggle, badge);  // ⚙ → right-hand tool group
    header.appendChild(ttl);

    // Keep the centered title + video-status badge in sync with the active section.
    const VIDEO_TABS = new Set(['plateTab', 'motionTab', 'countTab']);   // tabs that use a video/photo
    const labelFor = el => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
    const setTitle = t => { const e = $el('hdrTitle'); if (e) e.textContent = t || ''; };
    const updateChrome = b => {
      setTitle(labelFor(b));
      if (badge) badge.style.display = (b && VIDEO_TABS.has(b.dataset.tab)) ? '' : 'none';
    };
    window.WormTraceSetTitle = setTitle;
    document.querySelectorAll('.tab-btn, .mobile-tab-btn').forEach(b =>
      b.addEventListener('click', () => updateChrome(b)));
    updateChrome(document.querySelector('.tab-btn.active') || document.querySelector('.tab-btn'));
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
