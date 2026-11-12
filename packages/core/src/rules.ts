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

/**
 * True if the player may place or remove a firefly on this cell. `locked`
 * holds this play's hint fireflies: like lanterns they are fixed, so the
 * player can neither remove them nor toggle them off (docs/references/rules.md).
 */
export function canPlace(board: Board, cell: number, locked?: ReadonlySet<number>): boolean {
  return board.kind[cell] === 'path' && !board.lantern[cell] && !(locked?.has(cell) ?? false);
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
    if (board.kind[i] !== 'path') throw new RangeError(`cell ${i} cannot hold a firefly`);
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

/**
 * Pairs of fireflies that see each other, nearest neighbours only: three in an
 * open row give two pairs (left-middle, middle-right), never the outer pair,
 * so a line drawn per pair covers the broken stretch exactly once. Lanterns
 * count as fireflies, as in `evaluate`. Each pair is `[low, high]`, sorted.
 * Used to show the broken rule itself (the conflict beam), not only the
 * fireflies that break it.
 */
export function conflictPairs(board: Board, fireflies: Iterable<number>): [number, number][] {
  const has = new Set<number>(board.lanterns);
  for (const f of fireflies) has.add(f);
  const pairs: [number, number][] = [];
  for (const f of [...has].sort((a, b) => a - b)) {
    const r = Math.floor(f / board.w), c = f % board.w;
    // Looking right and down from each firefly finds every pair exactly once.
    for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
      for (let rr = r + dr, cc = c + dc; rr < board.h && cc < board.w; rr += dr, cc += dc) {
        const j = rr * board.w + cc;
        if (board.kind[j] !== 'path') break;
        if (has.has(j)) {
          pairs.push([f, j]);
          break;
        }
      }
    }
  }
  return pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/**
 * How many fireflies light each cell (a firefly lights its own tile too).
 * Lanterns count; moonlight does not. A path tile with no firefly on it and a
 * count of two or more is a crossing: beams from a row and a column meeting,
 * which is allowed (only fireflies may not see each other).
 */
export function lightCounts(board: Board, fireflies: Iterable<number>): number[] {
  const has = new Set<number>(board.lanterns);
  for (const f of fireflies) has.add(f);
  const counts = new Array<number>(board.kind.length).fill(0);
  for (const f of has) {
    counts[f]!++;
    for (const j of board.rays[f]!) counts[j]!++;
  }
  return counts;
}

/** Path tiles where light crosses: no firefly on them, lit by two or more. Ascending. */
export function crossings(board: Board, fireflies: Iterable<number>): number[] {
  const has = new Set<number>(board.lanterns);
  for (const f of fireflies) has.add(f);
  const counts = lightCounts(board, has);
  const out: number[] = [];
  for (const i of board.paths) if (!has.has(i) && counts[i]! >= 2) out.push(i);
  return out;
}
