import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cellCoord, createRng } from '@firefly/core';
import { createCatalog } from '../src/state/catalog.ts';
import { DEFAULT_SETTINGS, MAX_COINS, MAX_PARKED, MAX_SAVE_CHARS, newInstallId, parseSave, SAVE_VERSION, serializeSave } from '../src/state/save.ts';
import type { SaveData } from '../src/state/save.ts';
import { HISTORY_CAP } from '../src/state/session.ts';
import { MAX_BANKED_HINTS } from '../src/state/wallet.ts';

const LEVELS = join(import.meta.dirname, '../../../levels');
const read = (f: string): unknown => JSON.parse(readFileSync(join(LEVELS, f), 'utf8'));
const catalog = createCatalog({ launch: read('launch.json'), reserve: read('reserve.json'), manifest: read('manifest.json') }, ['c1', 'c2', 'c3']);
const NOW = Date.UTC(2026, 10, 12, 18);
const INSTALL = '0123456789abcdef0123456789abcdef';
const id = catalog.mainPath[4]!;
const board = catalog.board(id);
const solution = [...catalog.solution(id)];
const fresh = () => 'feedfacefeedfacefeedfacefeedface';
const wrong = board.paths.find((c) => !catalog.solution(id).has(c))!;

function good(): SaveData {
  return {
    install: INSTALL, session: 3, coins: 70, bank: 2,
    solved: new Set(catalog.mainPath.slice(0, 4)),
    history: catalog.mainPath.slice(0, 4).map((l, i) => ({ levelId: l, reason: 'main' as const, solved: true, seconds: 30 + i, hints: 0, endedAt: NOW - 1000 * (4 - i) })),
    playedReserve: new Set([catalog.reserve[0]!.id]),
    quitMain: new Set([catalog.mainPath[3]!]),
    current: { levelId: id, key: catalog.levelKey(id), reason: 'main', placed: [solution[1]!], locked: [solution[0]!], seconds: 12, placements: 3, undos: 1, restarts: 0, hints: 1 },
    parked: [],
    settings: { sound: false, motion: 'off' },
    mapSeen: new Set(),
  };
}

/** Edit a serialized save as plain JSON. */
function tamper(edit: (o: Record<string, unknown>) => void): string {
  const o = JSON.parse(serializeSave(good(), catalog)) as Record<string, unknown>;
  edit(o);
  return JSON.stringify(o);
}

describe('save round trip', () => {
  it('reads back exactly what was written, with no problems', () => {
    const { data, problems } = parseSave(serializeSave(good(), catalog), catalog, NOW, fresh);
    expect(problems).toEqual([]);
    expect(data).toEqual(good());
  });

  it('stores cells as canonical [row, col], not indices', () => {
    const o = JSON.parse(serializeSave(good(), catalog)) as { current: { locked: unknown } };
    expect(o.current.locked).toEqual([cellCoord(board, solution[0]!)]);
  });

  it('makes a 32-hex install id', () => {
    expect(newInstallId((n) => new Uint8Array(n).fill(171))).toBe('ab'.repeat(16));
  });
});

describe('save validation (rules.md)', () => {
  it('starts fresh on missing or unreadable saves, without throwing', () => {
    for (const raw of [null, '', '{', '[]', '"x"', '42']) {
      expect(parseSave(raw, catalog, NOW, fresh).data).toBeNull();
    }
  });

  it('flags a save from another version so the caller can back it up instead of losing it', () => {
    expect(parseSave(JSON.stringify({ v: 2, coins: 5 }), catalog, NOW, fresh)).toMatchObject({ data: null, unknownVersion: true });
  });

  it('keeps progress when only the install id is malformed', () => {
    const { data, problems } = parseSave(tamper((o) => { o.install = 'not-hex'; }), catalog, NOW, fresh);
    expect(data!.install).toBe(fresh());
    expect(data!.solved).toEqual(good().solved);
    expect(data!.coins).toBe(70);
    expect(problems.join()).toMatch(/install id/);
  });

  it('never locks a lantern, even though lanterns are part of the answer', () => {
    // Chapters 1 to 3 have no lanterns: use a catalog that includes the first lantern chapter.
    const manifest = read('manifest.json') as { chapters: { id: string; levels: string[] }[] };
    const launch = read('launch.json') as { levels: { id: string; twists?: { lanterns?: unknown[] } }[] };
    const lanternLevel = launch.levels.find((l) => (l.twists?.lanterns?.length ?? 0) > 0)!;
    const chapter = manifest.chapters.find((c) => c.levels.includes(lanternLevel.id))!;
    const cat = createCatalog({ launch, reserve: read('reserve.json'), manifest }, ['c1', chapter.id]);
    const withLantern = lanternLevel.id;
    const b = cat.board(withLantern);
    const lantern = b.lanterns[0]!;
    const raw = tamper((o) => {
      o.current = { levelId: withLantern, key: cat.levelKey(withLantern), reason: 'main', placed: [], locked: [cellCoord(b, lantern)], seconds: 0, placements: 0, undos: 0, restarts: 0, hints: 0 };
    });
    const parsed = parseSave(raw, cat, NOW, fresh);
    expect(parsed.data!.current).not.toBeNull();
    expect(parsed.data!.current!.locked).toEqual([]);
    expect(parsed.problems.join()).toMatch(/not a placeable answer cell/);
  });

  it('drops a saved board holding more fireflies than the jar', () => {
    const tooMany = board.paths.filter((c) => !board.lantern[c] && c !== solution[0]).slice(0, solution.length).map((c) => cellCoord(board, c));
    const { data, problems } = parseSave(tamper((o) => { (o.current as Record<string, unknown>).placed = tooMany; }), catalog, NOW, fresh);
    expect(data!.current!.placed).toEqual([]);
    expect(data!.current!.locked).toEqual([solution[0]]);
    expect(problems.join()).toMatch(/more fireflies than the jar/);
  });

  it('drops the saved board when the level changed under the same id', () => {
    const { data, problems } = parseSave(tamper((o) => { (o.current as Record<string, unknown>).key = 'deadbeef'; }), catalog, NOW, fresh);
    expect(data!.current).toBeNull();
    expect(data!.coins).toBe(70); // the rest of the save is kept
    expect(problems.join()).toMatch(/level changed/);
    const old = parseSave(tamper((o) => { delete (o.current as Record<string, unknown>).key; }), catalog, NOW, fresh);
    expect(old.data!.current).toBeNull();
  });

  it('refuses an oversized save before parsing it', () => {
    const raw = tamper((o) => { o.pad = 'x'.repeat(MAX_SAVE_CHARS); });
    expect(parseSave(raw, catalog, NOW, fresh).data).toBeNull();
  });

  it('never locks a cell outside the answer: the locked set is dropped', () => {
    const raw = tamper((o) => { (o.current as Record<string, unknown>).locked = [cellCoord(board, solution[0]!), cellCoord(board, wrong)]; });
    const { data, problems } = parseSave(raw, catalog, NOW, fresh);
    expect(data!.current!.locked).toEqual([]);
    expect(problems.join()).toMatch(/not a placeable answer cell/);
  });

  it('drops player fireflies on bushes, off the board, or on a locked cell', () => {
    const bush = board.kind.findIndex((k) => k === 'bush');
    for (const placed of [[cellCoord(board, bush)], [[99, 0]], [[0.5, 1]], [cellCoord(board, solution[0]!)], 'x', [[1]]]) {
      const raw = tamper((o) => { (o.current as Record<string, unknown>).placed = placed; });
      const { data } = parseSave(raw, catalog, NOW, fresh);
      expect(data!.current!.placed, JSON.stringify(placed)).toEqual([]);
      expect(data!.current!.locked).toEqual([solution[0]]); // valid locked cells are kept
    }
  });

  it('caps the bank and coins and never turns a broken balance into a grant', () => {
    for (const [coins, bank] of [[1e12, 1e12], [-5, -1], [Infinity, NaN], ['70', '2'], [3.5, 1.5], [MAX_COINS + 1, MAX_BANKED_HINTS + 1]] as const) {
      const { data } = parseSave(tamper((o) => { o.coins = coins; o.bank = bank; }), catalog, NOW, fresh);
      expect(data!.coins).toBe(0);
      expect(data!.bank).toBe(0);
    }
  });

  it('drops unknown levels, unknown reasons, bad numbers and future timestamps from history', () => {
    const raw = tamper((o) => {
      const h = o.history as Record<string, unknown>[];
      h.push({ ...h[0], levelId: 'nope' }, { ...h[0], reason: 'skip' }, { ...h[0], seconds: -1 }, { ...h[0], endedAt: NOW + 60_000 }, { ...h[0], hints: 1.5 }, 'x' as never);
    });
    const { data, problems } = parseSave(raw, catalog, NOW, fresh);
    expect(data!.history).toHaveLength(4);
    expect(problems.join()).toMatch(/dropped 6 records/);
  });

  it('keeps only known ids in the solved, played-reserve and quit-main sets', () => {
    const raw = tamper((o) => {
      o.solved = [...(o.solved as string[]), 'ghost', 42];
      o.playedReserve = [catalog.mainPath[0], catalog.reserve[1]!.id]; // a main level is not a reserve level
      o.quitMain = [catalog.reserve[0]!.id, catalog.mainPath[2]];
    });
    const { data } = parseSave(raw, catalog, NOW, fresh);
    expect([...data!.solved]).toEqual(catalog.mainPath.slice(0, 4));
    expect([...data!.playedReserve]).toEqual([catalog.reserve[1]!.id]);
    expect([...data!.quitMain]).toEqual([catalog.mainPath[2]]);
  });

  it('caps history length', () => {
    const raw = tamper((o) => {
      const one = (o.history as unknown[])[0];
      o.history = Array.from({ length: HISTORY_CAP * 3 }, () => one);
    });
    expect(parseSave(raw, catalog, NOW, fresh).data!.history).toHaveLength(HISTORY_CAP);
  });

  it('falls back to default settings field by field', () => {
    expect(parseSave(tamper((o) => { o.settings = { sound: 'yes', motion: 'wild' }; }), catalog, NOW, fresh).data!.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores prototype keys and extra fields', () => {
    const raw = `{"v":${SAVE_VERSION},"install":"${INSTALL}","__proto__":{"coins":999},"constructor":{"x":1},"coins":5,"bank":0,"session":1,"admin":true}`;
    const { data } = parseSave(raw, catalog, NOW, fresh);
    expect(data!.coins).toBe(5);
    expect(({} as Record<string, unknown>).coins).toBeUndefined();
    expect(JSON.parse(serializeSave(data!, catalog))).not.toHaveProperty('admin');
  });
});

describe('map seen chapters (the unlock flight plays once)', () => {
  const c1 = catalog.chapters[0]!;
  const finishedC1 = (): SaveData => ({ ...good(), current: null, solved: new Set(c1.levels), mapSeen: new Set([c1.id]) });

  it('round-trips the chapters the map has shown finished', () => {
    const back = parseSave(serializeSave(finishedC1(), catalog), catalog, NOW, fresh);
    expect(back.problems).toEqual([]);
    expect([...back.data!.mapSeen]).toEqual([c1.id]);
  });

  it('reads an older save with no mapSeen as nothing seen', () => {
    const raw = JSON.parse(serializeSave(finishedC1(), catalog)) as Record<string, unknown>;
    delete raw.mapSeen;
    const back = parseSave(JSON.stringify(raw), catalog, NOW, fresh);
    expect(back.problems).toEqual([]);
    expect(back.data!.mapSeen.size).toBe(0);
  });

  it('drops unknown chapters, chapters this save has not finished, and non-lists', () => {
    const raw = JSON.parse(serializeSave(finishedC1(), catalog)) as Record<string, unknown>;
    raw.mapSeen = [c1.id, catalog.chapters[1]!.id, 'c99', 7, '__proto__'];
    const back = parseSave(JSON.stringify(raw), catalog, NOW, fresh);
    expect([...back.data!.mapSeen]).toEqual([c1.id]);
    expect(back.problems.some((p) => p.includes('mapSeen'))).toBe(true);
    raw.mapSeen = 'c1';
    const bad = parseSave(JSON.stringify(raw), catalog, NOW, fresh);
    expect(bad.data!.mapSeen.size).toBe(0);
    expect(bad.problems).toContain('mapSeen is not a list');
  });
});

describe('parked boards (quit levels kept for their retry)', () => {
  const quitId = catalog.mainPath[6]!;
  const qb = catalog.board(quitId);
  const qsol = [...catalog.solution(quitId)];
  const parkedPlay = (levelId: string) => ({
    levelId, key: catalog.levelKey(levelId), reason: 'retry' as const, placed: [], locked: [], seconds: 9, placements: 2, undos: 0, restarts: 0, hints: 0,
  });

  it('round-trips a parked board with its fireflies', () => {
    const d = { ...good(), parked: [{ ...parkedPlay(quitId), placed: [qsol[0]!], locked: [qsol[1]!] }] };
    expect(parseSave(serializeSave(d, catalog), catalog, NOW, fresh).data!.parked).toEqual(d.parked);
    void qb;
  });

  it('keeps the newest copy when a level is parked twice', () => {
    const raw = tamper((o) => { o.parked = [{ ...parkedPlay(quitId), seconds: 1 }, { ...parkedPlay(quitId), seconds: 2 }]; });
    expect(parseSave(raw, catalog, NOW, fresh).data!.parked.map((p) => p.seconds)).toEqual([2]);
  });

  it('drops parked boards for the current level, solved levels, duplicates and unknown levels, and caps the list', () => {
    const raw = tamper((o) => {
      o.parked = [
        parkedPlay(id), // the current level
        parkedPlay(catalog.mainPath[0]!), // solved in good()
        parkedPlay(quitId),
        parkedPlay(quitId), // duplicate
        { ...parkedPlay(quitId), levelId: 'nope' },
      ];
    });
    expect(parseSave(raw, catalog, NOW, fresh).data!.parked.map((p) => p.levelId)).toEqual([quitId]);
    const many = tamper((o) => { o.parked = catalog.mainPath.slice(8, 8 + MAX_PARKED + 3).map(parkedPlay); });
    expect(parseSave(many, catalog, NOW, fresh).data!.parked.length).toBeLessThanOrEqual(MAX_PARKED);
  });

  it('validates parked cells like the current board: no locked cell outside the answer', () => {
    const wrong = qb.paths.find((c) => !catalog.solution(quitId).has(c))!;
    const raw = tamper((o) => { o.parked = [{ ...parkedPlay(quitId), locked: [cellCoord(qb, wrong)] }]; });
    expect(parseSave(raw, catalog, NOW, fresh).data!.parked[0]!.locked).toEqual([]);
  });
});

describe('save fuzz', () => {
  const rng = createRng(20261112);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)]!;
  const junk = (depth: number): unknown => {
    const r = rng.next();
    if (depth > 2 || r < 0.3) return pick([null, true, -1, 0, 1, 1e300, -0, NaN, 'x', '__proto__', '', [], {}, 3.14, Infinity]);
    if (r < 0.6) return Array.from({ length: Math.floor(rng.next() * 6) }, () => junk(depth + 1));
    const o: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) o[pick(['levelId', 'reason', 'placed', 'locked', 'coins', 'bank', 'x', '__proto__', 'constructor', 'seconds'])] = junk(depth + 1);
    return o;
  };
  const FIELDS = ['session', 'coins', 'bank', 'solved', 'history', 'playedReserve', 'quitMain', 'current', 'parked', 'settings', 'mapSeen'];

  it('never throws, never locks a wrong cell, never exceeds a cap, over 3000 hostile saves', () => {
    for (let i = 0; i < 3000; i++) {
      const raw = tamper((o) => {
        for (const f of FIELDS) if (rng.next() < 0.4) o[f] = junk(0);
        if (rng.next() < 0.3) {
          o.parked = Array.from({ length: Math.floor(rng.next() * 9) }, () => {
            const lid = pick([...catalog.mainPath, 'nope']);
            const kb = catalog.has(lid) ? catalog.board(lid) : null;
            return { levelId: lid, key: kb ? catalog.levelKey(lid) : 'x', reason: pick(['retry', 'main', 'skip']),
              placed: junk(1), locked: Array.from({ length: Math.floor(rng.next() * 3) }, () => [Math.floor(rng.next() * 9), Math.floor(rng.next() * 9)]) };
          });
        }
        // Real chapter ids too (finished or not, repeated, in long lists), so the finished check is reached.
        if (rng.next() < 0.3) o.mapSeen = Array.from({ length: Math.floor(rng.next() * 40) }, () => pick([...catalog.chapters.map((c) => c.id), 'c99', 7, '__proto__']));
        if (rng.next() < 0.3) o.solved = rng.next() < 0.5 ? [...catalog.chapters[0]!.levels] : catalog.mainPath.slice(0, Math.floor(rng.next() * 30));
        if (rng.next() < 0.3 && o.current && typeof o.current === 'object') {
          const cur = o.current as Record<string, unknown>;
          cur.levelId = pick([...catalog.mainPath, catalog.reserve[0]!.id, 'nope']);
          // Keep the fingerprint in step so the fuzz reaches the cell checks, not the early drop.
          if (catalog.has(cur.levelId as string)) cur.key = catalog.levelKey(cur.levelId as string);
          cur.locked = Array.from({ length: Math.floor(rng.next() * 4) }, () => [Math.floor(rng.next() * 9) - 1, Math.floor(rng.next() * 9) - 1]);
        }
      });
      const { data } = parseSave(raw, catalog, NOW, fresh);
      if (!data) continue;
      expect(data.coins).toBeLessThanOrEqual(MAX_COINS);
      expect(data.bank).toBeLessThanOrEqual(MAX_BANKED_HINTS);
      expect(data.history.length).toBeLessThanOrEqual(HISTORY_CAP);
      expect(data.parked.length).toBeLessThanOrEqual(MAX_PARKED);
      expect(new Set(data.parked.map((p) => p.levelId)).size).toBe(data.parked.length);
      for (const pk of data.parked) {
        expect(data.solved.has(pk.levelId)).toBe(false);
        expect(pk.levelId).not.toBe(data.current?.levelId);
        const sol = catalog.solution(pk.levelId);
        expect(pk.locked.every((c) => sol.has(c))).toBe(true);
      }
      // The map's seen chapters are always real chapters this save has finished.
      for (const c of data.mapSeen) {
        const ch = catalog.chapters.find((x) => x.id === c);
        expect(ch, `mapSeen holds unknown ${c}`).toBeDefined();
        expect(ch!.levels.every((l) => data.solved.has(l))).toBe(true);
      }
      const cur = data.current;
      if (cur) {
        const sol = catalog.solution(cur.levelId);
        expect(cur.locked.every((c) => sol.has(c))).toBe(true);
        const b = catalog.board(cur.levelId);
        expect(cur.placed.every((c) => b.kind[c] === 'path' && !cur.locked.includes(c))).toBe(true);
      }
      // A parsed save always serializes and re-parses to itself.
      expect(parseSave(serializeSave(data, catalog), catalog, NOW, fresh).data).toEqual(data);
    }
  });
});
