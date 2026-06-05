/**
 * Contribute.js — lets a user auto-upload their labeled training data to a shared
 * cloud endpoint so EVERYONE's labels can be pooled into a stronger model. Training
 * data from one person is tiny; pooled across many users it becomes useful.
 *
 * What gets sent (one contribution = one confirmed photo):
 *   • the feature rows the model actually learns from ([5 numbers] + category), AND
 *   • the source photo + click labels, so we can re-extract better features / train a
 *     stronger model offline later. (Images leaving the device → guarded by consent.)
 *
 * Transport: a single HTTPS POST to a configurable endpoint. The body is JSON sent
 * as text/plain so it counts as a "simple" CORS request (no preflight) — this keeps
 * it compatible with zero-infra endpoints like a Google Apps Script Web App. See
 * docs/CONTRIBUTE_ENDPOINT.md for a ready-to-deploy backend.
 *
 * Privacy: no name/email is collected. An anonymous random client id is generated
 * once per device so duplicate uploads can be de-duped server-side without PII.
 */

// Default endpoint baked into the build so every user contributes to the same shared
// database automatically (no per-device setup). A user can still override it in-app.
export const DEFAULT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxgISFMwh84wr2KnZO5REgHHFxEIZGYDS7ywBWrGs1j-jv-UuvapWLl7-F7yMMePsVFkA/exec';
// Shared token sent with every contribution. NOT a real secret (it ships in the client
// source), just a low-friction gate so the public endpoint ignores casual/bot spam.
// Must match the SECRET in the Apps Script (see docs/CONTRIBUTE_ENDPOINT.md).
export const SHARED_TOKEN = 'wt_f2c9748cbc2b5afd1045aa3d';
const APP_VERSION = 151;

const EP_KEY     = 'wt_contribute_endpoint';   // per-device endpoint override
const CID_KEY    = 'wt_client_id';             // anonymous device id
const SENT_KEY   = 'wt_contributed_hashes';    // de-dup: contributions already uploaded
const CONSENT_KEY = 'wt_contribute_consent';   // user agreed (once) to contribute
const DISMISS_KEY = 'wt_contribute_dismissed'; // user said "not now" — don't nag again

export function getEndpoint() {
  try { return (localStorage.getItem(EP_KEY) || DEFAULT_ENDPOINT || '').trim(); }
  catch { return DEFAULT_ENDPOINT; }
}
export function setEndpoint(url) {
  try {
    const u = (url || '').trim();
    if (u) localStorage.setItem(EP_KEY, u); else localStorage.removeItem(EP_KEY);
  } catch {}
}
export function isConfigured() { return /^https?:\/\//i.test(getEndpoint()); }

// A single "I agree to contribute" flag. Agreeing covers BOTH the numeric features
// and the photo — the consent copy says so — so there's nothing else to toggle.
export function hasConsent() { try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; } }
export function setConsent(v) {
  try {
    if (v) { localStorage.setItem(CONSENT_KEY, '1'); localStorage.removeItem(DISMISS_KEY); }
    else localStorage.removeItem(CONSENT_KEY);
  } catch {}
}
export function isDismissed() { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } }
export function setDismissed(v) { try { v ? localStorage.setItem(DISMISS_KEY, '1') : localStorage.removeItem(DISMISS_KEY); } catch {} }

// Contributing is live when we have somewhere to send AND the user has agreed.
export function isActive() { return isConfigured() && hasConsent(); }

function clientId() {
  try {
    let id = localStorage.getItem(CID_KEY);
    if (!id) {
      id = 'wt_' + (crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      localStorage.setItem(CID_KEY, id);
    }
    return id;
  } catch { return 'wt_anon'; }
}

// Stable fingerprint of a contribution's learning content (rows + labels) so the same
// photo confirmed twice isn't uploaded twice. Cheap 32-bit hash — collisions are
// harmless here (worst case we skip a near-identical upload).
function fingerprint(payload) {
  const basis = JSON.stringify({
    r: payload.rows?.map(r => [r.f.map(x => Math.round(x * 1e4)), r.cat]),
    l: payload.labels,
  });
  let h = 5381;
  for (let i = 0; i < basis.length; i++) h = ((h * 33) ^ basis.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function alreadySent(fp) {
  try { return (JSON.parse(localStorage.getItem(SENT_KEY) || '[]')).includes(fp); } catch { return false; }
}
function markSent(fp) {
  try {
    const arr = JSON.parse(localStorage.getItem(SENT_KEY) || '[]');
    arr.push(fp);
    localStorage.setItem(SENT_KEY, JSON.stringify(arr.slice(-500)));   // cap history
  } catch {}
}

/**
 * Upload one confirmed photo's training data.
 * @param {{image?, labels:Array, counts:Object, rows:Array, includeImage?:boolean}} data
 * @returns {Promise<{ok:boolean, skipped?:boolean, reason?:string}>}
 */
export async function contribute(data) {
  if (!isConfigured()) return { ok: false, reason: 'no-endpoint' };
  if (!data.rows?.length) return { ok: false, reason: 'no-data' };

  const includeImage = data.includeImage !== false && hasConsent() && !!data.image;
  const payload = {
    type: 'wormtrace-contribution',
    version: 1,
    token: SHARED_TOKEN,
    appVersion: APP_VERSION,
    clientId: clientId(),
    ts: new Date().toISOString(),
    features: 5,
    counts: data.counts || {},
    labels: data.labels || [],
    rows: data.rows,
    image: includeImage ? data.image : null,   // photo only with consent
  };

  const fp = fingerprint(payload);
  if (alreadySent(fp)) return { ok: true, skipped: true };

  // text/plain → "simple request", no CORS preflight (works with Apps Script et al.)
  const res = await fetch(getEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);

  markSent(fp);
  return { ok: true };
}
