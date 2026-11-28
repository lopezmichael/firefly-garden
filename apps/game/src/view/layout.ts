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

/**
 * A released firefly's way from its tile to the garden progress track (viewport pixels): it
 * rises first, swings to one side (`phase` picks which and how far), then curves in to land on
 * the track from just above it, with a small wander that fades as it nears. Pure, so tested.
 */
export function releasePath(from: Point, to: Point, phase: number, steps = 28): Point[] {
  const sway = Math.sin(phase) * 46;
  const p1 = { x: from.x + sway, y: from.y - 130 };
  const p2 = { x: to.x + (from.x - to.x) * 0.2 - sway * 0.4, y: Math.min(to.y, from.y) - 34 };
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    const wander = Math.sin(t * Math.PI * 3 + phase) * 9 * Math.sin(t * Math.PI);
    out.push({
      x: a * from.x + b * p1.x + c * p2.x + d * to.x + wander,
      y: a * from.y + b * p1.y + c * p2.y + d * to.y,
    });
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
/** `toggle`: place or lift a firefly (space, enter). `mark`: the player's own X (X key). */
export type KeyAction = { readonly kind: 'move'; readonly dir: Direction } | { readonly kind: 'toggle' | 'mark' | 'undo' | 'hint' };

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
    case 'x': return { kind: 'mark' };
    case 'z': return { kind: 'undo' };
    case 'h': return { kind: 'hint' };
    default: return null;
  }
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

/**
 * The garden map's field: room above the first stop and below the last, and the least room
 * between two stops. A label sits beside its stop, on the side where the next stop sits, so
 * stops closer than a stop's glow (40) plus half a label (26) and some air let the label cover
 * its neighbour; the map grows (and scrolls) instead.
 */
export const MAP_FIELD = { top: 44, bottom: 36, minStep: 92 } as const;

/** The least field height that keeps `stops` stops at least `MAP_FIELD.minStep` apart. */
export function mapFieldHeight(stops: number): number {
  return MAP_FIELD.top + MAP_FIELD.bottom + Math.max(0, stops - 1) * MAP_FIELD.minStep;
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

/** The home screen's painted scene, in its own 390-wide phone space (docs/plans/2026-11-28-home-screen.md). */
export const HOME_SCENE = { w: 390, h: 844 } as const;
export const HOME_FIT = {
  /** Cover a phone edge to edge while at least this much of the scene's height shows; else a column. */
  minShown: 0.72,
  /** Of what a phone crops, this share comes off the sky; the rest off the foreground (under the buttons). */
  topShare: 0.1,
  /** Text laid over the scene scales with it, within these bounds (it never gets tiny on a desktop). */
  textScale: [0.88, 1.15],
  /** The chrome over a column is at least this wide (wider than a short screen's column), if the screen allows. */
  chromeMin: 380,
  /** A column narrower than this splits instead: the scene beside a panel holding the chrome. */
  splitBelow: 330,
  /** In a split, the band of the scene that shows (the arch, Pip and the friends), its gap and the panel's width. */
  splitWindow: [130, 760],
  splitGap: 24,
  panel: 340,
} as const;

export interface HomeFit {
  /** The scene's box on screen, in CSS pixels (it may hang past the edges: cropped). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** CSS pixels per scene pixel. */
  readonly k: number;
  /** A centred column with the night beside it (wide screens), rather than edge to edge. */
  readonly column: boolean;
  /** Short and wide (a phone on its side): the scene beside the chrome's panel, not under it. */
  readonly split: boolean;
  /** Where the title, caption and buttons go: over the shown scene, or the panel beside it. */
  readonly chrome: { readonly x: number; readonly w: number };
  /** Scale for the title and Pip's caption. */
  readonly text: number;
}

/**
 * Where the home scene sits on a `vw × vh` screen. A phone is covered edge to edge: a wider phone
 * crops the scene's height (mostly the foreground, which the buttons cover), a narrower one its
 * sides. Once covering would hide too much of it (tablets, desktops), the whole scene shows as a
 * centred column.
 */
export function homeFit(vw: number, vh: number): HomeFit {
  const { w: SW, h: SH } = HOME_SCENE;
  const text = (k: number) => Math.min(HOME_FIT.textScale[1], Math.max(HOME_FIT.textScale[0], k));
  const byWidth = vw / SW;
  const over = (x: number, w: number) => ({ x: Math.max(0, x), w: Math.min(vw, x + w) - Math.max(0, x) });
  if (SH * byWidth >= vh) {
    // Tall enough: cover the width, crop the height.
    if (vh / (SH * byWidth) >= HOME_FIT.minShown) {
      const h = SH * byWidth;
      return { x: 0, y: -(h - vh) * HOME_FIT.topShare, w: vw, h, k: byWidth, column: false, split: false, chrome: over(0, vw), text: text(byWidth) };
    }
  } else {
    // Narrower than the scene: cover the height, crop the sides evenly.
    const k = vh / SH, w = SW * k, x = (vw - w) / 2;
    return { x, y: 0, w, h: vh, k, column: false, split: false, chrome: over(x, w), text: text(k) };
  }
  const k = vh / SH, w = SW * k;
  if (w >= HOME_FIT.splitBelow) {
    // A column, the chrome over it a little wider than it when it is narrow.
    const x = (vw - w) / 2, cw = Math.max(w, Math.min(vw - 32, HOME_FIT.chromeMin));
    return { x, y: 0, w, h: vh, k, column: true, split: false, chrome: { x: (vw - cw) / 2, w: cw }, text: text(k) };
  }
  // Short and wide: the scene's middle band fills the height, the panel stands beside it.
  const [top, bottom] = HOME_FIT.splitWindow;
  const sk = vh / (bottom - top), sw = SW * sk;
  const panel = Math.min(HOME_FIT.panel, Math.max(0, vw - sw - HOME_FIT.splitGap - 16));
  const x = (vw - (sw + HOME_FIT.splitGap + panel)) / 2;
  return {
    x, y: -top * sk, w: sw, h: SH * sk, k: sk, column: true, split: true,
    chrome: { x: x + sw + HOME_FIT.splitGap, w: panel }, text: HOME_FIT.textScale[0],
  };
}
