import { describe, expect, it } from 'vitest';
import { bandFor, fitBoard, keepOrTurn, MIN_TAP, orientFor } from '../src/view/layout.ts';

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
