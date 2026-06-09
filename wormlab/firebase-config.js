/**
 * firebase-config.js — paste your Firebase project's web config here.
 *
 * ── HOW TO GET THIS (one time, ~5 min, free) ─────────────────────────────────
 *   1. Go to https://console.firebase.google.com → "Add project" (any name).
 *   2. In the project, open  Build → Firestore Database → "Create database"
 *        → Start in *production mode* (we set rules below) → pick a location.
 *   3. Open  Build → Authentication → "Get started" → enable "Anonymous".
 *   4. Click the gear ⚙ (Project settings) → scroll to "Your apps" →
 *        click the </> (Web) icon → register an app → copy the `firebaseConfig`
 *        object it shows you and paste it over FIREBASE_CONFIG below.
 *   5. In Firestore → Rules, paste the rules from SETUP.md and Publish.
 *
 * Until you paste a real config, the app runs in LOCAL-ONLY mode (works on one
 * device, no cross-phone sync) so you can try everything first.
 *
 * NOTE: A Firebase *web* config is not a secret — it's meant to ship in the page.
 * Access is controlled by the Firestore security rules, not by hiding this file.
 */
export const FIREBASE_CONFIG = {
  apiKey:            'PASTE_ME',
  authDomain:        'PASTE_ME',
  projectId:         'PASTE_ME',
  storageBucket:     'PASTE_ME',
  messagingSenderId: 'PASTE_ME',
  appId:             'PASTE_ME',
};

// Light gate for Teacher mode. Change this to whatever you want to hand staff.
// (This guards the UI/simulation only; it is not strong security.)
export const TEACHER_PASSCODE = 'teach';

// true once the config above has been filled in (no PASTE_ME left).
export const FIREBASE_READY =
  Object.values(FIREBASE_CONFIG).every(v => v && !String(v).includes('PASTE_ME'));
