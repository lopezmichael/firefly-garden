import { describe, expect, it } from 'vitest';
import { buildBoard, canonicalKey, cellIndex, evaluate, solve, TRANSFORMS, transformLevel, validateLevel } from '../src/index.ts';
import { mockup4, mockup6, mockupKoi, UNIQUE } from './fixtures.ts';

describe('transformLevel', () => {
  it('returns to the original after four quarter turns, or two mirrors', () => {
    let l = mockupKoi.level;
    for (let i = 0; i < 4; i++) l = transformLevel(l, 'rot90');
    expect(l).toEqual(mockupKoi.level);
    expect(transformLevel(transformLevel(mockupKoi.level, 'mirror'), 'mirror')).toEqual(mockupKoi.level);
  });

  it('swaps width and height on a quarter turn', () => {
    const t = transformLevel(mockupKoi.level, 'rot90');
    expect([t.w, t.h]).toEqual([5, 9]);
    expect(t.mask).toHaveLength(9);
  });

  it('produces eight distinct orientations of an asymmetric board', () => {
    const level = UNIQUE[1]!.level; // 6x6 with a corner lantern
    const seen = new Set(TRANSFORMS.map((t) => JSON.stringify(transformLevel(level, t))));
    expect(seen.size).toBe(8);
  });

  it.each([mockup4, mockup6, mockupKoi, ...UNIQUE])(
    'keeps $level.id valid, with the same solution count and a working answer, in every orientation',
    (f) => {
      const base = solve(buildBoard(f.level), { limit: 10_000 }).count;
      for (const t of TRANSFORMS) {
        const level = transformLevel({ ...f.level, solution: f.intended }, t);
        expect(validateLevel(level), t).toEqual([]);
        const board = buildBoard(level);
        expect(solve(board, { limit: 10_000 }).count, t).toBe(base);
        expect(evaluate(board, level.solution!.map((c) => cellIndex(board, c))).solved, t).toBe(true);
      }
    },
  );
});

describe('canonicalKey', () => {
  it('is the same for every rotation and mirror of a level, whatever its id', () => {
    const base = canonicalKey(mockupKoi.level);
    for (const t of TRANSFORMS) expect(canonicalKey({ ...transformLevel(mockupKoi.level, t), id: `other-${t}` })).toBe(base);
  });

  it('differs when a clue differs', () => {
    const changed = { ...mockup6.level, bushes: mockup6.level.bushes.map(([r, c, n], i) => [r, c, i === 0 ? (n ?? 0) + 1 : n] as const) };
    expect(canonicalKey(changed)).not.toBe(canonicalKey(mockup6.level));
  });
});
