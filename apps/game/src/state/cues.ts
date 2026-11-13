import type { Evaluation } from '@firefly/core';

/**
 * Sound cues from a change of position: what the audio layer should play.
 * Pure, so which moment gets which sound is tested in Node; the audio layer
 * only knows how to make sounds, not when.
 */

export type Cue =
  /** A firefly landed. `pitch` runs from 1 (top row on screen) to 0 (bottom row): higher rings higher. */
  | { readonly kind: 'place'; readonly pitch: number }
  | { readonly kind: 'lift' }
  /** A hint placed a locked firefly. */
  | { readonly kind: 'hint'; readonly pitch: number }
  /** At least one more bush has exactly its number. */
  | { readonly kind: 'bush' }
  /** Fireflies that did not see each other now do. */
  | { readonly kind: 'conflict' }
  | { readonly kind: 'solve' }
  /** A tap with the jar empty: nothing was placed. */
  | { readonly kind: 'empty' };

export type Move =
  | { readonly kind: 'placed' | 'hint-placed'; readonly row: number; readonly rows: number }
  | { readonly kind: 'removed' | 'hint-removed' | 'undo' | 'reset' | 'jar-empty' };

const met = (ev: Evaluation) => ev.bushes.reduce((n, b) => n + (b.state === 'met' ? 1 : 0), 0);

/**
 * Cues for one move, most important first. A solve is the whole story (its
 * flourish replaces the landing chime). Otherwise the move's own sound, then
 * a bush chime if more bushes are satisfied, then a conflict tone if the move
 * made fireflies see each other.
 */
export function cuesFor(before: Evaluation, after: Evaluation, move: Move): Cue[] {
  if (move.kind === 'jar-empty') return [{ kind: 'empty' }];
  if (after.solved && !before.solved) return [{ kind: 'solve' }];
  const out: Cue[] = [];
  if (move.kind === 'placed' || move.kind === 'hint-placed') {
    const pitch = move.rows <= 1 ? 0.5 : 1 - Math.min(1, Math.max(0, move.row / (move.rows - 1)));
    out.push({ kind: move.kind === 'placed' ? 'place' : 'hint', pitch });
  } else if (move.kind === 'removed' || move.kind === 'hint-removed') {
    out.push({ kind: 'lift' });
  }
  if (met(after) > met(before)) out.push({ kind: 'bush' });
  const was = new Set(before.conflicts);
  if (after.conflicts.some((c) => !was.has(c))) out.push({ kind: 'conflict' });
  return out;
}
