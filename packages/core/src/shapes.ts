/**
 * Garden shapes: masks of active cells. Missing cells behave like the board
 * edge. Shapes add variety and act as a difficulty lever with no new rules.
 */
export type ShapeId = 'rect' | 'ring' | 'L' | 'bridge' | 'crescent';

export const SHAPES: readonly ShapeId[] = ['rect', 'ring', 'L', 'bridge', 'crescent'];

/** Build a mask (`#` active, `.` outside). Small boards fall back to a rectangle. */
export function makeMask(shape: ShapeId, w: number, h: number): string[] {
  const grid = Array.from({ length: h }, () => new Array<boolean>(w).fill(true));
  const off = (r: number, c: number) => {
    if (r >= 0 && r < h && c >= 0 && c < w) grid[r]![c] = false;
  };

  switch (shape) {
    case 'rect':
      break;
    case 'ring': {
      // A pond in the middle, a 2-wide path around it (the koi pond board).
      if (w >= 5 && h >= 5) {
        for (let r = 2; r < h - 2; r++) for (let c = 2; c < w - 2; c++) off(r, c);
      }
      break;
    }
    case 'L': {
      const cw = Math.floor(w / 2), ch = Math.floor(h / 2);
      if (w >= 4 && h >= 4) for (let r = 0; r < ch; r++) for (let c = w - cw; c < w; c++) off(r, c);
      break;
    }
    case 'bridge': {
      // Two plots joined by a one-row bridge through the middle.
      if (w >= 7 && h >= 3) {
        const gap0 = Math.floor(w / 2) - 1, gap1 = gap0 + (w % 2 === 0 ? 1 : 2);
        const mid = Math.floor(h / 2);
        for (let r = 0; r < h; r++) if (r !== mid) for (let c = gap0; c <= gap1; c++) off(r, c);
      }
      break;
    }
    case 'crescent': {
      // A disc with a bite taken out of one side.
      if (w >= 5 && h >= 5) {
        const cx = (w - 1) / 2, cy = (h - 1) / 2, rad = Math.min(w, h) / 2 + 0.3;
        const bx = cx + rad * 0.75, br = rad * 0.75;
        for (let r = 0; r < h; r++) {
          for (let c = 0; c < w; c++) {
            const inDisc = (c - cx) ** 2 + (r - cy) ** 2 <= rad * rad;
            const inBite = (c - bx) ** 2 + (r - cy) ** 2 <= br * br;
            if (!inDisc || inBite) off(r, c);
          }
        }
      }
      break;
    }
  }
  return grid.map((row) => row.map((on) => (on ? '#' : '.')).join(''));
}
