/**
 * SessionManager — save, load, tag, and export tracking sessions
 * using localStorage (falls back gracefully if storage is full).
 */

const STORE_KEY  = 'wormtrace_sessions';
const MAX_SESSIONS = 50;

export class SessionManager {
  constructor() {
    this._sessions = this._load();
  }

  /** Create a new session record and return its id. */
  createSession({ name = 'Untitled Session', tags = [], notes = '' } = {}) {
    const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const session = {
      id, name, tags, notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      videoName: '',
      trackingData: null,   // serialised worm tracks
      patternData: [],      // serialised patterns
      plateIds: [],         // linked plate ids
    };
    this._sessions.unshift(session);
    if (this._sessions.length > MAX_SESSIONS) this._sessions.pop();
    this._persist();
    return id;
  }

  /** Update fields on an existing session. */
  update(id, fields) {
    const s = this._find(id);
    if (!s) return false;
    Object.assign(s, fields, { updatedAt: Date.now() });
    this._persist();
    return true;
  }

  /** Save worm tracking snapshot to a session. */
  saveTracking(id, tracks, patterns, videoName) {
    return this.update(id, {
      videoName,
      trackingData: this._serializeTracks(tracks),
      patternData: patterns.map(p => ({ ...p, seq: undefined })), // skip large seq arrays
    });
  }

  /** Add or remove a tag from a session. */
  toggleTag(id, tag) {
    const s = this._find(id);
    if (!s) return;
    const idx = s.tags.indexOf(tag);
    if (idx >= 0) s.tags.splice(idx, 1);
    else s.tags.push(tag);
    s.updatedAt = Date.now();
    this._persist();
  }

  delete(id) {
    this._sessions = this._sessions.filter(s => s.id !== id);
    this._persist();
  }

  get(id) { return this._find(id); }
  getAll() { return [...this._sessions]; }

  getAllTags() {
    const tags = new Set();
    for (const s of this._sessions) s.tags.forEach(t => tags.add(t));
    return [...tags].sort();
  }

  /** Export a session as a JSON blob for download. */
  exportJSON(id) {
    const s = this._find(id);
    if (!s) return null;
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    return URL.createObjectURL(blob);
  }

  /** Export tracking data as CSV. */
  exportCSV(id) {
    const s = this._find(id);
    if (!s || !s.trackingData) return null;
    const rows = ['worm_id,time_s,x,y,speed,ang_vel,angle,aspect_ratio'];
    for (const t of s.trackingData) {
      for (const p of t.trajectory) {
        rows.push(`${t.id},${p.t?.toFixed(3)},${p.x?.toFixed(1)},${p.y?.toFixed(1)},` +
          `${(p.speed ?? 0).toFixed(2)},${(p.angVel ?? 0).toFixed(4)},` +
          `${(p.angle ?? 0).toFixed(4)},${(p.aspectRatio ?? 1).toFixed(2)}`);
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    return URL.createObjectURL(blob);
  }

  // ── internals ──────────────────────────────────────────────────────────────
  _find(id) { return this._sessions.find(s => s.id === id) ?? null; }

  _serializeTracks(tracks) {
    return tracks.map(t => ({
      id: t.id, color: t.color,
      firstTime: t.firstTime,
      trajectory: t.trajectory.map(p => ({
        t: p.t, x: p.x, y: p.y,
        speed: p.speed, angVel: p.angVel,
        angle: p.angle, aspectRatio: p.aspectRatio,
      })),
      patternId: t.patternId,
      bestMatch: t.bestMatch,
    }));
  }

  _load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
    catch { return []; }
  }

  _persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this._sessions)); }
    catch (e) {
      // Storage full — trim oldest and retry
      if (this._sessions.length > 1) {
        this._sessions.pop();
        this._persist();
      }
    }
  }
}
