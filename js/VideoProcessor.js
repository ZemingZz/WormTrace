/**
 * VideoProcessor — extracts frames from a video element and builds
 * a pixel-wise background model using a running average.
 */
export class VideoProcessor {
  constructor() {
    this.offCanvas = document.createElement('canvas');
    this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: true });
    this.bgModel = null;   // Float32Array [R,G,B, R,G,B, ...]
    this.width = 0;
    this.height = 0;
    this.bgBuilt = false;
  }

  setSize(w, h) {
    this.width = w;
    this.height = h;
    this.offCanvas.width = w;
    this.offCanvas.height = h;
    this.bgModel = new Float32Array(w * h * 3);
    this.bgBuilt = false;
  }

  /**
   * Build background model by sampling N frames evenly across the video.
   * @param {HTMLVideoElement} video
   * @param {number} sampleCount
   * @param {function} onProgress  callback(0..1)
   */
  async buildBackground(video, sampleCount = 15, onProgress) {
    const dur = video.duration;
    const step = dur / sampleCount;
    const accum = new Float32Array(this.width * this.height * 3);

    for (let i = 0; i < sampleCount; i++) {
      await this._seekTo(video, i * step + step * 0.1);
      this.offCtx.drawImage(video, 0, 0, this.width, this.height);
      const px = this.offCtx.getImageData(0, 0, this.width, this.height).data;

      for (let p = 0; p < this.width * this.height; p++) {
        accum[p * 3]     += px[p * 4];
        accum[p * 3 + 1] += px[p * 4 + 1];
        accum[p * 3 + 2] += px[p * 4 + 2];
      }

      if (onProgress) onProgress((i + 1) / sampleCount);
    }

    for (let i = 0; i < accum.length; i++) accum[i] /= sampleCount;
    this.bgModel = accum;
    this.bgBuilt = true;
  }

  /**
   * Extract ImageData from current video frame.
   */
  grabFrame(video) {
    this.offCtx.drawImage(video, 0, 0, this.width, this.height);
    return this.offCtx.getImageData(0, 0, this.width, this.height);
  }

  /**
   * Compute foreground mask (Uint8Array, 1 = foreground) by comparing
   * frame to background model.
   */
  foregroundMask(frameData, threshold = 28) {
    const n = this.width * this.height;
    const mask = new Uint8Array(n);
    const px = frameData.data;
    const bg = this.bgModel;

    for (let p = 0; p < n; p++) {
      const r = Math.abs(px[p * 4]     - bg[p * 3]);
      const g = Math.abs(px[p * 4 + 1] - bg[p * 3 + 1]);
      const b = Math.abs(px[p * 4 + 2] - bg[p * 3 + 2]);
      mask[p] = (r + g + b) / 3 > threshold ? 1 : 0;
    }

    return mask;
  }

  // ── morphological ops ──────────────────────────────────────────────────────

  erode(mask, r = 1) { return this._morph(mask, r, false); }
  dilate(mask, r = 1) { return this._morph(mask, r, true); }
  open(mask, r = 1)  { return this.dilate(this.erode(mask, r), r); }
  close(mask, r = 1) { return this.erode(this.dilate(mask, r), r); }

  _morph(mask, r, isDilate) {
    const { width: w, height: h } = this;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let found = isDilate ? 0 : 1;
        outer: for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
            const v = mask[ny * w + nx];
            if (isDilate && v) { found = 1; break outer; }
            if (!isDilate && !v) { found = 0; break outer; }
          }
        }
        out[y * w + x] = found;
      }
    }
    return out;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  _seekTo(video, t) {
    return new Promise(resolve => {
      const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = Math.min(t, video.duration - 0.05);
    });
  }
}
