import { describe, expect, it } from 'vitest';
import { bushLayout, dotPositions, FACE_CENTER_Y, ROSE_SLOTS, ROSE_VARIANTS, roseVariants, UNIT } from '../src/view/art/geometry.ts';

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
