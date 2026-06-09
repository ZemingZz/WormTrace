/**
 * cloud.js — data sync layer for the course app.
 *
 * Two interchangeable backends behind one async API:
 *   • FirebaseBackend — Firestore + anonymous auth. Student phones write their
 *     group's data; the teacher's phone subscribes to ALL groups in the class and
 *     sees them live. Used when firebase-config.js has been filled in.
 *   • LocalBackend — localStorage only (single device). Used until Firebase is
 *     configured, so the whole app is testable out of the box.
 *
 * Data model (one document per group keeps the teacher view to a single listener):
 *   classes/{CLASSCODE}/groups/{groupId} = {
 *     name, members:[..], createdAt, updatedAt,
 *     plates: [ { id, name, strainId, strainLabel, tempC, inoculatedAt,
 *                 createdAt, updatedAt, note, counts:{egg,l1..adult,dead},
 *                 photo:dataURL|null, observations:[ {...} ] } ]
 *   }
 */
import { FIREBASE_CONFIG, FIREBASE_READY } from '../firebase-config.js?v=9';

export function groupIdFromName(name) {
  return String(name || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'group';
}
export function normalizeClassCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 24);
}

// ── Firebase backend ──────────────────────────────────────────────────────────
class FirebaseBackend {
  constructor() { this.mode = 'cloud'; }

  async init() {
    const appMod  = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    const fsMod   = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    this.fs = fsMod;
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    this.db = fsMod.getFirestore(app);
    const auth = authMod.getAuth(app);
    await authMod.signInAnonymously(auth);
    await new Promise(res => authMod.onAuthStateChanged(auth, u => { if (u) res(u); }));
  }

  _groupRef(classCode, groupId) {
    return this.fs.doc(this.db, 'classes', classCode, 'groups', groupId);
  }

  async writeGroup(classCode, groupId, data) {
    await this.fs.setDoc(this._groupRef(classCode, groupId),
      { ...data, updatedAt: Date.now() }, { merge: true });
  }

  async getGroup(classCode, groupId) {
    const snap = await this.fs.getDoc(this._groupRef(classCode, groupId));
    return snap.exists() ? snap.data() : null;
  }

  subscribeGroup(classCode, groupId, cb) {
    return this.fs.onSnapshot(this._groupRef(classCode, groupId),
      snap => cb(snap.exists() ? { id: groupId, ...snap.data() } : null));
  }

  subscribeClass(classCode, cb) {
    const col = this.fs.collection(this.db, 'classes', classCode, 'groups');
    return this.fs.onSnapshot(col, qs => {
      const groups = [];
      qs.forEach(d => groups.push({ id: d.id, ...d.data() }));
      cb(groups);
    });
  }

  async deleteGroup(classCode, groupId) {
    await this.fs.deleteDoc(this._groupRef(classCode, groupId));
  }
}

// ── Local backend (single device; for testing before Firebase is set up) ───────
class LocalBackend {
  constructor() { this.mode = 'local'; this._subs = []; }
  async init() {
    window.addEventListener('storage', e => { if (e.key && e.key.startsWith('wlc_')) this._fire(); });
  }
  _key(classCode) { return 'wlc_class_' + classCode; }
  _read(classCode) {
    try { return JSON.parse(localStorage.getItem(this._key(classCode)) || '{"groups":{}}'); }
    catch { return { groups: {} }; }
  }
  _write(classCode, data) {
    localStorage.setItem(this._key(classCode), JSON.stringify(data));
    this._fire();
  }
  _fire() { this._subs.forEach(fn => { try { fn(); } catch {} }); }

  async writeGroup(classCode, groupId, data) {
    const all = this._read(classCode);
    all.groups[groupId] = { ...(all.groups[groupId] || {}), ...data, id: groupId, updatedAt: Date.now() };
    this._write(classCode, all);
  }
  async getGroup(classCode, groupId) {
    return this._read(classCode).groups[groupId] || null;
  }
  subscribeGroup(classCode, groupId, cb) {
    const emit = () => cb(this._read(classCode).groups[groupId] || null);
    this._subs.push(emit); emit();
    return () => { this._subs = this._subs.filter(f => f !== emit); };
  }
  subscribeClass(classCode, cb) {
    const emit = () => cb(Object.values(this._read(classCode).groups || {}));
    this._subs.push(emit); emit();
    return () => { this._subs = this._subs.filter(f => f !== emit); };
  }
  async deleteGroup(classCode, groupId) {
    const all = this._read(classCode); delete all.groups[groupId]; this._write(classCode, all);
  }
}

let _backend = null;
export async function initCloud() {
  if (_backend) return _backend;
  _backend = FIREBASE_READY ? new FirebaseBackend() : new LocalBackend();
  try {
    await _backend.init();
  } catch (err) {
    console.error('Cloud init failed, falling back to local:', err);
    _backend = new LocalBackend();
    await _backend.init();
    _backend._initError = err.message;
  }
  return _backend;
}
export function cloud() { return _backend; }
export function cloudMode() { return _backend ? _backend.mode : 'local'; }
