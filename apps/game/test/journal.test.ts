import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/state/catalog.ts';
import { gardenSketch, journalPages, openingPage } from '../src/state/journal.ts';

const LEVELS = join(import.meta.dirname, '../../../levels');
const read = (f: string): unknown => JSON.parse(readFileSync(join(LEVELS, f), 'utf8'));
const catalog = createCatalog({ launch: read('launch.json'), reserve: read('reserve.json'), manifest: read('manifest.json') }, ['c1', 'c2', 'c3']);
const [c1, c2] = catalog.chapters;

describe('journal pages', () => {
  it('a new player: chapter 1 growing with nothing grown, the rest dark; opens on chapter 1', () => {
    const pages = journalPages(catalog.chapters, () => false, []);
    expect(pages.map((p) => p.state)).toEqual(['growing', 'dark', 'dark']);
    expect(pages[0]!.grown).toBe(0);
    expect(pages[0]!.area).toBe(`The ${c1!.area}`);
    expect(openingPage(pages)).toBe(0);
  });

  it('a finished chapter is done with its card line and totals; the next one grows and the journal opens there', () => {
    const solved = new Set([...c1!.levels, ...c2!.levels.slice(0, 4)]);
    const history = [...solved].map((levelId, i) => ({ levelId, seconds: 30 + i, hints: i === 2 ? 1 : 0 }));
    const pages = journalPages(catalog.chapters, (id) => solved.has(id), history);
    expect(pages.map((p) => p.state)).toEqual(['done', 'growing', 'dark']);
    expect(pages[0]!.line).toMatch(/glowing/);
    expect(pages[0]!.hints).toBe(1);
    expect(pages[0]!.seconds).toBe(c1!.levels.reduce((sum, _, i) => sum + 30 + i, 0));
    expect(pages[1]!.grown).toBe(4);
    expect(pages[1]!.line).toMatch(/6 gardens to go/);
    expect(pages[1]!.gardens.filter((g) => g.grown).map((g) => g.id)).toEqual(c2!.levels.slice(0, 4));
    expect(openingPage(pages)).toBe(1);
  });

  it('a chapter with a garden grown out of order is not dark (a save from a later build)', () => {
    const pages = journalPages(catalog.chapters, (id) => id === catalog.chapters[2]!.levels[0], []);
    expect(pages[2]!.state).toBe('growing');
  });

  it('opens on the last chapter when every one is done', () => {
    const pages = journalPages(catalog.chapters, () => true, []);
    expect(pages.every((p) => p.state === 'done')).toBe(true);
    expect(openingPage(pages)).toBe(pages.length - 1);
  });
});

describe('journal totals', () => {
  it('show no totals once the capped history no longer holds every grown garden', () => {
    const solved = new Set(c1!.levels);
    const all = c1!.levels.map((levelId) => ({ levelId, seconds: 40, hints: 0, solved: true }));
    expect(journalPages(catalog.chapters, (id) => solved.has(id), all)[0]!.totalsKnown).toBe(true);
    // The oldest plays trimmed away: the page would undercount, so it says so instead.
    expect(journalPages(catalog.chapters, (id) => solved.has(id), all.slice(3))[0]!.totalsKnown).toBe(false);
    // A quit doesn't count as the garden's play.
    const quit = [...all.slice(1), { levelId: c1!.levels[0]!, seconds: 5, hints: 0, solved: false }];
    expect(journalPages(catalog.chapters, (id) => solved.has(id), quit)[0]!.totalsKnown).toBe(false);
  });
});

describe('garden sketch', () => {
  it('draws the layout with the answer’s fireflies, bushes where the bushes are', () => {
    const id = c1!.levels[0]!;
    const board = catalog.board(id), sol = catalog.solution(id);
    const sk = gardenSketch(board, sol);
    expect(sk.cells).toHaveLength(board.w * board.h);
    sk.cells.forEach((c, i) => {
      if (board.kind[i] === 'void') expect(c).toBeNull();
      else if (board.kind[i] === 'bush' || board.kind[i] === 'mushroom') expect(c).toBe('bush');
      else if (board.lantern[i]) expect(c).toBe('lantern');
      else expect(c).toBe(sol.has(i) ? 'firefly' : 'path');
    });
    expect(sk.cells.filter((c) => c === 'firefly').length).toBeGreaterThan(0);
  });
});
