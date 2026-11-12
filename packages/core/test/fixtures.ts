import type { Coord, Level } from '../src/index.ts';

/**
 * The gardens from the "Puzzle Game Mockups" canvas (portrait levels 1 to 3
 * and the landscape koi-pond board). They were drawn to show the look, not
 * checked for uniqueness, and none of them is unique.
 *
 * `expectedCount` was counted by an independent brute-force script (written
 * separately from this solver, 2026-11-12). The Phase 0 gate test in
 * solver.test.ts also re-derives every fixture's solutions with the naive
 * enumerator in oracle.ts. `intended` is the answer the mockup
 * shipped with.
 */
export interface Fixture {
  readonly level: Level;
  readonly expectedCount: number;
  readonly intended: readonly Coord[];
}

const square = (n: number) => Array.from({ length: n }, () => '#'.repeat(n));
const coords = (cells: readonly string[]): Coord[] =>
  cells.map((s) => s.split(',').map(Number) as unknown as Coord);

export const mockup4: Fixture = {
  level: { id: 'mockup-1', w: 4, h: 4, mask: square(4), bushes: [[1, 1, 3], [2, 2, 3]] },
  expectedCount: 9,
  intended: coords(['0,0', '1,2', '2,1', '3,3']),
};

export const mockup5: Fixture = {
  level: { id: 'mockup-2', w: 5, h: 5, mask: square(5), bushes: [[1, 1, 2], [1, 3, 2], [3, 2, 2]] },
  expectedCount: 40,
  intended: coords(['0,0', '1,2', '2,4', '3,1', '4,3']),
};

export const mockup6: Fixture = {
  level: {
    id: 'mockup-3', w: 6, h: 6, mask: square(6),
    bushes: [[1, 1, 3], [1, 4, 2], [2, 3, 3], [3, 2, 2], [4, 1, 1], [4, 4, 1]],
  },
  expectedCount: 2,
  intended: coords(['0,0', '1,2', '1,5', '2,1', '2,4', '3,3', '5,2']),
};

export const mockupKoi: Fixture = {
  level: {
    id: 'mockup-koi', area: 'koi-pond', w: 9, h: 5,
    mask: ['#########', '###...###', '###...###', '###...###', '#########'],
    bushes: [[0, 4, 0], [2, 1, 2], [2, 7, 2], [4, 4, 0]],
  },
  expectedCount: 289,
  intended: coords(['0,0', '1,1', '3,1', '4,2', '0,6', '1,7', '3,7', '4,8']),
};

export const MOCKUPS: readonly Fixture[] = [mockup4, mockup5, mockup6, mockupKoi];

/**
 * Known-unique boards: mockups repaired the way the generator will repair
 * them (step 5 of the pipeline: add a lantern). The independent script found
 * that a lantern at a corner fixes both of these; the 5x5 and koi boards
 * need more than one extra clue.
 */
export const UNIQUE: readonly Fixture[] = [
  {
    level: { ...mockup4.level, id: 'mockup-1-lantern', twists: { lanterns: [[0, 0]] } },
    expectedCount: 1,
    intended: mockup4.intended,
  },
  {
    level: { ...mockup6.level, id: 'mockup-3-lantern', twists: { lanterns: [[0, 0]] } },
    expectedCount: 1,
    intended: mockup6.intended,
  },
];
