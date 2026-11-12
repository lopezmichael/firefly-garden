import { describe, expect, it } from 'vitest';
import { nextLevel, POLICY_CONFIG, type PlayRecord, type PolicyInput, type PolicyLevel } from '../src/index.ts';

const L = (id: string, tier: number, score: number, estimatedSeconds = 40): PolicyLevel => ({ id, tier, score, estimatedSeconds });
const main = [L('m1', 1, 30), L('m2', 2, 55), L('m3', 2, 60), L('m4', 3, 85, 120)];
const reserve = [L('r-easy', 1, 28, 30), L('r-mid', 2, 52, 50), L('r-long', 2, 60, 200), L('r-hard', 3, 80, 80)];
const levels = new Map([...main, ...reserve].map((l) => [l.id, l]));
const HOUR = 3_600_000;

const play = (levelId: string, over: Partial<PlayRecord> = {}): PlayRecord =>
  ({ levelId, reason: 'main', solved: true, seconds: 30, hints: 0, endedAt: 0, ...over });
const input = (history: PlayRecord[], over: Partial<PolicyInput> = {}): PolicyInput => ({
  mainPath: main.map((l) => l.id), reserve, levels,
  solved: new Set(history.filter((h) => h.solved).map((h) => h.levelId)),
  history, now: (history.at(-1)?.endedAt ?? 0) + 60_000, ...over,
});

describe('nextLevel', () => {
  it('starts on the main path and follows it', () => {
    expect(nextLevel(input([]))).toEqual({ id: 'm1', reason: 'main' });
    expect(nextLevel(input([play('m1')]))).toEqual({ id: 'm2', reason: 'main' });
  });

  it('serves an easier breather after a quit, then brings the quit level back as a retry', () => {
    const h = [play('m1'), play('m2'), play('m3', { solved: false })];
    const breather = nextLevel(input(h))!;
    expect(breather.reason).toBe('breather-after-quit');
    expect(levels.get(breather.id)!.tier).toBeLessThan(2 + 1);
    expect(levels.get(breather.id)!.score).toBeLessThanOrEqual(60 * POLICY_CONFIG.breatherScoreFraction);
    const after = nextLevel(input([...h, play(breather.id, { reason: breather.reason })]));
    expect(after).toEqual({ id: 'm3', reason: 'retry' });
  });

  it('serves a breather after a long solve', () => {
    const h = [play('m1'), play('m2', { seconds: 400 })];
    expect(nextLevel(input(h))?.reason).toBe('breather-after-long');
  });

  it('serves a breather after hints on two main levels running', () => {
    const h = [play('m1', { hints: 1 }), play('m2', { hints: 2 })];
    expect(nextLevel(input(h))?.reason).toBe('breather-after-hints');
  });

  it("serves a short warm-up a tier below the player's best after a long break", () => {
    const h = [play('m1'), play('m2'), play('m3', { endedAt: 0 })];
    const next = nextLevel(input(h, { now: POLICY_CONFIG.returnGapHours * HOUR + 1 }))!;
    expect(next.reason).toBe('warm-up');
    expect(levels.get(next.id)!.tier).toBeLessThanOrEqual(1);
    expect(levels.get(next.id)!.estimatedSeconds).toBeLessThanOrEqual(POLICY_CONFIG.warmupMaxSeconds);
  });

  it('never serves two detours in a row', () => {
    // The detour ran long, and r-easy would make a fine breather after it, but no second detour.
    const h = [play('m1'), play('m2', { solved: false }), play('r-mid', { reason: 'breather-after-quit', seconds: 999 })];
    expect(nextLevel(input(h))).toEqual({ id: 'm2', reason: 'retry' });
  });

  it('never reuses a reserve level, and falls back to the main path when none fits', () => {
    const h = [play('m1'), play('r-easy', { reason: 'warm-up' }), play('m2', { solved: false })];
    // r-easy is used and r-mid is too hard for a breather after m2 (score 55 × 0.8 = 44).
    expect(nextLevel(input(h))).toEqual({ id: 'm2', reason: 'retry' });
  });

  it('returns null when the main path is done', () => {
    expect(nextLevel(input(main.map((l) => play(l.id))))).toBeNull();
  });
});
