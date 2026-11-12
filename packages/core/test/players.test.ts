import { describe, expect, it } from 'vitest';
import { combine, PLAYER_CONFIG, rampRoles, simulate, simulateWithPolicy, type PlayerProfile, type SimLevel } from '../src/index.ts';

const step = (tier: number, width = 3) => ({ tier, width });
const level = (id: string, tiers: number[], width = 3): SimLevel =>
  ({ id, chapter: 'c', role: 'climb', steps: tiers.map((t) => step(t, width)), fireflies: 4 });
const profile = (over: Partial<PlayerProfile> = {}): PlayerProfile => ({
  id: 'p', label: 'P', share: 1, skill: 2, speed: 1, patience: 300, learnSteps: 3, adWillingness: 0.5, churnOnQuit: 0.5, ...over,
});
const economy = { startingCoins: 60, coinsPerSolve: 10, hintCost: 30, hintsPerAd: 1 };

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

  it('keeps its books balanced on every level', () => {
    const lv = [level('a', [1, 2, 2]), level('b', [2, 3, 3], 1), level('c', [3, 4, 4], 1), level('d', [4, 4, 5], 1)];
    for (const skill of [1, 2, 3]) {
      const r = simulate(lv, profile({ skill, churnOnQuit: 0.3 }), { ...economy, startingCoins: 0 }, 400, 11 + skill);
      r.levels.forEach((o, i) => {
        expect(o.solved + o.churned).toBe(o.reached); // everyone who arrives solves or leaves
        expect(o.plays).toBe(o.solved + o.quits);
        expect(o.churned).toBeLessThanOrEqual(o.quits);
        if (i + 1 < r.levels.length) expect(r.levels[i + 1]!.reached).toBe(o.solved);
      });
      expect(r.finished).toBe(r.levels.at(-1)!.solved);
    }
  });

  it('charges for hints, so coins run out and later hints come from ads', () => {
    // 30 coins buys exactly one hint; this level needs many.
    const lv = [level('x', [5, 5, 5, 5, 5, 5, 5, 5])];
    const o = simulate(lv, profile({ skill: 1, adWillingness: 1, patience: 1e9 }), { startingCoins: 30, coinsPerSolve: 0, hintCost: 30, hintsPerAd: 1 }, 200, 9).levels[0]!;
    expect(o.coinHints).toBeLessThanOrEqual(o.plays); // at most one paid hint per player
    expect(o.adHints).toBeGreaterThan(o.coinHints);
  });

  it('saves the extra hints a rewarded ad grants, so fewer ads are needed', () => {
    const lv = Array.from({ length: 4 }, (_, i) => level(`h${i}`, [5, 5, 5, 5]));
    const broke = { startingCoins: 0, coinsPerSolve: 0, hintCost: 30 };
    const p = profile({ skill: 1, adWillingness: 1, patience: 1e9, churnOnQuit: 0 });
    const one = simulate(lv, p, { ...broke, hintsPerAd: 1 }, 300, 21);
    const three = simulate(lv, p, { ...broke, hintsPerAd: 3 }, 300, 21);
    const sum = (r: typeof one, f: (o: (typeof one.levels)[number]) => number) => r.levels.reduce((a, o) => a + f(o), 0);
    expect(sum(three, (o) => o.bankedHints)).toBeGreaterThan(0);
    // Each ad funds at most hintsPerAd - 1 saved hints: the bundle is spent, not endless.
    expect(sum(three, (o) => o.bankedHints)).toBeLessThanOrEqual(2 * sum(three, (o) => o.adHints));
    expect(three.rewardedPerPlayer).toBeLessThan(one.rewardedPerPlayer * 0.6);
    expect(sum(one, (o) => o.bankedHints)).toBe(0);
  });

  it('paces midgame ads: none in the first five levels, then at most one per three minutes', () => {
    // Quick levels (a few seconds each, plus transitions and midgame ads).
    const lv = Array.from({ length: 35 }, (_, i) => level(`q${i}`, [1]));
    const r = simulate(lv, profile({ skill: 5 }), economy, 50, 22);
    expect(r.levels.slice(0, 5).every((o) => o.interstitials === 0)).toBe(true);
    expect(r.levels[5]!.interstitials).toBe(50); // the first allowed slot always shows one
    expect(r.interstitialsPerPlayer).toBeLessThanOrEqual(Math.floor(r.minutesPerPlayer / 3) + 1);
    expect(r.interstitialsPerPlayer).toBeGreaterThanOrEqual(2);
  });

  it('counts a level finished past the time limit as solved', () => {
    const lv = [level('slow', [1])];
    const o = simulate(lv, profile({ skill: 5, patience: 0.001 }), economy, 50, 10).levels[0]!;
    expect(o.solved).toBe(50);
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

describe('simulateWithPolicy', () => {
  const mainLv = [level('a', [1, 2]), level('b', [2, 3], 1), level('c', [3, 3, 4], 1), level('d', [4, 4], 1)]
    .map((l, i) => ({ ...l, tier: [2, 3, 4, 4][i]!, score: [55, 80, 110, 120][i]!, estimatedSeconds: 60 }));
  const reserve = Array.from({ length: 12 }, (_, i) => ({ ...level(`r${i}`, [1, 1, 2]), tier: i % 2 ? 2 : 1, score: 30 + i, estimatedSeconds: 30 }));
  const opts = { reserve, churnFactorWithBreather: 1 };

  it('is deterministic and keeps per-level books balanced', () => {
    const a = simulateWithPolicy(mainLv, profile({ skill: 2 }), economy, 300, 31, opts);
    expect(a).toEqual(simulateWithPolicy(mainLv, profile({ skill: 2 }), economy, 300, 31, opts));
    a.levels.forEach((o) => {
      expect(o.plays).toBe(o.solved + o.quits);
      expect(o.solved + o.churned).toBeLessThanOrEqual(o.reached);
    });
    expect(a.finished).toBeLessThanOrEqual(a.levels.at(-1)!.solved);
  });

  it('takes detours from the reserve and plays longer than without the policy', () => {
    const p = profile({ skill: 1, speed: 1.5 });
    const without = simulate(mainLv, p, economy, 300, 32);
    const withPolicy = simulateWithPolicy(mainLv, p, economy, 300, 32, opts);
    const detours = Object.values(withPolicy.detoursPerPlayer).reduce((a, b) => a + b, 0);
    expect(detours).toBeGreaterThan(0);
    expect(withPolicy.minutesPerPlayer).toBeGreaterThan(without.minutesPerPlayer);
  });

  it('leaves after quitting the same main level twice, even if quits never cause churn', () => {
    const wall = [{ ...level('wall', [5, 5, 5, 5, 5]), tier: 5, score: 140, estimatedSeconds: 60 }];
    const p = profile({ skill: 1, churnOnQuit: 0, adWillingness: 0, patience: 1 });
    const r = simulateWithPolicy(wall, p, { ...economy, startingCoins: 0 }, 100, 34, opts);
    expect(r.levels[0]!.churned).toBe(r.levels[0]!.reached - r.levels[0]!.solved);
  });

  it('only softens quits when an easier level is actually served next', () => {
    // With no reserve there is never a breather, so the assumed factor must change nothing.
    const p = profile({ skill: 1, churnOnQuit: 0.8 });
    const empty = { reserve: [], churnFactorWithBreather: 1 };
    expect(simulateWithPolicy(mainLv, p, economy, 300, 35, { ...empty, churnFactorWithBreather: 0.3 }))
      .toEqual(simulateWithPolicy(mainLv, p, economy, 300, 35, empty));
  });

  it('keeps more players when breathers are assumed to soften quits', () => {
    const p = profile({ skill: 1, churnOnQuit: 0.8 });
    const none = simulateWithPolicy(mainLv, p, economy, 400, 33, opts);
    const soft = simulateWithPolicy(mainLv, p, economy, 400, 33, { ...opts, churnFactorWithBreather: 0.5 });
    expect(soft.finished).toBeGreaterThan(none.finished);
  });
});

describe('rampRoles', () => {
  it('labels opener, climbs, breathers and the peak', () => {
    expect(rampRoles([{ score: 10 }, { score: 20 }, { score: 15 }, { score: 30 }])).toEqual(['opener', 'climb', 'breather', 'peak']);
  });
});
