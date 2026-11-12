import { conflictPairs, crossings } from '@firefly/core';
import type { Board, Evaluation } from '@firefly/core';

/**
 * Teaching logic that reacts to the board (Michael's play feedback, 2026-11-12:
 * "light crossing light reads as wrong"). Pure, so the triggers are tested in
 * Node; how a tip or a conflict looks is the view's business.
 */

/** One-time tips. Seen tips are kept in the save, so each shows once per install. */
export type TipId = 'cross';
export const TIP_IDS: ReadonlySet<string> = new Set<TipId>(['cross']);
export const isTipId = (v: string): v is TipId => TIP_IDS.has(v);

export interface CrossTipInput {
  /** The level is one of the opening gardens (chapter 1 of the main path). */
  readonly opening: boolean;
  /** The tip was already shown on this install. */
  readonly seen: boolean;
  readonly board: Board;
  /** Fireflies on the board (player, locked and lanterns) before and after the move. */
  readonly before: Iterable<number>;
  readonly after: Iterable<number>;
  /** The position after the move. */
  readonly evaluation: Evaluation;
}

/**
 * Show "Light can cross" the first time a move makes beams cross in an opening
 * garden. Not while fireflies see each other: that is the real broken rule and
 * its own message wins (the tip waits for a later, clean crossing). Not on the
 * solving move: the celebration wins.
 */
export function crossTipDue(i: CrossTipInput): boolean {
  if (!i.opening || i.seen || i.evaluation.solved || i.evaluation.conflicts.length > 0) return false;
  const was = new Set(crossings(i.board, i.before));
  return crossings(i.board, i.after).some((c) => !was.has(c));
}

/** Plain words for a conflict, for screen readers: which two fireflies see each other. */
export function conflictWords(board: Board, fireflies: Iterable<number>, name: (cell: number) => string): string | null {
  const [pair] = conflictPairs(board, fireflies);
  if (!pair) return null;
  return `The fireflies at ${name(pair[0])} and ${name(pair[1])} can see each other.`;
}
