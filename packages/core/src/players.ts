import { DIFFICULTY_CONFIG } from './difficulty.ts';
import { isDetour, nextLevel, type PlayRecord, type PolicyLevel } from './policy.ts';
import { createRng, deriveSeed, type Rng } from './rng.ts';

/**
 * Simulated players: a stand-in for real play data until Phase 3. Each
 * simulated player walks a level's grader trace step by step. Techniques at
 * or below their skill cost the usual time; one tier above is a stretch
 * (slower, with a real chance of getting stuck); anything beyond almost
 * always gets them stuck. Stuck players buy a hint with coins, watch an ad
 * for one, struggle on, or quit; some who quit never come back. Solving
 * stretch steps teaches the technique, so skill grows along the ramp.
 *
 * Every number here is a modelling assumption, kept in PLAYER_CONFIG so it
 * can be refit once real solve, hint and quit data exists.
 */

export interface SimStep {
  readonly tier: number;
  readonly width: number;
}

export type LevelRole = 'opener' | 'climb' | 'breather' | 'peak';

export interface SimLevel {
  readonly id: string;
  readonly chapter: string;
  readonly role: LevelRole;
  readonly steps: readonly SimStep[];
  readonly fireflies: number;
  /** Needed by the next-level policy (tier, score, estimate). */
  readonly tier?: number;
  readonly score?: number;
  readonly estimatedSeconds?: number;
}

export interface PlayerProfile {
  readonly id: string;
  readonly label: string;
  /** Share of the player population. Profiles' shares should sum to 1. */
  readonly share: number;
  /** Highest technique tier the player already uses fluently. */
  readonly skill: number;
  /** Multiplier on the time model (1 = the model's fluent player). */
  readonly speed: number;
  /** Seconds on one level before frustration sets in. */
  readonly patience: number;
  /** Unaided stretch steps needed to learn the next tier. */
  readonly learnSteps: number;
  /** Chance of watching a rewarded ad for a hint when coins run short. */
  readonly adWillingness: number;
  /** Chance that quitting a level means leaving the game. */
  readonly churnOnQuit: number;
}

export interface Economy {
  readonly startingCoins: number;
  readonly coinsPerSolve: number;
  readonly hintCost: number;
  /** Hints one rewarded ad grants: one used now, the rest saved for later. */
  readonly hintsPerAd: number;
}

export const PLAYER_CONFIG = {
  /** Time multiplier for a step one tier above the player's skill. */
  stretchTimeFactor: 2.5,
  /** Chance of getting stuck on a stretch step; doubled when it is the only move available. */
  stretchStuck: 0.25,
  /** Chance of getting stuck on a step two or more tiers above skill. */
  beyondStuck: 0.85,
  /** Chance of a slip (stuck) on a fluent step that is the only move available. */
  slipStuck: 0.006,
  /** Per-step time noise range (uniform multiplier). */
  noise: [0.7, 1.4] as readonly [number, number],
  /** Chance of quitting instead of seeking help when stuck: before and after patience runs out. */
  quitWhenStuck: [0.08, 0.45] as readonly [number, number],
  /** Chance of giving up outright when stuck with no hint available. */
  quitWithoutHelp: 0.6,
  /** Seconds a rewarded ad takes. */
  adSeconds: 30,
  /** A level abandoned once elapsed time passes patience × this. */
  hardStopFactor: 2.5,
  /** A player who quits but stays retries the level this many times at most. */
  retries: 1,
  profiles: [
    { id: 'newcomer', label: 'Newcomer', share: 0.3, skill: 1, speed: 1.4, patience: 150, learnSteps: 3, adWillingness: 0.5, churnOnQuit: 0.6 },
    { id: 'casual', label: 'Casual', share: 0.45, skill: 2, speed: 1.15, patience: 240, learnSteps: 3, adWillingness: 0.45, churnOnQuit: 0.45 },
    { id: 'puzzler', label: 'Puzzler', share: 0.2, skill: 3, speed: 0.9, patience: 420, learnSteps: 2, adWillingness: 0.3, churnOnQuit: 0.3 },
    { id: 'expert', label: 'Expert', share: 0.05, skill: 4, speed: 0.7, patience: 600, learnSteps: 2, adWillingness: 0.2, churnOnQuit: 0.2 },
  ] as readonly PlayerProfile[],
  /**
   * The shipped economy, chosen from the Phase 1 sweep (2026-11-12): enough
   * starting coins for two hints so a stuck newcomer is never refused, and a
   * price that still makes a hint cost three solves. Retention first; see the
   * difficulty report for the rewarded-ad tradeoff.
   */
  economy: { startingCoins: 60, coinsPerSolve: 10, hintCost: 30, hintsPerAd: 3 } as Economy,
  /** Ad pacing from the project plan (Monetization, Ad placements). */
  ads: {
    /** No midgame ad until this many levels are complete (first session protection). */
    midgameAfterLevels: 5,
    /** Portal cap on midgame ads (CrazyGames: at most one per three minutes). */
    midgameMinGapSeconds: 180,
    /** Seconds between levels (celebration, auto-advance). */
    levelTransitionSeconds: 5,
    /** Seconds a midgame ad takes. */
    midgameSeconds: 15,
  },
  /** Economies compared in the report's sweep. */
  sweep: {
    startingCoins: [30, 60, 90],
    coinsPerSolve: [10, 15],
    hintCost: [30, 45, 60],
    /** Hints per rewarded ad, compared at the shipped and a tight economy. */
    hintsPerAd: [1, 2, 3, 5],
  },
  /** Simulated players per profile. */
  runs: 1000,
  /** Sessions, for the next-level policy's warm-ups. */
  sessions: {
    /** Minutes in one sitting (uniform range). */
    minutes: [8, 20] as readonly [number, number],
    /** Hours between sittings. */
    gapHours: 12,
  },
} as const;

export interface LevelOutcome {
  readonly id: string;
  readonly chapter: string;
  readonly role: LevelRole;
  /** Players who reached this level. */
  readonly reached: number;
  /** Attempts (a retry counts again). */
  readonly plays: number;
  readonly solved: number;
  readonly quits: number;
  /** Players who left the game on this level. */
  readonly churned: number;
  /** Attempts that used at least one hint. */
  readonly hintedPlays: number;
  readonly coinHints: number;
  readonly adHints: number;
  /** Times a stuck player wanted a hint but had no coins and skipped the ad. */
  readonly refusedHints: number;
  /** Hints taken from the bank an earlier rewarded ad filled. */
  readonly bankedHints: number;
  /** Midgame ads shown on this level's complete screen. */
  readonly interstitials: number;
  /** Mean seconds of solved attempts. */
  readonly meanSolveSeconds: number;
}

export interface SimResult {
  readonly profile: string;
  readonly runs: number;
  readonly levels: readonly LevelOutcome[];
  /** Coins held at the end by players who finished, averaged. */
  readonly meanEndCoins: number;
  /** Players who finished every level. */
  readonly finished: number;
  /** Midgame ads per simulated player (everyone who started). */
  readonly interstitialsPerPlayer: number;
  /** Rewarded hint ads per simulated player. */
  readonly rewardedPerPlayer: number;
  /** Minutes played per simulated player. */
  readonly minutesPerPlayer: number;
}

interface Tally {
  reached: number; plays: number; solved: number; quits: number; churned: number;
  hintedPlays: number; coinHints: number; adHints: number; refusedHints: number; bankedHints: number;
  interstitials: number; solveSeconds: number;
}

interface PlayerState {
  skill: number;
  xp: number;
  coins: number;
  /** Hints saved from rewarded ads. */
  bank: number;
}

/** Simulate `runs` players of one profile through the levels in order. Deterministic for a seed. */
export function simulate(levels: readonly SimLevel[], profile: PlayerProfile, economy: Economy, runs: number, seed: number): SimResult {
  const tallies: Tally[] = levels.map(() => ({
    reached: 0, plays: 0, solved: 0, quits: 0, churned: 0, hintedPlays: 0, coinHints: 0, adHints: 0, refusedHints: 0, bankedHints: 0,
    interstitials: 0, solveSeconds: 0,
  }));
  let endCoins = 0;
  let finished = 0;
  let totalSeconds = 0;
  const ads = PLAYER_CONFIG.ads;

  for (let run = 0; run < runs; run++) {
    const rng = createRng(deriveSeed(seed, run));
    const state: PlayerState = { skill: profile.skill, xp: 0, coins: economy.startingCoins, bank: 0 };
    let alive = true;
    let clock = 0;
    let completed = 0;
    let lastMidgame = -Infinity;
    for (let i = 0; i < levels.length && alive; i++) {
      const t = tallies[i]!;
      t.reached++;
      for (let attempt = 0; attempt <= PLAYER_CONFIG.retries; attempt++) {
        t.plays++;
        const r = playOnce(levels[i]!, profile, economy, state, rng);
        t.coinHints += r.coinHints;
        t.adHints += r.adHints;
        t.refusedHints += r.refusedHints;
        t.bankedHints += r.bankedHints;
        if (r.coinHints + r.adHints + r.bankedHints > 0) t.hintedPlays++;
        clock += r.seconds + ads.levelTransitionSeconds;
        if (r.solved) {
          t.solved++;
          t.solveSeconds += r.seconds;
          state.coins += economy.coinsPerSolve;
          completed++;
          // Midgame ad on the level-complete screen, paced by the portal cap.
          if (completed > ads.midgameAfterLevels && clock - lastMidgame >= ads.midgameMinGapSeconds) {
            t.interstitials++;
            lastMidgame = clock;
            clock += ads.midgameSeconds;
          }
          break;
        }
        t.quits++;
        if (attempt === PLAYER_CONFIG.retries || rng.next() < profile.churnOnQuit) {
          t.churned++;
          alive = false;
          break;
        }
      }
    }
    if (alive) {
      finished++;
      endCoins += state.coins;
    }
    totalSeconds += clock;
  }
  const sumOf = (f: (t: Tally) => number) => tallies.reduce((a, t) => a + f(t), 0);

  return {
    profile: profile.id,
    runs,
    finished,
    meanEndCoins: finished ? endCoins / finished : 0,
    interstitialsPerPlayer: runs ? sumOf((t) => t.interstitials) / runs : 0,
    rewardedPerPlayer: runs ? sumOf((t) => t.adHints) / runs : 0,
    minutesPerPlayer: runs ? totalSeconds / runs / 60 : 0,
    levels: levels.map((l, i) => {
      const t = tallies[i]!;
      return {
        id: l.id, chapter: l.chapter, role: l.role,
        reached: t.reached, plays: t.plays, solved: t.solved, quits: t.quits, churned: t.churned,
        hintedPlays: t.hintedPlays, coinHints: t.coinHints, adHints: t.adHints, refusedHints: t.refusedHints,
        bankedHints: t.bankedHints, interstitials: t.interstitials,
        meanSolveSeconds: t.solved ? t.solveSeconds / t.solved : 0,
      };
    }),
  };
}

interface PlayResult {
  solved: boolean;
  seconds: number;
  coinHints: number;
  adHints: number;
  refusedHints: number;
  bankedHints: number;
}

function playOnce(level: SimLevel, profile: PlayerProfile, economy: Economy, state: PlayerState, rng: Rng): PlayResult {
  const cfg = PLAYER_CONFIG;
  const time = DIFFICULTY_CONFIG.time;
  const [n0, n1] = cfg.noise;
  const out: PlayResult = { solved: false, seconds: level.fireflies * time.secondsPerTap * profile.speed, coinHints: 0, adHints: 0, refusedHints: 0, bankedHints: 0 };

  for (const [k, step] of level.steps.entries()) {
    // Give up between steps once far past patience; finishing the last step always counts.
    if (k > 0 && out.seconds > profile.patience * cfg.hardStopFactor) return out;
    const base = time.secondsPerTier[step.tier]! * (1 + time.spread / (step.width + 1));
    const noise = n0 + rng.next() * (n1 - n0);
    const gap = step.tier - state.skill;
    const narrow = step.width === 1;
    let stuckChance: number;
    if (gap <= 0) {
      out.seconds += base * profile.speed * noise;
      stuckChance = narrow ? cfg.slipStuck : 0;
    } else {
      out.seconds += base * profile.speed * noise * cfg.stretchTimeFactor;
      stuckChance = gap === 1 ? Math.min(1, cfg.stretchStuck * (narrow ? 2 : 1)) : cfg.beyondStuck;
    }

    if (rng.next() < stuckChance) {
      const frustrated = out.seconds > profile.patience;
      if (rng.next() < cfg.quitWhenStuck[frustrated ? 1 : 0]!) return out;
      if (state.bank > 0) {
        state.bank--;
        out.bankedHints++;
      } else if (state.coins >= economy.hintCost) {
        state.coins -= economy.hintCost;
        out.coinHints++;
      } else if (rng.next() < profile.adWillingness) {
        out.adHints++;
        out.seconds += cfg.adSeconds;
        state.bank += Math.max(0, economy.hintsPerAd - 1); // one used now, the rest saved
      } else {
        out.refusedHints++;
        if (rng.next() < cfg.quitWithoutHelp) return out;
        out.seconds += base * profile.speed * cfg.stretchTimeFactor; // grinds it out
      }
      // A hinted step teaches a little; an unaided one teaches fully.
      if (gap === 1) learn(state, profile, 0.5);
    } else if (gap === 1) {
      learn(state, profile, 1);
    }

  }
  out.solved = true;
  return out;
}

function learn(state: PlayerState, profile: PlayerProfile, amount: number): void {
  state.xp += amount;
  if (state.xp >= profile.learnSteps) {
    state.skill++;
    state.xp = 0;
  }
}

/** Population-weighted outcome per level across profile results. */
export function combine(results: readonly SimResult[], profiles: readonly PlayerProfile[]): { id: string; survival: number; hintRate: number; quitRate: number }[] {
  const share = new Map(profiles.map((p) => [p.id, p.share]));
  const first = results[0];
  if (!first) return [];
  return first.levels.map((l, i) => {
    let survival = 0, hintRate = 0, quitRate = 0;
    for (const r of results) {
      const w = share.get(r.profile) ?? 0;
      const o = r.levels[i]!;
      survival += w * (o.reached / r.runs);
      hintRate += w * (o.plays ? o.hintedPlays / o.plays : 0);
      quitRate += w * (o.plays ? o.quits / o.plays : 0);
    }
    return { id: l.id, survival, hintRate, quitRate };
  });
}

export interface PolicyOptions {
  /** Extra levels for detours (warm-ups and breathers). */
  readonly reserve: readonly SimLevel[];
  /**
   * ASSUMPTION, not evidence: multiplier on the chance of leaving the game
   * after quitting a main-path level, applied only when the policy serves an
   * easier level next (1 = no effect).
   */
  readonly churnFactorWithBreather: number;
}

export interface PolicySimResult extends SimResult {
  /** Detours per simulated player, by reason. */
  readonly detoursPerPlayer: Readonly<Record<string, number>>;
}

const toPolicyLevel = (l: SimLevel): PolicyLevel => ({
  id: l.id,
  tier: l.tier ?? Math.max(1, ...l.steps.map((s) => s.tier)),
  score: l.score ?? 0,
  estimatedSeconds: l.estimatedSeconds ?? 60,
});

/**
 * Like `simulate`, but every next level comes from the next-level policy
 * (`nextLevel`), with play split into sessions so warm-ups happen. Tallies
 * are per main-path level, so results compare directly with `simulate`. A
 * player still leaves after quitting the same main level twice.
 */
export function simulateWithPolicy(
  levels: readonly SimLevel[], profile: PlayerProfile, economy: Economy, runs: number, seed: number, options: PolicyOptions,
): PolicySimResult {
  const ads = PLAYER_CONFIG.ads;
  const sessions = PLAYER_CONFIG.sessions;
  const mainIndex = new Map(levels.map((l, i) => [l.id, i]));
  const all = new Map<string, SimLevel>([...levels, ...options.reserve].map((l) => [l.id, l]));
  const policyLevels = new Map([...all.values()].map((l) => [l.id, toPolicyLevel(l)]));
  const reserve = options.reserve.map(toPolicyLevel);
  const mainPath = levels.map((l) => l.id);

  const tallies: Tally[] = levels.map(() => ({
    reached: 0, plays: 0, solved: 0, quits: 0, churned: 0, hintedPlays: 0, coinHints: 0, adHints: 0, refusedHints: 0, bankedHints: 0,
    interstitials: 0, solveSeconds: 0,
  }));
  const detours: Record<string, number> = {};
  let endCoins = 0, finished = 0, totalSeconds = 0, interstitials = 0, rewarded = 0;

  for (let run = 0; run < runs; run++) {
    const rng = createRng(deriveSeed(seed, run));
    const state: PlayerState = { skill: profile.skill, xp: 0, coins: economy.startingCoins, bank: 0 };
    const solved = new Set<string>();
    const reached = new Set<number>();
    const quits = new Map<string, number>();
    const history: PlayRecord[] = [];
    let clock = 0; // seconds of play
    let gaps = 0; // milliseconds of time between sessions
    let sessionStart = 0;
    let sessionLength = sessionMinutes(rng) * 60;
    let completed = 0;
    let lastMidgame = -Infinity;
    let alive = true;

    for (let guard = 0; guard < levels.length * 6 && alive; guard++) {
      const next = nextLevel({ mainPath, reserve, levels: policyLevels, solved, history, now: clock * 1000 + gaps });
      if (!next) break;
      const level = all.get(next.id)!;
      const mi = mainIndex.get(next.id);
      if (mi !== undefined && !reached.has(mi)) {
        reached.add(mi);
        tallies[mi]!.reached++;
      }
      if (isDetour(next.reason)) detours[next.reason] = (detours[next.reason] ?? 0) + 1;

      const r = playOnce(level, profile, economy, state, rng);
      rewarded += r.adHints;
      clock += r.seconds + ads.levelTransitionSeconds;
      if (mi !== undefined) {
        const t = tallies[mi]!;
        t.plays++;
        t.coinHints += r.coinHints;
        t.adHints += r.adHints;
        t.refusedHints += r.refusedHints;
        t.bankedHints += r.bankedHints;
        if (r.coinHints + r.adHints + r.bankedHints > 0) t.hintedPlays++;
      }
      history.push({
        levelId: level.id, reason: next.reason, solved: r.solved, seconds: r.seconds,
        hints: r.coinHints + r.adHints + r.bankedHints, endedAt: clock * 1000 + gaps,
      });

      if (r.solved) {
        solved.add(level.id);
        state.coins += economy.coinsPerSolve;
        completed++;
        if (mi !== undefined) {
          tallies[mi]!.solved++;
          tallies[mi]!.solveSeconds += r.seconds;
        }
        if (completed > ads.midgameAfterLevels && clock - lastMidgame >= ads.midgameMinGapSeconds) {
          if (mi !== undefined) tallies[mi]!.interstitials++;
          interstitials++;
          lastMidgame = clock;
          clock += ads.midgameSeconds;
        }
      } else if (mi !== undefined) {
        const t = tallies[mi]!;
        t.quits++;
        const n = (quits.get(level.id) ?? 0) + 1;
        quits.set(level.id, n);
        const peek = nextLevel({ mainPath, reserve, levels: policyLevels, solved, history, now: clock * 1000 + gaps });
        const softened = peek !== null && isDetour(peek.reason);
        const churn = profile.churnOnQuit * (softened ? options.churnFactorWithBreather : 1);
        if (n > PLAYER_CONFIG.retries || rng.next() < churn) {
          t.churned++;
          alive = false;
          break;
        }
      } else if (rng.next() < profile.churnOnQuit) {
        // Quitting a detour can end the game too (the policy then goes back to the main path).
        detours['left during a detour'] = (detours['left during a detour'] ?? 0) + 1;
        alive = false;
        break;
      }

      // End of a sitting: the next play starts after a gap (a warm-up's cue).
      if (clock - sessionStart >= sessionLength) {
        gaps += sessions.gapHours * 3_600_000;
        sessionStart = clock;
        sessionLength = sessionMinutes(rng) * 60;
      }
    }
    if (alive && mainPath.every((id) => solved.has(id))) {
      finished++;
      endCoins += state.coins;
    }
    totalSeconds += clock;
  }

  return {
    profile: profile.id,
    runs,
    finished,
    meanEndCoins: finished ? endCoins / finished : 0,
    interstitialsPerPlayer: runs ? interstitials / runs : 0,
    rewardedPerPlayer: runs ? rewarded / runs : 0,
    minutesPerPlayer: runs ? totalSeconds / runs / 60 : 0,
    detoursPerPlayer: Object.fromEntries(Object.entries(detours).map(([k, v]) => [k, runs ? v / runs : 0])),
    levels: levels.map((l, i) => {
      const t = tallies[i]!;
      return {
        id: l.id, chapter: l.chapter, role: l.role,
        reached: t.reached, plays: t.plays, solved: t.solved, quits: t.quits, churned: t.churned,
        hintedPlays: t.hintedPlays, coinHints: t.coinHints, adHints: t.adHints, refusedHints: t.refusedHints,
        bankedHints: t.bankedHints, interstitials: t.interstitials,
        meanSolveSeconds: t.solved ? t.solveSeconds / t.solved : 0,
      };
    }),
  };
}

function sessionMinutes(rng: Rng): number {
  const [a, b] = PLAYER_CONFIG.sessions.minutes;
  return a + rng.next() * (b - a);
}

