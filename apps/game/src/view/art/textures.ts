import { FIBRE, GRAIN, noiseField, wobble } from './noise.ts';
import type { FieldOptions } from './noise.ts';

/**
 * The ink and wash texture kit: paper grain, card fibre, wobbled wash edges and
 * pooled edges, drawn with 2D canvas so nothing on screen runs an SVG filter.
 * The board bakes these once per tile size into its texture cache
 * (`BoardView.texture`); the DOM chrome gets one paper tile at startup
 * (`bakeChromePaper`). Colours always come in as token CSS strings.
 */

/** `#rrggbb` (from the palette) → [r, g, b]. */
function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function context(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return ctx;
}

/** A transparent layer of one colour whose alpha is a noise field, `w × h` device pixels. */
export function noiseLayer(w: number, h: number, color: string, field: FieldOptions): HTMLCanvasElement {
  const c = canvas(w, h);
  const ctx = context(c);
  const img = ctx.createImageData(c.width, c.height);
  const alpha = noiseField(c.width, c.height, field);
  const [r, g, b] = channels(color);
  const d = img.data;
  for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
    d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = alpha[i]!;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Device pixels per CSS pixel on this context (the board's texture cache scales by resolution). */
function scaleOf(ctx: CanvasRenderingContext2D): number {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

/**
 * Device pixels of one repeat, [w, h]. Grain is near white noise, so a 64 px repeat
 * never shows and costs a quarter of a 128 px one (most of the cold start, measured).
 * Fibre streaks run down the tile, so it is twice as tall as it is wide.
 */
const TILE_PX = { grain: [64, 64], fibre: [64, 128] } as const;
const tiles = new Map<string, HTMLCanvasElement>();

/**
 * A tileable noise square, baked once per kind, colour, strength and seed and
 * then reused at every tile size: a resize only redraws, it never re-runs noise.
 */
function noiseTile(kind: 'grain' | 'fibre', color: string, maxAlpha: number, seed: number): HTMLCanvasElement {
  const key = `${kind}|${color}|${maxAlpha}|${seed}`;
  let t = tiles.get(key);
  if (!t) {
    t = noiseLayer(TILE_PX[kind][0], TILE_PX[kind][1], color, { ...(kind === 'grain' ? GRAIN : FIBRE), seed, maxAlpha, periodic: true });
    tiles.set(key, t);
  }
  return t;
}

/**
 * Lay a noise texture over what is already drawn in the box, only where paint
 * already is (`source-atop`), so grain never spills past a shape's edge. The
 * texture repeats at one device pixel per noise pixel, so it stays crisp at
 * any resolution.
 */
export function texturize(
  ctx: CanvasRenderingContext2D, kind: 'grain' | 'fibre', color: string, maxAlpha: number, seed: number,
  x: number, y: number, w: number, h: number,
): void {
  const pattern = ctx.createPattern(noiseTile(kind, color, maxAlpha, seed), 'repeat');
  if (!pattern) return;
  const s = scaleOf(ctx);
  pattern.setTransform(new DOMMatrix().scale(1 / s));
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** A point on a rounded rectangle's outline at arc length `d`, with its outward normal. */
function outlinePoint(x: number, y: number, w: number, h: number, r: number, d: number): [number, number, number, number] {
  const sw = w - 2 * r, sh = h - 2 * r, q = (Math.PI / 2) * r;
  const segs: [number, (t: number) => [number, number, number, number]][] = [
    [sw, (t) => [x + r + t, y, 0, -1]],
    [q, (t) => { const a = -Math.PI / 2 + t / r; return [x + w - r + Math.cos(a) * r, y + r + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; }],
    [sh, (t) => [x + w, y + r + t, 1, 0]],
    [q, (t) => { const a = t / r; return [x + w - r + Math.cos(a) * r, y + h - r + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; }],
    [sw, (t) => [x + w - r - t, y + h, 0, 1]],
    [q, (t) => { const a = Math.PI / 2 + t / r; return [x + r + Math.cos(a) * r, y + h - r + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; }],
    [sh, (t) => [x, y + h - r - t, -1, 0]],
    [q, (t) => { const a = Math.PI + t / r; return [x + r + Math.cos(a) * r, y + r + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; }],
  ];
  for (const [len, at] of segs) {
    if (d <= len) return at(d);
    d -= len;
  }
  return [x + r, y, 0, -1];
}

/**
 * Trace a rounded rectangle whose edge wanders in and out by up to `amp`
 * pixels, as a brushed wash does (replaces the canvas's feDisplacementMap).
 * Seeded, so the same tile always gets the same edge.
 */
export function wobblePath(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, amp: number, seed: number,
): void {
  r = Math.max(0.5, Math.min(r, w / 2, h / 2));
  const perimeter = 2 * (w + h - 4 * r) + 2 * Math.PI * r;
  const count = Math.max(24, Math.round(perimeter / 2));
  // About six gentle bumps per side, as the canvas's feDisplacementMap gives an 84 px tile.
  const off = wobble(count, seed, Math.max(8, Math.round(perimeter / (Math.min(w, h) / 6))));
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const [px, py, nx, ny] = outlinePoint(x, y, w, h, r, (i / count) * perimeter);
    const o = off[i]! * amp;
    if (i === 0) ctx.moveTo(px + nx * o, py + ny * o);
    else ctx.lineTo(px + nx * o, py + ny * o);
  }
  ctx.closePath();
}

/** Fill a wobbled wash. */
export function wash(
  ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number, r: number, amp: number, seed: number,
): void {
  wobblePath(ctx, x, y, w, h, r, amp, seed);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * The darker rim a wash leaves where pigment pools at its edge: a soft band
 * inside the wobbled outline, densest at the edge and fading inward. Built from
 * stacked strokes clipped to the shape, so no blur filter is needed.
 */
export function pooledEdge(
  ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number, r: number,
  width: number, amp: number, seed: number,
): void {
  ctx.save();
  wobblePath(ctx, x, y, w, h, r, amp, seed);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  for (const [k, a] of [[2.6, 0.18], [1.8, 0.22], [1.1, 0.3], [0.5, 0.35]] as const) {
    ctx.globalAlpha = a;
    ctx.lineWidth = width * k;
    ctx.stroke();
  }
  ctx.restore();
}

/** CSS pixels of one repeat of the chrome's paper texture. */
export const CHROME_PAPER_PX = 128;

/**
 * One tileable square of paper grain for the DOM chrome (status card, sheets,
 * buttons), as a `blob:` URL to layer over a paper background colour. Baked
 * once at startup; the PNG encode runs off the main thread (`toBlob`), and the
 * CSP already allows `img-src blob:`. Resolves null if the browser cannot
 * encode it: the chrome then shows plain paper. Without a 2D canvas at all it
 * throws, like the board's own textures, and the game shows its error screen.
 */
export function bakeChromePaper(grain: string, resolution: number): Promise<string | null> {
  const s = Math.min(2, Math.max(1, resolution));
  const px = Math.round(CHROME_PAPER_PX * s);
  const c = canvas(px, px);
  const ctx = context(c);
  // The shared grain tile at one CSS pixel per noise pixel, so the chrome's specks are the
  // same size at 1x and 2x; 128 CSS px holds exactly two repeats, so the result still tiles.
  const pattern = ctx.createPattern(noiseTile('grain', grain, 70, 31), 'repeat');
  if (pattern) {
    pattern.setTransform(new DOMMatrix().scale(px / CHROME_PAPER_PX));
    ctx.fillStyle = pattern;
    // Lighter than the lit tile's grain: the canvas's paper cards read as nearly plain.
    ctx.globalAlpha = 0.6;
    ctx.fillRect(0, 0, px, px);
  }
  return new Promise((resolve) => c.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/png'));
}
