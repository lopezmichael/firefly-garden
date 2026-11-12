import type { Board } from './board.ts';
import { grade, type Grade, type TechniqueId } from './grader.ts';
import { evaluate } from './rules.ts';

/**
 * Hints: the grader's next step on the player's current board. A hint either
 * removes one wrong firefly or places one correct one, with a one-line reason
 * (docs/references/rules.md, "Hints"). The game calls this; it is the same
 * grader that rated the level, so a hint is always a move a person could have
 * found. Like the level's rating, it grades with the firefly count known (the
 * game shows it in the firefly jar), so count deductions can feed a hint.
 */
export type Hint =
  /** A player firefly that is not part of the answer. */
  | { readonly kind: 'remove'; readonly cell: number; readonly reason: string }
  /**
   * The grader's next firefly from this position. The grader may first rule
   * out cells the player cannot yet see are empty (a satisfied bush's other
   * neighbors, a bush-room, overlap or count deduction); those are `ruledOut`, and
   * the game marks them "no firefly here" while showing the hint so that
   * `reason` reads true on screen. `because` is the firefly step's own cells
   * first (the bush, the dark tile...), then the cells behind each ruled-out
   * step, without repeats.
   */
  | {
      readonly kind: 'place';
      readonly cell: number;
      readonly technique: TechniqueId;
      readonly reason: string;
      readonly because: readonly number[];
      readonly ruledOut: readonly number[];
    }
  /** The grader is stuck from this position: a correct firefly anyway, so a paid hint always does something. */
  | { readonly kind: 'try-here'; readonly cell: number; readonly reason: string }
  /** Already solved: nothing to hint. */
  | { readonly kind: 'none' };

/**
 * What the player reads for each technique. A place hint's reason is always
 * its firefly step's; the count techniques only rule cells out, so their text
 * explains a `ruledOut` cell, never the placed one.
 */
export const HINT_REASONS: Readonly<Record<TechniqueId, string>> = {
  'T1-needs-all': 'This bush needs a firefly in every open spot around it.',
  'T1-satisfied': 'This bush already has all its fireflies.',
  'T2-one-source': 'That dark tile can only be lit from here.',
  'T2-bush-room': 'Every way to fit this bush\'s fireflies uses this spot.',
  'T3-overlap': 'These two bushes share neighbors, and together their numbers need this spot.',
  'T4-lookahead': 'Leaving this spot empty runs into trouble one move later.',
  'T5-trial': 'Leaving this spot empty leads to a dead end a few moves later.',
  'T1-count-complete': 'Every firefly is already placed.',
  'T3-count-bound': 'The dark tiles and bushes that still need fireflies use up every one left.',
};

export const REMOVE_REASONS = {
  conflict: 'This firefly can see another one.',
  overfull: 'This firefly gives a bush too many.',
  wrong: 'This firefly can\'t be part of the answer.',
} as const;

export const TRY_HERE_REASON = 'Try a firefly here.';

/**
 * The next hint for a position.
 *
 * - `solution`: every firefly cell of the level's unique answer (lanterns included).
 * - `placed`: the player's fireflies (may include locked cells; lanterns are ignored).
 *   Untrusted when it comes from saved progress: validate it before calling
 *   (integers in 0..w*h-1 on path cells, no repeats, at most w*h); on failure
 *   drop the level's placed set and keep only valid locked cells.
 * - `locked`: this play's hint fireflies. Each must be a solution cell (saved
 *   progress is validated against that before it gets here); a locked cell
 *   outside the solution is a caller bug and throws.
 *
 * Wrong fireflies go first, conflicting ones before ones that overfill a bush,
 * then any other, lowest cell first so hints are deterministic.
 */
export function hint(
  board: Board,
  solution: Iterable<number>,
  placed: Iterable<number>,
  locked: ReadonlySet<number> = new Set(),
): Hint {
  const answer = new Set(solution);
  const on = new Set<number>();
  for (const c of placed) if (!board.lantern[c]) on.add(c);
  for (const c of locked) {
    if (!answer.has(c)) throw new RangeError(`locked cell ${c} is not part of the solution`);
    on.add(c);
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

  // Every firefly on the board is part of the answer, so the grader's
  // deductions from here are sound. The player sees the firefly count, so the
  // grader uses it too (lanterns are in `answer`, as in the level's rating).
  const steps = grade(board, { start: on, stopAtFirefly: true, knownCount: answer.size }).steps;
  const next = steps.at(-1);
  // Defense in depth: never place a cell outside the answer, whatever the grader says.
  if (next && next.value === 'firefly' && answer.has(next.cell)) {
    const ruledOut: number[] = [];
    const because = [...next.because];
    for (const st of steps.slice(0, -1)) {
      ruledOut.push(st.cell);
      for (const b of st.because) if (!because.includes(b)) because.push(b);
    }
    return {
      kind: 'place', cell: next.cell, technique: next.technique, reason: HINT_REASONS[next.technique], because, ruledOut,
    };
  }
  const missing = [...answer].filter((c) => !on.has(c) && !board.lantern[c]).sort((a, b) => a - b)[0];
  if (missing === undefined) return { kind: 'none' }; // unreachable: all answer cells on and nothing wrong is solved
  return { kind: 'try-here', cell: missing, reason: TRY_HERE_REASON };
}

/**
 * For analytics (`hint.step`): the index, in the level's full grader trace
 * from an empty board, of the step that decides `cell`, so Phase 4 can tie
 * each hint to a technique. Pass `gradeLevel(level, board)` (computed once per
 * level), the same count-aware trace the level was rated with.
 * A cell no step decides (a lantern, or past where the grader got stuck)
 * maps to the trace length.
 */
export function hintStep(trace: Grade, cell: number): number {
  const i = trace.steps.findIndex((s) => s.cell === cell);
  return i < 0 ? trace.steps.length : i;
}
