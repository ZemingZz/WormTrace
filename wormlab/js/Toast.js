/**
 * Toast.js — non-blocking in-app notification system.
 * Replaces all alert() / confirm() with beautiful slide-in banners.
 */

const ICONS = { info:'ℹ️', warn:'⚠️', error:'❌', success:'✅' };
const STYLES = {
  info:    { bg:'#0d2a22', border:'#00d4aa', text:'#00d4aa' },
  warn:    { bg:'#1e1805', border:'#f59e0b', text:'#f59e0b' },
  error:   { bg:'#2a0808', border:'#ef4444', text:'#f87171' },
  success: { bg:'#064e3b', border:'#10b981', text:'#34d399' },
};

function _container() {
  let c = document.getElementById('wt-toasts');
  if (!c) {
    c = document.createElement('div');
    c.id = 'wt-toasts';
    c.style.cssText =
      'position:fixed;top:70px;left:50%;transform:translateX(-50%);' +
      'z-index:1000;display:flex;flex-direction:column;align-items:center;' +
      'gap:8px;width:90%;max-width:380px;pointer-events:none;';
    document.body.appendChild(c);
  }
  return c;
}

export function showToast(message, type = 'info', duration = 3500) {
  const s = STYLES[type] ?? STYLES.info;
  const toast = document.createElement('div');
  toast.style.cssText =
    `background:${s.bg};border:1.5px solid ${s.border};color:${s.text};` +
    'padding:11px 16px;border-radius:12px;font-size:13px;font-weight:600;' +
    'display:flex;align-items:center;gap:10px;pointer-events:auto;width:100%;' +
    'box-shadow:0 6px 30px rgba(0,0,0,0.6);backdrop-filter:blur(12px);' +
    'animation:wtToastIn 0.28s cubic-bezier(0.34,1.56,0.64,1) forwards;' +
    'line-height:1.4;cursor:pointer;';
  toast.innerHTML =
    `<span style="font-size:18px;flex-shrink:0">${ICONS[type] ?? ICONS.info}</span>` +
    `<span style="flex:1">${message}</span>` +
    `<span style="font-size:18px;opacity:0.5;flex-shrink:0">×</span>`;

  _container().appendChild(toast);

  const remove = () => {
    toast.style.animation = 'wtToastOut 0.22s ease-in forwards';
    setTimeout(() => toast.remove(), 220);
  };

  toast.addEventListener('click', remove);
  setTimeout(remove, duration);
  return toast;
}

/** Async confirm dialog — resolves true/false */
export function showConfirm(message, confirmLabel = 'Yes', cancelLabel = 'Cancel') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:950;' +
      'display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';

    overlay.innerHTML = `
      <div style="background:#111827;border:1px solid #1e2a3a;border-radius:16px;padding:22px;
                  max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.8);
                  animation:wtToastIn 0.25s cubic-bezier(0.34,1.56,0.64,1) forwards">
        <p style="font-size:14px;color:#e2e8f0;line-height:1.6;margin-bottom:18px">${message}</p>
        <div style="display:flex;gap:10px">
          <button id="wtCancel" style="flex:1;padding:11px;border-radius:8px;background:#1e2a3a;
            border:1px solid #2d3748;color:#94a3b8;font-size:13px;font-weight:600;cursor:pointer;
            min-height:44px;">${cancelLabel}</button>
          <button id="wtConfirm" style="flex:1;padding:11px;border-radius:8px;background:#00d4aa;
            border:none;color:#000;font-size:13px;font-weight:700;cursor:pointer;
            min-height:44px;">${confirmLabel}</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const cleanup = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#wtConfirm').onclick = () => cleanup(true);
    overlay.querySelector('#wtCancel').onclick  = () => cleanup(false);
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
  });
}

// Inject CSS keyframes once
if (!document.getElementById('wt-toast-style')) {
  const style = document.createElement('style');
  style.id = 'wt-toast-style';
  style.textContent = `
    @keyframes wtToastIn  { from{opacity:0;transform:translateY(-14px) scale(0.95)} to{opacity:1;transform:translateY(0) scale(1)} }
    @keyframes wtToastOut { from{opacity:1;transform:translateY(0) scale(1)} to{opacity:0;transform:translateY(-10px) scale(0.95)} }
  `;
  document.head.appendChild(style);
}
