import { canPlace, evaluate, hint as nextHint, ruleOutReason, TECHNIQUE_TIER } from '@firefly/core';
import type { Board, Evaluation, Hint, TechniqueId } from '@firefly/core';

/**
 * One play of one level: the player's fireflies and X marks, this play's hint
 * X marks, undo, reset, hints, the counters `level_end` reports and the
 * active-time clock. Pure (the clock is injected), so it is tested in Node.
 *
 * Rules from docs/references/rules.md: a hint never places a firefly; its X
 * marks are locked (never toggled, undone or reset away: a paid hint is never
 * lost), and undo never brings back a firefly a hint removed. A tap places or
 * lifts a firefly; holding a tile (`mark`, dragging with `paint`) places the
 * player's own X, which is free, never judged, and never read by a hint. The firefly jar holds exactly as many
 * fireflies as the answer needs: player plus locked fireflies never exceed it.
 * `locked` holds hint fireflies from saves made before hints stopped placing them.
 */

export interface Clock {
  /** Milliseconds, monotonic enough for durations. */
  now(): number;
}

/** Active time is capped just under the analytics schema's one-week bound. */
export const MAX_PLAY_SECONDS = 7 * 86_400 - 1;

/** `jar-full`: undoing would bring back more fireflies than the jar has room for; nothing changed. */
export type UndoResult = 'undone' | 'nothing' | 'jar-full';

/**
 * A tap: `placed` (empty to firefly), `removed` (firefly to empty), `cleared` (the player's X
 * to empty), `hint-x` (a hint's X: its reason again, `shown`), `locked` (an old hint firefly),
 * `jar-empty` (every firefly is out; nothing changed). A hold (`mark`): `marked` (to X; a
 * firefly there goes home first) or `cleared`.
 */
export type TapResult = 'placed' | 'removed' | 'marked' | 'cleared' | 'hint-x' | 'locked' | 'blocked' | 'jar-empty';

/** What a tile holds that the player can change. */
export type TileMark = 'empty' | 'firefly' | 'x';

type Op =
  | { readonly kind: 'tile'; readonly cell: number; readonly from: TileMark; readonly to: TileMark }
  | { readonly kind: 'reset'; readonly cells: readonly number[]; readonly marks: readonly number[] };

/**
 * Hint X marks for one reason: the tiles, and the technique and reason cells behind them (a
 * hint that crosses for several reasons adds one group each). `wrong`: the tile of a wrong
 * firefly a hint lifted. Saved this way so tapping a hint X can show its reason again; the
 * words come from the technique (`ruleOutReason`), never from the save.
 */
export interface CrossGroup {
  readonly cells: readonly number[];
  readonly technique: TechniqueId | 'wrong';
  readonly because: readonly number[];
}

/** What tapping the X on a lifted wrong firefly's tile says. */
export const WRONG_X_REASON = 'A firefly here can\u2019t be part of the answer.';

/** A saved play to resume (validated by `parseSave` first). */
export interface PlayStart {
  readonly placed?: Iterable<number>;
  readonly locked?: Iterable<number>;
  /** Hint X marks: path cells outside the answer. */
  readonly crossed?: readonly CrossGroup[];
  /** The player's own X marks: path cells holding nothing else. */
  readonly marks?: Iterable<number>;
  /** Active seconds already spent. */
  readonly seconds?: number;
  readonly placements?: number;
  readonly undos?: number;
  readonly restarts?: number;
  readonly hints?: number;
  /**
   * Hints taken on this board in earlier plays (a quit board resumed as a retry starts its own
   * counters, but its garden's free hints stay used).
   */
  readonly priorHints?: number;
}

/**
 * The last hint shown, for the board to draw (the ring round its reason cells), or a hint X
 * tapped again: `wrong-x` for the tile of a wrong firefly a hint lifted.
 */
export type ShownHint = Exclude<Hint, { kind: 'none' }> | { readonly kind: 'wrong-x'; readonly cell: number; readonly reason: string };

/** A hint group as the hint that made it, so its reason reads exactly as when it was bought. */
export function crossHint(board: Board, g: CrossGroup): ShownHint {
  if (g.technique === 'wrong') return { kind: 'wrong-x', cell: g.cells[0]!, reason: WRONG_X_REASON };
  const part = { cells: g.cells, technique: g.technique, reason: ruleOutReason(g.technique, g.cells.length, board, g.because), because: g.because };
  return { kind: 'cross', ...part, parts: [part] };
}

/** A technique id, or `wrong` (a lifted wrong firefly's tile), as a hint group may hold. */
export const isTechnique = (t: unknown): t is TechniqueId | 'wrong' => typeof t === 'string' && (t === 'wrong' || Object.hasOwn(TECHNIQUE_TIER, t));

export class Play {
  readonly board: Board;
  readonly solution: ReadonlySet<number>;
  private readonly clock: Clock;
  private readonly placedSet = new Set<number>();
  private readonly lockedSet = new Set<number>();
  private readonly crossedSet = new Set<number>();
  private readonly groups: CrossGroup[] = [];
  private readonly marksSet = new Set<number>();
  /** The position (fireflies and hint X marks) a pointing hint was last shown for. */
  private pointedAt: string | null = null;
  private ops: Op[] = [];
  private cached: Evaluation | null = null;
  private activeMs = 0;
  private runningSince: number | null = null;

  placements = 0;
  undos = 0;
  restarts = 0;
  hints = 0;
  /** The most recent hint, until the next move. */
  shown: ShownHint | null = null;

  /** The garden's tier: a hint never uses a technique harder than this (`HintOptions.maxTier`). */
  private readonly tier: number | undefined;

  constructor(board: Board, solution: ReadonlySet<number>, clock: Clock, start: PlayStart = {}, level: { readonly tier?: number } = {}) {
    this.tier = level.tier;
    this.board = board;
    this.solution = solution;
    this.clock = clock;
    for (const c of start.locked ?? []) {
      if (!solution.has(c) || board.lantern[c]) throw new RangeError(`locked cell ${c} is not a placeable answer cell`);
      this.lockedSet.add(c);
    }
    for (const g of start.crossed ?? []) {
      if (!isTechnique(g.technique)) throw new RangeError(`unknown technique ${String(g.technique)}`);
      if (g.technique === 'wrong' && g.cells.length !== 1) throw new RangeError('a wrong firefly\u2019s X is one tile');
      for (const c of g.cells) {
        if (solution.has(c) || board.kind[c] !== 'path' || this.crossedSet.has(c)) throw new RangeError(`cell ${c} cannot hold a hint X`);
        this.crossedSet.add(c);
      }
      this.groups.push({ cells: [...g.cells], technique: g.technique, because: [...g.because] });
    }
    for (const c of start.placed ?? []) {
      if (!canPlace(board, c, this.lockedSet) || this.crossedSet.has(c)) throw new RangeError(`cell ${c} cannot hold a player firefly`);
      this.placedSet.add(c);
    }
    for (const c of start.marks ?? []) {
      if (!canPlace(board, c, this.lockedSet) || this.crossedSet.has(c) || this.placedSet.has(c)) throw new RangeError(`cell ${c} cannot hold an X`);
      this.marksSet.add(c);
    }
    if (this.placedSet.size + this.lockedSet.size > this.jarSize) {
      throw new RangeError(`${this.placedSet.size + this.lockedSet.size} fireflies do not fit a jar of ${this.jarSize}`);
    }
    this.activeMs = Math.max(0, start.seconds ?? 0) * 1000;
    this.placements = start.placements ?? 0;
    this.undos = start.undos ?? 0;
    this.restarts = start.restarts ?? 0;
    this.hints = start.hints ?? 0;
    this.priorHints = Math.max(0, start.priorHints ?? 0);
  }

  /** Hints taken on this board in earlier plays (see `PlayStart.priorHints`). */
  readonly priorHints: number;

  /** Every hint this garden's board has taken, this play and earlier ones: what the free allowance counts. */
  get boardHints(): number {
    return this.priorHints + this.hints;
  }

  get placed(): ReadonlySet<number> {
    return this.placedSet;
  }

  get locked(): ReadonlySet<number> {
    return this.lockedSet;
  }

  /** Every hint X on the board. */
  get crossed(): ReadonlySet<number> {
    return this.crossedSet;
  }

  /** The hint X marks by hint, oldest first (saved, and for showing a reason again). */
  get crossGroups(): readonly CrossGroup[] {
    return this.groups;
  }

  /** The player's own X marks. */
  get marks(): ReadonlySet<number> {
    return this.marksSet;
  }

  /** What a tile holds that the player can change. */
  markOf(cell: number): TileMark {
    return this.placedSet.has(cell) ? 'firefly' : this.marksSet.has(cell) ? 'x' : 'empty';
  }

  get evaluation(): Evaluation {
    this.cached ??= evaluate(this.board, [...this.placedSet, ...this.lockedSet]);
    return this.cached;
  }

  get solved(): boolean {
    return this.evaluation.solved;
  }

  /**
   * The jar's size: fireflies the player places to finish (the answer's count minus
   * its lanterns, which are already on the board and never in the jar).
   */
  get jarSize(): number {
    let lanterns = 0;
    for (const l of this.board.lanterns) if (this.solution.has(l)) lanterns++;
    return this.solution.size - lanterns;
  }

  /** Fireflies still in the jar. */
  get remaining(): number {
    return Math.max(0, this.jarSize - this.placedSet.size - this.lockedSet.size);
  }

  get canUndo(): boolean {
    return this.ops.length > 0;
  }

  /** A tap: place or lift a firefly, or clear the player's own X. A hint's X shows its reason again. */
  tap(cell: number): TapResult {
    if (this.solved) return 'blocked';
    if (this.lockedSet.has(cell)) {
      this.shown = null;
      return 'locked';
    }
    if (this.crossedSet.has(cell)) {
      const g = this.groups.find((x) => x.cells.includes(cell));
      this.shown = g ? crossHint(this.board, g) : null;
      return 'hint-x';
    }
    if (!canPlace(this.board, cell, this.lockedSet)) return 'blocked';
    const from = this.markOf(cell);
    if (from === 'empty' && this.remaining === 0) {
      this.shown = null;
      return 'jar-empty';
    }
    const to: TileMark = from === 'empty' ? 'firefly' : 'empty';
    this.move(cell, from, to);
    return to === 'firefly' ? 'placed' : from === 'firefly' ? 'removed' : 'cleared';
  }

  /**
   * A hold: toggle the player's own X (a firefly there goes home and leaves the X). Hint X
   * marks and old hint fireflies answer as a tap does.
   */
  mark(cell: number): TapResult {
    if (this.solved) return 'blocked';
    if (this.lockedSet.has(cell) || this.crossedSet.has(cell)) return this.tap(cell);
    if (!canPlace(this.board, cell, this.lockedSet)) return 'blocked';
    const from = this.markOf(cell);
    const to: TileMark = from === 'x' ? 'empty' : 'x';
    this.move(cell, from, to);
    return to === 'x' ? 'marked' : 'cleared';
  }

  /**
   * Dragging on after a hold: set (`on`) or clear the player's X on one more tile, as the hold
   * did on the first. Tiles holding a firefly or any hint's mark are passed over. True if it changed.
   */
  paint(cell: number, on: boolean): boolean {
    if (this.solved || this.lockedSet.has(cell) || this.crossedSet.has(cell) || !canPlace(this.board, cell, this.lockedSet)) return false;
    const from = this.markOf(cell);
    if (from === 'firefly' || (from === 'x') === on) return false;
    this.move(cell, from, on ? 'x' : 'empty');
    return true;
  }

  private move(cell: number, from: TileMark, to: TileMark): void {
    this.setMark(cell, to);
    if (to === 'firefly') this.placements++;
    this.ops.push({ kind: 'tile', cell, from, to });
    this.changed();
  }

  private setMark(cell: number, to: TileMark): void {
    this.placedSet.delete(cell);
    this.marksSet.delete(cell);
    if (to === 'firefly') this.placedSet.add(cell);
    else if (to === 'x') this.marksSet.add(cell);
  }

  /**
   * Undo the last move (X marks included). Because a hint rewrites history (`forget`),
   * undo can reach a solved position the player never had: callers must check
   * `solved` afterwards, as after a tap.
   */
  undo(): UndoResult {
    if (this.solved) return 'nothing';
    const op = this.ops.at(-1);
    if (!op) return 'nothing';
    // Bringing fireflies back can't overfill the jar (a hint may have used a slot since).
    // Refuse instead of restoring part of it: the step stays, so it can be undone once
    // the player frees room, and nothing changes behind their back.
    const returning = op.kind === 'tile' ? (op.from === 'firefly' ? 1 : 0) : op.cells.length;
    if (returning > this.remaining) return 'jar-full';
    this.ops.pop();
    if (op.kind === 'tile') {
      this.setMark(op.cell, op.from);
    } else {
      for (const c of op.cells) this.placedSet.add(c);
      for (const c of op.marks) this.marksSet.add(c);
    }
    this.undos++;
    this.changed();
    return 'undone';
  }

  /** Clears the player's fireflies and X marks; hint X marks (and old hint fireflies) stay. */
  reset(): void {
    if (this.solved || (this.placedSet.size === 0 && this.marksSet.size === 0)) return;
    this.ops.push({ kind: 'reset', cells: [...this.placedSet], marks: [...this.marksSet] });
    this.placedSet.clear();
    this.marksSet.clear();
    this.restarts++;
    this.changed();
  }

  /** Stop drawing the last hint's outlines (a move or notice replaced it). */
  dismissHint(): void {
    this.shown = null;
  }

  /** What a hint would do now, without applying it (nothing is charged). The player's X marks are never read. */
  peekHint(): Hint {
    return nextHint(this.board, this.solution, [...this.placedSet, ...this.lockedSet], this.lockedSet, this.crossedSet,
      this.tier === undefined ? {} : { maxTier: this.tier });
  }

  /**
   * True when `h` points exactly where the last pointing hint did, on the same position:
   * asking again shows it again (`reshow`), free, since nothing new would be learned.
   */
  repeatsPoint(h: Hint): boolean {
    return h.kind === 'point' && this.pointedAt === this.positionKey();
  }

  /** Show a repeated pointing hint again, uncharged. */
  reshow(h: ShownHint): void {
    this.shown = h;
  }

  /**
   * Apply the next hint. The caller charges for it first; this never fails
   * once charged unless the board is already solved (returns `none`). A hint never
   * places a firefly: it removes a wrong one, crosses tiles out, or points.
   */
  applyHint(): Hint {
    const h = this.peekHint();
    if (h.kind === 'none') return h;
    if (h.kind === 'remove') {
      // The wrong firefly goes home, and its tile gets a hint X: it can never hold one.
      this.placedSet.delete(h.cell);
      this.crossedSet.add(h.cell);
      this.groups.push({ cells: [h.cell], technique: 'wrong', because: [] });
      this.forget([h.cell]);
    } else if (h.kind === 'cross') {
      for (const c of h.cells) {
        // A player's X on the same tile becomes the hint's (locked) one.
        this.marksSet.delete(c);
        this.crossedSet.add(c);
      }
      for (const p of h.parts) this.groups.push({ cells: [...p.cells], technique: p.technique, because: [...p.because] });
      this.forget(h.cells);
    }
    this.hints++;
    this.cached = null;
    this.shown = h;
    this.pointedAt = h.kind === 'point' ? this.positionKey() : null;
    return h;
  }

  /** The position a hint reads: fireflies and hint X marks (never the player's X marks). */
  private positionKey(): string {
    const sorted = (s: Iterable<number>) => [...s].sort((a, b) => a - b).join(',');
    return `${sorted([...this.placedSet, ...this.lockedSet])}|${sorted(this.crossedSet)}`;
  }

  /** Undo history must never re-add a removed wrong firefly or put anything on a hint's tile. */
  private forget(cells: readonly number[]): void {
    const gone = new Set(cells);
    this.ops = this.ops
      .map((op): Op | null => {
        if (op.kind === 'tile') return gone.has(op.cell) ? null : op;
        const kept = op.cells.filter((c) => !gone.has(c));
        const marks = op.marks.filter((c) => !gone.has(c));
        return kept.length + marks.length > 0 ? { kind: 'reset', cells: kept, marks } : null;
      })
      .filter((op): op is Op => op !== null);
  }

  private changed(): void {
    this.cached = null;
    this.shown = null;
  }

  // Active time: paused while the tab is hidden, a menu or an ad is up.

  resume(): void {
    this.runningSince ??= this.clock.now();
  }

  pause(): void {
    if (this.runningSince === null) return;
    this.activeMs += Math.max(0, this.clock.now() - this.runningSince);
    this.runningSince = null;
  }

  get running(): boolean {
    return this.runningSince !== null;
  }

  /** Active seconds so far, whole and never negative. */
  get seconds(): number {
    const live = this.runningSince === null ? 0 : Math.max(0, this.clock.now() - this.runningSince);
    return Math.min(MAX_PLAY_SECONDS, Math.floor((this.activeMs + live) / 1000));
  }
}
