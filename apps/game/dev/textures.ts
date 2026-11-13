/**
 * Dev-only specimen and timing page for the ink and wash texture kit (theme
 * plan, milestone 2). `npm run dev`, then open /dev/textures.html. Not part of
 * the production build (Vite builds index.html only).
 */
import '../src/fonts.css';
import '../src/theme.css';
import { bakeChromePaper, CHROME_PAPER_PX, pooledEdge, texturize, wash } from '../src/view/art/textures.ts';
import { readPalette } from '../src/view/theme.ts';

const pal = readPalette();
const c = pal.css;

/** Draw one tile kind into a fresh canvas the way the board's texture cache does. */
function tile(kind: 'dark' | 'lit', cell: number, res: number): HTMLCanvasElement {
  const edge = Math.max(3, Math.round(cell * 0.1));
  const size = cell + edge;
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(size * res);
  const ctx = cv.getContext('2d')!;
  ctx.scale(res, res);
  const r = cell * 0.08;
  if (kind === 'dark') {
    ctx.fillStyle = c.tileDarkEdge;
    ctx.fillRect(0, edge, cell, cell);
    ctx.fillStyle = c.tileDark;
    ctx.fillRect(0, 0, cell, cell);
    texturize(ctx, 'fibre', c.wing, 26, 11, 0, 0, size, size);
    ctx.globalAlpha = 0.5;
    wash(ctx, c.tileDarkHi, cell * 0.08, cell * 0.08, cell * 0.84, cell * 0.84, r, cell * 0.025, 7);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = c.tileLitEdge;
    ctx.fillRect(0, edge, cell, cell);
    ctx.fillStyle = c.ink;
    ctx.fillRect(0, 0, cell, cell);
    wash(ctx, c.gold, cell * 0.07, cell * 0.07, cell * 0.86, cell * 0.86, r, cell * 0.025, 7);
    pooledEdge(ctx, c.tileLitLo, cell * 0.07, cell * 0.07, cell * 0.86, cell * 0.86, r, Math.max(1.5, cell * 0.035), cell * 0.025, 7);
    texturize(ctx, 'grain', c.paperGrain, 70, 31, 0, 0, size, size);
  }
  return cv;
}

/** Bake the full set a board needs for one cell size; milliseconds. */
function bakeSet(cell: number, res: number): number {
  const t0 = performance.now();
  tile('dark', cell, res);
  tile('lit', cell, res);
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
