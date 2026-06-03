/**
 * WormLearner — lightweight, in-browser, INCREMENTAL classifier that learns from
 * the user's labels as they confirm each image. Distinguishes worm life stages
 * (L1–L4 / Adult) from non-worms (egg / debris = 'none'). Old size-class models
 * (large/juvenile/baby) are auto-migrated to stages on load — see CAT_MIGRATE.
 *
 * • Runs fully offline on the phone (k-NN over labeled feature rows).
 * • Scale-robust features (sizes normalized per image) → transfers across magnifications.
 * • Persists in localStorage; keeps improving as more images are confirmed.
 * • The stored rows ARE the dataset — exportable as a shareable model file so many
 *   users' labels can be POOLED (merge on import) and sent for offline model training.
 */
const KEY = 'wt_worm_model_v1';
// Old size-based category names → new life-stage ids. Applied on load/import so
// pre-existing models & shared exports keep working after the labeling switch.
const CAT_MIGRATE = { large: 'l4', juvenile: 'l2', baby: 'l1', edge: 'l4' };
const FEATS = 5;          // [relMajor, relArea, aspect, fill, darkness]
const K = 7;
const MAX_ROWS = 6000;

export class WormLearner {
  constructor() { this.rows = []; this.images = 0; this._load(); }

  /** Feature vector for one detector blob, normalized by this image's medians. */
  featureVec(blob, res) {
    return [
      blob.major / (res.medianMajor || 1),
      blob.area  / (res.medianArea  || 1),
      blob.aspectRatio ?? blob.aspect ?? 1,
      blob.fill ?? 0.5,
      blob.darkness ?? 0.5,
    ];
  }

  addExamples(rows) {                 // rows: [{f:[...], cat}] → returns # genuinely new
    if (!rows.length) return 0;
    this.images++;
    const seen = new Set(this.rows.map(r => this._rowKey(r)));
    let added = 0;
    for (const r of rows) {
      const k = this._rowKey(r);
      if (seen.has(k)) continue;      // skip exact duplicate (e.g. re-confirming same image)
      seen.add(k); this.rows.push(r); added++;
    }
    if (this.rows.length > MAX_ROWS) this.rows = this.rows.slice(-MAX_ROWS);
    this._fitNorm(); this._save();
    return added;
  }
  _rowKey(r) { return r.f.map(x => Math.round(x * 1e5)).join(',') + '|' + r.cat; }
  _migrate() { let n = 0; for (const r of this.rows) if (CAT_MIGRATE[r.cat]) { r.cat = CAT_MIGRATE[r.cat]; n++; } return n; }
  _dedupRows() {
    const seen = new Set(), out = [];
    for (const r of this.rows) { const k = this._rowKey(r); if (!seen.has(k)) { seen.add(k); out.push(r); } }
    this.rows = out;
  }

  ready() { return this.rows.length >= 12; }

  predict(f) {
    if (!this.ready()) return { cat: 'l4', conf: 0 };
    const z = this._z(f);
    const ds = this.rows.map(r => ({ d: this._dist2(z, this._z(r.f)), cat: r.cat }))
      .sort((a, b) => a.d - b.d).slice(0, K);
    // Plain k-NN majority. Tried class-weighting to lift worm recall but it tanked
    // precision (80→49%) on real data — the right fix is more worm examples, not
    // reweighting. So keep this simple; precision is what makes the marks trustworthy.
    const votes = {}; for (const x of ds) votes[x.cat] = (votes[x.cat] || 0) + 1;
    let best = 'l4', bc = -1;
    for (const k in votes) if (votes[k] > bc) { bc = votes[k]; best = k; }
    return { cat: best, conf: bc / ds.length };
  }

  stats() {
    const byCat = {}; for (const r of this.rows) byCat[r.cat] = (byCat[r.cat] || 0) + 1;
    return { images: this.images, examples: this.rows.length, byCat, accuracy: this._loo() };
  }

  export() { return { type: 'wormtrace-model', version: 1, features: FEATS, images: this.images, rows: this.rows }; }
  importMerge(obj) {
    if (obj.type !== 'wormtrace-model' || !Array.isArray(obj.rows)) throw new Error('Not a WormTrace model file.');
    this.rows.push(...obj.rows.filter(r => Array.isArray(r.f) && r.f.length === FEATS && r.cat));
    this._migrate();                   // remap any old size-cat rows from older exports
    this._dedupRows();                 // pooling models often overlaps — drop duplicates
    this.images += obj.images || 0;
    if (this.rows.length > MAX_ROWS) this.rows = this.rows.slice(-MAX_ROWS);
    this._fitNorm(); this._save();
  }
  reset() { this.rows = []; this.images = 0; this._fitNorm(); this._save(); }

  // ── internals ──────────────────────────────────────────────────────────────
  _dist2(a, b) { let s = 0; for (let i = 0; i < FEATS; i++) { const d = a[i] - b[i]; s += d * d; } return s; }
  _z(f) { const o = new Array(FEATS); for (let i = 0; i < FEATS; i++) o[i] = (f[i] - this.mean[i]) / this.std[i]; return o; }
  _fitNorm() {
    this.mean = new Array(FEATS).fill(0); this.std = new Array(FEATS).fill(1);
    const n = this.rows.length; if (!n) return;
    for (const r of this.rows) for (let i = 0; i < FEATS; i++) this.mean[i] += r.f[i];
    for (let i = 0; i < FEATS; i++) this.mean[i] /= n;
    const v = new Array(FEATS).fill(0);
    for (const r of this.rows) for (let i = 0; i < FEATS; i++) { const d = r.f[i] - this.mean[i]; v[i] += d * d; }
    for (let i = 0; i < FEATS; i++) this.std[i] = Math.sqrt(v[i] / n) || 1;
  }
  _loo() {                            // leave-one-out k-NN accuracy (capped for speed)
    const n = this.rows.length; if (n < 20) return null;
    const idxs = n > 350 ? Array.from({ length: 350 }, (_, i) => (i * 7919) % n) : Array.from({ length: n }, (_, i) => i);
    const Z = this.rows.map(r => this._z(r.f));
    let correct = 0;
    for (const ti of idxs) {
      const ds = [];
      for (let j = 0; j < n; j++) { if (j === ti) continue; ds.push({ d: this._dist2(Z[ti], Z[j]), cat: this.rows[j].cat }); }
      ds.sort((a, b) => a.d - b.d);
      const votes = {}; for (let k = 0; k < K && k < ds.length; k++) votes[ds[k].cat] = (votes[ds[k].cat] || 0) + 1;
      let best = '', bc = -1; for (const c in votes) if (votes[c] > bc) { bc = votes[c]; best = c; }
      if (best === this.rows[ti].cat) correct++;
    }
    return correct / idxs.length;
  }
  _save() { try { localStorage.setItem(KEY, JSON.stringify({ rows: this.rows, images: this.images })); } catch (e) {} }
  _load() {
    try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o) { this.rows = o.rows || []; this.images = o.images || 0; } } catch (e) {}
    const n0 = this.rows.length; const migrated = this._migrate(); this._dedupRows(); this._fitNorm();
    if (migrated || this.rows.length < n0) this._save();   // persist migrated / deduped model
  }
}
