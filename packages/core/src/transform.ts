import type { BushSpec, Coord, Level, LevelTwists } from './types.ts';

/**
 * The eight symmetries of a rectangle (rotations and mirrors). Light Up rules
 * only care about rows, columns and neighbors, so every symmetry maps a
 * level to an equally valid one with the same number of solutions. The game
 * uses this to show a level in whichever orientation fits the screen best.
 */
export type Transform =
  | 'identity' | 'rot90' | 'rot180' | 'rot270'
  | 'mirror' | 'mirrorRot90' | 'mirrorRot180' | 'mirrorRot270';

export const TRANSFORMS: readonly Transform[] = [
  'identity', 'rot90', 'rot180', 'rot270', 'mirror', 'mirrorRot90', 'mirrorRot180', 'mirrorRot270',
];

/** Apply a symmetry to a level. Board metadata (id, tier, score...) is kept. */
export function transformLevel(level: Level, t: Transform): Level {
  const mirrored = t.startsWith('mirror');
  const turns = { identity: 0, rot90: 1, rot180: 2, rot270: 3, mirror: 0, mirrorRot90: 1, mirrorRot180: 2, mirrorRot270: 3 }[t];
  let out = mirrored ? mapLevel(level, level.w, level.h, ([r, c]) => [r, level.w - 1 - c]) : level;
  for (let i = 0; i < turns; i++) {
    const { w, h } = out;
    // Clockwise quarter turn: (r, c) -> (c, h - 1 - r); width and height swap.
    out = mapLevel(out, h, w, ([r, c]) => [c, h - 1 - r]);
  }
  return out;
}

function mapLevel(level: Level, w: number, h: number, f: (p: Coord) => Coord): Level {
  const grid: string[][] = Array.from({ length: h }, () => new Array<string>(w).fill('.'));
  level.mask.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const [nr, nc] = f([r, c]);
      grid[nr]![nc] = row[c]!;
    }
  });
  const mapCoords = (cs: readonly Coord[] | undefined) => cs?.map(f);
  const bushes = level.bushes.map(([r, c, n]): BushSpec => {
    const [nr, nc] = f([r, c]);
    return [nr, nc, n];
  });

  const out: { -readonly [K in keyof Level]: Level[K] } = { ...level, w, h, mask: grid.map((row) => row.join('')), bushes };
  if (level.twists) {
    const twists: { -readonly [K in keyof LevelTwists]: LevelTwists[K] } = {};
    for (const key of Object.keys(level.twists) as (keyof LevelTwists)[]) {
      const entries = level.twists[key] as readonly (readonly number[])[] | undefined;
      if (!entries) continue;
      // Each entry is [row, col, ...extra]; only the coordinate moves.
      const mapped = entries.map(([r, c, ...rest]) => [...f([r!, c!]), ...rest]);
      (twists as Record<string, unknown>)[key] = mapped;
    }
    out.twists = twists;
  }
  const solution = mapCoords(level.solution);
  if (solution) out.solution = solution;
  return out;
}
