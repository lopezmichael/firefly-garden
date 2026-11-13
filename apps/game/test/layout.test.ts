import { describe, expect, it } from 'vitest';
import { bandFor, fitBoard, flightPath, HILLS, hillsFor, keepOrTurn, mapLayout, MIN_TAP, orientFor, segmentPoints } from '../src/view/layout.ts';

describe('layout bands follow the screen shape', () => {
  it.each([
    ['phone portrait', 390, 844, 'tall'],
    ['small Android portrait', 360, 740, 'tall'],
    ['phone landscape', 844, 390, 'wide'],
    ['iPhone Duo unfolded portrait', 626, 890, 'square'],
    ['iPhone Duo unfolded landscape', 890, 626, 'wide'],
    ['iPhone Duo outer screen', 470, 670, 'square'],
    ['iPad portrait', 820, 1180, 'square'],
    ['desktop', 1280, 720, 'wide'],
  ] as const)('%s → %s', (_name, w, h, band) => {
    expect(bandFor(w, h)).toBe(band);
  });
});

describe('board fit', () => {
  it('an 8x8 board on a 360 px phone with no outer gutter stays near the tap minimum', () => {
    const fit = fitBoard(8, 8, 360, 400);
    expect(fit.width).toBeLessThanOrEqual(360);
    expect(fit.cell).toBeGreaterThanOrEqual(38);
  });

  it('an 8x8 board on the iPhone Duo outer screen clears the tap minimum easily', () => {
    expect(fitBoard(8, 8, 470 - 32, 450).cell).toBeGreaterThanOrEqual(MIN_TAP);
  });

  it('never exceeds the area it is given', () => {
    for (const [c, r, w, h] of [[4, 4, 300, 300], [10, 6, 500, 300], [5, 9, 320, 700]] as const) {
      const fit = fitBoard(c, r, w, h);
      expect(fit.width).toBeLessThanOrEqual(w);
      expect(fit.height).toBeLessThanOrEqual(h);
    }
  });
});

describe('orientation', () => {
  it('turns a wide level on a tall screen and keeps square levels as stored', () => {
    expect(orientFor(9, 5, 360, 600)).toBe('rot90');
    expect(orientFor(9, 5, 800, 360)).toBe('identity');
    expect(orientFor(6, 6, 360, 600)).toBe('identity');
  });

  it('keeps the orientation through a fold unless the board would get too small', () => {
    // Unfolding (more room): keep as is.
    expect(keepOrTurn('identity', 9, 5, 600, 560)).toBe('identity');
    // Folding to a narrow screen where the wide board gets tiny: turn.
    expect(keepOrTurn('identity', 9, 5, 330, 600)).toBe('rot90');
  });
});

describe('jar flight path', () => {
  it('starts at the jar, ends on the tile and rises above both', () => {
    const from = { x: 60, y: 600 }, to = { x: 300, y: 200 };
    const p = flightPath(from, to);
    expect(p[0]).toEqual(from);
    expect(p[p.length - 1]).toEqual(to);
    expect(Math.min(...p.map((q) => q.y))).toBeLessThan(200);
  });
});

describe('hills sit behind the status card', () => {
  const card = { left: 16, top: 600, right: 374, bottom: 720 };

  it('rise just above the card and span the screen in tall and square', () => {
    for (const band of ['tall', 'square'] as const) {
      const h = hillsFor(band, 390, 844, card);
      expect(h.left).toBe(0);
      expect(h.right).toBe(390);
      expect(h.mossTop).toBeLessThan(card.top);
      expect(h.duskTop).toBeLessThan(h.mossTop);
      expect(h.bottom).toBe(844);
    }
  });

  it('stay in the side column, a little past it, in wide', () => {
    const side = { left: 16, top: 520, right: 276, bottom: 700 };
    const h = hillsFor('wide', 1280, 720, side);
    expect(h.right).toBe(side.right + HILLS.wideReach);
    expect(h.right).toBeLessThan(1280 / 2);
  });

  it('never start above the screen, and keep their motes over the hills', () => {
    const h = hillsFor('tall', 390, 844, { left: 16, top: 20, right: 374, bottom: 140 });
    expect(h.duskTop).toBeGreaterThanOrEqual(0);
    expect(h.mossTop).toBeGreaterThanOrEqual(0);
    const g = hillsFor('tall', 390, 844, card);
    expect(g.motes).toHaveLength(HILLS.motes);
    for (const m of g.motes) {
      expect(m.x).toBeGreaterThanOrEqual(g.left - 12);
      expect(m.x).toBeLessThanOrEqual(g.right + 12);
      expect(m.y).toBeLessThan(g.mossTop + 30);
    }
  });
});

describe('the garden map path', () => {
  const m = mapLayout(4, 390, 260, 640);

  it('puts one stop per chapter plus the teaser, top to bottom, inside the width', () => {
    expect(m.stops).toHaveLength(4);
    expect(m.stops[0]!.y).toBe(260);
    expect(m.stops[3]!.y).toBe(640);
    for (let i = 1; i < 4; i++) expect(m.stops[i]!.y).toBeGreaterThan(m.stops[i - 1]!.y);
    for (const p of m.stops) {
      expect(p.x).toBeGreaterThan(40);
      expect(p.x).toBeLessThan(350);
    }
  });

  it('zig-zags, with each label on the open side', () => {
    expect(m.labelRight).toEqual([true, false, true, false]);
    expect(m.stops[0]!.x).toBeLessThan(195);
    expect(m.stops[1]!.x).toBeGreaterThan(195);
  });

  it('joins every stop to the next, and the flight runs exactly from one stop to the next', () => {
    expect(m.segments).toHaveLength(3);
    m.segments.forEach((s, i) => {
      expect(s.from).toEqual(m.stops[i]);
      expect(s.to).toEqual(m.stops[i + 1]);
      const pts = segmentPoints(s);
      expect(pts[0]).toEqual(s.from);
      expect(pts.at(-1)!.x).toBeCloseTo(s.to.x, 9);
      expect(pts.at(-1)!.y).toBeCloseTo(s.to.y, 9);
    });
  });
});
