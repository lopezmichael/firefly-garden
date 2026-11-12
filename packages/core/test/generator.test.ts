import { describe, expect, it } from 'vitest';
import {
  buildBoard, buildRamp, cellIndex, evaluate, generate, isUnique, makeMask, parseLevel, sawtooth, SHAPES,
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

  it('places the twists it is asked for, and never a firefly on a toadstool', () => {
    const gen = generate({ id: 'tw', seed: 11, w: 7, h: 7, bushDensity: 0.15, toadstools: 0.06, sporecaps: 0.06, moonlit: 0.06 })!;
    const t = gen.level.twists!;
    expect(t.toadstools?.length).toBeGreaterThan(0);
    expect(t.sporecaps?.length).toBeGreaterThan(0);
    expect(t.moonlit?.length).toBeGreaterThan(0);
    const toad = new Set(t.toadstools!.map(([r, c]) => `${r},${c}`));
    expect(gen.level.solution!.some(([r, c]) => toad.has(`${r},${c}`))).toBe(false);
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

  it('builds chapters from matching levels without reusing any', () => {
    const pool = [
      ...Array.from({ length: 20 }, (_, i) => lv(`a${i}`, i, 1 + (i % 2), 16)),
      ...Array.from({ length: 20 }, (_, i) => lv(`b${i}`, 40 + i, 3, 49)),
      ...Array.from({ length: 10 }, (_, i) => lv(`m${i}`, 30 + i, 2, 36, ['moonlit'])),
    ];
    const chapters = buildRamp(pool, [
      { id: 'c1', title: 'One', count: 8, tiers: [1, 2], areas: [16, 25] },
      { id: 'c2', title: 'Two', count: 8, tiers: [1, 3], mechanics: ['moonlit'], requires: ['moonlit'] },
      { id: 'c3', title: 'Three', count: 30, tiers: [3, 3] },
    ]);
    expect(chapters[0]!.levels.every((l) => l.tier <= 2 && l.area <= 25 && l.mechanics.length === 0)).toBe(true);
    expect(chapters[1]!.levels.every((l) => l.mechanics.includes('moonlit'))).toBe(true);
    expect(chapters[2]!.shortfall).toBe(10);
    const ids = chapters.flatMap((c) => c.levels.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
