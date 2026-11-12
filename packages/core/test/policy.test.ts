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

  it('returns null when the main path is done, whatever happened on the last level', () => {
    const done = main.map((l) => play(l.id));
    expect(nextLevel(input(done))).toBeNull();
    const slowHinted = [...done.slice(0, -2), play('m3', { hints: 1 }), play('m4', { hints: 1, seconds: 999 })];
    expect(nextLevel(input(slowHinted))).toBeNull();
    expect(nextLevel(input(done, { now: 100 * HOUR }))).toBeNull();
  });

  it('counts a solve as long past 1.75x its estimate even when under four minutes', () => {
    // m2 is estimated at 40 s; 100 s is past 70 s but well under 240 s.
    expect(nextLevel(input([play('m1'), play('m2', { seconds: 100 })]))?.reason).toBe('breather-after-long');
  });

  it('ignores detours when counting hinted levels in a row, and resets after a hint breather', () => {
    const hinted = [play('m1', { hints: 1 }), play('r-hard', { reason: 'warm-up' }), play('m2', { hints: 1 })];
    expect(nextLevel(input(hinted))?.reason).toBe('breather-after-hints');
    const after = [play('m1', { hints: 1 }), play('m2', { hints: 1 }), play('r-easy', { reason: 'breather-after-hints' }), play('m3', { hints: 1 })];
    expect(nextLevel(input(after))).toEqual({ id: 'm4', reason: 'main' });
  });

  it('sets the warm-up tier from levels solved without hints only', () => {
    // m3 (T2) solved cleanly, m4 (T3) solved only with hints: the comfortable tier is 2,
    // so the warm-up is T1 (r-easy), not the T2 r-mid it would be if hinted solves counted.
    const extra = L('m5', 3, 90);
    const h = [play('m1'), play('m2'), play('m3'), play('m4', { hints: 1, endedAt: 0 })];
    const warm = nextLevel(input(h, {
      mainPath: [...main.map((l) => l.id), 'm5'], levels: new Map([...levels, ['m5', extra]]), now: 9 * HOUR,
    }))!;
    expect(warm).toEqual({ id: 'r-easy', reason: 'warm-up' });
  });

  it('never serves the same reserve level twice', () => {
    // r-mid (52) is the only fitting breather after m4 (85 × 0.8 = 68, T2 or lower, under 90 s)... once.
    const first = [play('m1'), play('m2'), play('m3'), play('m4', { solved: false })];
    expect(nextLevel(input(first))?.id).toBe('r-mid');
    // The player quit that breather too, so only "already played" keeps it from coming back.
    const second = [...first, play('r-mid', { reason: 'breather-after-quit', solved: false }), play('m4', { solved: false })];
    const next = nextLevel(input(second))!;
    expect(next.id).not.toBe('r-mid');
  });

  describe('compact facts for a capped history', () => {
    // A long, varied history; the game keeps only its tail plus the facts.
    const long: PlayRecord[] = [
      play('m1', { endedAt: 1 }), play('r-easy', { reason: 'warm-up', endedAt: 2 }), play('m2', { solved: false, endedAt: 3 }),
      play('r-mid', { reason: 'breather-after-quit', endedAt: 4 }), play('m2', { reason: 'retry', endedAt: 5 }),
      play('m3', { solved: false, endedAt: 6 }),
    ];
    const facts = (h: readonly PlayRecord[]) => ({
      playedReserve: new Set(h.filter((p) => reserve.some((r) => r.id === p.levelId)).map((p) => p.levelId)),
      quitMain: new Set(h.filter((p) => !p.solved && main.some((m) => m.id === p.levelId)).map((p) => p.levelId)),
    });

    it('decides the same from the last plays plus the facts as from the full history', () => {
      const solved = new Set(long.filter((h) => h.solved).map((h) => h.levelId));
      for (let keep = 1; keep <= long.length; keep++) {
        for (const now of [long.at(-1)!.endedAt + 60_000, POLICY_CONFIG.returnGapHours * HOUR + 10]) {
          const full = nextLevel(input(long, { solved, now }));
          const capped = nextLevel(input(long.slice(-keep), { solved, now, ...facts(long) }));
          // Warm-ups read the comfortable tier from the history itself; it is reached in the
          // last plays here (m1 and m2 are both clean solves inside every tail of length ≥ 2).
          if (keep >= 2 || full?.reason !== 'warm-up') expect(capped, `keep ${keep}`).toEqual(full);
        }
      }
    });

    it(`decides the same from the last ${POLICY_CONFIG.minHistory} plays plus the facts, hint streaks included`, () => {
      const { minHistory, hintStreak } = POLICY_CONFIG;
      expect(minHistory).toBeGreaterThanOrEqual(2 * hintStreak + 1);
      const more = [L('m5', 3, 90, 60), L('m6', 3, 92, 60), L('m7', 3, 94, 60), L('m8', 3, 96, 60), L('m9', 3, 98, 60)];
      const spare = [L('r-b1', 1, 30, 40), L('r-b2', 2, 50, 40), L('r-b3', 2, 54, 40), L('r-b4', 2, 56, 40)];
      const mainPath = [...main, ...more].map((l) => l.id);
      const allReserve = [...reserve, ...spare];
      const allLevels = new Map([...main, ...more, ...allReserve].map((l) => [l.id, l]));
      const isReserve = (id: string) => allReserve.some((r) => r.id === id);
      const story: Partial<PlayRecord>[] = [
        { levelId: 'm1' }, { levelId: 'm2', hints: 1 }, { levelId: 'm3', hints: 1 },
        { levelId: 'r-easy', reason: 'breather-after-hints' }, { levelId: 'm4', solved: false },
        { levelId: 'r-mid', reason: 'breather-after-quit' }, { levelId: 'm4', reason: 'retry', hints: 2 },
        { levelId: 'm5', hints: 1 }, { levelId: 'r-b2', reason: 'breather-after-hints' }, { levelId: 'm6', hints: 1 },
        { levelId: 'm7', solved: false }, { levelId: 'r-b1', reason: 'breather-after-quit' },
        { levelId: 'm7', reason: 'retry', hints: 1 }, { levelId: 'm8', hints: 1 },
      ];
      const history = story.map((p, i) => play(p.levelId!, { ...p, endedAt: (i + 1) * 60_000 }));
      const reasons = new Set<string>();
      for (let k = 1; k <= history.length; k++) {
        const h = history.slice(0, k);
        const base = {
          mainPath, reserve: allReserve, levels: allLevels, now: h.at(-1)!.endedAt + 60_000,
          solved: new Set(h.filter((p) => p.solved).map((p) => p.levelId)),
        };
        const full = nextLevel({ ...base, history: h });
        const capped = nextLevel({
          ...base, history: h.slice(-minHistory),
          playedReserve: new Set(h.filter((p) => isReserve(p.levelId)).map((p) => p.levelId)),
          quitMain: new Set(h.filter((p) => !p.solved && !isReserve(p.levelId)).map((p) => p.levelId)),
        });
        expect(capped, `after ${k} plays`).toEqual(full);
        if (full) reasons.add(full.reason);
      }
      expect([...reasons]).toEqual(expect.arrayContaining(['main', 'retry', 'breather-after-quit', 'breather-after-hints']));
    });

    it('never repeats a reserve level once played, even after it drops out of the history', () => {
      const h = [play('m1'), play('m2'), play('m3'), play('m4', { solved: false })];
      expect(nextLevel(input(h))?.id).toBe('r-mid');
      expect(nextLevel(input(h, { playedReserve: new Set(['r-mid']) }))?.id).not.toBe('r-mid');
    });

    it('brings back a level quit long ago as a retry', () => {
      const h = [play('m1')];
      expect(nextLevel(input(h, { now: 120_000 }))).toEqual({ id: 'm2', reason: 'main' });
      expect(nextLevel(input(h, { now: 120_000, quitMain: new Set(['m2']) }))).toEqual({ id: 'm2', reason: 'retry' });
    });
  });
});
