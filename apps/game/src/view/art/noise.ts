/**
 * Seeded value noise for the ink and wash textures (paper grain, card fibre,
 * wobbled wash edges). Pure: no DOM, no Math.random, so a garden always looks
 * the same and the textures are unit-tested. One generator serves every
 * texture; fibre is the same noise sampled stretched.
 */

/** 32-bit integer hash of a lattice point and a seed (a small avalanche mix). */
function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Lattice value in [0, 1); with a period, the lattice repeats so the noise tiles. */
function lattice(ix: number, iy: number, seed: number, px: number, py: number): number {
  if (px > 0) ix = ((ix % px) + px) % px;
  if (py > 0) iy = ((iy % py) + py) % py;
  return hash(ix, iy, seed) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Smooth value noise at (x, y), in [0, 1). Continuous in both axes. A period
 * (in lattice cells, 0 for none) makes it repeat along that axis.
 */
export function valueNoise(x: number, y: number, seed: number, periodX = 0, periodY = 0): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const px = periodX, py = periodY;
  const a = lattice(ix, iy, seed, px, py), b = lattice(ix + 1, iy, seed, px, py);
  const c = lattice(ix, iy + 1, seed, px, py), d = lattice(ix + 1, iy + 1, seed, px, py);
  const top = a + (b - a) * fx, bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Fractal sum of `octaves` layers (each twice the frequency, half the weight), in [0, 1).
 * Periods are for the first octave and double with each one, so the sum still tiles.
 */
export function fbm(x: number, y: number, seed: number, octaves: number, periodX = 0, periodY = 0): number {
  let sum = 0, weight = 1, total = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * f, y * f, seed + o * 1013, periodX * f, periodY * f) * weight;
    total += weight;
    weight *= 0.5;
    f *= 2;
  }
  return sum / total;
}

export interface FieldOptions {
  readonly seed: number;
  /** Lattice cells per pixel along x and y (higher = finer). Fibre stretches one axis. */
  readonly freqX: number;
  readonly freqY: number;
  readonly octaves: number;
  /** Output alpha = clamp((n - threshold) * gain), so only the brighter specks show. */
  readonly threshold: number;
  readonly gain: number;
  /** Largest alpha written, 0..255. */
  readonly maxAlpha: number;
  /**
   * Make the field tile seamlessly (for a repeating CSS background): each
   * frequency is nudged so a whole number of lattice cells spans the field.
   */
  readonly periodic?: boolean;
}

/**
 * A `w × h` alpha field (row-major, one byte per pixel) for a texture overlay.
 * The caller turns it into pixels of one token colour.
 */
export function noiseField(w: number, h: number, o: FieldOptions): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  const px = o.periodic ? Math.max(1, Math.round(w * o.freqX)) : 0;
  const py = o.periodic ? Math.max(1, Math.round(h * o.freqY)) : 0;
  const fx = o.periodic ? px / w : o.freqX, fy = o.periodic ? py / h : o.freqY;
  // Same values as fbm() pixel by pixel, but each octave's lattice is hashed once into a
  // grid and interpolated, instead of hashing four corners per pixel (about 4x faster).
  const sum = new Float32Array(w * h);
  let weight = 1, total = 0, f = 1;
  const sx = new Float32Array(w), ix0 = new Int32Array(w);
  for (let oct = 0; oct < o.octaves; oct++) {
    const seed = o.seed + oct * 1013, kx = fx * f, ky = fy * f, ppx = px * f, ppy = py * f;
    const gw = Math.floor((w - 1) * kx) + 2, gh = Math.floor((h - 1) * ky) + 2;
    const grid = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) grid[j * gw + i] = lattice(i, j, seed, ppx, ppy);
    for (let x = 0; x < w; x++) {
      const gx = x * kx, i = Math.floor(gx);
      ix0[x] = i;
      sx[x] = smooth(gx - i);
    }
    for (let y = 0; y < h; y++) {
      const gy = y * ky, j = Math.floor(gy), ty = smooth(gy - j), row = j * gw, row2 = row + gw;
      for (let x = 0; x < w; x++) {
        const i = ix0[x]!, tx = sx[x]!;
        const a = grid[row + i]!, b = grid[row + i + 1]!, c = grid[row2 + i]!, d = grid[row2 + i + 1]!;
        const top = a + (b - a) * tx, bottom = c + (d - c) * tx;
        sum[y * w + x]! += (top + (bottom - top) * ty) * weight;
      }
    }
    total += weight;
    weight *= 0.5;
    f *= 2;
  }
  for (let k = 0; k < sum.length; k++) {
    const a = Math.min(1, Math.max(0, (sum[k]! / total - o.threshold) * o.gain));
    out[k] = Math.round(a * o.maxAlpha);
  }
  return out;
}

/**
 * Paper grain: fine, even specks (the canvas's feTurbulence at 0.85). Two octaves, not
 * the canvas's three: a third would run at 3.4 lattice cells per pixel, detail finer
 * than a pixel that costs four times the work and cannot be seen.
 */
export const GRAIN: Omit<FieldOptions, 'seed' | 'maxAlpha'> = {
  freqX: 0.85, freqY: 0.85, octaves: 2, threshold: 0.45, gain: 2.4,
};

/** Card fibre: the same noise stretched 12:1 into short vertical fibres. */
export const FIBRE: Omit<FieldOptions, 'seed' | 'maxAlpha'> = {
  freqX: 0.6, freqY: 0.05, octaves: 2, threshold: 0.42, gain: 2.2,
};

/**
 * Offsets along a closed outline, for a wobbled wash edge: `count` samples of
 * 1D noise around a loop, in [-1, 1], wrapping so the first and last meet.
 */
export function wobble(count: number, seed: number, cycles = 6): Float32Array {
  const out = new Float32Array(count);
  // Sample a circle in noise space, so the loop closes without a seam.
  const r = cycles / (2 * Math.PI);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * 2 * Math.PI;
    out[i] = fbm(r * Math.cos(a) + 50, r * Math.sin(a) + 50, seed, 2) * 2 - 1;
  }
  return out;
}
