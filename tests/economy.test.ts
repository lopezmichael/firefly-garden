/**
 * Hint-economy check: simulated players through the committed chapters with
 * the shipped economy. These are guardrails that hold today; the plan's
 * peak/breather hint-rate targets are tracked in the difficulty report until
 * the model is calibrated against real players.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildBoard, combine, gradeLevel, measure, parseLevel, PLAYER_CONFIG, rampRoles, simulate, type SimLevel,
} from '../packages/core/src/index.ts';

const DIR = join(import.meta.dirname, '..', 'levels');
const pack = JSON.parse(readFileSync(join(DIR, 'launch.json'), 'utf8')) as { levels: unknown[] };
const byId = new Map(pack.levels.map((l) => parseLevel(l)).map((l) => [l.id, l]));
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as { chapters: { id: string; levels: string[] }[] };

// The economy guardrails are about the opening: chapters 1 to 3.
const simLevels: SimLevel[] = manifest.chapters.slice(0, 3).flatMap((c) => {
  const graded = c.levels.map((id) => {
    const level = byId.get(id)!;
    const board = buildBoard(level);
    const g = gradeLevel(level, board); // the count is shown, so players' traces use it
    return { id, g, score: measure(level, board, g).score };
  });
  const roles = rampRoles(graded);
  return graded.map(({ id, g }, i) => ({
    id, chapter: c.id, role: roles[i]!, steps: g.steps.map((s) => ({ tier: s.tier, width: s.width })), fireflies: g.fireflies.length,
  }));
});
const results = PLAYER_CONFIG.profiles.map((p, k) => simulate(simLevels, p, PLAYER_CONFIG.economy, PLAYER_CONFIG.runs, 4242 + k));
const population = combine(results, PLAYER_CONFIG.profiles);

describe('hint economy (simulated, shipped economy)', () => {
  it('almost never leaves a stuck player without a way to get a hint (ads stay optional)', () => {
    let asked = 0, refused = 0;
    results.forEach((r, k) => {
      const w = PLAYER_CONFIG.profiles[k]!.share;
      for (const o of r.levels) {
        asked += (w * (o.coinHints + o.adHints + o.bankedHints + o.refusedHints)) / r.runs;
        refused += (w * o.refusedHints) / r.runs;
      }
    });
    expect(refused / asked).toBeLessThanOrEqual(0.05);
  });

  it('keeps at least 95% of players through chapter 1', () => {
    const lastOfChapter1 = simLevels.map((l) => l.chapter).lastIndexOf('c1');
    const cleared = results.reduce((a, r, k) => a + (PLAYER_CONFIG.profiles[k]!.share * r.levels[lastOfChapter1]!.solved) / r.runs, 0);
    expect(cleared).toBeGreaterThanOrEqual(0.95);
  });

  it('keeps breathers under 5% hint use on average (project plan target)', () => {
    const breathers = population.filter((_, i) => simLevels[i]!.role === 'breather');
    const mean = breathers.reduce((a, l) => a + l.hintRate, 0) / breathers.length;
    expect(breathers.length).toBeGreaterThan(0);
    expect(mean).toBeLessThan(0.05);
  });

  it('has no level where more than 40% of plays need a hint', () => {
    const worst = population.reduce((m, l) => Math.max(m, l.hintRate), 0);
    expect(worst).toBeLessThanOrEqual(0.4);
  });
});
