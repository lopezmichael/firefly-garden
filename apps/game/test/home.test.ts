import { describe, expect, it } from 'vitest';
import { HOME_LIMITS, homeWords } from '../src/state/home.ts';
import type { HomeStart } from '../src/state/home.ts';
import { HOME_ART, RIG_PARTS, RIG_PIVOTS } from '../src/view/home/art.ts';
import { CAST } from '../src/view/home/cast.ts';
import { COLOR_TOKENS, camel } from '../src/view/tokens.ts';

const STARTS: HomeStart[] = [
  { kind: 'first' },
  { kind: 'resume', at: { chapter: 2, garden: 4 }, word: 'Medium' },
  { kind: 'resume', at: null, word: 'Expert' },
  { kind: 'unlock', chapter: 1 },
  { kind: 'next', chapter: 1, garden: 1, word: 'Easy', glowing: 0 },
  { kind: 'next', chapter: 1, garden: 2, word: 'Easy', glowing: 1 },
  { kind: 'next', chapter: 3, garden: 10, word: 'Expert', glowing: 129 },
  { kind: 'finished' },
];

describe('home words', () => {
  it.each(STARTS.map((s) => [s.kind, s] as const))('%s: every line stays within the measured limits', (_k, s) => {
    const w = homeWords(s);
    expect(w.title.length).toBeLessThanOrEqual(HOME_LIMITS.title);
    expect(w.line.length).toBeLessThanOrEqual(HOME_LIMITS.line);
    expect(w.go.length).toBeLessThanOrEqual(HOME_LIMITS.go);
    expect(w.sub.length).toBeLessThanOrEqual(HOME_LIMITS.sub);
  });

  it('says where the button goes', () => {
    expect(homeWords({ kind: 'first' }).go).toBe('Light the first garden');
    expect(homeWords({ kind: 'resume', at: { chapter: 2, garden: 4 }, word: 'Medium' })).toMatchObject({ go: 'Back to garden 4', sub: 'Medium · Chapter 2' });
    // A detour garden has no place in a chapter: no borrowed number.
    expect(homeWords({ kind: 'resume', at: null, word: 'Hard' })).toMatchObject({ go: 'Back to your garden', sub: 'Hard' });
    expect(homeWords({ kind: 'next', chapter: 1, garden: 2, word: 'Easy', glowing: 1 }).line).toBe('Your first garden glows! Ready for more?');
    expect(homeWords({ kind: 'next', chapter: 1, garden: 3, word: 'Easy', glowing: 2 }).line).toBe('2 gardens are glowing. Ready for more?');
    // Played but nothing grown yet (a garden left for the map): never "0 gardens".
    expect(homeWords({ kind: 'next', chapter: 1, garden: 1, word: 'Easy', glowing: 0 }).line).toBe('Your first garden is still waiting for you.');
    expect(homeWords({ kind: 'unlock', chapter: 1 }).go).toBe('See the garden map');
  });
});

describe('the baked home art', () => {
  it('has the plate and an atlas, and every part lies inside the atlas', () => {
    const { atlas } = HOME_ART;
    const rects = [...HOME_ART.cast.flatMap((c) => Object.values(c.parts).map((p) => p!.rect)), HOME_ART.fx.petal, HOME_ART.fx.heart];
    for (const [x, y, w, h] of rects) {
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(atlas.w);
      expect(y + h).toBeLessThanOrEqual(atlas.h);
    }
  });

  it('gives every character its joints and body parts, and only known parts', () => {
    for (const c of HOME_ART.cast) {
      expect(Object.keys(c.pivots).sort()).toEqual([...RIG_PIVOTS].sort());
      for (const k of Object.keys(c.parts)) expect(RIG_PARTS).toContain(k);
      // (a happy or sleepy friend's eyes are closed arcs: no pupils)
      for (const k of ['wingL', 'wingR', 'armL', 'armR', 'lantern', 'head', 'eyes', 'mouth'] as const) expect(c.parts[k], `${c.id} ${k}`).toBeDefined();
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(HOME_ART.scene.w);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(HOME_ART.scene.h);
    }
  });

  it('moves every character it paints, and lights each with a colour token', () => {
    const tokens = new Set(COLOR_TOKENS.map(camel));
    expect(Object.keys(CAST).sort()).toEqual(HOME_ART.cast.map((c) => c.id).sort());
    for (const m of Object.values(CAST)) expect(tokens.has(m.glow)).toBe(true);
    expect(HOME_ART.cast.find((c) => c.id === 'pip')?.parts.garlandFront).toBeDefined();
  });
});
