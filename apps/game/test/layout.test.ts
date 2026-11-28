import { describe, expect, it } from 'vitest';
import { bandFor, fitBoard, flightPath, HILLS, hillsFor, HOME_FIT, HOME_SCENE, homeFit, keepOrTurn, mapLayout, MIN_TAP, orientFor, segmentPoints, releasePath } from '../src/view/layout.ts';
import type { HomeFit } from '../src/view/layout.ts';

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

describe('a released firefly flies to the progress track', () => {
  const from = { x: 200, y: 500 }, to = { x: 120, y: 40 };

  it('starts on its tile and lands on the track', () => {
    for (const phase of [0, 1.3, 4]) {
      const path = releasePath(from, to, phase);
      expect(path[0]!.x).toBeCloseTo(from.x);
      expect(path[0]!.y).toBeCloseTo(from.y);
      expect(path.at(-1)!.x).toBeCloseTo(to.x);
      expect(path.at(-1)!.y).toBeCloseTo(to.y);
    }
  });

  it('lifts off upward first, and reaches the track from above it, not through the chrome below', () => {
    const path = releasePath(from, to, 0.7);
    expect(path[2]!.y).toBeLessThan(from.y);
    expect(path.at(-2)!.y).toBeLessThan(to.y);
  });

  it('works when the track is beside the board (the wide band), not above it', () => {
    const path = releasePath({ x: 700, y: 300 }, { x: 60, y: 40 }, 2);
    expect(path.at(-1)!.x).toBeCloseTo(60);
    expect(Math.max(...path.map((p) => p.x))).toBeLessThan(800);
  });
});

describe('the home scene fit', () => {
  const shown = (f: HomeFit, vh: number) => (Math.min(vh, f.y + f.h) - Math.max(0, f.y)) / f.k;
  it.each([
    ['phone', 390, 844], ['small phone', 320, 568], ['iPhone SE', 375, 667], ['big phone', 430, 932], ['narrow Android', 360, 800],
  ] as const)('%s: covered edge to edge, scale kept, most of the scene shown', (_n, vw, vh) => {
    const f = homeFit(vw, vh);
    expect(f.column).toBe(false);
    expect(f.x).toBeLessThanOrEqual(0);
    expect(f.x + f.w).toBeGreaterThanOrEqual(vw - 1e-9);
    expect(f.chrome).toEqual({ x: 0, w: vw });
    expect(f.y).toBeLessThanOrEqual(0);
    expect(f.y + f.h).toBeGreaterThanOrEqual(vh - 1e-9);
    expect(f.w / f.h).toBeCloseTo(HOME_SCENE.w / HOME_SCENE.h, 9);
    expect(shown(f, vh)).toBeGreaterThanOrEqual(HOME_SCENE.h * HOME_FIT.minShown - 1e-9);
  });

  it('crops a wide phone mostly from the foreground, keeping the sky and Pip', () => {
    const f = homeFit(375, 667);
    const top = -f.y, bottom = f.y + f.h - 667;
    expect(top).toBeGreaterThan(0);
    expect(top / (top + bottom)).toBeCloseTo(HOME_FIT.topShare, 9);
    expect(f.y + 232 * f.k).toBeGreaterThan(150); // Pip stays well below the title
  });

  it.each([['desktop', 1280, 720], ['iPad', 820, 1180]] as const)('%s: the whole scene as a centred column, the chrome at least its minimum width', (_n, vw, vh) => {
    const f = homeFit(vw, vh);
    expect(f.column).toBe(true);
    expect(f.split).toBe(false);
    expect(f.h).toBe(vh);
    expect(f.x).toBeCloseTo((vw - f.w) / 2, 9);
    expect(f.chrome.w).toBeGreaterThanOrEqual(Math.min(HOME_FIT.chromeMin, f.w));
    expect(f.chrome.x + f.chrome.w / 2).toBeCloseTo(vw / 2, 9);
    expect(f.text).toBeGreaterThanOrEqual(HOME_FIT.textScale[0]);
    expect(f.text).toBeLessThanOrEqual(HOME_FIT.textScale[1]);
  });

  it.each([['phone landscape', 844, 390], ['small landscape', 640, 360], ['portal frame', 800, 450]] as const)('%s: the scene beside a panel, nothing overlapping or off screen', (_n, vw, vh) => {
    const f = homeFit(vw, vh);
    expect(f.split).toBe(true);
    expect(f.x).toBeGreaterThanOrEqual(0);
    expect(f.chrome.x).toBeGreaterThanOrEqual(f.x + f.w);
    expect(f.chrome.x + f.chrome.w).toBeLessThanOrEqual(vw);
    expect(f.chrome.w).toBeGreaterThanOrEqual(300);
    // The band with the arch, Pip and the friends fills the height.
    expect(f.y + HOME_FIT.splitWindow[0] * f.k).toBeCloseTo(0, 9);
    expect(f.y + HOME_FIT.splitWindow[1] * f.k).toBeCloseTo(vh, 9);
  });
});
