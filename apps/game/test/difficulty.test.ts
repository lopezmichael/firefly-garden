import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYED_CHAPTERS } from '../src/build.ts';
import { createCatalog } from '../src/state/catalog.ts';
import { difficultyOf } from '../src/state/difficulty.ts';

const LEVELS = join(import.meta.dirname, '../../../levels');
const read = (f: string): unknown => JSON.parse(readFileSync(join(LEVELS, f), 'utf8'));
const catalog = createCatalog({ launch: read('launch.json'), reserve: read('reserve.json'), manifest: read('manifest.json') }, PLAYED_CHAPTERS);

describe('difficulty labels', () => {
  it('maps each tier to a word and leaves', () => {
    expect([1, 2, 3, 4].map((t) => difficultyOf(t))).toEqual([
      { word: 'Easy', leaves: 1 }, { word: 'Medium', leaves: 2 }, { word: 'Hard', leaves: 3 }, { word: 'Expert', leaves: 4 },
    ]);
  });

  it('clamps out-of-range tiers', () => {
    expect(difficultyOf(0).word).toBe('Easy');
    expect(difficultyOf(5).word).toBe('Expert');
    expect(difficultyOf(Number.NaN).word).toBe('Easy');
  });

  it('every playable garden has a label, and chapter 1 needs nothing past Medium (the T2 ratchet)', () => {
    for (const [, l] of catalog.levels) expect(difficultyOf(l.tier).leaves).toBe(l.tier);
    for (const id of catalog.chapters[0]!.levels) expect(difficultyOf(catalog.levels.get(id)!.tier).leaves).toBeLessThanOrEqual(2);
  });
});
