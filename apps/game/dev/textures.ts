/**
 * Dev-only specimen and timing page for the ink and wash texture kit (theme
 * plan, milestone 2). `npm run dev`, then open /dev/textures.html. Not part of
 * the production build (Vite builds index.html only).
 */
import '../src/fonts.css';
import '../src/theme.css';
import { drawBush, drawDarkTile, drawLitTile, drawRose } from '../src/view/art/pieces.ts';
import { bakeChromePaper, CHROME_PAPER_PX } from '../src/view/art/textures.ts';
import { readPalette } from '../src/view/theme.ts';

const pal = readPalette();
const c = pal.css;

/** Draw one piece into a fresh canvas the way the board's texture cache does. */
function piece(draw: (ctx: CanvasRenderingContext2D) => void, cell: number, res: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(cell * res);
  const ctx = cv.getContext('2d')!;
  ctx.scale(res, res);
  draw(ctx);
  return cv;
}

function tile(kind: 'dark' | 'lit', cell: number, res: number): HTMLCanvasElement {
  return piece((ctx) => (kind === 'dark' ? drawDarkTile : drawLitTile)(ctx, c, cell), cell, res);
}

/** Bake the full set a board needs for one cell size; milliseconds. */
function bakeSet(cell: number, res: number): number {
  const t0 = performance.now();
  tile('dark', cell, res);
  tile('lit', cell, res);
  for (const kind of ['numbered', 'plain', 'wilted'] as const) piece((ctx) => drawBush(ctx, c, cell, kind), cell, res);
  const rose = Math.round((cell * 15) / 84);
  for (let v = 0; v < 4; v++) piece((ctx) => drawRose(ctx, c, rose, v), rose, res);
  return performance.now() - t0;
}

/** Main-thread cost of the chrome paper (the PNG encode itself runs off-thread). */
function bakeChrome(res: number): number {
  const t0 = performance.now();
  bakeChromePaper(c.paperGrain, res);
  return performance.now() - t0;
}

declare global {
  interface Window { ffBench: (cell: number, res: number) => { set: number; chrome: number } }
}
// Chrome first, as main.ts does at startup; a cell of 0 times the chrome paper alone.
window.ffBench = (cell, res) => {
  const chrome = bakeChrome(res || 2);
  return { chrome, set: cell > 0 ? bakeSet(cell, res) : 0 };
};

// Specimen: the tiles at a phone 7x7 size and a large size, plus the chrome paper.
// `?bench` skips it so a timing run starts cold.
if (!location.search.includes('bench')) specimen();

function specimen(): void {
  const root = document.getElementById('app')!;
  root.style.cssText = 'display:flex;flex-wrap:wrap;gap:24px;padding:24px;align-items:flex-end';
  const res = Math.min(3, window.devicePixelRatio || 1);
  for (const cell of [45, 120]) {
    for (const kind of ['dark', 'lit'] as const) {
      const cv = tile(kind, cell, res);
      const edge = Math.max(3, Math.round(cell * 0.1));
      cv.style.width = cv.style.height = `${cell + edge}px`;
      const fig = document.createElement('figure');
      fig.style.cssText = 'margin:0;font:12px Figtree,sans-serif';
      const cap = document.createElement('figcaption');
      cap.textContent = `${kind} · ${cell} px`;
      fig.append(cv, cap);
      root.append(fig);
    }
  }
  const paper = document.createElement('div');
  paper.style.cssText = `width:${CHROME_PAPER_PX * 2.5}px;height:160px;border:2px solid var(--ff-sumi);border-radius:12px;`
    + `background:var(--ff-paper) 0 0/${CHROME_PAPER_PX}px ${CHROME_PAPER_PX}px;`
    + 'color:var(--ff-sumi);font:15px Figtree,sans-serif;padding:14px;box-sizing:border-box';
  paper.innerHTML = '<div style="font:22px \'Young Serif\',serif">Chrome paper</div>Tiled 128 px grain over --ff-paper, baked once at startup.';
  void bakeChromePaper(c.paperGrain, res).then((url) => {
    if (url) paper.style.backgroundImage = `url(${url})`;
  });
  root.append(paper);
}
