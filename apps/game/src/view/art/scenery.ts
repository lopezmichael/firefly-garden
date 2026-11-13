import type { HillLayout } from '../layout.ts';
import type { Palette } from '../theme.ts';
import { drawRose } from './pieces.ts';
import { texturize } from './textures.ts';

/**
 * The scenery behind the chrome (design: Round 4 and the play bands): the
 * night with paper grain, a far dusk ridge with its ink line, and a near moss
 * ridge with a dot texture, an ink ridge line and small roses along it. Drawn
 * once per screen size into one canvas (no live filters); the moon and the
 * drifting motes are DOM, so they can move without a redraw.
 */

type Css = Palette['css'];

/** The canvas's ridge curves, in its 390-wide phone space, and each curve's highest point. */
const DUSK = { top: 642, start: 690, curves: [[40, 664, 80, 676, 120, 658], [160, 642, 200, 664, 240, 654], [290, 640, 330, 662, 390, 648]] } as const;
const MOSS = { top: 676, start: 726, curves: [[50, 700, 100, 716, 150, 694], [200, 676, 250, 704, 300, 690], [340, 680, 370, 694, 390, 688]] } as const;
/** Roses along the moss ridge: x in the 390 space, depth below the ridge top, size. */
const RIDGE_ROSES = [[132, 14, 10], [290, 8, 9], [40, 36, 9]] as const;
const SPACE = 390;

function ridgePath(ctx: CanvasRenderingContext2D, r: typeof DUSK | typeof MOSS, h: HillLayout, top: number): void {
  const sx = (x: number) => h.left + (x / SPACE) * (h.right - h.left);
  const sy = (y: number) => top + (y - r.top);
  ctx.beginPath();
  ctx.moveTo(sx(0), sy(r.start));
  for (const [x1, y1, x2, y2, x3, y3] of r.curves) ctx.bezierCurveTo(sx(x1), sy(y1), sx(x2), sy(y2), sx(x3), sy(y3));
}

function closeDown(ctx: CanvasRenderingContext2D, h: HillLayout): void {
  ctx.lineTo(h.right, h.bottom);
  ctx.lineTo(h.left, h.bottom);
  ctx.closePath();
}

/** Draw the whole scene into a `w × h` CSS-pixel context (the caller scales for resolution). */
export function drawScenery(ctx: CanvasRenderingContext2D, c: Css, w: number, h: number, hills: HillLayout): void {
  ctx.fillStyle = c.night;
  ctx.fillRect(0, 0, w, h);
  texturize(ctx, 'grain', c.wing, 16, 4, 0, 0, w, h);

  // Far ridge: a dusk wash with its own ink line.
  ridgePath(ctx, DUSK, hills, hills.duskTop);
  closeDown(ctx, hills);
  ctx.fillStyle = c.hillDusk;
  ctx.fill();
  ridgePath(ctx, DUSK, hills, hills.duskTop);
  ctx.strokeStyle = c.hillInk;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Near ridge: moss with a dot texture and a sumi ridge line.
  ridgePath(ctx, MOSS, hills, hills.mossTop);
  closeDown(ctx, hills);
  ctx.fillStyle = c.mossLo;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = c.hillDots;
  // One path for every dot: a single fill instead of thousands.
  ctx.beginPath();
  for (let y = hills.mossTop + 3; y < hills.bottom; y += 6) {
    for (let x = hills.left + 3; x < hills.right; x += 6) {
      ctx.moveTo(x + 1.1, y);
      ctx.arc(x, y, 1.1, 0, 2 * Math.PI);
    }
  }
  ctx.fill();
  ctx.restore();
  ridgePath(ctx, MOSS, hills, hills.mossTop);
  ctx.strokeStyle = c.sumi;
  ctx.lineWidth = 2;
  ctx.stroke();

  RIDGE_ROSES.forEach(([x, depth, size], i) => {
    ctx.save();
    ctx.translate(hills.left + (x / SPACE) * (hills.right - hills.left) - size / 2, hills.mossTop + depth - size / 2);
    drawRose(ctx, c, size, i % 3);
    ctx.restore();
  });
}
