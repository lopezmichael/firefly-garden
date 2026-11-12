import { describe, expect, it } from 'vitest';
import {
  buildBoard, buildRamp, cellIndex, evaluate, generate, isUnique, makeMask, parseLevel, placeDebut, sawtooth, SHAPES,
  type RampLevel,
} from '../src/index.ts';

describe('generate', () => {
  it('is deterministic for a given spec', () => {
    const spec = { id: 'det', seed: 42, w: 6, h: 6, bushDensity: 0.18, hide: 'max' as const };
    expect(JSON.stringify(generate(spec)?.level)).toBe(JSON.stringify(generate(spec)?.level));
  });

  it('produces valid, unique levels whose stored solution solves them, in every shape', () => {
    for (const [i, shape] of SHAPES.entries()) {
      for (const hide of ['none', 'max'] as const) {
        const gen = generate({ id: `${shape}-${hide}`, seed: 70 + i, w: 7, h: 7, shape, bushDensity: 0.17, hide });
        expect(gen, `${shape}/${hide}`).not.toBeNull();
        const level = parseLevel(JSON.parse(JSON.stringify(gen!.level)));
        const board = buildBoard(level);
        expect(isUnique(board)).toBe(true);
        expect(evaluate(board, level.solution!.map((c) => cellIndex(board, c))).solved).toBe(true);
        expect(level.mask).toEqual(makeMask(shape, 7, 7));
      }
    }
  });

  it('keeps every number visible with hide "none" and hides some with "max"', () => {
    const none = generate({ id: 'n', seed: 5, w: 7, h: 7, bushDensity: 0.2, hide: 'none' })!;
    const max = generate({ id: 'm', seed: 5, w: 7, h: 7, bushDensity: 0.2, hide: 'max' })!;
    expect(none.level.bushes.every(([, , n]) => n !== null)).toBe(true);
    expect(max.level.bushes.some(([, , n]) => n === null)).toBe(true);
  });

  it('respects targetTiers and maxTier', () => {
    for (let i = 0; i < 8; i++) {
      const easy = generate({ id: `t${i}`, seed: 300 + i, w: 6, h: 6, bushDensity: 0.18, hide: 'max', maxTier: 2, targetTiers: [1, 2] });
      if (easy) expect(easy.difficulty.tier).toBeLessThanOrEqual(2);
    }
  });

  it('never puts a repair lantern on a moonlit tile (regression)', () => {
    const spec = {
      id: 'f925', seed: 152132, w: 5, h: 4, shape: 'rect' as const, bushDensity: 0.1, hide: 'max' as const,
      mushrooms: 0.08, moonlit: 0.1, lanterns: true, attempts: 10,
    };
    expect(() => generate(spec)).not.toThrow();
    for (let i = 0; i < 40; i++) {
      expect(() => generate({ ...spec, id: `lm${i}`, seed: 5000 + i })).not.toThrow();
    }
  });

  it('places numbered mushrooms with 4-neighbor counts derived from the answer', () => {
    const gen = generate({ id: 'tw', seed: 11, w: 7, h: 7, bushDensity: 0.15, mushrooms: 0.08, moonlit: 0.06 })!;
    const t = gen.level.twists!;
    expect(t.mushrooms?.length).toBeGreaterThan(0);
    expect(t.moonlit?.length).toBeGreaterThan(0);
    const fly = new Set(gen.level.solution!.map(([r, c]) => `${r},${c}`));
    for (const [r, c, n] of t.mushrooms!) {
      const sides = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => fly.has(`${a},${b}`)).length;
      expect(n).toBe(sides);
    }
  });

  it('stops hiding clues before crossing maxSeconds, instead of discarding the level', () => {
    const spec = { id: 'cap', seed: 9002, w: 9, h: 9, bushDensity: 0.16, hide: 'max' as const };
    const free = generate(spec)!;
    const capped = generate({ ...spec, maxSeconds: 395 })!;
    expect(free.difficulty.estimatedSeconds).toBeGreaterThan(395);
    expect(capped.attempts).toBe(free.attempts); // same board, not a retry
    expect(capped.difficulty.estimatedSeconds).toBeLessThanOrEqual(395);
    expect(capped.difficulty.features.hiddenBushes).toBeLessThan(free.difficulty.features.hiddenBushes);
  });

  it('makes teaching levels: the hardest technique needed at most maxHardestSteps times', () => {
    let made = 0;
    for (let i = 0; i < 12; i++) {
      const g = generate({ id: `teach${i}`, seed: 800 + i, w: 6, h: 6, bushDensity: 0.18, hide: 'max', targetTiers: [3, 3], maxHardestSteps: 1 });
      if (!g) continue;
      made++;
      expect(g.difficulty.tier).toBe(3);
      expect(g.grade.tierCounts[3]).toBeLessThanOrEqual(1);
    }
    expect(made).toBeGreaterThan(3);
  });

  it('places fixed lanterns from the answer', () => {
    const g = generate({ id: 'lan', seed: 77, w: 7, h: 7, bushDensity: 0.16, fixedLanterns: 2, moonlit: 0.05 })!;
    const lanterns = g.level.twists?.lanterns ?? [];
    expect(lanterns.length).toBeGreaterThanOrEqual(2);
    const sol = new Set(g.level.solution!.map(([r, c]) => `${r},${c}`));
    for (const [r, c] of lanterns) expect(sol.has(`${r},${c}`)).toBe(true);
  });

  it('respects maxSeconds', () => {
    // Seeds chosen so the capped spec succeeds and the same spec without the cap lands well over
    // 150 s, so the cap is what keeps each one under. Seeds that give up (null) cost a full
    // attempt budget and prove nothing, so none are included.
    for (const seed of [601, 602, 604]) {
      const spec = { id: `ms${seed}`, seed, w: 10, h: 10, bushDensity: 0.16, hide: 'max' as const };
      expect(generate(spec)!.difficulty.estimatedSeconds).toBeGreaterThan(150);
      const gen = generate({ ...spec, maxSeconds: 150 });
      expect(gen).not.toBeNull();
      expect(gen!.difficulty.estimatedSeconds).toBeLessThanOrEqual(150);
    }
  });
});

describe('ramp', () => {
  const lv = (id: string, score: number, tier = 2, area = 25, mechanics: string[] = []): RampLevel =>
    ({ id, score, tier, area, mechanics, estimatedSeconds: score });

  it('climbs, slots in breathers, and ends on the peak', () => {
    const out = sawtooth([1, 9, 3, 7, 5, 2, 8, 4, 6].map((s) => lv(String(s), s)), 3).map((l) => l.score);
    expect(out[0]).toBe(1);
    expect(out.at(-1)).toBe(9);
    expect(out).toHaveLength(9);
    const dips = out.slice(1).filter((s, i) => s < out[i]!).length;
    expect(dips).toBeGreaterThanOrEqual(2);
  });

  const tl = (id: string, score: number, tier: number, newTierSteps: number): RampLevel => {
    const tierSteps = [0, 0, 0, 0, 0, 0];
    tierSteps[tier] = newTierSteps;
    return { ...lv(id, score, tier), tierSteps };
  };

  it('debuts each new tier on its gentlest level', () => {
    // 'soft' is later in the same chapter, so it swaps places with 'hard'; the peak stays put.
    const pool = [tl('a', 10, 1, 1), tl('b', 12, 1, 1), tl('c', 14, 1, 1), tl('hard', 30, 2, 5), tl('soft', 31, 2, 1), tl('top', 60, 2, 4)];
    const [ch] = buildRamp(pool, [{ id: 'c', title: 'C', count: 5, tiers: [1, 2] }]);
    const ids = ch!.levels.map((l) => l.id);
    expect(ch!.levels.find((l) => l.tier === 2)?.id).toBe('soft');
    expect(ids.at(-1)).toBe('top');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the peak when a new tier first appears on it, teaching just before', () => {
    const pool = [tl('a', 10, 1, 1), tl('t', 11, 2, 1), tl('a2', 12, 1, 1), tl('a3', 14, 1, 1), tl('p', 50, 2, 6)];
    const [ch] = buildRamp(pool, [{ id: 'c', title: 'C', count: 3, tiers: [1, 2] }]);
    const ids = ch!.levels.map((l) => l.id);
    expect(ids.at(-1)).toBe('p'); // the peak survives
    expect(ids.at(-2)).toBe('t'); // the teacher sits right before it
  });

  it('teaches a lower tier even when a higher one appeared first', () => {
    const pool = [tl('a', 10, 1, 1), tl('t3', 40, 3, 1), tl('t2hard', 45, 2, 6), tl('t2soft', 46, 2, 1), tl('z', 99, 3, 2)];
    const [ch] = buildRamp(pool, [{ id: 'c', title: 'C', count: 4, tiers: [1, 3] }]);
    const firstT2 = ch!.levels.find((l) => l.tier === 2);
    expect(firstT2?.id).toBe('t2soft');
  });

  describe('placeDebut', () => {
    const L = (id: string, tier: number, score: number, newSteps = 1) => {
      const tierSteps = [0, 0, 0, 0, 0, 0];
      tierSteps[tier] = newSteps;
      return { id, tier, score, tierSteps };
    };
    // Sawtooth order would stack the T3s at the end.
    const chapter = [
      L('e1', 2, 50), L('e2', 2, 52), L('e3', 2, 54), L('e4', 2, 56), L('e5', 2, 58), L('e6', 2, 60),
      L('teach', 3, 76, 1), L('hard', 3, 85, 4), L('gentle', 3, 88, 1), L('peak', 3, 95, 5),
    ];
    const out = placeDebut(chapter, 3, 0.3);
    const ids = out.map((l) => l.id);

    it('moves the teaching level about 30% of the way in, after easier levels', () => {
      expect(ids.indexOf('teach')).toBe(3);
      expect(out.slice(0, 3).every((l) => l.tier < 3)).toBe(true);
    });

    it('alternates practice with easier levels, gentlest practice first, and ends on the peak', () => {
      expect(ids.at(-1)).toBe('peak');
      expect(ids.indexOf('gentle')).toBeLessThan(ids.indexOf('hard')); // fewer T3 steps first
      for (let i = 1; i < out.length - 1; i++) {
        if (out[i]!.tier === 3 && out[i - 1]!.tier === 3) throw new Error(`T3 levels back to back at ${i}: ${ids.join(' ')}`);
      }
      expect(new Set(ids).size).toBe(chapter.length);
    });

    it('ends on the chapter\'s highest score', () => {
      expect(out.at(-1)?.score).toBe(Math.max(...chapter.map((l) => l.score)));
    });

    it('leaves the order alone if a lower tier outscores the new one (score bands broken)', () => {
      const odd = [L('e1', 2, 50), L('e2', 2, 99), L('t', 3, 70), L('x', 3, 80)];
      expect(placeDebut(odd, 3, 0.3).map((l) => l.id)).toEqual(['e1', 'e2', 't', 'x']);
    });

    it('leaves a chapter alone when the new tier has only its teaching level', () => {
      const only = [L('a', 2, 50), L('b', 2, 52), L('t', 3, 80)];
      expect(placeDebut(only, 3, 0.3).map((l) => l.id)).toEqual(['a', 'b', 't']);
    });
  });

  it('builds chapters from matching levels without reusing any', () => {
    const pool = [
      ...Array.from({ length: 20 }, (_, i) => lv(`a${i}`, i, 1 + (i % 2), 16)),
      ...Array.from({ length: 20 }, (_, i) => lv(`b${i}`, 40 + i, 3, 49)),
      ...Array.from({ length: 10 }, (_, i) => lv(`m${i}`, 30 + i, 2, 36, ['moonlit'])),
    ];
    const chapters = buildRamp(pool, [
      { id: 'c1', title: 'One', count: 8, tiers: [1, 2], areas: [16, 25], maxSeconds: 15 },
      { id: 'c2', title: 'Two', count: 8, tiers: [1, 3], mechanics: ['moonlit'], requires: ['moonlit'] },
      { id: 'c3', title: 'Three', count: 30, tiers: [3, 3] },
    ]);
    expect(chapters[0]!.levels.every((l) => l.tier <= 2 && l.area <= 25 && l.mechanics.length === 0)).toBe(true);
    expect(chapters[0]!.levels.every((l) => l.estimatedSeconds <= 15)).toBe(true);
    expect(chapters[1]!.levels.every((l) => l.mechanics.includes('moonlit'))).toBe(true);
    expect(chapters[2]!.shortfall).toBe(10);
    const ids = chapters.flatMap((c) => c.levels.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
