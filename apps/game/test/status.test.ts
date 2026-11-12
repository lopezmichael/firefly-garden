import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYER_CONFIG } from '@firefly/core';
import { createCatalog } from '../src/state/catalog.ts';
import { Play } from '../src/state/play.ts';
import { boardStatus, litPercent, noticeStatus } from '../src/state/status.ts';

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

  it('explains hints, and mentions crossed-out tiles only when there are some', () => {
    const ev = new Play(catalog.board(id), catalog.solution(id), clock).evaluation;
    const base = { kind: 'place', cell: 0, technique: 'T1-needs-all', reason: 'R', because: [1] } as const;
    expect(noticeStatus({ kind: 'hint', hint: { ...base, ruledOut: [] } }, ev).sub).toMatch(/still dark/);
    expect(noticeStatus({ kind: 'hint', hint: { ...base, ruledOut: [5] } }, ev).sub).toMatch(/crossed-out/);
    expect(noticeStatus({ kind: 'hint', hint: { kind: 'remove', cell: 0, reason: 'X' } }, ev).title).toMatch(/can't stay/);
    expect(noticeStatus({ kind: 'no-coins', coinsPerSolve: coins }, ev).sub).toContain(String(coins));
  });
});
