import { describe, expect, it } from 'vitest';
import { canonicalCell, displayCell, keyAction, stepFocus } from '../src/view/layout.ts';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
  keyAction({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe('display mapping', () => {
  it('round-trips every cell under both orientations', () => {
    for (const t of ['identity', 'rot90'] as const) {
      for (let cell = 0; cell < 4 * 6; cell++) {
        const [r, c] = displayCell(t, 4, 6, cell);
        expect(canonicalCell(t, 4, 6, r, c)).toBe(cell);
      }
    }
  });

  it('rot90 turns the level a quarter clockwise: its bottom-left corner shows top-left', () => {
    // 3 wide, 2 tall. Canonical bottom-left is cell 3 (row 1, col 0).
    expect(displayCell('rot90', 3, 2, 3)).toEqual([0, 0]);
    expect(displayCell('rot90', 3, 2, 0)).toEqual([0, 1]);
  });
});

describe('keyboard focus moves on screen, not in canonical space', () => {
  const none = () => false;
  it('steps one cell and stays put at the edge', () => {
    expect(stepFocus('identity', 3, 3, 4, 'right', none)).toBe(5);
    expect(stepFocus('identity', 3, 3, 5, 'right', none)).toBe(5);
    expect(stepFocus('identity', 3, 3, 4, 'up', none)).toBe(1);
  });

  it('follows the rotated board as drawn', () => {
    // 3 wide, 2 tall, turned: "right" on screen from cell 3 (shown top-left) reaches cell 0.
    expect(stepFocus('rot90', 3, 2, 3, 'right', none)).toBe(0);
    expect(stepFocus('rot90', 3, 2, 3, 'down', none)).toBe(4);
  });

  it('skips cells outside the garden, and stays put when nothing lies beyond', () => {
    const pond = new Set([1]);
    expect(stepFocus('identity', 3, 1, 0, 'right', (c) => pond.has(c))).toBe(2);
    expect(stepFocus('identity', 3, 1, 0, 'right', (c) => c !== 0)).toBe(0);
  });
});

describe('key map', () => {
  it('arrows move, space and enter toggle, Z undoes, H hints', () => {
    expect(key('ArrowLeft')).toEqual({ kind: 'move', dir: 'left' });
    expect(key(' ')).toEqual({ kind: 'toggle' });
    expect(key('Enter')).toEqual({ kind: 'toggle' });
    expect(key('z')).toEqual({ kind: 'undo' });
    expect(key('Z')).toEqual({ kind: 'undo' }); // caps lock
    expect(key('z', { ctrlKey: true })).toEqual({ kind: 'undo' });
    expect(key('z', { metaKey: true })).toEqual({ kind: 'undo' });
    expect(key('h')).toEqual({ kind: 'hint' });
  });

  it('leaves other keys and browser chords alone', () => {
    expect(key('x')).toBeNull();
    expect(key('Tab')).toBeNull();
    expect(key('h', { ctrlKey: true })).toBeNull();
    expect(key('z', { altKey: true })).toBeNull();
    expect(key('ArrowUp', { metaKey: true })).toBeNull();
    expect(key('z', { ctrlKey: true, shiftKey: true })).toBeNull(); // redo, not undo
    expect(key('Z', { shiftKey: true })).toBeNull();
  });
});
