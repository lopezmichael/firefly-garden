import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBoard, cellIndex, evaluate } from '@firefly/core';
import type { Evaluation, Level } from '@firefly/core';
import { cuesFor } from '../src/state/cues.ts';
import type { Move } from '../src/state/cues.ts';
import { createCatalog } from '../src/state/catalog.ts';
import { Play } from '../src/state/play.ts';
import { describeCell } from '../src/state/describe.ts';
import { conflictWords, crossTipDue } from '../src/state/teach.ts';

// 4x4 with bushes in two corners: a row beam from (1,0) and a column beam from (0,1) meet at (1,1),
// and two fireflies leave tiles dark, so the crossing move is never the solving one.
const level: Level = { id: 't', w: 4, h: 4, mask: ['####', '####', '####', '####'], bushes: [[0, 0, null], [3, 3, null]] };
const board = buildBoard(level);
const at = (r: number, c: number) => cellIndex(board, [r, c]);

describe('the "light can cross" tip', () => {
  const base = { opening: true, seen: false, board };
  const tip = (before: number[], after: number[], o: Partial<typeof base> = {}) =>
    crossTipDue({ ...base, ...o, before, after, evaluation: evaluate(board, after) });

  it('shows when a move makes beams cross for the first time', () => {
    expect(tip([at(1, 0)], [at(1, 0), at(0, 1)])).toBe(true);
  });

  it('does not show without a new crossing', () => {
    expect(tip([], [at(1, 0)])).toBe(false);
    // Removing a firefly can't create a crossing.
    expect(tip([at(1, 0), at(0, 1)], [at(1, 0)])).toBe(false);
  });

  it('shows once per install, in opening gardens only', () => {
    expect(tip([at(1, 0)], [at(1, 0), at(0, 1)], { seen: true })).toBe(false);
    expect(tip([at(1, 0)], [at(1, 0), at(0, 1)], { opening: false })).toBe(false);
  });

  it('waits while fireflies see each other: the conflict message wins', () => {
    // (1,0) and (1,2) see each other along row 1; (0,1) adds a crossing at (1,1).
    const after = [at(1, 0), at(1, 2), at(0, 1)];
    expect(evaluate(board, after).conflicts.length).toBeGreaterThan(0);
    expect(tip([at(1, 0), at(1, 2)], after)).toBe(false);
  });

  it('fires in a real chapter 1 garden: some first-crossing move exists on the opening levels', () => {
    const LEVELS = join(import.meta.dirname, '../../../levels');
    const read = (f: string): unknown => JSON.parse(readFileSync(join(LEVELS, f), 'utf8'));
    const catalog = createCatalog({ launch: read('launch.json'), reserve: read('reserve.json'), manifest: read('manifest.json') }, ['c1']);
    let gardensWithTip = 0;
    for (const id of catalog.mainPath) {
      const p = new Play(catalog.board(id), catalog.solution(id), { now: () => 0 });
      // Place the answer in order; the tip should come due somewhere along the way on most gardens.
      let due = false;
      for (const c of catalog.solution(id)) {
        if (p.board.lantern[c]) continue;
        const before = [...p.placed];
        p.tap(c);
        due ||= crossTipDue({ opening: true, seen: false, board: p.board, before, after: [...p.placed], evaluation: p.evaluation });
      }
      if (due) gardensWithTip++;
    }
    expect(gardensWithTip).toBeGreaterThan(0);
  });

  it('names the two fireflies that see each other, for screen readers', () => {
    const name = (c: number) => `cell ${c}`;
    expect(conflictWords(board, [at(1, 0), at(1, 2)], name)).toBe(`The fireflies at cell ${at(1, 0)} and cell ${at(1, 2)} can see each other.`);
    expect(conflictWords(board, [at(1, 0)], name)).toBeNull();
  });
});

describe('sound cues', () => {
  const ev = (cells: number[]): Evaluation => evaluate(board, cells);
  const place = (row: number): Move => ({ kind: 'placed', row, rows: 4 });

  it('a landing rings higher on higher rows', () => {
    expect(cuesFor(ev([]), ev([at(0, 1)]), place(0))).toEqual([{ kind: 'place', pitch: 1 }]);
    expect(cuesFor(ev([]), ev([at(3, 1)]), place(3))).toEqual([{ kind: 'place', pitch: 0 }]);
  });

  it('adds a conflict tone when a move makes fireflies see each other, and only then', () => {
    expect(cuesFor(ev([at(1, 0)]), ev([at(1, 0), at(1, 2)]), place(1)).map((c) => c.kind)).toEqual(['place', 'conflict']);
    expect(cuesFor(ev([at(1, 0), at(1, 2)]), ev([at(1, 0)]), { kind: 'removed' }).map((c) => c.kind)).toEqual(['lift']);
  });

  it('chimes when another bush is satisfied', () => {
    const b2 = buildBoard({ id: 'b', w: 3, h: 1, mask: ['###'], bushes: [[0, 1, 1]] });
    expect(cuesFor(evaluate(b2, []), evaluate(b2, [0]), { kind: 'placed', row: 0, rows: 1 }).map((c) => c.kind)).toEqual(['place', 'bush']);
  });

  it('a solve is only the flourish; an empty jar is only its bump', () => {
    const b2 = buildBoard({ id: 'b', w: 3, h: 1, mask: ['###'], bushes: [[0, 1, 2]] });
    expect(cuesFor(evaluate(b2, [0]), evaluate(b2, [0, 2]), { kind: 'placed', row: 0, rows: 1 })).toEqual([{ kind: 'solve' }]);
    expect(cuesFor(ev([]), ev([]), { kind: 'jar-empty' })).toEqual([{ kind: 'empty' }]);
  });

  it('hints have their own landing sound', () => {
    expect(cuesFor(ev([]), ev([at(0, 1)]), { kind: 'hint-placed', row: 0, rows: 4 })).toEqual([{ kind: 'hint', pitch: 1 }]);
  });
});

describe('cell words for screen readers', () => {
  it('says what a tile holds, as drawn on screen', () => {
    const b = buildBoard({ id: 'd', w: 3, h: 1, mask: ['###'], bushes: [[0, 1, 1]], twists: { lanterns: [[0, 2]] } });
    const empty = evaluate(b, []);
    expect(describeCell(b, empty, new Set(), 0, 0, 0)).toBe('Row 1, column 1: dark path');
    expect(describeCell(b, empty, new Set(), 1, 0, 1)).toBe('Row 1, column 2: bush wants 1, done');
    expect(describeCell(b, empty, new Set(), 2, 0, 2)).toBe('Row 1, column 3: lantern');
    const one = evaluate(b, [0]);
    expect(describeCell(b, one, new Set([0]), 0, 0, 0)).toBe('Row 1, column 1: hint firefly, locked');
    expect(describeCell(b, one, new Set(), 1, 0, 1)).toBe('Row 1, column 2: bush wants 1, too many');
  });
});
