/**
 * accountUI.js — account button + modal for the Biotastic Lab launcher.
 *
 * Injects an "☁ Account" chip into the home screen. Opening it shows:
 *   • signed-out: Log in / Sign up (sign up includes the research consent gate)
 *   • signed-in:  who you are, a "Contribute training data" button, Log out
 *
 * When the cloud is not configured (config.js empty), the chip explains that
 * the app is running in offline mode and points to LAUNCH.md — nothing breaks.
 */
import { Cloud } from './cloud.js?v=99';
import { CONFIG, isConfigured } from './config.js?v=99';
import { MLEngine } from './MLEngine.js?v=99';
import { PlateTracker } from './PlateTracker.js?v=99';

let _modal = null;
let _user = null;

// ── styling (scoped, injected once) ─────────────────────────────────────────
function ensureStyles() {
  if (document.getElementById('acctStyles')) return;
  const s = document.createElement('style');
  s.id = 'acctStyles';
  s.textContent = `
    #acctChip{position:fixed;top:14px;right:14px;z-index:1600;background:#111a2b;border:1px solid #1e2a3a;
      color:#cbd5e1;border-radius:20px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;
      display:flex;align-items:center;gap:7px;width:auto;min-height:unset;font-family:inherit}
    #acctChip:hover{border-color:#00d4aa;color:#e2e8f0}
    #acctOverlay{position:fixed;inset:0;z-index:1700;background:rgba(3,6,12,.72);backdrop-filter:blur(3px);
      display:none;align-items:center;justify-content:center;padding:20px}
    #acctOverlay.on{display:flex}
    .acct-card{width:100%;max-width:380px;background:linear-gradient(160deg,#101a2c,#0a0e1a);border:1px solid #1e2a3a;
      border-radius:18px;padding:24px;color:#e2e8f0;font-family:inherit;box-shadow:0 24px 70px rgba(0,0,0,.55)}
    .acct-card h2{margin:0 0 4px;font-size:20px;font-weight:800}
    .acct-sub{font-size:12px;color:#64748b;margin-bottom:18px;line-height:1.5}
    .acct-card label{display:block;font-size:11px;font-weight:700;color:#94a3b8;margin:11px 0 4px;letter-spacing:.03em}
    .acct-card input[type=text],.acct-card input[type=email],.acct-card input[type=password]{
      width:100%;background:#0a0e1a;border:1px solid #2d3748;color:#e2e8f0;border-radius:9px;padding:10px 12px;font-size:14px;min-height:unset}
    .acct-consent{display:flex;gap:9px;align-items:flex-start;font-size:11.5px;color:#94a3b8;line-height:1.5;margin:14px 0 4px;
      background:#0b1220;border:1px solid #1e2a3a;border-radius:10px;padding:11px}
    .acct-consent input{margin-top:2px;flex-shrink:0}
    .acct-btn{width:100%;margin-top:16px;background:#00d4aa;border:none;color:#04201a;border-radius:10px;padding:12px;
      font-size:14px;font-weight:800;cursor:pointer}
    .acct-btn:disabled{opacity:.5;cursor:default}
    .acct-btn.ghost{background:#1e2a3a;color:#cbd5e1;margin-top:9px}
    .acct-btn.danger{background:#3a1620;color:#fca5a5}
    .acct-switch{text-align:center;font-size:12px;color:#64748b;margin-top:14px}
    .acct-switch a{color:#00d4aa;cursor:pointer;font-weight:600}
    .acct-msg{font-size:12px;margin-top:12px;min-height:16px;line-height:1.5}
    .acct-msg.err{color:#fca5a5}.acct-msg.ok{color:#34d399}
    .acct-x{float:right;background:none;border:none;color:#64748b;font-size:20px;cursor:pointer;line-height:1;width:auto;min-height:unset;padding:0}
    .acct-row{font-size:13px;color:#cbd5e1;background:#0b1220;border:1px solid #1e2a3a;border-radius:10px;padding:12px 14px;margin-bottom:10px}
    .acct-row b{color:#e2e8f0}
    .acct-badge{display:inline-block;font-size:10px;font-weight:800;border-radius:8px;padding:2px 8px;margin-left:6px}
    .acct-badge.on{background:#052e22;color:#34d399}.acct-badge.off{background:#3a2410;color:#fbbf24}
  `;
  document.head.appendChild(s);
}

// ── chip ────────────────────────────────────────────────────────────────────
function ensureChip() {
  const home = document.getElementById('homeScreen');
  if (!home || document.getElementById('acctChip')) return;
  const chip = document.createElement('button');
  chip.id = 'acctChip'; chip.type = 'button';
  chip.innerHTML = '☁ <span id="acctChipLbl">Account</span>';
  chip.addEventListener('click', open);
  home.appendChild(chip);
  refreshChip();
}

function refreshChip() {
  const lbl = document.getElementById('acctChipLbl');
  if (!lbl) return;
  if (!isConfigured()) { lbl.textContent = 'Offline mode'; return; }
  lbl.textContent = _user ? (_user.user_metadata?.display_name || _user.email.split('@')[0]) : 'Account';
}

// ── modal ───────────────────────────────────────────────────────────────────
function ensureModal() {
  if (_modal) return _modal;
  const o = document.createElement('div');
  o.id = 'acctOverlay';
  o.innerHTML = `<div class="acct-card" id="acctCard"></div>`;
  o.addEventListener('click', e => { if (e.target === o) close(); });
  document.body.appendChild(o);
  _modal = o;
  return o;
}

function open() { ensureModal(); render(); _modal.classList.add('on'); }
function close() { if (_modal) _modal.classList.remove('on'); }

let _mode = 'signin';   // 'signin' | 'signup'

function render() {
  const card = document.getElementById('acctCard');
  if (!card) return;

  if (!isConfigured()) {
    card.innerHTML = `
      <button class="acct-x" id="acctClose">×</button>
      <h2>Offline mode</h2>
      <div class="acct-sub">${CONFIG.LAB_NAME} is running fully on-device — all your
        data stays in this browser. Accounts and research-data upload activate once
        the app is connected to a Supabase project.</div>
      <div class="acct-row">To enable accounts &amp; the training-data server, add your
        keys in <b>js/config.js</b> and run <b>supabase/schema.sql</b>. See
        <b>LAUNCH.md</b> for the full guide.</div>
      <button class="acct-btn ghost" id="acctOk">Got it</button>`;
    card.querySelector('#acctClose').onclick = close;
    card.querySelector('#acctOk').onclick = close;
    return;
  }

  if (_user) return renderSignedIn(card);
  return renderAuth(card);
}

function renderAuth(card) {
  const signup = _mode === 'signup';
  card.innerHTML = `
    <button class="acct-x" id="acctClose">×</button>
    <h2>${signup ? 'Create account' : 'Log in'}</h2>
    <div class="acct-sub">${signup ? 'Your own ' + CONFIG.LAB_NAME + ' — synced across devices.'
                                    : 'Welcome back to ' + CONFIG.LAB_NAME + '.'}</div>
    ${signup ? `<label>Display name</label><input type="text" id="acctName" placeholder="e.g. A. Researcher">` : ''}
    <label>Email</label><input type="email" id="acctEmail" placeholder="you@university.edu" autocomplete="email">
    <label>Password</label><input type="password" id="acctPass" placeholder="••••••••" autocomplete="${signup ? 'new-password' : 'current-password'}">
    ${signup ? `<div class="acct-consent"><input type="checkbox" id="acctConsent">
        <label for="acctConsent" style="margin:0;font-weight:500;color:#94a3b8;text-transform:none;letter-spacing:0">
        ${CONFIG.CONSENT_TEXT}</label></div>` : ''}
    <button class="acct-btn" id="acctGo">${signup ? 'Sign up' : 'Log in'}</button>
    <div class="acct-msg" id="acctMsg"></div>
    <div class="acct-switch">${signup
      ? `Already have an account? <a id="acctSwitch">Log in</a>`
      : `New here? <a id="acctSwitch">Create an account</a>`}</div>`;

  card.querySelector('#acctClose').onclick = close;
  card.querySelector('#acctSwitch').onclick = () => { _mode = signup ? 'signin' : 'signup'; render(); };
  card.querySelector('#acctGo').onclick = () => submitAuth(signup);
}

async function submitAuth(signup) {
  const msg = document.getElementById('acctMsg');
  const btn = document.getElementById('acctGo');
  const email = document.getElementById('acctEmail').value.trim();
  const pass  = document.getElementById('acctPass').value;
  msg.className = 'acct-msg';
  if (!email || !pass) { msg.className = 'acct-msg err'; msg.textContent = 'Email and password are required.'; return; }
  btn.disabled = true;
  try {
    if (signup) {
      const name = document.getElementById('acctName').value.trim();
      const consent = document.getElementById('acctConsent').checked;
      await Cloud.signUp(email, pass, { displayName: name, consent });
      msg.className = 'acct-msg ok';
      msg.textContent = 'Account created! Check your email if confirmation is required, then log in.';
      _mode = 'signin';
      setTimeout(render, 1400);
    } else {
      await Cloud.signIn(email, pass);
      // onAuthChange will refresh _user and re-render.
    }
  } catch (e) {
    msg.className = 'acct-msg err';
    msg.textContent = e?.message || 'Something went wrong.';
  } finally {
    btn.disabled = false;
  }
}

function renderSignedIn(card) {
  const name = _user.user_metadata?.display_name || _user.email;
  const consent = Boolean(_user.user_metadata?.research_consent);
  card.innerHTML = `
    <button class="acct-x" id="acctClose">×</button>
    <h2>My account</h2>
    <div class="acct-sub">Signed in to ${CONFIG.LAB_NAME}.</div>
    <div class="acct-row"><b>${name}</b><br><span style="color:#64748b;font-size:12px">${_user.email}</span></div>
    <div class="acct-row">Research contribution
      <span class="acct-badge ${consent ? 'on' : 'off'}">${consent ? 'CONSENTED' : 'NOT ENABLED'}</span>
      <div style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.5">
        ${consent ? 'Your anonymized measurements help improve the shared timing models.'
                  : 'Enable on a new sign-up to contribute anonymized training data.'}</div></div>
    <button class="acct-btn" id="acctContrib" ${consent ? '' : 'disabled'}>⬆ Contribute training data</button>
    <div class="acct-msg" id="acctMsg"></div>
    <button class="acct-btn danger" id="acctOut">Log out</button>`;
  card.querySelector('#acctClose').onclick = close;
  card.querySelector('#acctOut').onclick = async () => { await Cloud.signOut(); };
  const cb = card.querySelector('#acctContrib');
  if (cb) cb.onclick = contribute;
}

async function contribute() {
  const msg = document.getElementById('acctMsg');
  const btn = document.getElementById('acctContrib');
  msg.className = 'acct-msg';
  msg.textContent = 'Packaging your observations…';
  btn.disabled = true;
  try {
    const tracker = new PlateTracker();
    const plates  = tracker.getAll();
    const engine  = new MLEngine();
    engine.train(plates);                                  // refresh local corrections
    const pkg = engine.exportContributionPackage(plates);
    if (!pkg.plates.length) {
      msg.className = 'acct-msg err';
      msg.textContent = 'No real-world observations yet — log some plate measurements first.';
      btn.disabled = false; return;
    }
    const res = await Cloud.uploadContribution(pkg);
    if (res.ok) {
      msg.className = 'acct-msg ok';
      msg.textContent = `Thank you! Uploaded ${pkg.plates.length} plate dataset(s) to the research server.`;
    } else {
      msg.className = 'acct-msg err';
      msg.textContent = res.reason === 'no-consent'
        ? 'Research consent is not enabled on this account.'
        : `Upload failed: ${res.reason}`;
    }
  } catch (e) {
    msg.className = 'acct-msg err';
    msg.textContent = e?.message || 'Upload failed.';
  } finally {
    btn.disabled = false;
  }
}

// ── init ─────────────────────────────────────────────────────────────────────
function init() {
  ensureStyles();
  ensureChip();
  if (isConfigured()) {
    Cloud.onAuthChange(u => {
      _user = u;
      refreshChip();
      if (_modal?.classList.contains('on')) render();
    });
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
