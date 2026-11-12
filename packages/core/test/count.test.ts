/**
 * The "firefly jar": grading with the total firefly count known, as the game
 * shows it. Every count deduction must agree with the unique solution on every
 * shipped level, and grading without the option must be untouched. Shipped
 * levels are graded through `gradeLevel` (tests/levels.test.ts re-grades them).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBoard, cellIndex, grade, gradeLevel, parseLevel, type Level } from '../src/index.ts';

const DIR = join(import.meta.dirname, '..', '..', '..', 'levels');
const load = (file: string): Level[] =>
  (JSON.parse(readFileSync(join(DIR, file), 'utf8')) as { levels: unknown[] }).levels.map((l) => parseLevel(l));
const levels = [...load('launch.json'), ...load('reserve.json')];

describe('grade with a known firefly count', () => {
  it('reaches exactly the stored solution on every launch and reserve level with only sound steps', () => {
    const bad: string[] = [];
    let countSteps = 0;
    for (const level of levels) {
      const board = buildBoard(level);
      const answer = new Set(level.solution!.map((c) => cellIndex(board, c)));
      const g = grade(board, { knownCount: answer.size });
      for (const step of g.steps) {
        if (answer.has(step.cell) !== (step.value === 'firefly')) bad.push(`${level.id}: unsound ${step.technique} on ${step.cell}`);
        if (step.technique === 'T1-count-complete' || step.technique === 'T3-count-bound') countSteps++;
      }
      // A failed place() inside the grader stops it unsolved, so this also catches that.
      if (!g.solved) bad.push(`${level.id}: not solved`);
      else if (g.fireflies.length !== answer.size || g.fireflies.some((c) => !answer.has(c))) bad.push(`${level.id}: wrong fireflies`);
    }
    expect(bad).toEqual([]);
    expect(countSteps).toBeGreaterThan(0); // the techniques actually ran
  });

  it('never needs a harder tier than grading without the count', () => {
    const harder: string[] = [];
    for (const level of levels) {
      const board = buildBoard(level);
      const g = grade(board, { knownCount: level.solution!.length });
      if (g.maxTier > grade(board).maxTier) harder.push(level.id);
    }
    expect(harder).toEqual([]);
  });

  it('rejects an impossible count, including one below the fireflies already placed', () => {
    const board = buildBoard(levels[0]!);
    expect(() => grade(board, { knownCount: -1 })).toThrow(RangeError);
    expect(() => grade(board, { knownCount: 1.5 })).toThrow(RangeError);
    expect(() => grade(board, { knownCount: board.paths.length + 1 })).toThrow(RangeError);
    const sol = levels[0]!.solution!.map((p) => cellIndex(board, p));
    expect(() => grade(board, { start: sol.slice(0, 2), knownCount: 1 })).toThrow(RangeError);
  });

  it('never reports a wrong count as a solved grade', () => {
    let checked = 0;
    for (const level of levels) {
      const board = buildBoard(level);
      const k = level.solution!.length;
      for (const wrong of [k - 1, k + 1]) {
        if (wrong < board.lanterns.length || wrong > board.paths.length) continue;
        expect(grade(board, { knownCount: wrong }).solved, `${level.id} with ${wrong}`).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('count-complete: once every firefly is placed, the rest stays empty', () => {
    // One firefly lights the left tile; the right tile is moonlit and needs no light, so only
    // the count says it must stay empty.
    const tiny = parseLevel({ id: 'tiny', w: 3, h: 1, mask: ['###'], bushes: [[0, 1, null]], twists: { moonlit: [[0, 2]] }, solution: [[0, 0]] });
    const g = grade(buildBoard(tiny), { knownCount: 1 });
    expect(g.solved).toBe(true);
    expect(g.steps.map((st) => st.technique)).toContain('T1-count-complete');
    expect(g.fireflies).toEqual([0]);
  });

  it('gradeLevel always passes the stored solution\'s length, lanterns included, and needs a solution', () => {
    const lit = levels.filter((l) => (l.twists?.lanterns?.length ?? 0) > 0).slice(0, 5);
    expect(lit.length).toBeGreaterThan(0);
    for (const level of [...levels.slice(0, 20), ...lit]) {
      const board = buildBoard(level);
      expect(gradeLevel(level, board)).toEqual(grade(board, { knownCount: level.solution!.length }));
    }
    const bare: Level = { id: 'bare', w: 3, h: 1, mask: ['###'], bushes: [] };
    expect(() => gradeLevel(bare, buildBoard(bare))).toThrow(RangeError);
  });
});
