/**
 * WormCounter — counts worms in a STILL plate photo (no video background to
 * subtract). Worms appear as dark, elongated objects on a lighter agar lawn, so
 * we mask "darker than the local background" via a box-blur background estimate
 * (handles uneven lighting / dish vignetting), clean it up morphologically, then
 * reuse WormDetector's connected-component + geometry filtering to count blobs.
 *
 * This is classic image processing — it runs fully offline in the browser, needs
 * no training, and is tuned live with 3 sliders. It is the foundation for later
 * stage recognition (blob length → stage) and a trained model from labeled photos.
 */
import { WormDetector } from './WormDetector.js?v=50';

const WORK_MAX = 900;   // longest-edge working resolution (keeps CV fast & thresholds stable)

export class WormCounter {
  /**
   * @param {HTMLImageElement|HTMLCanvasElement} img  loaded image
   * @param {object} opts
   *   sensitivity  how much darker than background a pixel must be (default 20)
   *   minArea      smallest blob to count, px² at working res (default 30)
   *   maxArea      largest blob to count, px² (default 4000)
   *   minAspect    elongation filter; worms are long (default 1.15)
   *   blurRadius   background-estimate radius, px (default 16)
   * @returns {{count:number, blobs:object[], workW:number, workH:number, scale:number}}
   */
  count(img, opts = {}) {
    const {
      sensitivity = 20, minArea = 30, maxArea = 4000,
      minAspect = 1.15, blurRadius = 16,
    } = opts;

    // 1) Draw to a working canvas, scaled so the longest edge ≤ WORK_MAX.
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const scale = Math.min(1, WORK_MAX / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;

    // 2) Grayscale (luminance).
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    }

    // 3) Background estimate = box-blurred grayscale → mask pixels darker than it.
    const bg = this._boxBlur(gray, w, h, blurRadius);
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      mask[i] = (bg[i] - gray[i]) > sensitivity ? 1 : 0;   // worm = locally dark
    }

    // 4) Morphological open (erode→dilate) to drop single-pixel specks & smooth.
    const cleaned = this._open(mask, w, h, 1);

    // 5) Connected-component blobs filtered by worm-like size & elongation.
    const detector = new WormDetector({ minArea, maxArea, minAspect });
    const blobs = detector.detect(cleaned, w, h);

    // 6) Per-blob features for the learner: darkness (mean below local background)
    //    and fill (area / bounding box). Plus image-level medians so sizes can be
    //    normalized → the classifier transfers across magnifications.
    for (const b of blobs) {
      let dsum = 0;
      for (const p of b.pixels) dsum += bg[p.y * w + p.x] - gray[p.y * w + p.x];
      b.darkness = (dsum / Math.max(1, b.pixels.length)) / 128;          // ~0–2
      const bw = b.maxX - b.minX + 1, bh = b.maxY - b.minY + 1;
      b.fill = b.area / Math.max(1, bw * bh);                            // 0–1
    }
    const med = (arr) => { if (!arr.length) return 1; const s = [...arr].sort((a, c) => a - c); return s[s.length >> 1] || 1; };
    const medianMajor = med(blobs.map(b => b.major));
    const medianArea  = med(blobs.map(b => b.area));

    return { count: blobs.length, blobs, workW: w, workH: h, scale, medianMajor, medianArea };
  }

  // ── Separable box blur (two O(n) passes) ─────────────────────────────────────
  _boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    const win = 2 * r + 1;
    // horizontal
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += src[row + this._clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / win;
        const add = src[row + this._clamp(x + r + 1, 0, w - 1)];
        const sub = src[row + this._clamp(x - r, 0, w - 1)];
        acc += add - sub;
      }
    }
    // vertical
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[this._clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / win;
        const add = tmp[this._clamp(y + r + 1, 0, h - 1) * w + x];
        const sub = tmp[this._clamp(y - r, 0, h - 1) * w + x];
        acc += add - sub;
      }
    }
    return out;
  }

  // ── Morphology ───────────────────────────────────────────────────────────────
  _open(mask, w, h, r) { return this._dilate(this._erode(mask, w, h, r), w, h, r); }

  _erode(mask, w, h, r)  { return this._morph(mask, w, h, r, false); }
  _dilate(mask, w, h, r) { return this._morph(mask, w, h, r, true); }

  _morph(mask, w, h, r, isDilate) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = isDilate ? 0 : 1;
        outer: for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
            const m = mask[ny * w + nx];
            if (isDilate && m) { v = 1; break outer; }
            if (!isDilate && !m) { v = 0; break outer; }
          }
        }
        out[y * w + x] = v;
      }
    }
    return out;
  }

  _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
}
