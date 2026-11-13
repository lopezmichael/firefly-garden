import { describe, expect, it } from 'vitest';
import { bushLayout, dotPositions, FACE_CENTER_Y, FLY_BOXES, bloomDelays, MOTION_TIMING, outlinePolylines, rippleDelays, ROSE_SLOTS, ROSE_VARIANTS, roseVariants, UNIT } from '../src/view/art/geometry.ts';

const DOT_R = 3.6;

describe('bush dots', () => {
  it('one dot per wanted firefly, centred, 10 units apart', () => {
    for (let n = 1; n <= 5; n++) {
      const d = dotPositions(n, 62);
      expect(d).toHaveLength(n);
      expect(d.every((p) => p.y === 62)).toBe(true);
      const mid = d.reduce((a, p) => a + p.x, 0) / n;
      expect(mid).toBeCloseTo(UNIT / 2, 6);
      for (let k = 1; k < n; k++) expect(d[k]!.x - d[k - 1]!.x).toBe(10);
    }
  });

  it('wraps into two rows above five, so eight dots still fit the face', () => {
    for (let n = 6; n <= 8; n++) {
      const d = dotPositions(n, 62);
      expect(d).toHaveLength(n);
      expect(new Set(d.map((p) => p.y)).size).toBe(2);
      for (const p of d) {
        expect(p.x - DOT_R).toBeGreaterThan(4);
        expect(p.x + DOT_R).toBeLessThan(UNIT - 4);
      }
    }
  });

  it('never runs onto the front edge, even on a wilted bush with eight', () => {
    for (const kind of ['numbered', 'wilted'] as const) {
      for (const p of dotPositions(8, bushLayout(kind).dotsY)) expect(p.y + DOT_R).toBeLessThan(77);
    }
  });

  it('none for a bush that wants none', () => {
    expect(dotPositions(0, 62)).toEqual([]);
  });
});

describe('roses', () => {
  it('pick three different drawings per bush, the same every time', () => {
    for (let cell = 0; cell < 200; cell++) {
      const v = roseVariants(cell);
      expect(new Set(v).size).toBe(3);
      expect(v.every((x) => x >= 0 && x < ROSE_VARIANTS)).toBe(true);
      expect(roseVariants(cell)).toEqual(v);
    }
  });

  it('vary from bush to bush', () => {
    const firsts = new Set(Array.from({ length: 40 }, (_, cell) => roseVariants(cell)[0]));
    expect(firsts.size).toBe(ROSE_VARIANTS);
  });

  it('stay clear of the number and the dots', () => {
    const { numberY, dotsY } = bushLayout('numbered');
    // The number: 30-unit Young Serif centred on (42, numberY), a digit about 18 wide and 22 tall.
    const number = { x0: 33, x1: 51, y0: numberY - 11, y1: numberY + 11 };
    for (const r of ROSE_SLOTS) {
      // The rose is a circle of radius 8 in its 20-unit box.
      const cx = r.x + r.size / 2, cy = r.y + r.size / 2, rad = (8 / 20) * r.size;
      const nx = Math.max(number.x0, Math.min(cx, number.x1)), ny = Math.max(number.y0, Math.min(cy, number.y1));
      expect(Math.hypot(cx - nx, cy - ny), `rose at ${r.x},${r.y} touches the number`).toBeGreaterThan(rad);
      expect(cy + rad).toBeLessThan(dotsY - DOT_R);
      expect(cx - rad).toBeGreaterThanOrEqual(0);
      expect(cx + rad).toBeLessThanOrEqual(UNIT);
    }
  });

  it('fireflies sit on the middle of the face, above the front edge', () => {
    expect(FACE_CENTER_Y).toBe((1 + 77) / 2);
  });
});

describe('hint reason outline', () => {
  const g = { cell: 84, gap: 6, pad: 5 };
  const lines = (p: number[][]) => p.filter((l) => l.length === 4);
  const arcs = (p: number[][]) => p.filter((l) => l.length > 4);

  it('rounds a single cell on all four corners, half a gap outside it', () => {
    const p = outlinePolylines([{ r: 0, c: 0 }], g, 8);
    expect(lines(p)).toHaveLength(4);
    expect(arcs(p)).toHaveLength(4);
    const xs = p.flat().filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeCloseTo(g.pad - g.gap / 2, 6);
    expect(Math.max(...xs)).toBeCloseTo(g.pad + g.cell + g.gap / 2, 6);
  });

  it('draws two neighbours as one shape: no line between them, four outer corners only', () => {
    const p = outlinePolylines([{ r: 0, c: 1 }, { r: 0, c: 2 }], g, 8);
    expect(arcs(p)).toHaveLength(4);
    // Top and bottom are split per cell (2 + 2), plus the two ends: no edge down the middle.
    expect(lines(p)).toHaveLength(6);
    const midX = g.pad + 2 * (g.cell + g.gap) - g.gap / 2;
    expect(lines(p).some((l) => l[0] === midX && l[2] === midX)).toBe(false);
  });

  it('closes: every line end meets another line or an arc end', () => {
    const p = outlinePolylines([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 1 }], g, 8);
    const ends = p.flatMap((l) => [[l[0]!, l[1]!], [l[l.length - 2]!, l[l.length - 1]!]]);
    for (const [x, y] of ends) {
      const meets = ends.filter(([a, b]) => Math.hypot(a! - x!, b! - y!) < 1e-6).length;
      expect(meets).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('motion timing', () => {
  // A 5-wide board; the firefly or last placement at the centre, cell 12 (row 2, col 2).
  const W = 5, CENTER = 12;

  it('spreads light outward along the row and column, nearest first', () => {
    const d = rippleDelays([13, 14, 7, 2], CENTER, W, MOTION_TIMING.spreadPerCell, true, true);
    expect(d.get(13)).toBe(MOTION_TIMING.spreadPerCell);
    expect(d.get(14)).toBe(2 * MOTION_TIMING.spreadPerCell);
    expect(d.get(7)).toBe(MOTION_TIMING.spreadPerCell);
    expect(d.get(2)).toBe(2 * MOTION_TIMING.spreadPerCell);
  });

  it('ripples the solve bloom out in rings from the last firefly', () => {
    const d = rippleDelays([12, 13, 18, 0, 24], CENTER, W, MOTION_TIMING.bloomPerCell, true);
    expect(d.get(12)).toBe(0);
    expect(d.get(13)!).toBeLessThan(d.get(18)!);
    expect(d.get(0)).toBe(d.get(24));
    expect(d.get(0)!).toBeGreaterThan(d.get(18)!);
  });

  it('under reduced motion, every moment lands at once (state stays, movement goes)', () => {
    const cells = Array.from({ length: 25 }, (_, i) => i);
    for (const manhattan of [true, false]) {
      const d = rippleDelays(cells, CENTER, W, 100, false, manhattan);
      expect(d.size).toBe(25);
      expect([...d.values()].every((ms) => ms === 0)).toBe(true);
    }
  });
});

describe('firefly parts are baked tight but whole', () => {
  // The extents of each drawing in pieces.ts (centre ± radius, path bounds), stroke included.
  const EXTENTS = {
    glow: { x0: 42 - 26, y0: 46 - 26, x1: 42 + 26, y1: 46 + 26 },
    shadow: { x0: 45 - 7, y0: 68 - 2.2, x1: 45 + 7, y1: 68 + 2.2 },
    wingL: { x0: 24 - 1, y0: 28 - 1, x1: 39 + 1, y1: 44 + 1 },
    wingR: { x0: 45 - 1, y0: 28 - 1, x1: 60 + 1, y1: 44 + 1 },
    // Tail, head, curled antennae, and the conflict's shiver lines: the outer curves
    // (M17 35 q-6 10 0 20 and its mirror) peak at x 14 and 70, plus half their 1.6 stroke.
    body: { x0: 14 - 0.8, y0: 29 - 0.8, x1: 70 + 0.8, y1: 55.5 + 0.8 },
    // Dashed halo (r 25, stroke 2.6) and the seal (63..78, 6..21).
    halo: { x0: 42 - 26.3, y0: 6, x1: 78, y1: 44 + 26.3 },
  } as const;

  it.each(Object.keys(EXTENTS) as (keyof typeof EXTENTS)[])('%s fits its box', (name) => {
    const b = FLY_BOXES[name], e = EXTENTS[name];
    expect(b.x).toBeLessThanOrEqual(e.x0);
    expect(b.y).toBeLessThanOrEqual(e.y0);
    expect(b.x + b.w).toBeGreaterThanOrEqual(e.x1);
    expect(b.y + b.h).toBeGreaterThanOrEqual(e.y1);
  });

  it('together they fill far less than one cell per part', () => {
    const area = (b: { w: number; h: number }) => b.w * b.h;
    const perFly = area(FLY_BOXES.glow) + area(FLY_BOXES.shadow) + area(FLY_BOXES.wingL) + area(FLY_BOXES.wingR) + area(FLY_BOXES.body);
    // Five full-cell parts would be 5 × 84²; tight boxes stay under a cell's worth in all.
    expect(perFly).toBeLessThan(UNIT * UNIT);
  });
});

describe('the solve bloom finishes before the next garden', () => {
  it('keeps the ripple pace on small boards and squeezes it on the largest', () => {
    // 4x4 from a corner: the farthest bush is about 4.2 steps away, inside the span.
    const small = bloomDelays([0, 5, 15], 0, 4, true);
    expect(small.get(15)).toBe(Math.round(Math.hypot(3, 3) * MOTION_TIMING.bloomPerCell));
    // 10x10 from a corner: about 12.7 steps would be 1400 ms... and an 18-step reach would not fit.
    const big = bloomDelays(Array.from({ length: 400 }, (_, i) => i), 0, 20, true);
    expect(Math.max(...big.values())).toBeLessThanOrEqual(MOTION_TIMING.bloomSpan);
    const order = [...big].sort((a, b) => a[1] - b[1]).map(([c]) => c);
    expect(order[0]).toBe(0);
  });

  it('lands the last rose before the auto-advance, even on the farthest bush', () => {
    const big = bloomDelays(Array.from({ length: 400 }, (_, i) => i), 0, 20, true);
    const lastRose = 480 + MOTION_TIMING.bloomStart + Math.max(...big.values()) + MOTION_TIMING.roseOpen + 2 * MOTION_TIMING.roseStagger;
    expect(lastRose).toBeLessThan(3000);
  });

  it('is all at once without motion', () => {
    expect([...bloomDelays([0, 99], 0, 10, false).values()]).toEqual([0, 0]);
  });
});
