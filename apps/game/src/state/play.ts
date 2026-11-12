import { canPlace, evaluate, hint as nextHint } from '@firefly/core';
import type { Board, Evaluation, Hint } from '@firefly/core';

/**
 * One play of one level: the player's fireflies, this play's locked hint
 * fireflies, undo, reset, hints, the counters `level_end` reports and the
 * active-time clock. Pure (the clock is injected), so it is tested in Node.
 *
 * Rules from docs/references/rules.md: a locked hint firefly can never be
 * toggled, undone or reset away (a paid hint is never lost); undo never brings
 * back a firefly a hint removed.
 */

export interface Clock {
  /** Milliseconds, monotonic enough for durations. */
  now(): number;
}

/** Active time is capped just under the analytics schema's one-week bound. */
export const MAX_PLAY_SECONDS = 7 * 86_400 - 1;

export type TapResult = 'placed' | 'removed' | 'locked' | 'blocked';

type Op =
  | { readonly kind: 'toggle'; readonly cell: number; readonly placed: boolean }
  | { readonly kind: 'reset'; readonly cells: readonly number[] };

/** A saved play to resume (validated by `parseSave` first). */
export interface PlayStart {
  readonly placed?: Iterable<number>;
  readonly locked?: Iterable<number>;
  /** Active seconds already spent. */
  readonly seconds?: number;
  readonly placements?: number;
  readonly undos?: number;
  readonly restarts?: number;
  readonly hints?: number;
}

/** The last hint shown, for the board to draw (reason outlines, ruled-out marks). */
export type ShownHint = Exclude<Hint, { kind: 'none' }>;

export class Play {
  readonly board: Board;
  readonly solution: ReadonlySet<number>;
  private readonly clock: Clock;
  private readonly placedSet = new Set<number>();
  private readonly lockedSet = new Set<number>();
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

  constructor(board: Board, solution: ReadonlySet<number>, clock: Clock, start: PlayStart = {}) {
    this.board = board;
    this.solution = solution;
    this.clock = clock;
    for (const c of start.locked ?? []) {
      if (!solution.has(c)) throw new RangeError(`locked cell ${c} is not part of the answer`);
      this.lockedSet.add(c);
    }
    for (const c of start.placed ?? []) {
      if (!canPlace(board, c, this.lockedSet)) throw new RangeError(`cell ${c} cannot hold a player firefly`);
      this.placedSet.add(c);
    }
    this.activeMs = Math.max(0, start.seconds ?? 0) * 1000;
    this.placements = start.placements ?? 0;
    this.undos = start.undos ?? 0;
    this.restarts = start.restarts ?? 0;
    this.hints = start.hints ?? 0;
  }

  get placed(): ReadonlySet<number> {
    return this.placedSet;
  }

  get locked(): ReadonlySet<number> {
    return this.lockedSet;
  }

  get evaluation(): Evaluation {
    this.cached ??= evaluate(this.board, [...this.placedSet, ...this.lockedSet]);
    return this.cached;
  }

  get solved(): boolean {
    return this.evaluation.solved;
  }

  get canUndo(): boolean {
    return this.ops.length > 0;
  }

  tap(cell: number): TapResult {
    if (this.solved) return 'blocked';
    if (this.lockedSet.has(cell)) {
      this.shown = null;
      return 'locked';
    }
    if (!canPlace(this.board, cell, this.lockedSet)) return 'blocked';
    const placed = !this.placedSet.has(cell);
    if (placed) {
      this.placedSet.add(cell);
      this.placements++;
    } else {
      this.placedSet.delete(cell);
    }
    this.ops.push({ kind: 'toggle', cell, placed });
    this.changed();
    return placed ? 'placed' : 'removed';
  }

  /**
   * Undo the last move. Because a hint rewrites history (`forgetCell`), undo
   * can reach a solved position the player never had: callers must check
   * `solved` afterwards, as after a tap.
   */
  undo(): boolean {
    if (this.solved) return false;
    const op = this.ops.pop();
    if (!op) return false;
    if (op.kind === 'toggle') {
      if (op.placed) this.placedSet.delete(op.cell);
      else this.placedSet.add(op.cell);
    } else {
      for (const c of op.cells) this.placedSet.add(c);
    }
    this.undos++;
    this.changed();
    return true;
  }

  /** Clears the player's fireflies; locked hint fireflies stay. */
  reset(): void {
    if (this.solved || this.placedSet.size === 0) return;
    this.ops.push({ kind: 'reset', cells: [...this.placedSet] });
    this.placedSet.clear();
    this.restarts++;
    this.changed();
  }

  /** Stop drawing the last hint's outlines (a move or notice replaced it). */
  dismissHint(): void {
    this.shown = null;
  }

  /** What a hint would do now, without applying it (nothing is charged). */
  peekHint(): Hint {
    return nextHint(this.board, this.solution, [...this.placedSet, ...this.lockedSet], this.lockedSet);
  }

  /**
   * Apply the next hint. The caller charges for it first; this never fails
   * once charged unless the board is already solved (returns `none`).
   */
  applyHint(): Hint {
    const h = this.peekHint();
    if (h.kind === 'none') return h;
    if (h.kind === 'remove') {
      this.placedSet.delete(h.cell);
    } else {
      this.placedSet.delete(h.cell);
      this.lockedSet.add(h.cell);
    }
    this.forgetCell(h.cell);
    this.hints++;
    this.cached = null;
    this.shown = h;
    return h;
  }

  /** Undo history must never re-add a removed wrong firefly or touch a locked one. */
  private forgetCell(cell: number): void {
    this.ops = this.ops
      .map((op): Op | null => {
        if (op.kind === 'toggle') return op.cell === cell ? null : op;
        const cells = op.cells.filter((c) => c !== cell);
        return cells.length > 0 ? { kind: 'reset', cells } : null;
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
