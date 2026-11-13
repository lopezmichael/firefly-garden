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

/** Firefly C's pivots, in units: where each wing meets the body, and the point the conflict sway turns about. */
export const WING_ROOT = { left: { x: 39, y: 41 }, right: { x: 45, y: 41 } } as const;
export const SWAY_ORIGIN = { x: 42, y: 50 } as const;

/** Firefly motion (the canvas's CSS): a 3-unit bob over 2.4 s, wings 28° about twice a second, a ±4° sway over 1.6 s. */
export const FLY_MOTION = { bobUnits: 3, bobMs: 2400, flapDeg: 28, flapMs: 420, swayDeg: 4, swayMs: 1600 } as const;

/** 0 → 1 → 0 over `period`, eased like CSS ease-in-out keyframes at 0%, 50%, 100%. */
export function pulse(t: number, period: number, phase = 0): number {
  const s = Math.sin((Math.PI * t) / period + phase);
  return s * s;
}

export interface GridSpacing {
  readonly cell: number;
  readonly gap: number;
  readonly pad: number;
}

/**
 * The hint reason outline: one rounded outline around the union of the named
 * cells (display rows and columns), running down the middle of the gaps, as
 * flat [x0, y0, x1, y1, …] polylines in board pixels. Each edge between a named
 * cell and an unnamed one is a line; each outer corner is a quarter arc of
 * `radius`. Cells that touch share no edge, so a group reads as one shape.
 */
export function outlinePolylines(cells: readonly { r: number; c: number }[], g: GridSpacing, radius: number): number[][] {
  const member = new Set(cells.map(({ r, c }) => `${r},${c}`));
  const has = (r: number, c: number) => member.has(`${r},${c}`);
  const at = (k: number) => g.pad + k * (g.cell + g.gap) - g.gap / 2;
  const out: number[][] = [];
  const arc = (cx: number, cy: number, from: number) => {
    const pts: number[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = from + (i / 6) * (Math.PI / 2);
      pts.push(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    }
    out.push(pts);
  };
  for (const { r, c } of cells) {
    const x0 = at(c), x1 = at(c + 1), y0 = at(r), y1 = at(r + 1);
    const top = !has(r - 1, c), bottom = !has(r + 1, c), left = !has(r, c - 1), right = !has(r, c + 1);
    // A corner is rounded when both its edges are outline (an outer corner).
    const tl = top && left, tr = top && right, bl = bottom && left, br = bottom && right;
    if (top) out.push([x0 + (tl ? radius : 0), y0, x1 - (tr ? radius : 0), y0]);
    if (right) out.push([x1, y0 + (tr ? radius : 0), x1, y1 - (br ? radius : 0)]);
    if (bottom) out.push([x1 - (br ? radius : 0), y1, x0 + (bl ? radius : 0), y1]);
    if (left) out.push([x0, y1 - (bl ? radius : 0), x0, y0 + (tl ? radius : 0)]);
    if (tl) arc(x0 + radius, y0 + radius, Math.PI);
    if (tr) arc(x1 - radius, y0 + radius, -Math.PI / 2);
    if (br) arc(x1 - radius, y1 - radius, 0);
    if (bl) arc(x0 + radius, y1 - radius, Math.PI / 2);
  }
  return out;
}
