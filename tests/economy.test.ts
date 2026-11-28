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
  buildBoard, cellIndex, combine, gradeLevel, hint, hintCap, measure, parseLevel, PLAYER_CONFIG, rampRoles, simHintGroup, simSteps, simulate, type SimLevel,
} from '../packages/core/src/index.ts';
import { PLAYED_CHAPTERS } from '../apps/game/src/build.ts';

const DIR = join(import.meta.dirname, '..', 'levels');
const pack = JSON.parse(readFileSync(join(DIR, 'launch.json'), 'utf8')) as { levels: unknown[] };
const byId = new Map(pack.levels.map((l) => parseLevel(l)).map((l) => [l.id, l]));
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as { chapters: { id: string; levels: string[] }[] };

// The economy guardrails cover the main path this build plays, in order.
const played = PLAYED_CHAPTERS.map((id) => manifest.chapters.find((c) => c.id === id)!);
const simLevels: SimLevel[] = played.flatMap((c) => {
  const graded = c.levels.map((id) => {
    const level = byId.get(id)!;
    const board = buildBoard(level);
    const g = gradeLevel(level, board); // the count is shown, so players' traces use it
    return { id, g, board, score: measure(level, board, g).score };
  });
  const roles = rampRoles(graded);
  return graded.map(({ id, g, board }, i) => ({
    id, chapter: c.id, role: roles[i]!, steps: simSteps(g, board), fireflies: g.fireflies.length,
    tier: byId.get(id)!.tier!, hintCap: hintCap(board),
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
        asked += (w * (o.freeHints + o.adHints + o.bankedHints + o.refusedHints)) / r.runs;
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

  it('models hints the way the game gives them: the simulated hint matches the real one from the same position', () => {
    // From every step of every played level, with the fireflies placed so far and no X
    // marks: does the real hint cross tiles or point, and does the simulated one (`simHintGroup`)
    // cross the same tiles? Crossing versus pointing is what drives the economy and matches
    // closely; the exact tiles differ more, since the real grader orders deductions from the
    // real position (2026-11-28, the Rose Bed: 626 and 313 of 653).
    let n = 0, kind = 0, exact = 0;
    for (const c of played) {
      for (const id of c.levels) {
        const level = byId.get(id)!;
        const board = buildBoard(level);
        const g = gradeLevel(level, board);
        const steps = simSteps(g, board);
        const answer = level.solution!.map((x) => cellIndex(board, x));
        g.steps.forEach((_, k) => {
          const on = g.steps.slice(0, k).filter((s) => s.value === 'firefly').map((s) => s.cell);
          const h = hint(board, answer, on, new Set(), [], { maxTier: level.tier! });
          const real = h.kind === 'cross' ? [...h.cells].sort((a, b) => a - b).join() : '';
          const sim = simHintGroup(steps, k, new Set(), hintCap(board), level.tier!).map((j) => g.steps[j]!.cell).sort((a, b) => a - b).join();
          n++;
          if ((real === '') === (sim === '')) kind++;
          if (real === sim) exact++;
        });
      }
    }
    expect(n).toBeGreaterThan(300);
    expect(kind / n).toBeGreaterThanOrEqual(0.95);
    expect(exact / n).toBeGreaterThanOrEqual(0.45);
  });
});
