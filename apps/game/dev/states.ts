/**
 * Dev-only state sheet (theme plan, milestone 3): every board state from the
 * canvas's "Components · states, icons, coin" board, drawn by the real
 * BoardView from real core evaluations. `npm run dev`, then open
 * /dev/states.html. Not part of the production build (Vite builds index.html
 * only). Add `?reduced` for reduced motion.
 */
import '../src/fonts.css';
import '../src/theme.css';
import { buildBoard, evaluate, parseLevel } from '@firefly/core';
import type { BushSpec, Coord } from '@firefly/core';
import { BoardView } from '../src/view/board.ts';
import { readPalette } from '../src/view/theme.ts';

interface Specimen {
  readonly label: string;
  readonly w: number;
  readonly h: number;
  readonly bushes: readonly BushSpec[];
  readonly flies?: readonly Coord[];
  readonly locked?: readonly Coord[];
  readonly ruledOut?: readonly Coord[];
  readonly because?: readonly Coord[];
}

const SPECIMENS: readonly Specimen[] = [
  { label: 'Dark path tile', w: 1, h: 1, bushes: [] },
  { label: 'Lit tile', w: 2, h: 1, bushes: [], flies: [[0, 0]] },
  { label: 'Your firefly', w: 1, h: 1, bushes: [], flies: [[0, 0]] },
  { label: 'Hint firefly', w: 1, h: 1, bushes: [], flies: [[0, 0]], locked: [[0, 0]] },
  { label: 'Conflict: they see each other', w: 2, h: 1, bushes: [], flies: [[0, 0], [0, 1]] },
  { label: 'Ruled out', w: 1, h: 1, bushes: [], ruledOut: [[0, 0]] },
  { label: 'Lit by two, still one lit tile', w: 3, h: 1, bushes: [], flies: [[0, 0], [0, 2]] },
  { label: 'Wanting 3, one so far', w: 3, h: 3, bushes: [[1, 1, 3]], flies: [[0, 0]] },
  { label: 'Happy: roses, number gold', w: 3, h: 3, bushes: [[1, 1, 3]], flies: [[0, 0], [1, 2], [2, 1]] },
  { label: 'Too many: wilts', w: 3, h: 3, bushes: [[1, 1, 2]], flies: [[0, 0], [1, 2], [2, 1]] },
  { label: 'No number', w: 2, h: 1, bushes: [[0, 0, null]] },
  { label: 'Wants none', w: 2, h: 1, bushes: [[0, 0, 0]] },
  { label: 'Wanting 8, five so far', w: 3, h: 3, bushes: [[1, 1, 8]], flies: [[0, 0], [0, 2], [2, 0], [2, 2], [1, 0]] },
  { label: 'Hint reason outline', w: 3, h: 1, bushes: [[0, 1, 1]], because: [[0, 1], [0, 2]] },
];

const reduced = new URLSearchParams(location.search).has('reduced');
const pal = readPalette();
const root = document.getElementById('app')!;
root.style.cssText = 'display:flex;flex-wrap:wrap;gap:28px 36px;padding:28px;align-items:flex-start;font:13px Figtree,sans-serif;color:var(--ff-paper)';
const CELL = 104;

async function show(s: Specimen): Promise<void> {
  const level = { id: `sheet-${s.label}`, w: s.w, h: s.h, mask: Array.from({ length: s.h }, () => '#'.repeat(s.w)), bushes: s.bushes };
  const board = buildBoard(level);
  const idx = ([r, c]: Coord) => r * s.w + c;
  const fig = document.createElement('figure');
  fig.style.cssText = 'margin:0;display:flex;flex-direction:column;gap:8px';
  const host = document.createElement('div');
  // Room for the cells plus the board's own padding (BOARD_GEOMETRY).
  host.style.cssText = `width:${Math.round(CELL * (s.w + (s.w - 1) * 0.07 + 0.12))}px;height:${Math.round(CELL * (s.h + (s.h - 1) * 0.07 + 0.12))}px`;
  const cap = document.createElement('figcaption');
  cap.textContent = s.label;
  fig.append(host, cap);
  root.append(fig);
  const view = await BoardView.create(host, { palette: pal, reducedMotion: reduced, onTap: () => undefined });
  view.setLevel(board, 'identity');
  view.resize(host.clientWidth, host.clientHeight);
  view.render({
    evaluation: evaluate(board, (s.flies ?? []).map(idx)),
    locked: new Set((s.locked ?? []).map(idx)),
    because: new Set((s.because ?? []).map(idx)),
    ruledOut: new Set((s.ruledOut ?? []).map(idx)),
    solved: false,
  }, { quiet: true });
}

/**
 * `?level=<id>`: a real launch level at phone width (the tall band's board area),
 * with the first `placed` solution fireflies on it (all of them by default), to
 * check how busy a big board gets.
 */
async function showLevel(id: string, placed: number | null, width: number): Promise<void> {
  const { default: launch } = await import('../../../levels/launch.json');
  const raw = launch.levels.find((l) => l.id === id);
  if (!raw) throw new Error(`no launch level ${id}`);
  const level = parseLevel(raw);
  const board = buildBoard(level);
  const sol = (level.solution ?? []).slice(0, placed ?? undefined).map(([r, c]) => r * level.w + c);
  const host = document.createElement('div');
  host.style.cssText = `width:${width}px;height:${width}px`;
  const cap = document.createElement('p');
  cap.textContent = `${id} · ${level.w}×${level.h} · ${sol.length} of ${level.solution?.length ?? 0} fireflies · ${width} px`;
  root.append(host, cap);
  const view = await BoardView.create(host, { palette: pal, reducedMotion: reduced, onTap: () => undefined });
  view.setLevel(board, 'identity');
  view.resize(width, width);
  view.render({ evaluation: evaluate(board, sol), locked: new Set(), because: new Set(), ruledOut: new Set(), solved: false }, { quiet: true });
}

await document.fonts.load('400 30px "Young Serif"').catch(() => undefined);
const params = new URLSearchParams(location.search);
const levelId = params.get('level');
if (levelId) {
  const placed = params.get('placed');
  for (const w of [374, 560]) await showLevel(levelId, placed === null ? null : Number(placed), w);
} else {
  for (const s of SPECIMENS) await show(s);
}
document.body.dataset.ready = 'true';
