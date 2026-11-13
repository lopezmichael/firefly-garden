import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HINT_REASONS, PLAYER_CONFIG, REMOVE_REASONS, TRY_HERE_REASON } from '@firefly/core';
import type { Evaluation, Hint, TechniqueId } from '@firefly/core';
import { createCatalog } from '../src/state/catalog.ts';
import { Play } from '../src/state/play.ts';
import { boardStatus, clockText, completeLine, finishedStatus, litPercent, noticeStatus } from '../src/state/status.ts';
import type { Notice, StatusText } from '../src/state/status.ts';

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

  it('heads hints with a short line, gives the reason below, and names crossed-out tiles only when there are some', () => {
    const ev = new Play(catalog.board(id), catalog.solution(id), clock).evaluation;
    const base = { kind: 'place', cell: 0, technique: 'T1-needs-all', reason: 'R', because: [1] } as const;
    expect(noticeStatus({ kind: 'hint', hint: { ...base, ruledOut: [] } }, ev)).toMatchObject({ title: 'A firefly goes here', sub: 'R' });
    expect(noticeStatus({ kind: 'hint', hint: { ...base, ruledOut: [5] } }, ev)).toMatchObject({ title: 'Crossed-out tiles stay empty', sub: 'R' });
    expect(noticeStatus({ kind: 'hint', hint: { kind: 'try-here', cell: 0, reason: 'T' } }, ev).sub).toMatch(/still dark/);
    expect(noticeStatus({ kind: 'hint', hint: { kind: 'remove', cell: 0, reason: 'X' } }, ev)).toMatchObject({ title: "That firefly can't stay", sub: 'X' });
    expect(noticeStatus({ kind: 'no-coins', coinsPerSolve: coins }, ev).sub).toContain(String(coins));
    expect(noticeStatus({ kind: 'jar-empty' }, ev).title).toBe('The jar is empty');
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

/** A typed evaluation for wording tests: only what the status words read, nothing cast away. */
function evaluation(o: { solved?: boolean; conflicts?: number[]; over?: boolean; unlit?: number }): Evaluation {
  return {
    fireflies: [], lit: [], conflicts: o.conflicts ?? [], unlit: o.unlit ?? 0, solved: o.solved ?? false,
    bushes: o.over ? [{ cell: 0, want: 1, have: 2, state: 'over' }] : [],
  };
}

/**
 * Every message the status card can show, with worst-case numbers, so the length budget below
 * covers all of them (hint reasons included). A new notice kind fails to compile until it has a
 * sample here.
 */
function everyStatus(): StatusText[] {
  const dark = evaluation({ unlit: 888 });
  const notices: { readonly [K in Exclude<Notice['kind'], 'hint'>]: Extract<Notice, { kind: K }> } = {
    locked: { kind: 'locked' },
    'no-coins': { kind: 'no-coins', coinsPerSolve: 1000 },
    reset: { kind: 'reset' },
    'jar-empty': { kind: 'jar-empty' },
  };
  const hint = (h: Exclude<Hint, { kind: 'none' }>) => noticeStatus({ kind: 'hint', hint: h }, dark);
  const out: StatusText[] = [
    boardStatus(evaluation({ solved: true }), false, 1000),
    boardStatus(evaluation({ conflicts: [1, 2] }), false, coins),
    boardStatus(evaluation({ over: true }), false, coins),
    boardStatus(dark, false, coins, 0),
    boardStatus(dark, true, coins),
    boardStatus(dark, false, coins),
    boardStatus(evaluation({}), false, coins),
    finishedStatus(),
    ...Object.values(notices).map((n) => noticeStatus(n, dark)),
    hint({ kind: 'try-here', cell: 0, reason: TRY_HERE_REASON }),
  ];
  for (const reason of Object.values(REMOVE_REASONS)) out.push(hint({ kind: 'remove', cell: 0, reason }));
  for (const technique of Object.keys(HINT_REASONS) as TechniqueId[]) {
    for (const ruledOut of [[], [1]]) {
      out.push(hint({ kind: 'place', cell: 0, technique, reason: HINT_REASONS[technique], because: [], ruledOut }));
    }
  }
  return out;
}

describe('status wording fits the card', () => {
  // The card reserves one title line, and two sub-lines (three below 244 px of text width; see
  // game.css, .ff-status-text). Measured with the shipped fonts on 2026-11-13: at these limits
  // every title fits one line from 264 px of text (18 px) or 236 px (16 px, narrow cards), and
  // every sub-line two lines from 244 px; a 360 px phone gives about 242 px.
  // Character counts are a proxy for rendered width: these limits leave margin for wide letters,
  // measured in Chromium with the shipped fonts. The CI browser smoke test measures the real card.
  // Longer wording needs a shorter line, not a taller card.
  const TITLE_MAX = 29;
  const SUB_MAX = 72;

  it('every title fits on one line and every sub-line in two', () => {
    const all = everyStatus();
    expect(all).toHaveLength(34);
    for (const s of all) {
      expect(s.title.length, s.title).toBeLessThanOrEqual(TITLE_MAX);
      expect(s.sub.length, s.sub).toBeLessThanOrEqual(SUB_MAX);
    }
  });
});
