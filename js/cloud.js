/**
 * cloud.js — thin wrapper around Supabase for WormTrace.
 *
 * Provides three capabilities, each of which degrades gracefully to a no-op
 * when the app is not configured (see config.js):
 *   1. Auth     — sign up / sign in / sign out / current user
 *   2. Sync     — push/pull a user's app state (key-value blobs)
 *   3. Research — upload anonymized training-data contribution packages
 *
 * The Supabase client is loaded from the CDN on demand (ESM), so there is no
 * build step — consistent with the rest of WormTrace's no-bundler setup.
 */
import { CONFIG, isConfigured } from './config.js?v=100';

const SUPABASE_ESM = 'https://esm.sh/@supabase/supabase-js@2';

let _client = null;          // cached Supabase client
let _clientPromise = null;   // de-dupe concurrent init
const _authListeners = new Set();

/** Lazily create (and cache) the Supabase client. Returns null if unconfigured. */
async function getClient() {
  if (!isConfigured()) return null;
  if (_client) return _client;
  if (_clientPromise) return _clientPromise;
  _clientPromise = (async () => {
    const { createClient } = await import(SUPABASE_ESM);
    _client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    // Fan out auth changes to subscribers (e.g. the account UI).
    _client.auth.onAuthStateChange((_event, session) => {
      for (const fn of _authListeners) {
        try { fn(session?.user ?? null); } catch {}
      }
    });
    return _client;
  })();
  return _clientPromise;
}

export const Cloud = {
  isConfigured,

  /** Subscribe to login/logout. Returns an unsubscribe function. */
  onAuthChange(fn) {
    _authListeners.add(fn);
    // Fire once with current state.
    this.getUser().then(fn).catch(() => {});
    return () => _authListeners.delete(fn);
  },

  /** Current signed-in user, or null. */
  async getUser() {
    const c = await getClient();
    if (!c) return null;
    const { data } = await c.auth.getUser();
    return data?.user ?? null;
  },

  /**
   * Create an account. `consent` records that the user accepted the research
   * consent (stored in user metadata + the profiles table).
   */
  async signUp(email, password, { displayName = '', consent = false } = {}) {
    const c = await getClient();
    if (!c) throw new Error('Cloud not configured');
    const { data, error } = await c.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          research_consent: consent,
          consent_version: consent ? CONFIG.CONSENT_VERSION : null,
        },
      },
    });
    if (error) throw error;
    // Best-effort profile row (ignored if the session isn't active yet, e.g.
    // when email confirmation is required).
    if (data?.user) {
      await c.from('profiles').upsert({
        id: data.user.id,
        display_name: displayName,
        research_consent: consent,
        consent_version: consent ? CONFIG.CONSENT_VERSION : null,
      }).then(() => {}, () => {});
    }
    return data.user;
  },

  async signIn(email, password) {
    const c = await getClient();
    if (!c) throw new Error('Cloud not configured');
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  },

  async signOut() {
    const c = await getClient();
    if (!c) return;
    await c.auth.signOut();
  },

  // ── Per-user data sync ──────────────────────────────────────────────────────
  /** Push a named blob of app state for the current user. */
  async saveState(key, value) {
    const c = await getClient();
    if (!c) return false;
    const user = await this.getUser();
    if (!user) return false;
    const { error } = await c.from('user_state')
      .upsert({ user_id: user.id, key, value, updated_at: new Date().toISOString() },
              { onConflict: 'user_id,key' });
    return !error;
  },

  /** Pull a named blob of app state for the current user (or null). */
  async loadState(key) {
    const c = await getClient();
    if (!c) return null;
    const user = await this.getUser();
    if (!user) return null;
    const { data, error } = await c.from('user_state')
      .select('value').eq('user_id', user.id).eq('key', key).maybeSingle();
    if (error) return null;
    return data?.value ?? null;
  },

  // ── Research training-data upload ────────────────────────────────────────────
  /**
   * Upload an anonymized contribution package (from MLEngine) to the research
   * server. Requires a signed-in user who has given research consent.
   * @returns {{ok:boolean, reason?:string, id?:string}}
   */
  async uploadContribution(pkg) {
    const c = await getClient();
    if (!c) return { ok: false, reason: 'not-configured' };
    const user = await this.getUser();
    if (!user) return { ok: false, reason: 'not-signed-in' };
    if (!user.user_metadata?.research_consent) {
      return { ok: false, reason: 'no-consent' };
    }
    const { data, error } = await c.from('training_contributions').insert({
      user_id: user.id,
      format: pkg.format ?? 'wormtrace-contribution',
      version: pkg.version ?? '1.0',
      payload: pkg,
      plate_count: Array.isArray(pkg.plates) ? pkg.plates.length : 0,
    }).select('id').single();
    if (error) return { ok: false, reason: error.message };
    return { ok: true, id: data.id };
  },
};
