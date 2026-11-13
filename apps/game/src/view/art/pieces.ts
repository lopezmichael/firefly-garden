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

