import { LevelError, validateLevel } from './level.ts';
import type { Coord, Level } from './types.ts';

/**
 * What occupies a cell.
 * - `void`: outside the garden (mask `.`, e.g. a pond). Light stops here.
 * - `path`: a tile that can hold a firefly. Moonlit tiles and lanterns are paths.
 * - `bush`: blocks light; may carry a clue number (or a hidden one).
 * - `mushroom`: blocks light, never carries a number.
 */
export type CellKind = 'void' | 'path' | 'bush' | 'mushroom';

/**
 * A level compiled for fast rule checks. Cells are addressed by index
 * `r * w + c`. Everything is precomputed once, so the solvers and the game
 * never re-walk rows and columns.
 */
export interface Board {
  readonly w: number;
  readonly h: number;
  readonly kind: readonly CellKind[];
  /** Clue number for a numbered bush; `null` for every other cell (and hidden bushes). */
  readonly clue: readonly (number | null)[];
  readonly moonlit: readonly boolean[];
  readonly lantern: readonly boolean[];
  /** Path tiles that need light but can never hold a firefly (toadstools). */
  readonly noLand: readonly boolean[];
  /** Numbered blockers that count only orthogonal neighbors (sporecaps). */
  readonly sporecap: readonly boolean[];
  /** Indices of all path cells, ascending. */
  readonly paths: readonly number[];
  /** Path cells that must end up lit (paths minus moonlit), ascending. */
  readonly needsLight: readonly number[];
  /** Indices of lantern cells, ascending. */
  readonly lanterns: readonly number[];
  /** Indices of bushes with a visible number, ascending. */
  readonly numbered: readonly number[];
  /** For a path cell: every other path cell it sees along its row and column. Empty otherwise. */
  readonly rays: readonly (readonly number[])[];
  /** For a numbered bush: the path cells among its 8 neighbors. Empty otherwise. */
  readonly around: readonly (readonly number[])[];
}

const ORTHO: readonly Coord[] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const EIGHT: readonly Coord[] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

/** Compile a level. Throws LevelError if the level is inconsistent. */
export function buildBoard(level: Level): Board {
  const problems = validateLevel(level);
  if (problems.length > 0) throw new LevelError(level.id, problems);

  const { w, h } = level;
  const n = w * h;
  const kind: CellKind[] = new Array<CellKind>(n);
  const clue: (number | null)[] = new Array<number | null>(n).fill(null);
  const moonlit: boolean[] = new Array<boolean>(n).fill(false);
  const lantern: boolean[] = new Array<boolean>(n).fill(false);
  const noLand: boolean[] = new Array<boolean>(n).fill(false);
  const sporecap: boolean[] = new Array<boolean>(n).fill(false);

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) kind[r * w + c] = level.mask[r]![c] === '#' ? 'path' : 'void';
  }
  for (const [r, c, num] of level.bushes) {
    kind[r * w + c] = 'bush';
    clue[r * w + c] = num;
  }
  for (const [r, c] of level.twists?.mushrooms ?? []) kind[r * w + c] = 'mushroom';
  for (const [r, c] of level.twists?.moonlit ?? []) moonlit[r * w + c] = true;
  for (const [r, c] of level.twists?.lanterns ?? []) lantern[r * w + c] = true;
  for (const [r, c] of level.twists?.toadstools ?? []) noLand[r * w + c] = true;
  for (const [r, c, num] of level.twists?.sporecaps ?? []) {
    kind[r * w + c] = 'bush';
    clue[r * w + c] = num;
    sporecap[r * w + c] = true;
  }

  const paths: number[] = [];
  const needsLight: number[] = [];
  const lanterns: number[] = [];
  const numbered: number[] = [];
  const rays: number[][] = Array.from({ length: n }, () => []);
  const around: number[][] = Array.from({ length: n }, () => []);
  const isPath = (r: number, c: number) => r >= 0 && r < h && c >= 0 && c < w && kind[r * w + c] === 'path';

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      if (kind[i] === 'path') {
        paths.push(i);
        if (!moonlit[i]) needsLight.push(i);
        if (lantern[i]) lanterns.push(i);
        for (const [dr, dc] of ORTHO) {
          for (let rr = r + dr, cc = c + dc; isPath(rr, cc); rr += dr, cc += dc) rays[i]!.push(rr * w + cc);
        }
        rays[i]!.sort((a, b) => a - b);
      } else if (kind[i] === 'bush' && clue[i] !== null) {
        numbered.push(i);
        for (const [dr, dc] of sporecap[i] ? ORTHO : EIGHT) {
          if (isPath(r + dr, c + dc)) around[i]!.push((r + dr) * w + (c + dc));
        }
        around[i]!.sort((a, b) => a - b);
      }
    }
  }

  return { w, h, kind, clue, moonlit, lantern, noLand, sporecap, paths, needsLight, lanterns, numbered, rays, around };
}

export function cellIndex(board: Pick<Board, 'w'>, [r, c]: Coord): number {
  return r * board.w + c;
}

export function cellCoord(board: Pick<Board, 'w'>, i: number): Coord {
  return [Math.floor(i / board.w), i % board.w];
}
