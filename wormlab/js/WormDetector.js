/**
 * WormDetector — finds individual worm blobs in a foreground mask using
 * connected-component labelling (flood fill) and filters by worm-like geometry.
 */
export class WormDetector {
  constructor({ minArea = 40, maxArea = 3000, minAspect = 1.2 } = {}) {
    this.minArea = minArea;
    this.maxArea = maxArea;
    this.minAspect = minAspect;  // worms are elongated
  }

  /**
   * @param {Uint8Array} mask  foreground mask
   * @param {number} w
   * @param {number} h
   * @returns {Blob[]}
   */
  detect(mask, w, h) {
    const labels = new Int32Array(w * h);
    let nextLabel = 1;
    const blobs = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx] && !labels[idx]) {
          const blob = this._fill(mask, labels, x, y, w, h, nextLabel++);
          blobs.push(blob);
        }
      }
    }

    return blobs
      .filter(b => b.area >= this.minArea && b.area <= this.maxArea)
      .map(b => this._addGeometry(b))
      .filter(b => b.aspectRatio >= this.minAspect);
  }

  _fill(mask, labels, sx, sy, w, h, label) {
    const stack = [sy * w + sx];
    let area = 0, sumX = 0, sumY = 0;
    let minX = sx, maxX = sx, minY = sy, maxY = sy;
    const pixels = [];

    while (stack.length) {
      const idx = stack.pop();
      if (idx < 0 || idx >= w * h) continue;
      if (!mask[idx] || labels[idx]) continue;

      labels[idx] = label;
      const x = idx % w, y = (idx / w) | 0;
      area++; sumX += x; sumY += y;
      pixels.push({ x, y });
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;

      if (x + 1 < w) stack.push(idx + 1);
      if (x - 1 >= 0) stack.push(idx - 1);
      if (y + 1 < h) stack.push(idx + w);
      if (y - 1 >= 0) stack.push(idx - w);
    }

    return { label, area, cx: sumX / area, cy: sumY / area, minX, maxX, minY, maxY, pixels };
  }

  _addGeometry(b) {
    // PCA to get major/minor axes → aspect ratio + orientation
    const { cx, cy, pixels } = b;
    let xx = 0, yy = 0, xy = 0;
    for (const p of pixels) {
      const dx = p.x - cx, dy = p.y - cy;
      xx += dx * dx; yy += dy * dy; xy += dx * dy;
    }
    const n = pixels.length;
    xx /= n; yy /= n; xy /= n;

    // Eigenvalues of 2×2 covariance matrix
    const tr = xx + yy;
    const det = xx * yy - xy * xy;
    const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const λ1 = tr / 2 + disc;
    const λ2 = tr / 2 - disc;

    const major = 2 * Math.sqrt(Math.max(λ1, 0.001));
    const minor = 2 * Math.sqrt(Math.max(λ2, 0.001));
    const angle = Math.atan2(2 * xy, xx - yy) / 2;

    return {
      ...b,
      major,
      minor,
      angle,
      aspectRatio: major / Math.max(minor, 0.5),
      // bounding radius for hit-testing
      radius: Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2
    };
  }
}
