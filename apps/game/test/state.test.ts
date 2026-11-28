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

  it('reads each chapter\'s intro, and refuses one too long for the status card', () => {
    expect(catalog.chapters[0]!.intro).toBeNull(); // chapter 1 debuts nothing; the first garden teaches
    expect(catalog.chapters[1]!.intro?.title).toMatch(/^New: /);
    const manifest = DATA.manifest as { chapters: Record<string, unknown>[] };
    const withIntro = (intro: unknown) => ({ ...DATA, manifest: { chapters: manifest.chapters.map((c) => (c.id === 'c2' ? { ...c, intro } : c)) } });
    expect(() => createCatalog(withIntro({ title: 'x'.repeat(30), sub: 'fine' }), CHAPTERS)).toThrow(CatalogError);
    expect(() => createCatalog(withIntro({ title: 'New: x', sub: 'y'.repeat(73) }), CHAPTERS)).toThrow(CatalogError);
    expect(() => createCatalog(withIntro({ title: 7, sub: 'y' }), CHAPTERS)).toThrow(CatalogError);
    expect(() => createCatalog(withIntro({ title: 'New: x', sub: '   ' }), CHAPTERS)).toThrow(CatalogError);
    expect(() => createCatalog(withIntro('New: x'), CHAPTERS)).toThrow(CatalogError);
    expect(createCatalog(withIntro(null), CHAPTERS).chapters[1]!.intro).toBeNull();
  });
});

describe('play', () => {
  const id = catalog.mainPath[5]!;

  it('cycles a tile empty, firefly, X, empty; undo and reset cover X marks too; counts each', () => {
    const p = playOf(id);
    const [a, b] = [...catalog.solution(id)];
    expect(p.tap(a!)).toBe('placed');
    expect(p.tap(b!)).toBe('placed');
    expect(p.tap(b!)).toBe('marked');
    expect(p.placed.has(b!)).toBe(false);
    expect(p.marks.has(b!)).toBe(true);
    expect(p.remaining).toBe(p.jarSize - 1); // an X takes nothing from the jar
    expect(p.tap(b!)).toBe('cleared');
    expect(p.markOf(b!)).toBe('empty');
    expect(p.undo()).toBe('undone');
    expect(p.markOf(b!)).toBe('x');
    expect(p.undo()).toBe('undone');
    expect(p.markOf(b!)).toBe('firefly');
    p.tap(b!); // back to an X
    p.reset();
    expect(p.placed.size + p.marks.size).toBe(0);
    expect(p.undo()).toBe('undone'); // undo the reset: the firefly and the X come back
    expect(p.markOf(a!)).toBe('firefly');
    expect(p.markOf(b!)).toBe('x');
    expect({ placements: p.placements, undos: p.undos, restarts: p.restarts }).toEqual({ placements: 2, undos: 3, restarts: 1 });
  });

  it('never judges the player\'s X marks: one on an answer tile changes no hint', () => {
    const p = playOf(id);
    const before = p.peekHint();
    for (const c of catalog.solution(id)) if (!p.board.lantern[c]) {
      p.tap(c);
      p.tap(c); // firefly, then X
    }
    expect(p.marks.size).toBeGreaterThan(0);
    expect(p.peekHint()).toEqual(before);
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
    expect(p.undo()).toBe('nothing');
    expect(p.placed.has(w)).toBe(false);
  });

  it('a hint never places a firefly: its X marks are locked, and taps, undo and reset never remove them', () => {
    let crossed = 0;
    for (const lid of catalog.mainPath.slice(0, 12)) {
      const p = playOf(lid);
      const flies = p.evaluation.fireflies.length;
      const h = p.applyHint();
      expect(h.kind === 'cross' || h.kind === 'point', lid).toBe(true);
      expect(p.evaluation.fireflies.length).toBe(flies);
      expect(p.locked.size).toBe(0);
      if (h.kind !== 'cross') continue;
      crossed++;
      const x = h.cells[0]!;
      expect(catalog.solution(lid).has(x)).toBe(false);
      expect(p.crossed.has(x)).toBe(true);
      expect(p.crossGroups).toEqual([{ cells: h.cells, technique: h.technique, because: h.because }]);
      expect(p.tap(x)).toBe('hint-x');
      const other = [...catalog.solution(lid)].find((c) => !p.board.lantern[c])!;
      p.tap(other);
      p.reset();
      p.undo();
      p.reset();
      expect(p.crossed.has(x)).toBe(true);
    }
    expect(crossed).toBeGreaterThan(0);
  });

  it('a player X under a hint X becomes the hint\'s, and undo forgets the player\'s moves on it', () => {
    for (const lid of catalog.mainPath) {
      const p = playOf(lid);
      const h = p.peekHint();
      if (h.kind !== 'cross') continue;
      const x = h.cells[0]!;
      p.tap(x);
      p.tap(x); // the player's own X
      expect(p.marks.has(x)).toBe(true);
      p.applyHint();
      expect(p.marks.has(x)).toBe(false);
      expect(p.crossed.has(x)).toBe(true);
      expect(p.canUndo).toBe(false);
      return;
    }
    throw new Error('no level opens with a cross hint');
  });

  it('tapping a hint X shows its reason again', () => {
    for (const lid of catalog.mainPath) {
      const p = playOf(lid);
      const h = p.applyHint();
      if (h.kind !== 'cross') continue;
      p.tap([...catalog.solution(lid)].find((c) => !p.board.lantern[c])!);
      expect(p.shown).toBeNull();
      expect(p.tap(h.cells.at(-1)!)).toBe('hint-x');
      expect(p.shown).toEqual(h);
      return;
    }
    throw new Error('no level opens with a cross hint');
  });

  it('a pointing hint asked again on the same board is the same one, shown again for free', () => {
    let pointed = 0;
    for (const lid of catalog.mainPath) {
      const p = playOf(lid);
      for (let i = 0; i < 40 && !p.solved; i++) {
        const h = p.peekHint();
        if (h.kind === 'point') {
          expect(p.repeatsPoint(h)).toBe(false);
          p.applyHint();
          expect(p.repeatsPoint(p.peekHint())).toBe(true);
          // The player's own X marks don't change the position a hint reads.
          const free = p.board.paths.find((c) => p.markOf(c) === 'empty' && !p.crossed.has(c) && !p.board.lantern[c] && !p.evaluation.lit[c]);
          if (free !== undefined && p.remaining > 0) {
            p.tap(free);
            p.tap(free);
            expect(p.repeatsPoint(p.peekHint())).toBe(true);
          }
          pointed++;
          break;
        }
        p.applyHint();
      }
    }
    expect(pointed).toBeGreaterThan(0);
  });

  it('repeated hints (the player placing each firefly a hint points at) solve every main-path level, and the solved board accepts no more moves', () => {
    for (const lid of catalog.mainPath) {
      const p = playOf(lid);
      p.tap(wrongCell(lid));
      for (let i = 0; i < 200 && !p.solved; i++) {
        const h = p.applyHint();
        if (h.kind === 'point') p.tap(h.target);
      }
      expect(p.solved, lid).toBe(true);
      expect(p.applyHint().kind).toBe('none');
      expect(p.tap(p.board.paths[0]!)).toBe('blocked');
      expect(p.undo()).toBe('nothing');
    }
  });

  it('rejects a locked start cell outside the answer, a hint X on one inside it, and a player cell on a blocker', () => {
    const b = catalog.board(id);
    expect(() => new Play(b, catalog.solution(id), fakeClock(), { locked: [wrongCell(id)] })).toThrow(RangeError);
    const right = [...catalog.solution(id)].find((c) => !b.lantern[c])!;
    expect(() => new Play(b, catalog.solution(id), fakeClock(), { crossed: [{ cells: [right], technique: 'T1-satisfied', because: [] }] })).toThrow(RangeError);
    expect(() => new Play(b, catalog.solution(id), fakeClock(), {
      crossed: [{ cells: [wrongCell(id)], technique: 'T1-satisfied', because: [] }], marks: [wrongCell(id)],
    })).toThrow(RangeError);
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
  it('a solved board is final: undo is refused and keeps its history entry', () => {
    const id = catalog.mainPath[3]!;
    const p = playOf(id);
    for (const c of catalog.solution(id)) if (!p.board.lantern[c]) p.tap(c);
    expect(p.solved).toBe(true);
    expect(p.undo()).toBe('nothing');
    expect(p.canUndo).toBe(true);
  });

  it('tapping an old locked hint firefly clears the hint ring', () => {
    const id = catalog.mainPath[5]!;
    const lockedOne = [...catalog.solution(id)].find((c) => !catalog.board(id).lantern[c])!;
    const p = new Play(catalog.board(id), catalog.solution(id), fakeClock(), { locked: [lockedOne] });
    p.applyHint();
    expect(p.shown).not.toBeNull();
    expect(p.tap(lockedOne)).toBe('locked');
    expect(p.shown).toBeNull();
  });
});

describe('play: resume', () => {
  it('restores fireflies, locked cells, X marks, counters and time already spent', () => {
    const id = catalog.mainPath[2]!;
    const [a, b] = [...catalog.solution(id)];
    const [x, y] = catalog.board(id).paths.filter((c) => !catalog.solution(id).has(c));
    const clock = fakeClock();
    const crossed = [{ cells: [x!], technique: 'T1-satisfied' as const, because: [] }];
    const p = new Play(catalog.board(id), catalog.solution(id), clock, {
      placed: [a!], locked: [b!], crossed, marks: [y!], seconds: 40, placements: 5, undos: 2, restarts: 1, hints: 1,
    });
    expect(p.placed.has(a!)).toBe(true);
    expect(p.locked.has(b!)).toBe(true);
    expect(p.crossGroups).toEqual(crossed);
    expect(p.marks.has(y!)).toBe(true);
    expect({ placements: p.placements, undos: p.undos, restarts: p.restarts, hints: p.hints, seconds: p.seconds }).toEqual({ placements: 5, undos: 2, restarts: 1, hints: 1, seconds: 40 });
    p.resume();
    clock.advance(5000);
    expect(p.seconds).toBe(45);
  });
});

describe('play: the firefly jar', () => {
  it('holds exactly the fireflies the answer needs and refuses one more', () => {
    const id = catalog.mainPath[6]!;
    const b = catalog.board(id);
    const sol = [...catalog.solution(id)];
    const p = playOf(id);
    expect(p.jarSize).toBe(sol.length - b.lanterns.length);
    // Fill the jar with wrong-but-placeable fireflies where possible, else answer cells.
    const free = b.paths.filter((c) => !b.lantern[c]);
    for (const c of free) {
      if (p.remaining === 0) break;
      p.tap(c);
    }
    expect(p.remaining).toBe(0);
    const extra = free.find((c) => !p.placed.has(c))!;
    expect(p.tap(extra)).toBe('jar-empty');
    expect(p.placed.has(extra)).toBe(false);
    // With every firefly out, the tap marks the tile with an X instead (free, undoable).
    expect(p.marks.has(extra)).toBe(true);
    expect(p.undo()).toBe('undone');
    expect(p.marks.has(extra)).toBe(false);
    // Calling one back frees a slot.
    const back = [...p.placed][0]!;
    expect(p.tap(back)).toBe('marked');
    expect(p.remaining).toBe(1);
  });

  it('a full but wrong jar always gets a removal hint, never an overfilling placement', () => {
    for (const id of catalog.mainPath) {
      const b = catalog.board(id);
      const p = playOf(id);
      for (const c of b.paths) if (p.remaining > 0 && !b.lantern[c] && !p.solution.has(c)) p.tap(c);
      for (const c of b.paths) if (p.remaining > 0 && !b.lantern[c]) p.tap(c);
      for (let i = 0; i < 200 && !p.solved; i++) {
        const before = p.placed.size + p.locked.size;
        const h = p.applyHint();
        expect(p.placed.size + p.locked.size, id).toBeLessThanOrEqual(p.jarSize);
        if (before === p.jarSize && !p.solved) expect(h.kind, id).toBe('remove');
        if (h.kind === 'point') p.tap(h.target);
      }
      expect(p.solved, id).toBe(true);
    }
  });

  it('refuses to resume a board with more fireflies than the jar', () => {
    const id = catalog.mainPath[2]!;
    const b = catalog.board(id);
    const tooMany = b.paths.filter((c) => !b.lantern[c]).slice(0, catalog.solution(id).size + 1);
    expect(() => new Play(b, catalog.solution(id), fakeClock(), { placed: tooMany })).toThrow(RangeError);
  });
});
