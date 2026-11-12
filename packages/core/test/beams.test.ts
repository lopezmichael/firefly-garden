import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBoard, cellIndex, conflictPairs, createRng, crossings, evaluate, lightCounts, parseLevel } from '../src/index.ts';
import type { Coord, Level } from '../src/index.ts';

const ids = (level: Level, cells: readonly Coord[]) => {
  const board = buildBoard(level);
  return { board, cells: cells.map((c) => cellIndex(board, c)) };
};

describe('conflictPairs', () => {
  it('pairs nearest neighbours only: three in an open row give two pairs', () => {
    const { board, cells } = ids({ id: 't', w: 5, h: 1, mask: ['#####'], bushes: [] }, [[0, 0], [0, 2], [0, 4]]);
    expect(conflictPairs(board, cells)).toEqual([[0, 2], [2, 4]]);
  });

  it('finds column pairs, stops at bushes and outside-mask cells, and ignores diagonals', () => {
    const level: Level = { id: 't', w: 3, h: 4, mask: ['###', '###', '.##', '###'], bushes: [[1, 2, null]] };
    // (0,0)-(1,0) see each other; (1,0)-(3,0) are split by the pond at (2,0);
    // (0,2)-(3,2) are split by the bush at (1,2); (0,0)-(1,1) is a diagonal.
    const { board, cells } = ids(level, [[0, 0], [1, 0], [3, 0], [0, 2], [3, 2], [1, 1]]);
    expect(conflictPairs(board, cells)).toEqual([
      [cellIndex(board, [0, 0]), cellIndex(board, [0, 2])],
      [cellIndex(board, [0, 0]), cellIndex(board, [1, 0])],
      [cellIndex(board, [1, 0]), cellIndex(board, [1, 1])],
      [cellIndex(board, [3, 0]), cellIndex(board, [3, 2])],
    ]);
  });

  it('counts lanterns as fireflies', () => {
    const { board, cells } = ids({ id: 't', w: 3, h: 1, mask: ['###'], bushes: [], twists: { lanterns: [[0, 0]] } }, [[0, 2]]);
    expect(conflictPairs(board, cells)).toEqual([[0, 2]]);
  });

  it('agrees with evaluate on every shipped level: the fireflies in pairs are exactly the conflicts', () => {
    const root = join(import.meta.dirname, '../../../levels');
    const packs = ['launch.json', 'reserve.json'].map((f) => JSON.parse(readFileSync(join(root, f), 'utf8')) as { levels: unknown[] });
    const rng = createRng(7);
    let checked = 0;
    for (const raw of packs.flatMap((p) => p.levels)) {
      const board = buildBoard(parseLevel(raw));
      for (let k = 0; k < 4; k++) {
        const placed = board.paths.filter(() => rng.next() < 0.3);
        const ev = evaluate(board, placed);
        const inPairs = [...new Set(conflictPairs(board, placed).flat())].sort((a, b) => a - b);
        expect(inPairs).toEqual(ev.conflicts);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('lightCounts and crossings', () => {
  it('counts every firefly reaching a tile, and calls a firefly-free tile lit twice a crossing', () => {
    // A row beam and a column beam meet at (1,1).
    const { board, cells } = ids({ id: 't', w: 3, h: 3, mask: ['###', '###', '###'], bushes: [[0, 0, null], [2, 2, null]] }, [[1, 0], [0, 1]]);
    const counts = lightCounts(board, cells);
    expect(counts[cellIndex(board, [1, 1])]).toBe(2);
    expect(counts[cellIndex(board, [1, 0])]).toBe(1); // its own tile
    expect(counts[cellIndex(board, [0, 0])]).toBe(0); // a bush
    expect(crossings(board, cells)).toEqual([cellIndex(board, [1, 1])]);
  });

  it('a tile holding a firefly is never a crossing, and moonlight adds nothing', () => {
    const level: Level = { id: 't', w: 3, h: 1, mask: ['###'], bushes: [], twists: { moonlit: [[0, 1]] } };
    const { board, cells } = ids(level, [[0, 0], [0, 2]]);
    expect(lightCounts(board, cells)).toEqual([2, 2, 2]);
    expect(crossings(board, cells)).toEqual([1]);
    expect(crossings(board, [0])).toEqual([]);
  });
});
