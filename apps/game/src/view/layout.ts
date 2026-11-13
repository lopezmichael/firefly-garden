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

/**
 * Proportions of the board drawing, in cells. Ink and wash: tiles sit straight
 * on the night (no tray) with their front edge inside the cell, 6 units apart on
 * the canvas's 84-unit tile.
 */
export const BOARD_GEOMETRY = {
  /** Gap between tiles, as a fraction of a cell. */
  gap: 0.07,
  /** Room on each side for hint outlines and halos that reach past the outer tiles. */
  pad: 0.06,
  /** Extra room below the last row (none: the front edge is inside the cell). */
  lip: 0,
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

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Where the hills sit, in screen pixels: behind the status card in every band
 * (design: Round 4 and the two play bands). The moss ridge rises just above the
 * card and the dusk ridge behind it; in the wide band they stay in the side
 * column (and a little past it), elsewhere they span the screen. `motes` are the
 * drifting firefly lights over the ridges.
 */
export interface HillLayout {
  readonly left: number;
  readonly right: number;
  /** Highest point of the far (dusk) ridge and of the near (moss) ridge. */
  readonly duskTop: number;
  readonly mossTop: number;
  readonly bottom: number;
  readonly motes: readonly Point[];
}

/** How far above the card each ridge rises, and how far past the side column the wide band's hills reach. */
export const HILLS = { mossAbove: 46, duskAbove: 96, wideReach: 40, motes: 6 } as const;

export function hillsFor(band: Band, width: number, height: number, card: Rect): HillLayout {
  const left = 0;
  const right = band === 'wide' ? Math.min(width, card.right + HILLS.wideReach) : width;
  const mossTop = Math.max(0, card.top - HILLS.mossAbove);
  const duskTop = Math.max(0, card.top - HILLS.duskAbove);
  // Motes drift in the band of sky over the ridges, spread evenly with a fixed jitter.
  const motes: Point[] = [];
  for (let i = 0; i < HILLS.motes; i++) {
    const t = (i + 0.5) / HILLS.motes;
    motes.push({ x: left + (right - left) * t + ((i * 37) % 23) - 11, y: duskTop - 18 + ((i * 53) % 44) });
  }
  return { left, right, duskTop, mossTop, bottom: height, motes };
}

/** The garden map's stop x positions as fractions of the width, cycling (from the canvas board). */
export const MAP_XS = [0.25, 0.74, 0.38, 0.77] as const;

export interface MapSegment {
  readonly from: Point;
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}

/**
 * The garden map's stops and the dotted path through them, top to bottom: one
 * stop per chapter plus the teaser, zig-zagging across `width` between `top` and
 * `bottom` (design: the "Garden map" board). Each label sits on the open side of
 * its stop.
 */
export function mapLayout(stops: number, width: number, top: number, bottom: number): {
  readonly stops: readonly Point[];
  readonly segments: readonly MapSegment[];
  readonly labelRight: readonly boolean[];
} {
  const pts: Point[] = [];
  const step = stops > 1 ? (bottom - top) / (stops - 1) : 0;
  for (let i = 0; i < stops; i++) pts.push({ x: Math.round(width * MAP_XS[i % MAP_XS.length]!), y: Math.round(top + i * step) });
  const segments: MapSegment[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!, dy = b.y - a.y;
    segments.push({ from: a, c1: { x: a.x * 0.55 + b.x * 0.45, y: a.y + dy * 0.15 }, c2: { x: b.x, y: b.y - dy * 0.45 }, to: b });
  }
  return { stops: pts, segments, labelRight: pts.map((p) => p.x < width / 2) };
}

/** `n + 1` points along a map segment (a cubic), from its start to its end: the unlock flight's path. */
export function segmentPoints(s: MapSegment, n = 24): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push({ x: a * s.from.x + b * s.c1.x + c * s.c2.x + d * s.to.x, y: a * s.from.y + b * s.c1.y + c * s.c2.y + d * s.to.y });
  }
  return out;
}
