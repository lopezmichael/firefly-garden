import { describe, expect, it } from 'vitest';
import { combine, PLAYER_CONFIG, rampRoles, simulate, type PlayerProfile, type SimLevel } from '../src/index.ts';

const step = (tier: number, width = 3) => ({ tier, width });
const level = (id: string, tiers: number[], width = 3): SimLevel =>
  ({ id, chapter: 'c', role: 'climb', steps: tiers.map((t) => step(t, width)), fireflies: 4 });
const profile = (over: Partial<PlayerProfile> = {}): PlayerProfile => ({
  id: 'p', label: 'P', share: 1, skill: 2, speed: 1, patience: 300, learnSteps: 3, adWillingness: 0.5, churnOnQuit: 0.5, ...over,
});
const economy = { startingCoins: 60, coinsPerSolve: 10, hintCost: 30 };

describe('simulate', () => {
  it('is deterministic for a seed', () => {
    const lv = [level('a', [1, 2, 3, 3]), level('b', [2, 3, 4])];
    expect(simulate(lv, profile(), economy, 200, 7)).toEqual(simulate(lv, profile(), economy, 200, 7));
  });

  it('lets a fluent player through easy levels with almost no hints', () => {
    const lv = Array.from({ length: 10 }, (_, i) => level(`e${i}`, [1, 1, 2, 2, 2]));
    const r = simulate(lv, profile({ skill: 4 }), economy, 300, 1);
    expect(r.finished / r.runs).toBeGreaterThan(0.99);
    expect(r.levels.reduce((a, o) => a + o.hintedPlays, 0)).toBe(0); // wide steps: no slips
  });

  it('gets a player stuck on techniques far above their skill', () => {
    const lv = [level('hard', [4, 4, 4, 4])];
    const o = simulate(lv, profile({ skill: 1 }), economy, 300, 2).levels[0]!;
    expect((o.hintedPlays + o.quits) / o.plays).toBeGreaterThan(0.9);
  });

  it('teaches: the same stretch level needs fewer hints the second time round', () => {
    const lv = Array.from({ length: 6 }, (_, i) => level(`s${i}`, [3, 3, 3]));
    const r = simulate(lv, profile({ skill: 2, learnSteps: 3 }), { ...economy, startingCoins: 10_000 }, 500, 3);
    const rate = (i: number) => r.levels[i]!.hintedPlays / r.levels[i]!.plays;
    expect(rate(5)).toBeLessThan(rate(0) / 2);
  });

  it('pays hints in coins while it can, then ads, and refuses the rest', () => {
    const lv = [level('x', [4, 4, 4, 4, 4, 4])];
    const rich = simulate(lv, profile({ skill: 1, adWillingness: 0 }), { ...economy, startingCoins: 10_000 }, 200, 4).levels[0]!;
    expect(rich.adHints).toBe(0);
    expect(rich.refusedHints).toBe(0);
    const broke = simulate(lv, profile({ skill: 1, adWillingness: 1 }), { ...economy, startingCoins: 0 }, 200, 4).levels[0]!;
    expect(broke.coinHints).toBe(0);
    expect(broke.adHints).toBeGreaterThan(0);
  });

  it('combines profiles by population share', () => {
    const lv = [level('a', [1]), level('b', [4, 4, 4])];
    const a = simulate(lv, profile({ id: 'a', skill: 5 }), economy, 100, 5);
    const b = simulate(lv, profile({ id: 'b', skill: 1, churnOnQuit: 1 }), economy, 100, 6);
    const [, second] = combine([a, b], [profile({ id: 'a', share: 0.75 }), profile({ id: 'b', share: 0.25 })]);
    expect(second!.survival).toBeCloseTo(0.75 * 1 + 0.25 * (b.levels[1]!.reached / 100), 5);
  });

  it('ships a population whose shares sum to 1', () => {
    expect(PLAYER_CONFIG.profiles.reduce((a, p) => a + p.share, 0)).toBeCloseTo(1, 9);
  });
});

describe('rampRoles', () => {
  it('labels opener, climbs, breathers and the peak', () => {
    expect(rampRoles([{ score: 10 }, { score: 20 }, { score: 15 }, { score: 30 }])).toEqual(['opener', 'climb', 'breather', 'peak']);
  });
});
