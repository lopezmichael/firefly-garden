import type { Board } from './board.ts';

export type BushState = 'under' | 'met' | 'over';

export interface BushStatus {
  readonly cell: number;
  readonly want: number;
  readonly have: number;
  readonly state: BushState;
}

/** Everything the game needs to draw a position and decide if it is solved. */
export interface Evaluation {
  /** Every firefly on the board: the player's plus the lanterns, ascending. */
  readonly fireflies: readonly number[];
  /** Per cell: lit by a firefly, or moonlit. Always false for non-path cells. */
  readonly lit: readonly boolean[];
  /** Fireflies that can see another firefly along a row or column, ascending. */
  readonly conflicts: readonly number[];
  /** One entry per numbered bush, in `board.numbered` order. */
  readonly bushes: readonly BushStatus[];
  /** Path cells that still need light. */
  readonly unlit: number;
  readonly solved: boolean;
}

/** True if the player may place or remove a firefly on this cell. */
export function canPlace(board: Board, cell: number): boolean {
  return board.kind[cell] === 'path' && !board.lantern[cell] && !board.noLand[cell];
}

/**
 * Evaluate a position. `placed` is the player's fireflies; lanterns are
 * added automatically, so passing them too is harmless. Throws if a firefly
 * is on a cell that cannot hold one, since that is a caller bug, not a
 * player mistake.
 */
export function evaluate(board: Board, placed: Iterable<number>): Evaluation {
  const has = new Set<number>(board.lanterns);
  for (const i of placed) {
    if (board.kind[i] !== 'path' || board.noLand[i]) throw new RangeError(`cell ${i} cannot hold a firefly`);
    has.add(i);
  }
  const fireflies = [...has].sort((a, b) => a - b);

  const lit = board.moonlit.slice();
  const conflicts: number[] = [];
  for (const f of fireflies) {
    lit[f] = true;
    let sees = false;
    for (const j of board.rays[f]!) {
      lit[j] = true;
      if (has.has(j)) sees = true;
    }
    if (sees) conflicts.push(f);
  }

  const bushes = board.numbered.map((cell): BushStatus => {
    const want = board.clue[cell]!;
    let have = 0;
    for (const j of board.around[cell]!) if (has.has(j)) have++;
    return { cell, want, have, state: have < want ? 'under' : have === want ? 'met' : 'over' };
  });

  let unlit = 0;
  for (const i of board.needsLight) if (!lit[i]) unlit++;

  const solved = unlit === 0 && conflicts.length === 0 && bushes.every((b) => b.state === 'met');
  return { fireflies, lit, conflicts, bushes, unlit, solved };
}
