import { cellCoord, cellIndex, canPlace } from '@firefly/core';
import type { Coord, NextReason, PlayRecord } from '@firefly/core';
import type { Catalog } from './catalog.ts';
import { HISTORY_CAP } from './session.ts';
import { MAX_BANKED_HINTS, MAX_COINS } from './wallet.ts';

export { MAX_COINS };

/**
 * Saved progress: one versioned JSON document under one storage key.
 *
 * Everything read back is untrusted (a corrupt, stale or hand-edited save),
 * so `parseSave` validates field by field, per docs/references/rules.md
 * ("Hints", "Saved progress"): unknown levels and reasons are dropped,
 * numbers must be finite and in range, timestamps not in the future, a locked
 * hint cell must be a cell of that level's unique answer, player cells must be
 * path cells, and the coin balance and hint bank are capped. A bad field falls
 * back to a safe default on its own; a wholly unreadable save starts fresh.
 * It never throws. Cells are stored as canonical [row, col], so the board's
 * on-screen rotation never reaches a save.
 */

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'progress';
/** A save larger than this is not ours (ours is a few KB): start fresh rather than parse it. */
export const MAX_SAVE_CHARS = 256_000;
/** Quit boards kept for their retry (oldest dropped first). */
export const MAX_PARKED = 5;
/** Sessions counter cap: below the event schema's count bound even after the next launch adds one. */
const MAX_SESSIONS = 1e9 - 2;

export type MotionSetting = 'device' | 'on' | 'off';

export interface Settings {
  readonly sound: boolean;
  readonly motion: MotionSetting;
}

export const DEFAULT_SETTINGS: Settings = { sound: true, motion: 'device' };

/** The level on the board when the game was closed. */
export interface CurrentPlay {
  readonly levelId: string;
  /** `catalog.levelKey` when saved: a mismatch means the level changed, so the board is dropped. */
  readonly key: string;
  readonly reason: NextReason;
  readonly placed: readonly number[];
  readonly locked: readonly number[];
  readonly seconds: number;
  readonly placements: number;
  readonly undos: number;
  readonly restarts: number;
  readonly hints: number;
}

export interface SaveData {
  /** Random hex id from first launch (analytics only; never tied to a person). */
  readonly install: string;
  /** Sittings so far, for analytics. */
  readonly session: number;
  readonly coins: number;
  readonly bank: number;
  readonly solved: ReadonlySet<string>;
  readonly history: readonly PlayRecord[];
  readonly playedReserve: ReadonlySet<string>;
  readonly quitMain: ReadonlySet<string>;
  readonly current: CurrentPlay | null;
  /**
   * Boards of levels the player left unsolved (a quit), kept so the retry resumes them.
   * Same validation as `current`; never the current level or a solved one.
   */
  readonly parked: readonly CurrentPlay[];
  readonly settings: Settings;
  /**
   * Chapters the garden map has already shown finished (its unlock flight played). Only known
   * chapters whose every level is solved; anything else is dropped.
   */
  readonly mapSeen: ReadonlySet<string>;
}

export interface ParsedSave {
  /** null when there was no save, or nothing in it was usable: start fresh. */
  readonly data: SaveData | null;
  /**
   * A save from a different (likely newer) build. The caller keeps a backup of
   * the raw text before starting fresh, so a rollback never destroys progress.
   */
  readonly unknownVersion?: boolean;
  /** What was dropped or reset, for the dev console and tests. */
  readonly problems: readonly string[];
}

const REASONS: ReadonlySet<string> = new Set<NextReason>([
  'main', 'retry', 'warm-up', 'breather-after-quit', 'breather-after-long', 'breather-after-hints',
]);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const isSeconds = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 7 * 86_400;
/** Same shape `validateEvent` accepts for an install id. */
export const isInstallId = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f-]{16,64}$/i.test(v) && (v.match(/[0-9a-f]/gi) ?? []).length >= 16;
/** Own property only: a key like "__proto__" must never read through to Object.prototype. */
const own = (o: Record<string, unknown>, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);

function idSet(v: unknown, allowed: ReadonlySet<string> | ((id: string) => boolean), cap: number, name: string, problems: string[]): Set<string> {
  const out = new Set<string>();
  if (v === undefined) return out;
  if (!Array.isArray(v)) {
    problems.push(`${name} is not a list`);
    return out;
  }
  const ok = typeof allowed === 'function' ? allowed : (id: string) => allowed.has(id);
  let dropped = 0;
  for (const id of v.slice(0, cap * 2)) {
    if (typeof id === 'string' && ok(id) && out.size < cap) out.add(id);
    else dropped++;
  }
  if (dropped > 0 || v.length > cap * 2) problems.push(`${name}: dropped ${dropped + Math.max(0, v.length - cap * 2)} entries`);
  return out;
}

function parseHistory(v: unknown, catalog: Catalog, now: number, problems: string[]): PlayRecord[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    problems.push('history is not a list');
    return [];
  }
  const out: PlayRecord[] = [];
  let dropped = 0;
  for (const raw of v.slice(-HISTORY_CAP)) {
    if (!isObject(raw)) {
      dropped++;
      continue;
    }
    const levelId = own(raw, 'levelId'), reason = own(raw, 'reason'), solved = own(raw, 'solved');
    const seconds = own(raw, 'seconds'), hints = own(raw, 'hints'), endedAt = own(raw, 'endedAt');
    if (typeof levelId !== 'string' || !catalog.has(levelId) || typeof reason !== 'string' || !REASONS.has(reason)
      || typeof solved !== 'boolean' || !isSeconds(seconds) || !isCount(hints, 10_000)
      || typeof endedAt !== 'number' || !Number.isFinite(endedAt) || endedAt < 0 || endedAt > now) {
      dropped++;
      continue;
    }
    out.push({ levelId, reason: reason as NextReason, solved, seconds, hints, endedAt });
  }
  if (dropped > 0) problems.push(`history: dropped ${dropped} records`);
  return out;
}

function parseCells(v: unknown, w: number, h: number): Coord[] | null {
  if (!Array.isArray(v) || v.length > w * h) return null;
  const out: Coord[] = [];
  for (const p of v) {
    if (!Array.isArray(p) || p.length !== 2 || !isCount(p[0], h - 1) || !isCount(p[1], w - 1)) return null;
    out.push([p[0], p[1]]);
  }
  return out;
}

function parseCurrent(v: unknown, catalog: Catalog, problems: string[]): CurrentPlay | null {
  if (v === undefined || v === null) return null;
  if (!isObject(v)) {
    problems.push('current is not an object');
    return null;
  }
  const levelId = own(v, 'levelId'), reason = own(v, 'reason');
  if (typeof levelId !== 'string' || !catalog.has(levelId) || typeof reason !== 'string' || !REASONS.has(reason)) {
    problems.push('current: unknown level or reason');
    return null;
  }
  const key = own(v, 'key');
  if (key !== catalog.levelKey(levelId)) {
    problems.push('current: the level changed since this save (or the save predates fingerprints); dropped');
    return null;
  }
  const board = catalog.board(levelId);
  const solution = catalog.solution(levelId);

  // Locked hint cells: each must be part of the unique answer, or the whole set is dropped
  // (a corrupt save must never lock a wrong cell; dropping only loses a paid hint's marker).
  let locked: number[] = [];
  const lockedCoords = parseCells(own(v, 'locked') ?? [], board.w, board.h);
  if (lockedCoords) {
    const cells = [...new Set(lockedCoords.map((c) => cellIndex(board, c)))];
    // A lantern is part of the answer but is never a hint firefly (it would also steal a jar slot).
    if (cells.every((c) => solution.has(c) && !board.lantern[c])) locked = cells;
    else problems.push('current.locked: a cell is not a placeable answer cell; dropped');
  } else problems.push('current.locked is malformed; dropped');

  // Player fireflies: path cells, not lanterns, not locked; otherwise the whole set is dropped.
  let placed: number[] = [];
  const lockedSet = new Set(locked);
  const placedCoords = parseCells(own(v, 'placed') ?? [], board.w, board.h);
  if (placedCoords) {
    const cells = [...new Set(placedCoords.map((c) => cellIndex(board, c)))];
    const lanterns = board.lanterns.filter((l) => solution.has(l)).length;
    const jarSize = solution.size - lanterns;
    if (!cells.every((c) => canPlace(board, c, lockedSet))) problems.push('current.placed: a cell cannot hold a firefly; dropped');
    else if (cells.length + locked.length > jarSize) problems.push('current.placed: more fireflies than the jar holds; dropped');
    else placed = cells;
  } else problems.push('current.placed is malformed; dropped');

  const count = (k: string) => {
    const n = own(v, k);
    if (isCount(n, 100_000)) return n;
    if (n !== undefined) problems.push(`current.${k} is not a count; reset`);
    return 0;
  };
  const seconds = own(v, 'seconds');
  return {
    levelId, key, reason: reason as NextReason, placed, locked,
    seconds: isSeconds(seconds) ? Math.floor(seconds) : 0,
    placements: count('placements'), undos: count('undos'), restarts: count('restarts'), hints: count('hints'),
  };
}

function parseSettings(v: unknown, problems: string[]): Settings {
  if (v === undefined) return DEFAULT_SETTINGS;
  if (!isObject(v)) {
    problems.push('settings is not an object');
    return DEFAULT_SETTINGS;
  }
  const sound = own(v, 'sound'), motion = own(v, 'motion');
  return {
    sound: typeof sound === 'boolean' ? sound : DEFAULT_SETTINGS.sound,
    motion: motion === 'device' || motion === 'on' || motion === 'off' ? motion : DEFAULT_SETTINGS.motion,
  };
}

/**
 * Read a save. `raw` is whatever storage returned (untrusted). `freshId` makes
 * a new install id when the stored one is malformed: progress is kept, only
 * the analytics identity starts over.
 */
export function parseSave(raw: string | null, catalog: Catalog, now: number, freshId: () => string): ParsedSave {
  if (raw === null || raw === '') return { data: null, problems: [] };
  if (raw.length > MAX_SAVE_CHARS) return { data: null, problems: [`save is ${raw.length} characters, over the ${MAX_SAVE_CHARS} limit`] };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    // Unreadable is a valid outcome for untrusted input: report it and start fresh.
    return { data: null, problems: ['save is not valid JSON'] };
  }
  if (!isObject(json)) return { data: null, problems: ['save is not an object'] };
  if (own(json, 'v') !== SAVE_VERSION) return { data: null, unknownVersion: true, problems: [`unknown save version ${String(own(json, 'v')).slice(0, 20)}`] };
  const problems: string[] = [];

  const storedInstall = own(json, 'install');
  const install = isInstallId(storedInstall) ? storedInstall : freshId();
  if (install !== storedInstall) problems.push('install id is malformed; a new one was made');

  const session = own(json, 'session');
  const coins = own(json, 'coins');
  const bank = own(json, 'bank');
  if (!isCount(session, MAX_SESSIONS)) problems.push('session is not a count; reset');
  if (!isCount(coins, MAX_COINS)) problems.push('coins out of range; reset');
  if (!isCount(bank, MAX_BANKED_HINTS)) problems.push('bank out of range; reset');

  const solved = idSet(own(json, 'solved'), (id) => catalog.has(id), catalog.levels.size, 'solved', problems);
  const data: SaveData = {
    install,
    session: isCount(session, MAX_SESSIONS) ? session : 0,
    // A broken balance resets to zero, never to a grant.
    coins: isCount(coins, MAX_COINS) ? coins : 0,
    bank: isCount(bank, MAX_BANKED_HINTS) ? bank : 0,
    solved,
    history: parseHistory(own(json, 'history'), catalog, now, problems),
    playedReserve: idSet(own(json, 'playedReserve'), catalog.reserveIds, catalog.reserveIds.size, 'playedReserve', problems),
    quitMain: idSet(own(json, 'quitMain'), catalog.mainIds, catalog.mainIds.size, 'quitMain', problems),
    current: parseCurrent(own(json, 'current'), catalog, problems),
    parked: [],
    settings: parseSettings(own(json, 'settings'), problems),
    mapSeen: parseMapSeen(own(json, 'mapSeen'), catalog, solved, problems),
  };
  const rawParked = own(json, 'parked');
  if (rawParked !== undefined) {
    if (!Array.isArray(rawParked)) problems.push('parked is not a list');
    else {
      // Newest wins: walk from the end, keep the first copy of each level, then restore order.
      const seen = new Set<string>(data.current ? [data.current.levelId] : []);
      const parked: CurrentPlay[] = [];
      for (const raw of rawParked.slice(-MAX_PARKED).reverse()) {
        const p = parseCurrent(raw, catalog, problems);
        if (!p || seen.has(p.levelId) || data.solved.has(p.levelId)) continue;
        seen.add(p.levelId);
        parked.push(p);
      }
      return { data: { ...data, parked: parked.reverse() }, problems };
    }
  }
  return { data, problems };
}

/** Chapters the map has shown finished: known chapter ids only, each finished by this save's own solved set. */
function parseMapSeen(v: unknown, catalog: Catalog, solved: ReadonlySet<string>, problems: string[]): Set<string> {
  const known = new Set(catalog.chapters.map((c) => c.id));
  const seen = idSet(v, known, known.size, 'mapSeen', problems);
  for (const c of catalog.chapters) {
    if (seen.has(c.id) && !c.levels.every((l) => solved.has(l))) {
      seen.delete(c.id);
      problems.push(`mapSeen: ${c.id} is not finished; dropped`);
    }
  }
  return seen;
}

/** Serialize a save. Only schema fields are written, so nothing else can ride along. */
export function serializeSave(d: SaveData, catalog: Catalog): string {
  const cur = d.current;
  const coords = (cells: readonly number[], id: string) => {
    const b = catalog.board(id);
    return cells.map((c) => cellCoord(b, c));
  };
  const play = (p: CurrentPlay) => ({
    levelId: p.levelId, key: p.key, reason: p.reason,
    placed: coords(p.placed, p.levelId), locked: coords(p.locked, p.levelId),
    seconds: p.seconds, placements: p.placements, undos: p.undos, restarts: p.restarts, hints: p.hints,
  });
  return JSON.stringify({
    v: SAVE_VERSION,
    install: d.install,
    session: d.session,
    coins: d.coins,
    bank: d.bank,
    solved: [...d.solved],
    history: d.history.slice(-HISTORY_CAP).map((h) => ({
      levelId: h.levelId, reason: h.reason, solved: h.solved, seconds: h.seconds, hints: h.hints, endedAt: h.endedAt,
    })),
    playedReserve: [...d.playedReserve],
    quitMain: [...d.quitMain],
    current: cur && play(cur),
    parked: d.parked.slice(-MAX_PARKED).map(play),
    settings: { sound: d.settings.sound, motion: d.settings.motion },
    mapSeen: [...d.mapSeen],
  });
}

/** A fresh random install id: 32 hex characters from a caller-supplied random source. */
export function newInstallId(randomBytes: (n: number) => Uint8Array): string {
  return [...randomBytes(16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
