/**
 * config.js — WormTrace cloud / launch configuration.
 *
 * WormTrace works 100% offline by default (all data in localStorage). Filling in
 * the values below "turns on" the cloud features:
 *   • user accounts (sign up / log in)
 *   • per-user data sync
 *   • uploading anonymized training data to the research server
 *
 * HOW TO GET THESE VALUES
 * ───────────────────────
 *   1. Create a free project at https://supabase.com  (New project)
 *   2. Project Settings → API → copy the "Project URL" and the "anon public" key
 *   3. Paste them below and redeploy. (The anon key is SAFE to ship publicly —
 *      it only grants what your Row-Level-Security policies allow. See
 *      supabase/schema.sql, which locks every row to its owner.)
 *   4. In the Supabase SQL editor, run supabase/schema.sql once to create the
 *      tables + security policies.
 *
 * Until these are filled in, isConfigured() is false and the app stays fully
 * local — no network calls, no broken buttons.
 */
export const CONFIG = {
  // ── Supabase (accounts + data + training-data upload) ──────────────────────
  SUPABASE_URL:      '',   // e.g. 'https://abcd1234.supabase.co'
  SUPABASE_ANON_KEY: '',   // e.g. 'eyJhbGciOi...'  (the "anon public" key)

  // ── Research-data consent ──────────────────────────────────────────────────
  // Shown on sign-up before any training data can be uploaded. Edit to match
  // your IRB-approved consent language.
  CONSENT_VERSION: '1.0',
  CONSENT_TEXT:
    'I agree to contribute anonymized C. elegans developmental-timing ' +
    'measurements (strain, temperature, stage timings, worm length, food level) ' +
    'to the Biotastic Lab research dataset. No personal information is included. ' +
    'I can stop contributing at any time from my account settings.',

  // ── Branding ───────────────────────────────────────────────────────────────
  LAB_NAME: 'Biotastic Lab',
  ORG_NAME: 'Florida Atlantic University',
};

export function isConfigured() {
  return Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
}
