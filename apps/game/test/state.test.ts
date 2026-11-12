import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYER_CONFIG, POLICY_CONFIG } from '@firefly/core';
import { CatalogError, createCatalog } from '../src/state/catalog.ts';
import { Play } from '../src/state/play.ts';
import { HISTORY_CAP, Session } from '../src/state/session.ts';
import { MAX_BANKED_HINTS, Wallet } from '../src/state/wallet.ts';

const LEVELS = join(import.meta.dirname, '../../../levels');
const read = (f: string): unknown => JSON.parse(readFileSync(join(LEVELS, f), 'utf8'));
const DATA = { launch: read('launch.json'), reserve: read('reserve.json'), manifest: read('manifest.json') };
const CHAPTERS = ['c1', 'c2', 'c3'];
const catalog = createCatalog(DATA, CHAPTERS);

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

function playOf(id: string, clock = fakeClock()) {
  return new Play(catalog.board(id), catalog.solution(id), clock);
}

/** A path cell that is not in the answer and does not see any answer cell's light restrictions mattering. */
function wrongCell(id: string): number {
  const b = catalog.board(id);
  const sol = catalog.solution(id);
  const c = b.paths.find((p) => !sol.has(p) && !b.lantern[p]);
  if (c === undefined) throw new Error('no wrong cell');
  return c;
}

describe('catalog', () => {
  it('holds chapters 1 to 3 as the main path and the whole reserve', () => {
    expect(catalog.mainPath).toHaveLength(30);
    expect(catalog.mainPath[0]).toBe(catalog.chapters[0]!.levels[0]);
    expect(catalog.reserve).toHaveLength(250);
    for (const id of catalog.mainPath) {
      const l = catalog.levels.get(id)!;
      expect(l.estimatedSeconds).toBeGreaterThan(0);
      expect(catalog.solution(id).size).toBe(catalog.level(id).solution!.length);
      expect(catalog.place(id)?.chapter.id).toMatch(/^c[123]$/);
    }
  });

  it('fails loudly on an unknown chapter or a malformed manifest', () => {
    expect(() => createCatalog(DATA, ['c999'])).toThrow(CatalogError);
    expect(() => createCatalog({ ...DATA, manifest: { chapters: [{ id: 'c1' }] } }, ['c1'])).toThrow(CatalogError);
    expect(() => createCatalog({ ...DATA, launch: {} }, ['c1'])).toThrow(CatalogError);
  });
});

describe('play', () => {
  const id = catalog.mainPath[5]!;

  it('toggles fireflies, undoes and resets, and counts each', () => {
    const p = playOf(id);
    const [a, b] = [...catalog.solution(id)];
    expect(p.tap(a!)).toBe('placed');
    expect(p.tap(b!)).toBe('placed');
    expect(p.tap(b!)).toBe('removed');
    expect(p.placed.has(b!)).toBe(false);
    expect(p.undo()).toBe(true);
    expect(p.placed.has(b!)).toBe(true);
    p.reset();
    expect(p.placed.size).toBe(0);
    expect(p.undo()).toBe(true); // undo the reset
    expect([...p.placed].sort()).toEqual([a, b].sort());
    expect({ placements: p.placements, undos: p.undos, restarts: p.restarts }).toEqual({ placements: 2, undos: 2, restarts: 1 });
  });

  it('refuses taps on bushes', () => {
    const p = playOf(id);
    const bush = catalog.board(id).kind.findIndex((k) => k === 'bush');
    expect(p.tap(bush)).toBe('blocked');
  });

  it('a removal hint takes the wrong firefly away for good: undo cannot bring it back', () => {
    const p = playOf(id);
    const w = wrongCell(id);
    p.tap(w);
    const h = p.applyHint();
    expect(h).toMatchObject({ kind: 'remove', cell: w });
    expect(p.placed.has(w)).toBe(false);
    expect(p.canUndo).toBe(false);
    expect(p.undo()).toBe(false);
    expect(p.placed.has(w)).toBe(false);
  });

  it('a placing hint locks its firefly: taps, undo and reset never remove it', () => {
    const p = playOf(id);
    const h = p.applyHint();
    expect(h.kind === 'place' || h.kind === 'try-here').toBe(true);
    if (h.kind !== 'place' && h.kind !== 'try-here') return;
    expect(catalog.solution(id).has(h.cell)).toBe(true);
    expect(p.locked.has(h.cell)).toBe(true);
    expect(p.tap(h.cell)).toBe('locked');
    const other = [...catalog.solution(id)].find((c) => c !== h.cell)!;
    p.tap(other);
    p.reset();
    p.undo();
    p.reset();
    expect(p.locked.has(h.cell)).toBe(true);
    expect(p.evaluation.fireflies).toContain(h.cell);
  });

  it('a player firefly the hint locks is not double-counted or undoable', () => {
    const p = playOf(id);
    const target = p.peekHint();
    if (target.kind !== 'place') return;
    p.tap(target.cell);
    // Placing it by hand means the next hint differs; lock it directly via the hint path instead.
    p.undo();
    p.applyHint();
    expect(p.placed.has(target.cell)).toBe(false);
    expect(p.locked.has(target.cell)).toBe(true);
    expect(p.canUndo).toBe(false);
  });

  it('repeated hints solve every main-path level, and the solved board accepts no more moves', () => {
    for (const lid of catalog.mainPath) {
      const p = playOf(lid);
      p.tap(wrongCell(lid));
      for (let i = 0; i < 100 && !p.solved; i++) p.applyHint();
      expect(p.solved, lid).toBe(true);
      expect(p.applyHint().kind).toBe('none');
      expect(p.tap(p.board.paths[0]!)).toBe('blocked');
      expect(p.undo()).toBe(false);
    }
  });

  it('rejects a locked start cell outside the answer and a player cell on a blocker', () => {
    const b = catalog.board(id);
    expect(() => new Play(b, catalog.solution(id), fakeClock(), { locked: [wrongCell(id)] })).toThrow(RangeError);
    const bush = b.kind.findIndex((k) => k === 'bush');
    expect(() => new Play(b, catalog.solution(id), fakeClock(), { placed: [bush] })).toThrow(RangeError);
  });

  it('caps active time inside the analytics schema', () => {
    const clock = fakeClock();
    const p = new Play(catalog.board(id), catalog.solution(id), clock, { seconds: 7 * 86_400 - 2 });
    p.resume();
    clock.advance(3_600_000);
    expect(p.seconds).toBe(7 * 86_400 - 1);
  });

  it('counts only active time', () => {
    const clock = fakeClock();
    const p = playOf(id, clock);
    p.resume();
    clock.advance(10_500);
    p.pause();
    clock.advance(60_000); // hidden tab
    p.resume();
    p.resume(); // idempotent
    clock.advance(2_000);
    expect(p.seconds).toBe(12);
  });
});

describe('wallet', () => {
  const eco = PLAYER_CONFIG.economy;

  it('starts with the shipped economy and logs the starting grant', () => {
    const log: unknown[] = [];
    const w = new Wallet(null, { coins: (d, b, why) => log.push([d, b, why]) });
    expect(w.coins).toBe(eco.startingCoins);
    expect(log).toEqual([[eco.startingCoins, eco.startingCoins, 'start']]);
  });

  it('pays from the bank first, then coins, and charges nothing when it cannot pay', () => {
    const w = new Wallet({ coins: eco.hintCost, bank: 1 });
    expect(w.payForHint()).toBe('bank');
    expect(w.coins).toBe(eco.hintCost);
    expect(w.payForHint()).toBe('coins');
    expect(w.coins).toBe(0);
    expect(w.payForHint()).toBeNull();
    expect(w.coins).toBe(0);
  });

  it('a finished rewarded ad banks the hints not used now, capped', () => {
    const w = new Wallet({ coins: 0, bank: 0 });
    w.creditAd();
    expect(w.bank).toBe(eco.hintsPerAd - 1);
    const full = new Wallet({ coins: 0, bank: MAX_BANKED_HINTS });
    full.creditAd();
    expect(full.bank).toBe(MAX_BANKED_HINTS);
  });

  it('caps the balance on every change, not only on load', () => {
    const w = new Wallet({ coins: 999_995, bank: 0 });
    w.creditSolve();
    expect(w.coins).toBe(1_000_000);
  });

  it('credits a solve', () => {
    const w = new Wallet({ coins: 5, bank: 0 });
    w.creditSolve();
    expect(w.coins).toBe(5 + eco.coinsPerSolve);
  });
});

describe('session', () => {
  const T0 = Date.UTC(2026, 10, 12, 12);

  it('starts on the first main-path level and moves on after a solve', () => {
    const s = new Session(catalog);
    expect(s.next(T0)).toEqual({ id: catalog.mainPath[0], reason: 'main' });
    s.record({ levelId: catalog.mainPath[0]!, reason: 'main', solved: true, seconds: 20, hints: 0, endedAt: T0 });
    expect(s.next(T0 + 1000)).toEqual({ id: catalog.mainPath[1], reason: 'main' });
  });

  it('serves a reserve breather after a quit, then the quit level as a retry', () => {
    const s = new Session(catalog);
    for (const id of catalog.mainPath.slice(0, 12)) s.record({ levelId: id, reason: 'main', solved: true, seconds: 30, hints: 0, endedAt: T0 });
    const quit = catalog.mainPath[12]!;
    s.record({ levelId: quit, reason: 'main', solved: false, seconds: 90, hints: 0, endedAt: T0 + 1 });
    const breather = s.next(T0 + 2)!;
    expect(breather.reason).toBe('breather-after-quit');
    expect(catalog.reserveIds.has(breather.id)).toBe(true);
    s.record({ levelId: breather.id, reason: breather.reason, solved: true, seconds: 30, hints: 0, endedAt: T0 + 3 });
    expect(s.next(T0 + 4)).toEqual({ id: quit, reason: 'retry' });
    expect(s.progress.playedReserve.has(breather.id)).toBe(true);
    expect(s.progress.quitMain.has(quit)).toBe(true);
    expect(s.attempt(quit)).toBe(2);
  });

  it('caps history above the policy minimum', () => {
    expect(HISTORY_CAP).toBeGreaterThanOrEqual(POLICY_CONFIG.minHistory);
    const s = new Session(catalog);
    for (let i = 0; i < HISTORY_CAP + 20; i++) {
      s.record({ levelId: catalog.mainPath[i % 30]!, reason: 'main', solved: true, seconds: 30, hints: 0, endedAt: T0 + i });
    }
    expect(s.progress.history).toHaveLength(HISTORY_CAP);
  });
});

describe('play: undo after a hint', () => {
  it('an undo can solve the board once a hint has rewritten history, and solved is then final', () => {
    const id = catalog.mainPath[3]!;
    const b = catalog.board(id);
    const sol = [...catalog.solution(id)];
    // A wrong firefly that conflicts with some answer cell keeps the board unsolved.
    const w = b.paths.find((c) => !catalog.solution(id).has(c) && b.rays[c]!.some((d) => catalog.solution(id).has(d)))!;
    const p = playOf(id);
    p.tap(w);
    for (const c of sol) p.tap(c);
    expect(p.solved).toBe(false);
    p.tap(sol[0]!); // lift one answer firefly
    expect(p.applyHint()).toMatchObject({ kind: 'remove', cell: w });
    expect(p.solved).toBe(false);
    expect(p.undo()).toBe(true); // brings sol[0] back: solved without a tap
    expect(p.solved).toBe(true);
    expect(p.undo()).toBe(false);
    expect(p.canUndo).toBe(true); // the refused undo kept its history entry
  });

  it('tapping a locked firefly or a refused undo clears the hint outlines', () => {
    const id = catalog.mainPath[5]!;
    const p = playOf(id);
    const h = p.applyHint();
    if (h.kind !== 'place') return;
    expect(p.shown).not.toBeNull();
    expect(p.tap(h.cell)).toBe('locked');
    expect(p.shown).toBeNull();
  });
});

describe('play: resume', () => {
  it('restores fireflies, locked cells, counters and time already spent', () => {
    const id = catalog.mainPath[2]!;
    const [a, b] = [...catalog.solution(id)];
    const clock = fakeClock();
    const p = new Play(catalog.board(id), catalog.solution(id), clock, { placed: [a!], locked: [b!], seconds: 40, placements: 5, undos: 2, restarts: 1, hints: 1 });
    expect(p.placed.has(a!)).toBe(true);
    expect(p.locked.has(b!)).toBe(true);
    expect({ placements: p.placements, undos: p.undos, restarts: p.restarts, hints: p.hints, seconds: p.seconds }).toEqual({ placements: 5, undos: 2, restarts: 1, hints: 1, seconds: 40 });
    p.resume();
    clock.advance(5000);
    expect(p.seconds).toBe(45);
  });
});
