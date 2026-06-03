/**
 * homeApp.js — "My Lab" launcher / home screen.
 *
 * A boot landing screen (overlay over #app) with square clickable project boxes.
 * "Caenorhabditis elegans" opens everything we've built (just hides the overlay —
 * the app is laid out underneath). A 🏠 button is injected into the header to come
 * back. Other project boxes are placeholders for now.
 */
function show() { const h = document.getElementById('homeScreen'); if (h) h.style.display = 'flex'; }
function hide() {
  const h = document.getElementById('homeScreen');
  if (h) { h.style.display = 'none'; window.dispatchEvent(new Event('resize')); }  // resize → app relayouts
}

function init() {
  const hs = document.getElementById('homeScreen');
  if (!hs) return;
  hs.querySelectorAll('[data-open-app]').forEach(b => b.addEventListener('click', () => {
    const exp = document.getElementById('labExp');           // Experiments & Procedures overlay
    if (exp) exp.style.display = (b.dataset.openApp === 'expproc') ? 'flex' : 'none';
    hide();                                                   // hide home → reveal the chosen project
  }));
  const msg = document.getElementById('homeMsg');
  hs.querySelectorAll('[data-home-soon]').forEach(b => b.addEventListener('click', () => {
    if (!msg) return;
    const name = b.querySelector('.hl-bt')?.textContent.trim() || 'This section';
    msg.textContent = `🚧 ${name} — we will build this next.`;
    clearTimeout(window._homeMsgT);
    window._homeMsgT = setTimeout(() => { msg.textContent = ''; }, 2600);
  }));
  // Inject a Home button into the header so users can return to My Lab.
  const header = document.querySelector('header');
  if (header && !document.getElementById('btnHome')) {
    const btn = document.createElement('button');
    btn.id = 'btnHome'; btn.type = 'button'; btn.title = 'Biotastic Lab'; btn.textContent = '🏠';
    btn.style.cssText = 'background:#1e2a3a;border:1px solid var(--border,#1e2a3a);color:var(--accent,#00d4aa);' +
      'border-radius:8px;width:34px;height:34px;font-size:15px;cursor:pointer;min-height:unset;padding:0;flex-shrink:0;margin-right:4px';
    header.insertBefore(btn, header.firstChild);
    btn.addEventListener('click', show);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
