/**
 * Image clean-up before OCR, written as pure functions over greyscale pixels
 * so they run in the browser (canvas) and in unit tests alike.
 *
 * Printed timetables are tables: Tesseract reads the cell borders as letters
 * ("|", "[", "—") and merges words across cells. So we:
 *  1. binarise with a local (adaptive) threshold, which copes with uneven phone lighting;
 *  2. find the table's horizontal and vertical lines (long straight runs of ink);
 *  3. erase those lines, leaving black text on white for OCR;
 *  4. keep the vertical lines, so the parser can tell where a cell spans several periods.
 */

export type Gray = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };

export type LineMasks = {
  width: number;
  height: number;
  /** 1 where a vertical table line is */
  vertical: Uint8Array;
  /** 1 where a horizontal table line is */
  horizontal: Uint8Array;
};

/** RGBA (canvas ImageData) → greyscale. */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) data[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  return { width, height, data };
}

/** Ink mask: a pixel is ink when clearly darker than its neighbourhood (and not near-white). */
export function binarize(img: Gray, opts: { window?: number; offset?: number } = {}): Uint8Array {
  const { width: w, height: h, data } = img;
  const r = Math.max(7, Math.round((opts.window ?? Math.round(w / 80)) / 2));
  const offset = opts.offset ?? 14;
  // Integral image for fast local means
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = data[y * w + x];
      ink[y * w + x] = v < mean - offset && v < 215 ? 1 : 0;
    }
  }
  return ink;
}

/** Mark straight runs of ink at least `minLen` long (bridging gaps of up to `gap` px). */
function runs(ink: Uint8Array, w: number, h: number, dir: "h" | "v", minLen: number, gap: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const outer = dir === "h" ? h : w;
  const inner = dir === "h" ? w : h;
  const at = (o: number, i: number) => (dir === "h" ? o * w + i : i * w + o);
  for (let o = 0; o < outer; o++) {
    let start = -1;
    let lastInk = -1;
    for (let i = 0; i <= inner; i++) {
      // A line drawn slightly off-axis wanders by a pixel: accept ink in the neighbouring row/column too.
      const isInk = i < inner && (ink[at(o, i)] === 1 || (o > 0 && ink[at(o - 1, i)] === 1) || (o + 1 < outer && ink[at(o + 1, i)] === 1));
      if (isInk) {
        if (start < 0) start = i;
        lastInk = i;
      } else if (start >= 0 && i - lastInk > gap) {
        if (lastInk - start + 1 >= minLen) for (let k = start; k <= lastInk; k++) if (ink[at(o, k)]) out[at(o, k)] = 1;
        start = -1;
      }
    }
  }
  return out;
}

/** Grow a mask by `r` px onto neighbouring ink (anti-aliased line edges). */
function grow(mask: Uint8Array, ink: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = mask.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < h && xx >= 0 && xx < w && ink[yy * w + xx]) out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
}

/**
 * Find table lines. Horizontal lines are long (≥ 6 % of the width); vertical
 * lines must be taller than text (≥ 2.2 % of the width ≈ 1.6 × a printed letter
 * at the 2,500 px OCR width) but row heights are small, so they are shorter.
 */
export function findLines(ink: Uint8Array, w: number, h: number): LineMasks {
  // Gap 1: bold text has 2–3 px gaps between letters, which must NOT join into a "line".
  const horizontal = grow(runs(ink, w, h, "h", Math.round(w * 0.06), 1), ink, w, h, 2);
  const vertical = grow(runs(ink, w, h, "v", Math.round(w * 0.022), 2), ink, w, h, 2);
  return { width: w, height: h, horizontal, vertical };
}

/** Clean image for OCR: black text on white, table lines removed. Returns greyscale. */
export function cleanForOcr(ink: Uint8Array, lines: LineMasks): Uint8ClampedArray {
  const out = new Uint8ClampedArray(ink.length);
  for (let i = 0; i < ink.length; i++) out[i] = ink[i] && !lines.horizontal[i] && !lines.vertical[i] ? 0 : 255;
  return out;
}

/**
 * Flatten the background: divide each pixel by its neighbourhood's brightness,
 * so shaded cells, shadows and uneven phone lighting all become white and text
 * gets darker and evenly contrasted.
 */
export function flattenBackground(img: Gray): Gray {
  const { width: w, height: h, data } = img;
  const r = Math.max(10, Math.round(w / 60));
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const mean = (integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      const ratio = data[y * w + x] / Math.max(1, mean);
      out[y * w + x] = ratio >= 0.9 ? 255 : Math.max(0, Math.min(255, Math.round((255 * (ratio - 0.35)) / 0.55)));
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Greyscale variant: the original pixels with table lines (plus a 2 px halo of
 * anti-aliasing) painted white. Keeps smooth letter edges, which Tesseract
 * reads better than a hard black/white image on small, low-resolution text.
 */
export function eraseLines(img: Gray, lines: LineMasks, halo = 2): Uint8ClampedArray {
  const { width: w, height: h } = img;
  const out = new Uint8ClampedArray(img.data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!lines.horizontal[i] && !lines.vertical[i]) continue;
      for (let dy = -halo; dy <= halo; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -halo; dx <= halo; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w) out[yy * w + xx] = 255;
        }
      }
    }
  }
  return out;
}

/**
 * x positions of vertical table lines that run through the band y0..y1
 * (e.g. the header row: its lines are the exact column boundaries).
 */
export function verticalLineXs(lines: LineMasks, y0: number, y1: number, minCoverage = 0.7): number[] {
  const { width: w, height: h, vertical } = lines;
  const top = Math.max(0, Math.round(Math.min(y0, y1)));
  const bottom = Math.min(h - 1, Math.round(Math.max(y0, y1)));
  if (bottom <= top) return [];
  const hits: number[] = [];
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = top; y <= bottom; y++) if (vertical[y * w + x] || (x > 0 && vertical[y * w + x - 1]) || (x < w - 1 && vertical[y * w + x + 1])) n++;
    if (n / (bottom - top + 1) >= minCoverage) hits.push(x);
  }
  // Group neighbouring x's into one line each
  const xs: number[] = [];
  let start = -1;
  for (let i = 0; i <= hits.length; i++) {
    if (i < hits.length && start >= 0 && hits[i] - hits[i - 1] <= 3) continue;
    if (start >= 0) xs.push((hits[start] + hits[i - 1]) / 2);
    start = i;
  }
  return xs;
}

/** What the parser needs from the detected lines (kept abstract so the parser stays pure). */
export type TableLines = {
  /** x positions of vertical lines crossing the band y0..y1 */
  lineXs(y0: number, y1: number): number[];
  /** true when a vertical line separates the cells at x in the band y0..y1 */
  separated(x: number, y0: number, y1: number): boolean;
};

export function tableLines(lines: LineMasks): TableLines {
  return { lineXs: (y0, y1) => verticalLineXs(lines, y0, y1), separated: (x, y0, y1) => hasVerticalLine(lines, x, y0, y1) };
}

/**
 * Is there a vertical table line near x between y0 and y1? Used to decide
 * whether two neighbouring period columns are separate cells or one merged cell.
 */
export function hasVerticalLine(lines: LineMasks, x: number, y0: number, y1: number, tolerance = 10): boolean {
  const { width: w, height: h, vertical } = lines;
  const top = Math.max(0, Math.round(Math.min(y0, y1)));
  const bottom = Math.min(h - 1, Math.round(Math.max(y0, y1)));
  if (bottom <= top) return false;
  let best = 0;
  for (let xx = Math.max(0, Math.round(x - tolerance)); xx <= Math.min(w - 1, Math.round(x + tolerance)); xx++) {
    let hit = 0;
    for (let y = top; y <= bottom; y++) if (vertical[y * w + xx] || (xx > 0 && vertical[y * w + xx - 1]) || (xx < w - 1 && vertical[y * w + xx + 1])) hit++;
    best = Math.max(best, hit / (bottom - top + 1));
  }
  return best >= 0.5;
}
