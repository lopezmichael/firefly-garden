/**
 * Level ratchets: every committed level must parse, re-solve to exactly one
 * solution, and re-grade to its stored tier and score. Chapter 1 may not
 * need anything above T2. Regenerate with `npm run levels`, never hand-edit.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildBoard, canonicalKey, cellIndex, DIFFICULTY_CONFIG, evaluate, grade, isUnique, measure, parseLevel, type Level,
} from '../packages/core/src/index.ts';

const { maxSecondsAnyLevel, maxSecondsMainPath, chapterMaxSeconds } = DIFFICULTY_CONFIG.limits;
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

  it('has no level that is a rotation or mirror of another', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const l of levels) {
      const k = canonicalKey(l);
      const prev = seen.get(k);
      if (prev) dupes.push(`${l.id} duplicates ${prev}`);
      else seen.set(k, l.id);
    }
    expect(dupes).toEqual([]);
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

  it('every chapter level fits its chapter time limit', () => {
    const over: string[] = [];
    for (const c of manifest.chapters) {
      const limit = chapterMaxSeconds[c.id] ?? maxSecondsMainPath;
      for (const id of c.levels) {
        const s = seconds(byId.get(id)!);
        if (s > limit) over.push(`${c.id}/${id}: ${s}s over ${limit}s`);
      }
    }
    expect(over).toEqual([]);
  });

  it('chapter limits stay at 1 minute for chapter 1 and 4 minutes on the rest of the main path', () => {
    expect(chapterMaxSeconds['c1']).toBe(60);
    expect(chapterMaxSeconds['c3'] ?? maxSecondsMainPath).toBeLessThanOrEqual(240);
    expect(maxSecondsMainPath).toBeLessThanOrEqual(240);
  });

  it('each chapter introduces at most one new tier above its easiest level', () => {
    const seen = new Set<number>();
    for (const c of manifest.chapters) {
      const tiers = c.levels.map((id) => byId.get(id)!.tier!);
      const base = Math.min(...tiers);
      const fresh = [...new Set(tiers)].filter((t) => t > base && !seen.has(t));
      expect(fresh.length, `${c.id} introduces ${fresh.join(', ')}`).toBeLessThanOrEqual(1);
      for (const t of tiers) seen.add(t);
    }
  });

  it('every chapter ends on its highest-scoring level', () => {
    for (const c of manifest.chapters) {
      const scores = c.levels.map((id) => byId.get(id)!.score!);
      expect(scores.at(-1), c.id).toBe(Math.max(...scores));
    }
  });

  it('chapter 1 needs nothing above T2', () => {
    const first = manifest.chapters[0];
    expect(first).toBeDefined();
    const over = first!.levels.filter((id) => (byId.get(id)?.tier ?? 99) > 2);
    expect(over).toEqual([]);
  });
});
