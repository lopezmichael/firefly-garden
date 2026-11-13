import type { Palette } from '../theme.ts';
import { UNIT } from './geometry.ts';
import type { BushKind } from './geometry.ts';
import { pooledEdge, texturize, wash, wobbleEllipse, wobblePath } from './textures.ts';

/**
 * The board's pieces in the ink and wash look, drawn with 2D canvas into the
 * board's per-size texture cache. Shapes are ported from the "Components ·
 * states, icons, coin" board of the design canvas, in its 84-unit tile space
 * (`UNIT`, see geometry.ts): a face 82 × 76 with a 7-unit front edge below
 * it, so the whole piece fits its cell. Colours are tokens only
 * (`pal.css.<token>`).
 */

type Css = Palette['css'];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** The card: face and front edge, `edgeColor` under `faceColor`, in units. */
function card(ctx: CanvasRenderingContext2D, face: string, edge: string): void {
  ctx.fillStyle = edge;
  roundRect(ctx, 1, 8, 82, 76, 6);
  ctx.fill();
  ctx.fillStyle = face;
  roundRect(ctx, 1, 1, 82, 76, 6);
  ctx.fill();
}

/**
 * Card fibre over the face only: drawn on a scratch layer clipped to the face, so
 * the front edge stays a clean band (the canvas filters only the face rect).
 */
function fibreFace(ctx: CanvasRenderingContext2D, c: Css): void {
  ctx.save();
  roundRect(ctx, 1, 1, 82, 76, 6);
  ctx.clip();
  texturize(ctx, 'fibre', c.wing, 14, 11, 1, 1, 82, 76);
  ctx.restore();
}

/** Run `draw` in unit space for a texture `cell` CSS pixels wide. */
function inUnits(ctx: CanvasRenderingContext2D, cell: number, draw: () => void): void {
  ctx.save();
  ctx.scale(cell / UNIT, cell / UNIT);
  draw();
  ctx.restore();
}

/** Dark path tile: dusk card, fibre, a soft inner dusk wash. */
export function drawDarkTile(ctx: CanvasRenderingContext2D, c: Css, cell: number): void {
  inUnits(ctx, cell, () => {
    card(ctx, c.dusk, c.duskEdge);
    fibreFace(ctx, c);
    ctx.globalAlpha = 0.5;
    wash(ctx, c.duskWash, 7, 7, 70, 64, 4, 1.6, 7);
    ctx.globalAlpha = 1;
  });
}

/**
 * Lit tile: paper rim, gold wash, warm centre, pooled edge, paper grain, ink
 * outline. One drawing however many fireflies light it.
 */
export function drawLitTile(ctx: CanvasRenderingContext2D, c: Css, cell: number): void {
  inUnits(ctx, cell, () => {
    card(ctx, c.paper, c.goldEdge);
    wash(ctx, c.gold, 6, 6, 72, 66, 5, 1.6, 7);
    // The warm centre: glow-warm fading through glow-soft to nothing (the canvas's cellglow).
    const g = ctx.createRadialGradient(42, 6 + 66 * 0.46, 0, 42, 6 + 66 * 0.46, 72 * 0.55);
    g.addColorStop(0, `${c.glowWarm}e6`);
    g.addColorStop(0.6, `${c.glowSoft}59`);
    g.addColorStop(1, `${c.glowSoft}00`);
    ctx.fillStyle = g;
    roundRect(ctx, 6, 6, 72, 66, 5);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    pooledEdge(ctx, c.goldPool, 6, 6, 72, 66, 5, 2.4, 1.6, 7);
    ctx.globalAlpha = 1;
    ctx.save();
    wobblePath(ctx, 6, 6, 72, 66, 5, 1.6, 7);
    ctx.clip();
    texturize(ctx, 'grain', c.paperGrain, 70, 31, 6, 6, 72, 66);
    ctx.restore();
    ctx.strokeStyle = c.sumi;
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, 82, 76, 6);
    ctx.stroke();
  });
}

const BUSH_LINE = new Path2D('M11 60 C14 30 38 10 64 18 C76 26 78 48 73 64');
const BUSH_HIGHLIGHT = new Path2D('M24 28 q6 -6 12 -2 M50 22 q6 -2 10 4');
const PLAIN_LEAVES = new Path2D('M22 40 q5 -5 10 -2 M44 30 q5 -4 10 0 M54 48 q4 -3 8 1 M30 54 q4 -3 8 0');
const WILT_DROOP = new Path2D('M17 48 q-4 8 -2 14 M67 48 q4 8 2 14 M29 38 q-6 4 -8 10 M55 38 q6 4 8 10');

function stroke(ctx: CanvasRenderingContext2D, path: Path2D, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke(path);
}

function blob(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, rx: number, ry: number, seed: number): void {
  wobbleEllipse(ctx, cx, cy, rx, ry, 1.6, seed);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * A bush on its dark card. Numbered: three-lobe moss with highlights. Plain (no
 * number, only blocks light): deeper and leafier. Wilted (too many): a slumped
 * olive mound inside a dashed warn border, two fallen petals.
 */
export function drawBush(ctx: CanvasRenderingContext2D, c: Css, cell: number, kind: BushKind): void {
  inUnits(ctx, cell, () => {
    card(ctx, c.dusk, c.duskEdge);
    fibreFace(ctx, c);
    if (kind === 'wilted') {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = c.warn;
      ctx.lineWidth = 2.5;
      roundRect(ctx, 4, 4, 76, 70, 5);
      ctx.stroke();
      ctx.restore();
      blob(ctx, c.wiltLo, 27, 54, 18, 13, 3);
      blob(ctx, c.wiltLo, 57, 54, 18, 13, 5);
      blob(ctx, c.wilt, 42, 44, 21, 16, 9);
      stroke(ctx, WILT_DROOP, c.sumi, 1.8);
      for (const [x, y, a] of [[16, 72, -25], [70, 20, 30]] as const) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((a * Math.PI) / 180);
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.5, 2, 0, 0, 2 * Math.PI);
        ctx.fillStyle = c.rose;
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    const plain = kind === 'plain';
    const lo = plain ? c.mossPlainLo : c.mossLo, mid = plain ? c.mossPlain : c.moss;
    const [side, sy, top, ty] = plain ? [18, 46, 22, 32] : [19, 44, 22, 30];
    blob(ctx, lo, plain ? 24 : 26, sy, side, side, 3);
    blob(ctx, lo, plain ? 60 : 58, sy, side, side, 5);
    blob(ctx, mid, 42, ty, top, top, 9);
    ctx.fillStyle = lo;
    wobblePath(ctx, plain ? 8 : 9, sy, plain ? 68 : 66, plain ? 22 : 24, 10, 1.2, 13);
    ctx.fill();
    stroke(ctx, BUSH_LINE, c.sumi, 2);
    if (plain) stroke(ctx, PLAIN_LEAVES, c.leaf, 2);
    else stroke(ctx, BUSH_HIGHLIGHT, c.mossHi, 2.4);
  });
}

const ROSE_SPIRAL = new Path2D('M10 10 m-1 0 a1.5 1.5 0 1 1 2.5 1.2 a3 3 0 1 1 -4.6 -2.6 a4.6 4.6 0 1 1 6.8 4.4');
const SMALL_SPIRAL = new Path2D('M10 10 m-0.7 0 a1 1 0 1 1 1.7 0.8 a2 2 0 1 1 -3 -1.7');
const ROSE_LEAVES = new Path2D('M6 14 q-3 -1 -3 -4 q3 0 4 2 Z M14 14 q3 -1 3 -4 q-3 0 -4 2 Z');

/**
 * One rose, in a 20-unit box drawn `px` CSS pixels wide. Variants are the one
 * drawing in three shades and turns, plus a smaller rose with two leaves.
 */
export function drawRose(ctx: CanvasRenderingContext2D, c: Css, px: number, variant: number): void {
  ctx.save();
  ctx.scale(px / 20, px / 20);
  if (variant === 3) {
    ctx.fillStyle = c.roseLeaf;
    ctx.fill(ROSE_LEAVES);
    stroke(ctx, ROSE_LEAVES, c.sumi, 0.8);
    wobbleEllipse(ctx, 10, 10, 5.2, 5.2, 0.4, 23);
    ctx.fillStyle = c.rose;
    ctx.fill();
    ctx.strokeStyle = c.sumi;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    stroke(ctx, SMALL_SPIRAL, c.roseSpiral, 1.1);
  } else {
    const [fill, turn] = ([[c.rose, 0], [c.roseDeep, 120], [c.rosePale, 230]] as const)[variant % 3]!;
    ctx.translate(10, 10);
    ctx.rotate((turn * Math.PI) / 180);
    ctx.translate(-10, -10);
    wobbleEllipse(ctx, 10, 10, 8, 8, 0.5, 19 + variant);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = c.sumi;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    stroke(ctx, ROSE_SPIRAL, c.roseSpiral, 1.2);
  }
  ctx.restore();
}


export type FlyKind = 'player' | 'hint' | 'conflict';

const WING_L = new Path2D('M39 39 C30 28 24 34 28 40 C31 44 36 43 39 41 Z');
const WING_R = new Path2D('M45 39 C54 28 60 34 56 40 C53 44 48 43 45 41 Z');
const WING_VEINS = { left: new Path2D('M37 39 q-4 -4 -7 -3'), right: new Path2D('M47 39 q4 -4 7 -3') } as const;
const RIBS = new Path2D('M35.5 46 q6.5 3 13 0 M35.5 50.5 q6.5 3 13 0');
const ANTENNAE_CURLED = new Path2D('M40.8 35.6 q-1.4 -5 -5 -5.6 q-1.6 0 -1 1.4 M43.2 35.6 q1.4 -5 5 -5.6 q1.6 0 1 1.4');
const ANTENNAE_STRAIGHT = new Path2D('M40.8 35.6 q-1.4 -5 -5 -5.6 M43.2 35.6 q1.4 -5 5 -5.6');
const SHIVER = new Path2D('M23 38 q-4 7 0 14 M17 35 q-6 10 0 20 M61 38 q4 7 0 14 M67 35 q6 10 0 20');

/** The light around a firefly: warm for yours and the hint's, rose for a conflict. */
export function drawFlyGlow(ctx: CanvasRenderingContext2D, c: Css, cell: number, kind: FlyKind): void {
  inUnits(ctx, cell, () => {
    const r = kind === 'hint' ? 22 : kind === 'conflict' ? 24 : 26;
    const g = ctx.createRadialGradient(42, 46, 0, 42, 46, r);
    if (kind === 'conflict') {
      g.addColorStop(0, c.warnGlow);
      g.addColorStop(0.4, `${c.warn}8c`);
      g.addColorStop(1, `${c.warn}00`);
    } else {
      g.addColorStop(0, c.glow);
      g.addColorStop(0.35, `${c.glowSoft}b3`);
      g.addColorStop(1, `${c.gold}00`);
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(42, 46, r, 0, 2 * Math.PI);
    ctx.fill();
  });
}

/** The soft shadow under a firefly. */
export function drawFlyShadow(ctx: CanvasRenderingContext2D, c: Css, cell: number): void {
  inUnits(ctx, cell, () => {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = c.nightDeep;
    ctx.beginPath();
    ctx.ellipse(45, 68, 7, 2.2, 0, 0, 2 * Math.PI);
    ctx.fill();
  });
}

/** One wing, a separate drawing so it can flap about its root. */
export function drawFlyWing(ctx: CanvasRenderingContext2D, c: Css, cell: number, side: 'left' | 'right'): void {
  inUnits(ctx, cell, () => {
    const wing = side === 'left' ? WING_L : WING_R;
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = c.wing;
    ctx.fill(wing);
    ctx.globalAlpha = 1;
    stroke(ctx, wing, c.sumi, 1);
    ctx.globalAlpha = 0.7;
    stroke(ctx, WING_VEINS[side], c.sumi, 0.7);
  });
}

/**
 * Firefly C's body: the glowing tail with lantern ribs, the head and the
 * antennae. Hint: a gold tail. Conflict: a rose tail, straight antennae, and
 * sumi shiver lines either side (shape, so the state never rests on colour).
 */
export function drawFlyBody(ctx: CanvasRenderingContext2D, c: Css, cell: number, kind: FlyKind): void {
  inUnits(ctx, cell, () => {
    const [tail, ribs] = kind === 'hint' ? [c.gold, c.goldEdge] : kind === 'conflict' ? [c.warn, c.roseSpiral] : [c.glow, c.fireflyRib];
    ctx.beginPath();
    ctx.arc(42, 48, 7.5, 0, 2 * Math.PI);
    ctx.fillStyle = tail;
    ctx.fill();
    ctx.strokeStyle = c.sumi;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    stroke(ctx, RIBS, ribs, 1);
    ctx.beginPath();
    ctx.arc(42, 38.5, 3.6, 0, 2 * Math.PI);
    ctx.fillStyle = c.sumi;
    ctx.fill();
    stroke(ctx, kind === 'conflict' ? ANTENNAE_STRAIGHT : ANTENNAE_CURLED, c.sumi, 1);
    if (kind === 'conflict') stroke(ctx, SHIVER, c.sumi, 1.6);
  });
}

/** The hint firefly's marks: a dashed seal-red halo at body height and a small seal with a plus. */
export function drawHintHalo(ctx: CanvasRenderingContext2D, c: Css, cell: number): void {
  inUnits(ctx, cell, () => {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = c.seal;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(42, 44, 25, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = c.seal;
    roundRect(ctx, 63, 6, 15, 15, 2);
    ctx.fill();
    stroke(ctx, new Path2D('M66.5 13.5 h8 M70.5 9.5 v8'), c.onSeal, 2);
  });
}

/** Ruled out: a small pale brush cross on the dark tile. */
export function drawRuledCross(ctx: CanvasRenderingContext2D, c: Css, cell: number): void {
  inUnits(ctx, cell, () => {
    // Two passes, the second thinner and nudged, so the stroke reads as a brush, not a vector line.
    stroke(ctx, new Path2D('M34 31 q4 4 16 16 M50 31 q-5 5 -16 16'), c.ruled, 3);
    ctx.globalAlpha = 0.5;
    stroke(ctx, new Path2D('M34.6 30.4 q4 4.4 16 16.4 M50.4 31.6 q-5.4 4.8 -16.2 15.6'), c.ruled, 1.4);
  });
}

/** A lit tile under fireflies that see each other: no warm centre, soft rose hatching. */
export function drawConflictTile(ctx: CanvasRenderingContext2D, c: Css, cell: number): void {
  inUnits(ctx, cell, () => {
    card(ctx, c.paper, c.goldEdge);
    wash(ctx, c.gold, 6, 6, 72, 66, 5, 1.6, 7);
    ctx.save();
    wobblePath(ctx, 6, 6, 72, 66, 5, 1.6, 7);
    ctx.clip();
    ctx.globalAlpha = 0.45;
    stroke(ctx, new Path2D('M6 22 L22 6 M6 40 L40 6 M6 58 L58 6 M12 70 L76 6 M30 70 L76 24 M48 70 L76 42 M66 70 L76 60'), c.warnHatch, 1.6);
    ctx.restore();
    ctx.strokeStyle = c.sumi;
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, 82, 76, 6);
    ctx.stroke();
  });
}
