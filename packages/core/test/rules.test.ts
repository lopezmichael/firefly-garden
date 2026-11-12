import { describe, expect, it } from 'vitest';
import { buildBoard, canPlace, cellIndex, evaluate, type Coord, type Level } from '../src/index.ts';
import { MOCKUPS, UNIQUE } from './fixtures.ts';

const at = (level: Level, cells: readonly Coord[]) => {
  const board = buildBoard(level);
  return { board, ids: cells.map((c) => cellIndex(board, c)) };
};

describe('evaluate', () => {
  it.each([...MOCKUPS, ...UNIQUE])('accepts the intended answer for $level.id', ({ level, intended }) => {
    const { board, ids } = at(level, intended);
    expect(evaluate(board, ids).solved).toBe(true);
  });

  it('stops light at bushes, the board edge and outside-mask cells', () => {
    const level: Level = { id: 't', w: 5, h: 3, mask: ['#####', '##.##', '#####'], bushes: [[0, 2, null]] };
    const { board, ids } = at(level, [[0, 0]]);
    const e = evaluate(board, ids);
    const lit = (c: Coord) => e.lit[cellIndex(board, c)];
    expect(lit([0, 1])).toBe(true);
    expect(lit([0, 3])).toBe(false); // behind the bush
    expect(lit([2, 0])).toBe(true);
    expect(lit([1, 1])).toBe(false); // diagonal, not lit
    expect(e.solved).toBe(false);
  });

  it('flags fireflies that see each other, and only those', () => {
    const level: Level = { id: 't', w: 4, h: 2, mask: ['####', '####'], bushes: [] };
    const { board, ids } = at(level, [[0, 0], [0, 3], [1, 1]]);
    const e = evaluate(board, ids);
    expect(e.conflicts).toEqual([cellIndex(board, [0, 0]), cellIndex(board, [0, 3])]);
    expect(e.solved).toBe(false);
  });

  it('counts all eight neighbors of a bush, diagonals included', () => {
    const level: Level = { id: 't', w: 3, h: 3, mask: ['###', '###', '###'], bushes: [[1, 1, 2]] };
    const { board, ids } = at(level, [[0, 0], [2, 2]]);
    const [bush] = evaluate(board, ids).bushes;
    expect(bush).toMatchObject({ want: 2, have: 2, state: 'met' });
    const over = evaluate(board, at(level, [[0, 0], [2, 2], [0, 2]]).ids).bushes[0];
    expect(over?.state).toBe('over');
  });

  it('treats moonlit tiles as already lit and adds lanterns automatically', () => {
    const level: Level = {
      id: 't', w: 3, h: 1, mask: ['###'], bushes: [],
      twists: { moonlit: [[0, 2]], lanterns: [[0, 0]] },
    };
    const board = buildBoard(level);
    const e = evaluate(board, []);
    expect(e.fireflies).toEqual([0]);
    expect(e.solved).toBe(true);
    expect(canPlace(board, 0)).toBe(false); // lantern
    expect(canPlace(board, 2)).toBe(true); // moonlit tiles still take fireflies
  });

  it('treats mushrooms and hidden bushes as blockers without a count', () => {
    const level: Level = {
      id: 't', w: 5, h: 1, mask: ['#####'], bushes: [[0, 1, null]], twists: { mushrooms: [[0, 3]] },
    };
    const board = buildBoard(level);
    expect(board.numbered).toEqual([]);
    expect(board.kind[3]).toBe('mushroom');
    expect(evaluate(board, [0]).unlit).toBe(2); // cells 2 and 4 stay dark
    expect(evaluate(board, [0, 2, 4]).solved).toBe(true);
  });

  it('rejects a firefly on a cell that cannot hold one', () => {
    const { board } = at(MOCKUPS[0]!.level, []);
    expect(() => evaluate(board, [cellIndex(board, [1, 1])])).toThrow(RangeError);
  });
});
