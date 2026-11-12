import type { Transform } from '@firefly/core';

/**
 * Layout math, kept pure (no DOM) so it is unit-tested. The layout follows the
 * screen's shape, not its orientation (docs/plans Phase 2, "Foldables"):
 * phones in portrait are tall (~0.46), an iPhone Duo or tablet is near-square
 * (~0.70 to 1.0), phones in landscape and desktops are wide.
 */

export type Band = 'tall' | 'square' | 'wide';

export const BAND_LIMITS = { tallBelow: 0.6, wideAbove: 1.25 } as const;

export function bandFor(width: number, height: number): Band {
  const r = width / Math.max(1, height);
  if (r < BAND_LIMITS.tallBelow) return 'tall';
  if (r > BAND_LIMITS.wideAbove) return 'wide';
  return 'square';
}

/** Proportions of the board drawing, in cells. */
export const BOARD_GEOMETRY = {
  /** Gap between tiles, as a fraction of a cell. */
  gap: 0.14,
  /** Tray padding on each side, as a fraction of a cell. */
  pad: 0.22,
  /** Extra room below for tile front edges and the tray's lip. */
  lip: 0.14,
} as const;

export interface BoardFit {
  /** Cell size in CSS pixels (whole). */
  readonly cell: number;
  readonly gap: number;
  readonly pad: number;
  /** Total drawing size in CSS pixels. */
  readonly width: number;
  readonly height: number;
}

export function fitBoard(cols: number, rows: number, areaW: number, areaH: number): BoardFit {
  const g = BOARD_GEOMETRY;
  const unitsW = cols + (cols - 1) * g.gap + 2 * g.pad;
  const unitsH = rows + (rows - 1) * g.gap + 2 * g.pad + g.lip;
  const cell = Math.max(8, Math.floor(Math.min(areaW / unitsW, areaH / unitsH)));
  const gap = Math.round(cell * g.gap);
  const pad = Math.round(cell * g.pad);
  return {
    cell, gap, pad,
    width: cols * cell + (cols - 1) * gap + 2 * pad,
    height: rows * cell + (rows - 1) * gap + 2 * pad + Math.round(cell * g.lip),
  };
}

/**
 * Pick the orientation that shows a level biggest in the given area. Square
 * levels never rotate. Ties keep the stored orientation.
 */
export function orientFor(levelW: number, levelH: number, areaW: number, areaH: number): Transform {
  if (levelW === levelH) return 'identity';
  const asIs = fitBoard(levelW, levelH, areaW, areaH).cell;
  const turned = fitBoard(levelH, levelW, areaW, areaH).cell;
  return turned > asIs ? 'rot90' : 'identity';
}

/** Smallest comfortable tap target, CSS pixels (Apple's 44 pt). */
export const MIN_TAP = 44;

/**
 * Keep the level's orientation through a resize (a fold or unfold) unless the
 * board would drop under the tap-target minimum and turning it would fix that.
 */
export function keepOrTurn(current: Transform, levelW: number, levelH: number, areaW: number, areaH: number): Transform {
  const [cw, ch] = current === 'rot90' ? [levelH, levelW] : [levelW, levelH];
  if (fitBoard(cw, ch, areaW, areaH).cell >= MIN_TAP) return current;
  const best = orientFor(levelW, levelH, areaW, areaH);
  const [bw, bh] = best === 'rot90' ? [levelH, levelW] : [levelW, levelH];
  return fitBoard(bw, bh, areaW, areaH).cell > fitBoard(cw, ch, areaW, areaH).cell ? best : current;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Points along a quadratic curve that rises above both ends (pure, so it is tested). */
export function flightPath(from: Point, to: Point, steps = 16, lift = 110): Point[] {
  const cx = (from.x + to.x) / 2;
  const cy = Math.min(from.y, to.y) - lift;
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    out.push({ x: a * from.x + b * cx + c * to.x, y: a * from.y + b * cy + c * to.y });
  }
  return out;
}

/** Display (row, col) → canonical cell index, for a level `w` wide and `h` tall. */
export function canonicalCell(transform: Transform, w: number, h: number, dr: number, dc: number): number {
  return transform === 'rot90' ? (h - 1 - dc) * w + dr : dr * w + dc;
}

/** Canonical cell index → display [row, col]. Inverse of `canonicalCell`. */
export function displayCell(transform: Transform, w: number, h: number, cell: number): [row: number, col: number] {
  const r = Math.floor(cell / w), c = cell % w;
  return transform === 'rot90' ? [c, h - 1 - r] : [r, c];
}

/** Display grid size [cols, rows] for a level under a transform. */
export function displayDims(transform: Transform, w: number, h: number): [cols: number, rows: number] {
  return transform === 'rot90' ? [h, w] : [w, h];
}

export type Direction = 'up' | 'down' | 'left' | 'right';

const STEP: Record<Direction, readonly [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

/**
 * Keyboard focus: one step on screen (so arrows follow the board as drawn,
 * whatever its rotation), skipping cells `skip` rejects (outside the garden).
 * Stays put at the edge. Cells are canonical in and out.
 */
export function stepFocus(transform: Transform, w: number, h: number, cell: number, dir: Direction, skip: (cell: number) => boolean): number {
  const [cols, rows] = displayDims(transform, w, h);
  const [dr, dc] = STEP[dir];
  let [r, c] = displayCell(transform, w, h, cell);
  for (;;) {
    r += dr;
    c += dc;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return cell;
    const next = canonicalCell(transform, w, h, r, c);
    if (!skip(next)) return next;
  }
}

/** What a key does on the play screen, or null if it is not one of ours. */
export type KeyAction = { readonly kind: 'move'; readonly dir: Direction } | { readonly kind: 'toggle' | 'undo' | 'hint' };

export interface KeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/**
 * Keyboard map for desktop portals (plan E): arrows move the focus ring,
 * space or enter toggles, Z (or Ctrl/Cmd+Z) undoes, H asks for a hint. Other
 * modifier chords are left to the browser.
 */
export function keyAction(e: KeyInput): KeyAction | null {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // Shift chords are someone else's (Ctrl/Cmd+Shift+Z is redo; Shift+Z is not undo).
  if (e.altKey || e.shiftKey) return null;
  if ((e.ctrlKey || e.metaKey) && k === 'z') return { kind: 'undo' };
  if (e.ctrlKey || e.metaKey) return null;
  switch (k) {
    case 'ArrowUp': return { kind: 'move', dir: 'up' };
    case 'ArrowDown': return { kind: 'move', dir: 'down' };
    case 'ArrowLeft': return { kind: 'move', dir: 'left' };
    case 'ArrowRight': return { kind: 'move', dir: 'right' };
    case ' ': case 'Enter': return { kind: 'toggle' };
    case 'z': return { kind: 'undo' };
    case 'h': return { kind: 'hint' };
    default: return null;
  }
}
