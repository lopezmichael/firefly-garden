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
