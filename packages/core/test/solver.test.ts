import { describe, expect, it } from 'vitest';
import { buildBoard, cellIndex, evaluate, isUnique, solve, type Coord, type Level } from '../src/index.ts';
import { MOCKUPS, UNIQUE } from './fixtures.ts';
import { bruteForceSolutions, rng } from './oracle.ts';

const key = (cells: readonly number[]) => cells.join(',');

/**
 * Phase 0 gate (docs/plans/2026-11-12-phase-0-foundation.md): the solver
 * finds every solution of the mockup gardens, matches an independent count,
 * flags them as non-unique, and confirms a set of known-unique boards.
 */
describe('Phase 0 gate', () => {
  it.each(MOCKUPS)('finds all $expectedCount solutions of $level.id and flags it non-unique', (f) => {
    const board = buildBoard(f.level);
    const result = solve(board, { limit: 10_000 });
    expect(result.exhaustive).toBe(true);
    expect(result.count).toBe(f.expectedCount);
    expect(isUnique(board)).toBe(false);

    // Every reported solution really is one, with no duplicates.
    for (const s of result.solutions) expect(evaluate(board, s).solved).toBe(true);
    expect(new Set(result.solutions.map(key)).size).toBe(result.count);

    // The naive enumerator finds exactly the same set.
    expect(result.solutions.map(key).sort()).toEqual(bruteForceSolutions(board).map(key).sort());

    // The mockup's own answer is among them.
    const intended = f.intended.map((c) => cellIndex(board, c)).sort((a, b) => a - b);
    expect(result.solutions.map(key)).toContain(key(intended));
  });

  it.each(UNIQUE)('confirms $level.id has exactly one solution, the intended one', (f) => {
    const board = buildBoard(f.level);
    expect(isUnique(board)).toBe(true);
    expect(bruteForceSolutions(board)).toHaveLength(1);
    const [only] = solve(board, { limit: 10 }).solutions;
    expect(only).toEqual(f.intended.map((c) => cellIndex(board, c)).sort((a, b) => a - b));
  });
});

describe('solve', () => {
  it('stops at the limit and says the count is not exhaustive', () => {
    const result = solve(buildBoard(MOCKUPS[1]!.level), { limit: 3 });
    expect(result.count).toBe(3);
    expect(result.exhaustive).toBe(false);
  });

  it('returns no solutions for an impossible board', () => {
    // The bush wants 3 fireflies but only has 2 path neighbors.
    const level: Level = { id: 'x', w: 3, h: 1, mask: ['###'], bushes: [[0, 1, 3]] };
    expect(solve(buildBoard(level))).toMatchObject({ count: 0, exhaustive: true });
  });

  it('returns no solutions when two lanterns see each other', () => {
    const level: Level = { id: 'x', w: 3, h: 1, mask: ['###'], bushes: [], twists: { lanterns: [[0, 0], [0, 2]] } };
    expect(solve(buildBoard(level)).count).toBe(0);
  });

  it('enumerates optional fireflies on unlit moonlit tiles', () => {
    // Both cells moonlit, no clues: empty, left, right are all valid.
    const level: Level = { id: 'x', w: 2, h: 1, mask: ['##'], bushes: [], twists: { moonlit: [[0, 0], [0, 1]] } };
    expect(solve(buildBoard(level), { limit: 10 }).count).toBe(3);
  });

  it('stops at the node budget and reports it', () => {
    const board = buildBoard(MOCKUPS[3]!.level);
    const result = solve(board, { limit: 10_000, maxNodes: 5 });
    expect(result).toMatchObject({ exhaustive: false, budgetExceeded: true, nodes: 5 });
    expect(solve(board, { limit: 10_000 }).budgetExceeded).toBe(false);
  });

  it('rejects a non-positive limit', () => {
    expect(() => solve(buildBoard(MOCKUPS[0]!.level), { limit: 0 })).toThrow(RangeError);
  });

  it('agrees with a naive enumerator on 300 random small boards, twists included', () => {
    const rand = rng(20261112);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
    let nonTrivial = 0;
    for (let t = 0; t < 300; t++) {
      const w = 2 + Math.floor(rand() * 4);
      const h = 2 + Math.floor(rand() * 4);
      const mask = Array.from({ length: h }, () =>
        Array.from({ length: w }, () => (rand() < 0.1 ? '.' : '#')).join(''));
      const free: Coord[] = [];
      mask.forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && free.push([r, c])));
      const take = (p: number): Coord[] => {
        const out: Coord[] = [];
        for (let i = free.length - 1; i >= 0; i--) {
          if (rand() < p) out.push(...free.splice(i, 1));
        }
        return out;
      };
      const bushes = take(0.2).map(([r, c]) => [r, c, rand() < 0.15 ? null : pick([0, 1, 1, 2, 2, 3, 4])] as const);
      const level: Level = {
        id: `rand-${t}`, w, h, mask, bushes,
        twists: { mushrooms: take(0.05), moonlit: take(0.05), lanterns: take(0.03) },
      };
      const board = buildBoard(level);
      const fast = solve(board, { limit: 100_000 });
      const slow = bruteForceSolutions(board);
      expect(fast.exhaustive).toBe(true);
      expect(fast.solutions.map(key).sort(), level.id).toEqual(slow.map(key).sort());
      if (slow.length > 0) nonTrivial++;
    }
    // Guard against a generator that only ever makes impossible boards.
    expect(nonTrivial).toBeGreaterThan(50);
  });
});
