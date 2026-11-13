import { describe, expect, it } from 'vitest';
import { FIBRE, fbm, GRAIN, noiseField, valueNoise, wobble } from '../src/view/art/noise.ts';

describe('value noise', () => {
  it('is deterministic for a seed', () => {
    for (const [x, y] of [[0.3, 7.1], [12.5, -3.25], [100.01, 42]] as const) {
      expect(valueNoise(x, y, 7)).toBe(valueNoise(x, y, 7));
      expect(fbm(x, y, 7, 3)).toBe(fbm(x, y, 7, 3));
    }
  });

  it('changes with the seed', () => {
    let same = 0;
    for (let i = 0; i < 200; i++) if (valueNoise(i * 0.37, i * 0.61, 1) === valueNoise(i * 0.37, i * 0.61, 2)) same++;
    expect(same).toBe(0);
  });

  it('stays in [0, 1) and uses the range', () => {
    let lo = 1, hi = 0;
    for (let i = 0; i < 20000; i++) {
      const v = fbm((i % 141) * 0.73, Math.floor(i / 141) * 0.73, 3, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeLessThan(0.25);
    expect(hi).toBeGreaterThan(0.75);
  });

  it('is continuous: a tiny step moves the value a tiny amount', () => {
    for (let i = 0; i < 500; i++) {
      const x = i * 0.913, y = i * 0.271;
      expect(Math.abs(valueNoise(x + 1e-4, y, 5) - valueNoise(x, y, 5))).toBeLessThan(1e-3);
      expect(Math.abs(valueNoise(x, y + 1e-4, 5) - valueNoise(x, y, 5))).toBeLessThan(1e-3);
    }
  });

  it('matches across lattice lines (no seams at integer coordinates)', () => {
    for (let k = -5; k <= 5; k++) {
      expect(valueNoise(k - 1e-9, 0.5, 9)).toBeCloseTo(valueNoise(k + 1e-9, 0.5, 9), 6);
    }
  });
});

describe('noise fields', () => {
  const opts = { ...GRAIN, seed: 11, maxAlpha: 60 };

  it('are deterministic and sized w × h', () => {
    const a = noiseField(33, 21, opts), b = noiseField(33, 21, opts);
    expect(a.length).toBe(33 * 21);
    expect([...a]).toEqual([...b]);
  });

  it('match fbm() pixel by pixel (the fast lattice path changes nothing)', () => {
    for (const periodic of [false, true]) {
      const o = { ...GRAIN, seed: 5, maxAlpha: 255, threshold: 0, gain: 1, periodic };
      const w = 37, h = 23, f = noiseField(w, h, o);
      const px = periodic ? Math.round(w * o.freqX) : 0, py = periodic ? Math.round(h * o.freqY) : 0;
      const fx = periodic ? px / w : o.freqX, fy = periodic ? py / h : o.freqY;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          expect(Math.abs(f[y * w + x]! - Math.round(fbm(x * fx, y * fy, 5, o.octaves, px, py) * 255))).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('never exceed maxAlpha and leave some pixels clear', () => {
    const f = noiseField(64, 64, opts);
    expect(Math.max(...f)).toBeLessThanOrEqual(60);
    expect(f.filter((v) => v === 0).length).toBeGreaterThan(64 * 64 * 0.2);
    expect(f.filter((v) => v > 0).length).toBeGreaterThan(64 * 64 * 0.2);
  });

  it('tile seamlessly when periodic: the wrap step is like any other step', () => {
    // Low frequency, so neighbours are close and a seam would stand out.
    const smoothField = (periodic: boolean) => noiseField(w, h, { freqX: 0.11, freqY: 0.11, octaves: 2, seed: 2, maxAlpha: 255, threshold: 0, gain: 1, periodic });
    const w = 48, h = 40, f = smoothField(true);
    let inner = 0, wrap = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) inner += Math.abs(f[y * w + x]! - f[y * w + x + 1]!);
      wrap += Math.abs(f[y * w + w - 1]! - f[y * w]!);
    }
    // Mean step across the seam matches the mean step inside (a seam would be several times larger).
    expect(wrap / h).toBeLessThan((inner / (h * (w - 1))) * 1.6);
    // And without tiling the same check fails: the test can see a seam.
    const g = smoothField(false);
    let gInner = 0, gWrap = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) gInner += Math.abs(g[y * w + x]! - g[y * w + x + 1]!);
      gWrap += Math.abs(g[y * w + w - 1]! - g[y * w]!);
    }
    expect(gWrap / h).toBeGreaterThan((gInner / (h * (w - 1))) * 1.6);
  });

  it('fibre runs along y: neighbours down a column agree more than along a row', () => {
    const w = 64, h = 64, f = noiseField(w, h, { ...FIBRE, seed: 4, maxAlpha: 255 });
    let dx = 0, dy = 0;
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        dx += Math.abs(f[y * w + x]! - f[y * w + x + 1]!);
        dy += Math.abs(f[y * w + x]! - f[(y + 1) * w + x]!);
      }
    }
    expect(dy * 4).toBeLessThan(dx);
  });
});

describe('wobble', () => {
  it('is deterministic, in [-1, 1], and closes its loop smoothly', () => {
    const a = wobble(240, 17), b = wobble(240, 17);
    expect([...a]).toEqual([...b]);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
    const step = Math.max(...a.map((v, i) => Math.abs(v - a[(i + 1) % a.length]!)));
    // The seam between the last and first sample is no bigger than any other step.
    expect(Math.abs(a[a.length - 1]! - a[0]!)).toBeLessThanOrEqual(step + 1e-9);
    expect(step).toBeLessThan(0.15);
  });
});
