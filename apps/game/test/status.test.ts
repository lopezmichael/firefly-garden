import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYER_CONFIG } from '@firefly/core';
import { createCatalog } from '../src/state/catalog.ts';
import { Play } from '../src/state/play.ts';
import { boardStatus, clockText, completeLine, litPercent, noticeStatus, opensUntouched } from '../src/state/status.ts';
import { everyStatus } from './status-samples.ts';

const LEVELS = join(import.meta.dirname, '../../../levels');
const read = (f: string): unknown => JSON.parse(readFileSync(join(LEVELS, f), 'utf8'));
const catalog = createCatalog({ launch: read('launch.json'), reserve: read('reserve.json'), manifest: read('manifest.json') }, ['c1']);
const id = catalog.mainPath[0]!;
const clock = { now: () => 0 };
const coins = PLAYER_CONFIG.economy.coinsPerSolve;

describe('status card', () => {
  it('teaches on the first move, counts dark tiles, and celebrates a solve with the real coin reward', () => {
    const p = new Play(catalog.board(id), catalog.solution(id), clock);
    const first = boardStatus(p.evaluation, true, coins);
    expect(first.title).toMatch(/path tiles still dark/);
    expect(first.sub).toMatch(/Tap a tile/);
    for (const c of catalog.solution(id)) p.tap(c);
    const done = boardStatus(p.evaluation, false, coins);
    expect(done).toEqual({ title: 'The garden is glowing!', sub: `Solved · +${coins} coins`, tone: 'solved' });
    expect(litPercent(p.evaluation, p.board.needsLight.length)).toBe(100);
  });

  it('warns about a conflict before anything else', () => {
    const b = catalog.board(id);
    const p = new Play(b, catalog.solution(id), clock);
    // Two path cells in the same row with nothing between them.
    const pair = b.paths.find((c) => b.rays[c]!.some((d) => b.paths.includes(d)));
    p.tap(pair!);
    p.tap(b.rays[pair!]!.find((d) => b.paths.includes(d))!);
    expect(boardStatus(p.evaluation, false, coins).tone).toBe('warn');
    expect(boardStatus(p.evaluation, false, coins).title).toMatch(/see each other/);
  });

  it('heads hints with a short line and gives the reason below: crossed tiles, a ring, or a firefly that must go', () => {
    const cross = (cells: number[]) => {
      const part = { cells, technique: 'T1-satisfied', reason: 'R', because: [1] } as const;
      return { kind: 'cross', ...part, parts: [part] } as const;
    };
    expect(noticeStatus({ kind: 'hint', hint: cross([5]) })).toMatchObject({ title: 'No firefly on this tile', sub: 'R' });
    expect(noticeStatus({ kind: 'hint', hint: cross([5, 6]) })).toMatchObject({ title: 'No fireflies on these tiles', sub: 'R' });
    expect(noticeStatus({ kind: 'hint', hint: { kind: 'wrong-x', cell: 3, reason: 'W' } })).toMatchObject({ title: 'No firefly on this tile', sub: 'W' });
    const point = { kind: 'point', reason: 'P', because: [1], target: 2 } as const;
    expect(noticeStatus({ kind: 'hint', hint: { ...point, technique: 'T2-one-source' } })).toMatchObject({ title: 'Look at this dark tile', sub: 'P' });
    expect(noticeStatus({ kind: 'hint', hint: { ...point, technique: 'T1-needs-all' } }).title).toBe('Look at this bush');
    expect(noticeStatus({ kind: 'hint', hint: { ...point, technique: null } }).title).toBe('Look around here');
    expect(noticeStatus({ kind: 'hint', hint: { kind: 'remove', cell: 0, reason: 'X' } })).toMatchObject({ title: "That firefly can't stay", sub: 'X' });
    expect(noticeStatus({ kind: 'no-hints' }).title).toBe('No hints left here');
    expect(noticeStatus({ kind: 'tip-hold' }).sub).toMatch(/Hold a tile/);
    expect(noticeStatus({ kind: 'jar-empty' }).title).toBe('The jar is empty');
  });

  it('an empty jar on an unsolved board says so, after conflicts and overfull bushes', () => {
    const p = new Play(catalog.board(id), catalog.solution(id), clock);
    expect(boardStatus(p.evaluation, false, coins, 0).sub).toMatch(/Every firefly is out/);
    expect(boardStatus(p.evaluation, false, coins, 2).title).toMatch(/still dark/);
  });
});

describe('level-complete line', () => {
  it('names the garden, the time and any hints', () => {
    const main = { kind: 'main', index: 5, total: 10, area: 'Rose Bed' } as const;
    expect(completeLine(main, 48, 0)).toBe('Garden 6 of 10 in the Rose Bed. Solved in 0:48.');
    expect(completeLine(main, 125, 1)).toBe('Garden 6 of 10 in the Rose Bed. Solved in 2:05 with 1 hint.');
    expect(completeLine({ kind: 'bonus', area: 'Rose Bed' }, 61, 3)).toBe('A bonus garden in the Rose Bed. Solved in 1:01 with 3 hints.');
  });

  it('formats the clock as m:ss, whole seconds, never negative', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(9.9)).toBe('0:09');
    expect(clockText(600)).toBe('10:00');
    expect(clockText(-4)).toBe('0:00');
  });
});

describe('status wording fits the card', () => {
  // The card reserves one title line, and two sub-lines (three below 244 px of text width; see
  // game.css, .ff-status-text). Measured with the shipped fonts on 2026-11-13: at these limits
  // every title fits one line from 264 px of text (18 px), 236 px (16 px) or 206 px (14 px), and
  // every sub-line two lines from 244 px; a 360 px phone gives about 256 px, a 320 px one 216 px
  // (titles at 14 px there, which fit from 206 px).
  // Character counts are a proxy for rendered width: these limits leave margin for wide letters,
  // measured in Chromium with the shipped fonts. The CI browser smoke test measures the real card.
  // Longer wording needs a shorter line, not a taller card.
  const TITLE_MAX = 29;
  const SUB_MAX = 72;

  it('every title fits on one line and every sub-line in two', () => {
    const all = everyStatus();
    expect(all).toHaveLength(55);
    for (const s of all) {
      expect(s.title.length, s.title).toBeLessThanOrEqual(TITLE_MAX);
      expect(s.sub.length, s.sub).toBeLessThanOrEqual(SUB_MAX);
    }
  });
});

describe('the opening line (first garden, chapter intro)', () => {
  const empty = { placed: 0, locked: 0, placements: 0, solved: false, notice: false };

  it('shows only on a truly untouched board', () => {
    expect(opensUntouched(empty)).toBe(true);
    // A resumed board keeps its fireflies but restarts its counters: not untouched.
    expect(opensUntouched({ ...empty, placed: 2 })).toBe(false);
    expect(opensUntouched({ ...empty, locked: 1 })).toBe(false);
    // Played, then undone back to empty: the player is past the opening.
    expect(opensUntouched({ ...empty, placements: 3 })).toBe(false);
  });

  it('never hides a notice or the solved line', () => {
    expect(opensUntouched({ ...empty, notice: true })).toBe(false);
    expect(opensUntouched({ ...empty, solved: true })).toBe(false);
  });
});
