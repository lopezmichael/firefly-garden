/**
 * Where things sit on a board piece, in the design canvas's 84-unit tile space.
 * Pure (no DOM), so placement is unit-tested; the drawings are in pieces.ts.
 */

export type BushKind = 'numbered' | 'plain' | 'wilted';

/** How many rose drawings there are (three shades and turns, and a small rose with leaves). */
export const ROSE_VARIANTS = 4;

/** Design units per cell. */
export const UNIT = 84;
/** Centre of a tile's face (where fireflies sit), in units: the face is 76 tall. */
export const FACE_CENTER_Y = 39;
/**
 * Where a happy bush's three roses sit, in units (top-left and size of each 20-unit
 * rose box): inside the leaf mass, clear of the number and the dots. From the
 * Components board's "Bush happy".
 */
export const ROSE_SLOTS: readonly { readonly x: number; readonly y: number; readonly size: number }[] = [
  { x: 12, y: 26, size: 14 },
  { x: 50.5, y: 14.5, size: 15 },
  { x: 58, y: 40, size: 12 },
];

/**
 * Which rose drawing goes in each slot of the bush at `cell`: picked from the
 * cell index, so a garden always looks the same, and never the same drawing twice
 * on one bush.
 */
export function roseVariants(cell: number): [number, number, number] {
  const h = (Math.imul(cell + 1, 0x9e3779b1) >>> 0) % ROSE_VARIANTS;
  return [h, (h + 1) % ROSE_VARIANTS, (h + 2) % ROSE_VARIANTS];
}

/** Bush number centre and dot row, in units (a wilted bush sits lower). */
export function bushLayout(kind: BushKind): { readonly numberY: number; readonly dotsY: number } {
  return kind === 'wilted' ? { numberY: 44, dotsY: 66 } : { numberY: 38, dotsY: 62 };
}

/**
 * Centres of `count` dots, in units: one row 10 units apart, or two rows when more
 * than five (an eight-neighbour bush can want up to 8).
 */
export function dotPositions(count: number, dotsY: number): { x: number; y: number }[] {
  const rows = count > 5 ? [Math.ceil(count / 2), Math.floor(count / 2)] : [count];
  const out: { x: number; y: number }[] = [];
  rows.forEach((n, r) => {
    const y = rows.length === 2 ? dotsY - 4.5 + r * 9 : dotsY;
    for (let k = 0; k < n; k++) out.push({ x: 42 + (k - (n - 1) / 2) * 10, y });
  });
  return out;
}
