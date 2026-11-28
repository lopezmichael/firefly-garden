import type { Board } from './board.ts';
import { grade, type Grade, type Step, type TechniqueId } from './grader.ts';
import { evaluate } from './rules.ts';

/**
 * Hints: the grader's next steps on the player's current board. A hint never
 * places a firefly (docs/references/rules.md, "Hints"). It removes one wrong
 * firefly (the game leaves a hint X on its tile), crosses out tiles that can't
 * hold one (as many as the board's size allows, `hintCap`), or, when nothing can
 * be ruled out, points at the bush or tile the next deduction is about, always
 * with a one-line reason per X. It
 * is the same grader that rated the level, so a hint is always a move a person
 * could have found. Like the level's rating, it grades with the firefly count
 * known (the game shows it in the firefly jar), so count deductions can feed a hint.
 */
export type Hint =
  /** A player firefly that is not part of the answer (its tile then gets a hint X: it can never hold one). */
  | { readonly kind: 'remove'; readonly cell: number; readonly reason: string }
  /**
   * Tiles that can't hold a firefly: every tile the grader can rule out from the board as
   * the player sees it, simplest technique first, up to the board's cap (`hintCap`) and
   * never with a technique harder than the garden needs (`HintOptions.maxTier`). Every
   * cell gets a hint X. `parts` splits them by reason (one technique and reason cells
   * each, in order); the lead part's `technique`, `reason` and `because` (the ring) are
   * repeated at the top for the status card. Tapping any X shows its own part's reason.
   */
  | {
      readonly kind: 'cross';
      readonly cells: readonly number[];
      readonly parts: readonly CrossPart[];
      readonly technique: TechniqueId;
      readonly reason: string;
      readonly because: readonly number[];
    }
  /**
   * The next deduction places a firefly and nothing is left to rule out first,
   * or the grader is stuck (`technique` null): the hint rings `because` (the
   * bush or dark tile the step is about) and says what to look for. `target` is
   * the cell the step decides, for analytics only: it is never shown.
   */
  | {
      readonly kind: 'point';
      readonly technique: TechniqueId | null;
      readonly reason: string;
      readonly because: readonly number[];
      readonly target: number;
    }
  /** Already solved: nothing to hint. */
  | { readonly kind: 'none' };

/** One reason's share of a crossing hint: its tiles, technique, words and reason cells. */
export interface CrossPart {
  readonly cells: readonly number[];
  readonly technique: TechniqueId;
  readonly reason: string;
  readonly because: readonly number[];
}

/** The most tiles any hint crosses out (the largest boards' cap); saves are checked against it. */
export const HINT_CROSS_MAX = 6;

/**
 * How many tiles one hint may cross out on this board: bigger gardens get bigger hints, so
 * one hint takes about the same share of any board and never clears half of one. By the
 * board's area: up to 5×5, 3; up to 7×7, 4; larger, `HINT_CROSS_MAX`.
 */
export function hintCap(board: Board): number {
  const area = board.w * board.h;
  return area <= 25 ? 3 : area <= 49 ? 4 : HINT_CROSS_MAX;
}

export interface HintOptions {
  /** Tiles one hint may cross out. Default: `hintCap(board)`. */
  readonly cap?: number;
  /**
   * The garden's own tier (its rating): a crossing hint never uses a technique harder than
   * this, unless the next step from here is itself harder (then up to that step's tier).
   * Default: no limit.
   */
  readonly maxTier?: number;
}

/**
 * What to look for when a hint points (the next deduction places a firefly).
 * Each is said about the ringed bush or tile; the firefly itself is left to the player.
 */
export const HINT_REASONS: Readonly<Record<TechniqueId, string>> = {
  'T1-needs-all': 'This bush needs a firefly in every open spot around it.',
  'T1-satisfied': 'This bush already has all its fireflies.',
  'T2-one-source': 'This dark tile can only be lit from one spot. Which?',
  'T2-bush-room': 'Every way to fit this bush’s fireflies shares a spot. Which?',
  'T3-overlap': 'These two bushes share neighbors. Together they pin down a spot.',
  'T4-lookahead': 'One of these tiles needs a firefly. Try leaving each one empty.',
  'T5-trial': 'One of these tiles needs a firefly. Follow each a few moves ahead.',
  'T1-count-complete': 'Every firefly is already placed.',
  'T3-count-bound': 'The dark tiles and bushes still waiting use up every firefly left.',
};

/**
 * Why crossed tiles can't hold a firefly, per technique. `{tiles}` becomes
 * "this tile" or "these tiles". `T1-needs-all` and `T2-one-source` only ever
 * place, so their lines are never shown; they exist so every technique has one.
 */
export const RULE_OUT_REASONS: Readonly<Record<TechniqueId, string>> = {
  'T1-satisfied': 'This bush already has all its fireflies, so no more go around it.',
  'T1-count-complete': 'Every firefly is already out, so none go on {tiles}.',
  'T2-bush-room': 'However this bush’s fireflies fit, they never use {tiles}.',
  'T3-overlap': 'Together these two bushes’ numbers leave no firefly for {tiles}.',
  'T3-count-bound': 'The bushes and dark tiles still waiting use up every firefly left.',
  'T4-lookahead': 'A firefly here runs into trouble one move later.',
  'T5-trial': 'A firefly here leads to a dead end a few moves later.',
  'T1-needs-all': 'This bush needs its open spots, so {tiles} can’t hold one.',
  'T2-one-source': 'That dark tile is lit from elsewhere, so {tiles} can’t hold one.',
};

/** A satisfied bush that wants none: "already has all its fireflies" would read oddly. */
export const ZERO_BUSH_REASON = 'This bush wants no fireflies, so none go around it.';

/**
 * The reason a group of `count` crossed tiles shows. `board` and `because` let a bush
 * that wants none say so (`ZERO_BUSH_REASON`).
 */
export function ruleOutReason(technique: TechniqueId, count: number, board?: Board, because?: readonly number[]): string {
  const bush = because?.[0];
  if (technique === 'T1-satisfied' && board && bush !== undefined && board.clue[bush] === 0) return ZERO_BUSH_REASON;
  return RULE_OUT_REASONS[technique].replace('{tiles}', count === 1 ? 'this tile' : 'these tiles');
}

export const REMOVE_REASONS = {
  conflict: 'This firefly can see another one.',
  overfull: 'This firefly gives a bush too many.',
  wrong: 'This firefly can\'t be part of the answer.',
} as const;

/** The grader is stuck from here (never seen on a shipped level): point near a missing answer firefly. */
export const STUCK_REASONS = {
  bush: 'A firefly belongs somewhere around this bush.',
  row: 'A firefly belongs somewhere along these tiles.',
} as const;

/**
 * The next hint for a position.
 *
 * - `solution`: every firefly cell of the level's unique answer (lanterns included).
 * - `placed`: the player's fireflies (may include locked cells; lanterns are ignored).
 *   Untrusted when it comes from saved progress: validate it before calling
 *   (integers in 0..w*h-1 on path cells, no repeats, at most w*h); on failure
 *   drop the level's placed set and keep only valid locked cells.
 * - `locked`: hint fireflies from older builds (hints placed fireflies before
 *   2026-11-28). Each must be a solution cell; one outside it is a caller bug and throws.
 * - `crossed`: the hint X marks already on the board. Each must be a path cell
 *   outside the solution (saved progress is validated against that); one inside
 *   it is a caller bug and throws. Never pass the player's own X marks: they may
 *   be wrong, and the grader must only build on what is certain.
 *
 * Wrong fireflies go first, conflicting ones before ones that overfill a bush,
 * then any other, lowest cell first so hints are deterministic.
 */
export function hint(
  board: Board,
  solution: Iterable<number>,
  placed: Iterable<number>,
  locked: ReadonlySet<number> = new Set(),
  crossed: Iterable<number> = [],
  options: HintOptions = {},
): Hint {
  const answer = new Set(solution);
  const on = new Set<number>();
  for (const c of placed) if (!board.lantern[c]) on.add(c);
  for (const c of locked) {
    if (!answer.has(c)) throw new RangeError(`locked cell ${c} is not part of the solution`);
    on.add(c);
  }
  const known = new Set<number>();
  for (const c of crossed) {
    if (answer.has(c) || board.kind[c] !== 'path') throw new RangeError(`crossed cell ${c} is not a non-answer path cell`);
    known.add(c);
  }

  const ev = evaluate(board, on);
  const wrong = [...on].filter((c) => !answer.has(c)).sort((a, b) => a - b);
  if (wrong.length > 0) {
    const conflicts = new Set(ev.conflicts);
    const conflicting = wrong.find((c) => conflicts.has(c));
    if (conflicting !== undefined) return { kind: 'remove', cell: conflicting, reason: REMOVE_REASONS.conflict };
    const crowded = new Set(ev.bushes.filter((b) => b.state === 'over').flatMap((b) => board.around[b.cell]!));
    const overfilling = wrong.find((c) => crowded.has(c));
    if (overfilling !== undefined) return { kind: 'remove', cell: overfilling, reason: REMOVE_REASONS.overfull };
    return { kind: 'remove', cell: wrong[0]!, reason: REMOVE_REASONS.wrong };
  }
  if (ev.solved) return { kind: 'none' };

  // Every firefly on the board is part of the answer and every hint X is outside it, so
  // the grader's deductions from here are sound. The player sees the firefly count, so
  // the grader uses it too (lanterns are in `answer`, as in the level's rating).
  const from = { start: on, startEmpty: known, knownCount: answer.size };
  const steps = grade(board, { ...from, stopAtFirefly: true }).steps;
  const first = steps[0];
  // Cross out before pointing: everything that can be ruled out now, simplest first, never
  // harder than the garden (or than the next step, if that is harder still).
  const limit = Math.max(first?.tier ?? 0, options.maxTier ?? Infinity);
  const empties = grade(board, { ...from, emptyOnly: true, maxSteps: options.cap ?? hintCap(board) }).steps;
  const usable: Step[] = [];
  for (const st of empties) {
    if (st.tier > limit) break;
    if (!answer.has(st.cell)) usable.push(st); // defense in depth: never cross an answer cell
  }
  if (usable.length > 0) {
    const parts = crossParts(board, usable);
    const lead = parts[0]!;
    return { kind: 'cross', cells: usable.map((st) => st.cell), parts, technique: lead.technique, reason: lead.reason, because: lead.because };
  }
  if (first && first.value === 'firefly' && answer.has(first.cell)) {
    // A tile boxed in on all sides (no rays) can only light itself: ringing it gives nothing away.
    const own = board.rays[first.cell]!.length > 0
      && (first.because.length === 0 || (first.because.length === 1 && first.because[0] === first.cell));
    if (!own) return { kind: 'point', technique: first.technique, reason: HINT_REASONS[first.technique], because: [...first.because], target: first.cell };
    // The step's reason is the firefly's own tile (lookahead, or a dark tile that only it can
    // light): ringing it alone would all but place the firefly, so ring its row and column.
    const because = [first.cell, ...board.rays[first.cell]!].sort((a, b) => a - b);
    const reason = first.technique === 'T4-lookahead' || first.technique === 'T5-trial' ? HINT_REASONS[first.technique] : STUCK_REASONS.row;
    return { kind: 'point', technique: first.technique, reason, because, target: first.cell };
  }
  return stuckPoint(board, answer, on);
}

/** Split crossed steps into runs that share a technique and reason cells, each with its words. */
function crossParts(board: Board, steps: readonly Step[]): CrossPart[] {
  const runs: Step[][] = [];
  for (const st of steps) {
    const last = runs.at(-1);
    const prev = last?.[0];
    if (last && prev && prev.technique === st.technique && prev.because.join(',') === st.because.join(',')) last.push(st);
    else runs.push([st]);
  }
  return runs.map((run) => {
    const { technique, because } = run[0]!;
    return { cells: run.map((st) => st.cell), technique, reason: ruleOutReason(technique, run.length, board, because), because: [...because] };
  });
}

/**
 * The grader has nothing from this position (no shipped level does this; the property test
 * checks). A paid hint still helps: ring a numbered bush next to the lowest missing answer
 * firefly, else the run of tiles along its row (never the firefly's tile alone).
 */
function stuckPoint(board: Board, answer: ReadonlySet<number>, on: ReadonlySet<number>): Hint {
  const target = [...answer].filter((c) => !on.has(c) && !board.lantern[c]).sort((a, b) => a - b)[0];
  if (target === undefined) return { kind: 'none' }; // unreachable: all answer cells on and nothing wrong is solved
  const bush = board.numbered.find((b) => board.around[b]!.includes(target));
  if (bush !== undefined) return { kind: 'point', technique: null, reason: STUCK_REASONS.bush, because: [bush], target };
  const row = Math.floor(target / board.w);
  const run = [target, ...board.rays[target]!.filter((c) => Math.floor(c / board.w) === row)].sort((a, b) => a - b);
  return { kind: 'point', technique: null, reason: STUCK_REASONS.row, because: run, target };
}

/**
 * The cell a hint is about, for analytics: the removed firefly, the first crossed
 * tile, or the (unshown) cell a pointing hint's step decides.
 */
export function hintCell(h: Exclude<Hint, { kind: 'none' }>): number {
  return h.kind === 'cross' ? h.cells[0]! : h.kind === 'point' ? h.target : h.cell;
}

/**
 * For analytics (`hint.step`): the index, in the level's full grader trace
 * from an empty board, of the step that decides `cell`, so Phase 4 can tie
 * each hint to a technique. Pass `gradeLevel(level, board)` (computed once per
 * level), the same count-aware trace the level was rated with, and `hintCell(h)`.
 * A cell no step decides (a lantern, a tile a firefly lights, or past where the
 * grader got stuck) maps to the trace length.
 */
export function hintStep(trace: Grade, cell: number): number {
  const i = trace.steps.findIndex((s) => s.cell === cell);
  return i < 0 ? trace.steps.length : i;
}
