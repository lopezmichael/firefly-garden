/**
 * Level ratchets: every committed level must parse, re-solve to exactly one
 * solution, and re-grade to its stored tier and score. Chapter 1 may not
 * need anything above T2. Regenerate with `npm run levels`, never hand-edit.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildBoard, cellIndex, DIFFICULTY_CONFIG, evaluate, grade, isUnique, measure, parseLevel, type Level,
} from '../packages/core/src/index.ts';

const { maxSecondsAnyLevel, maxSecondsChapter1 } = DIFFICULTY_CONFIG.limits;
const seconds = (level: Level) => {
  const board = buildBoard(level);
  return measure(level, board, grade(board)).estimatedSeconds;
};

const DIR = join(import.meta.dirname, '..', 'levels');
const packs = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
const levels: Level[] = packs.flatMap((f) => {
  const json = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as { levels: unknown[] };
  return json.levels.map((l) => parseLevel(l));
});
const byId = new Map(levels.map((l) => [l.id, l]));
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as {
  packs: { file: string; count: number }[];
  chapters: { id: string; levels: string[] }[];
};

describe('committed levels', () => {
  it('has at least 200 levels with unique ids', () => {
    expect(levels.length).toBeGreaterThanOrEqual(200);
    expect(byId.size).toBe(levels.length);
  });

  it('every level is unique, its solution solves it, and it re-grades to its stored tier and score', () => {
    const bad: string[] = [];
    for (const level of levels) {
      const board = buildBoard(level);
      if (!isUnique(board)) bad.push(`${level.id}: not unique`);
      if (!level.solution || !evaluate(board, level.solution.map((c) => cellIndex(board, c))).solved) {
        bad.push(`${level.id}: stored solution does not solve it`);
      }
      const d = measure(level, board, grade(board));
      if (d.tier !== level.tier || d.score !== level.score) {
        bad.push(`${level.id}: stored tier/score ${level.tier}/${level.score}, re-graded ${d.tier}/${d.score}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('manifest matches the packs', () => {
    for (const p of manifest.packs) {
      const json = JSON.parse(readFileSync(join(DIR, p.file), 'utf8')) as { levels: unknown[] };
      expect(json.levels.length, p.file).toBe(p.count);
    }
    for (const c of manifest.chapters) for (const id of c.levels) expect(byId.has(id), `${c.id}: ${id}`).toBe(true);
  });

  it(`no level is estimated over ${maxSecondsAnyLevel} seconds`, () => {
    const over = levels.filter((l) => seconds(l) > maxSecondsAnyLevel).map((l) => `${l.id}: ${seconds(l)}s`);
    expect(over).toEqual([]);
  });

  it(`every chapter 1 level is estimated at ${maxSecondsChapter1} seconds or less`, () => {
    const over = manifest.chapters[0]!.levels
      .map((id) => byId.get(id)!)
      .filter((l) => seconds(l) > maxSecondsChapter1)
      .map((l) => `${l.id}: ${seconds(l)}s`);
    expect(over).toEqual([]);
  });

  it('chapter 1 needs nothing above T2', () => {
    const first = manifest.chapters[0];
    expect(first).toBeDefined();
    const over = first!.levels.filter((id) => (byId.get(id)?.tier ?? 99) > 2);
    expect(over).toEqual([]);
  });
});
