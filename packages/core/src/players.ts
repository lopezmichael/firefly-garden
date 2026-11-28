import { DIFFICULTY_CONFIG } from './difficulty.ts';
import type { Board } from './board.ts';
import type { Grade } from './grader.ts';
import { HINT_CROSS_CAP } from './hints.ts';
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
 * A hint never places a firefly (`hint`, hints.ts). It crosses out the first
 * group of `empty` steps still open on the board (`simHintGroup`: the grader
 * reads only the hint's X marks, so it may re-find tiles the player had
 * already worked out, and the player stays stuck), or, when the next deduction
 * is a firefly with nothing left to rule out, it points at it and the player
 * still has to find it (`pointedTimeFactor`). Asking again for the same point
 * shows it again for free, so a point is the last hint one stuck spot can take.
 *
 * Every number here is a modelling assumption, kept in PLAYER_CONFIG so it
 * can be refit once real solve, hint and quit data exists.
 */

export interface SimStep {
  readonly tier: number;
  readonly width: number;
  /**
   * What the step decides and its technique plus reason cells (`simSteps`), so a hint can
   * cross out a group of empty steps. Without `value`, a hint resolves the stuck step (the
   * older model, kept for hand-made test levels).
   */
  readonly value?: 'firefly' | 'empty';
  readonly group?: string;
  /**
   * An empty step only: the index of the first firefly step whose light reaches its tile.
   * Once that firefly is down the tile is visibly decided, so no hint re-finds it.
   */
  readonly litAt?: number;
}

/** A grader trace as the simulated players walk it (count-aware: pass `gradeLevel` and the level's board). */
export function simSteps(g: Grade, board: Board): SimStep[] {
  const lit = new Map<number, number>();
  g.steps.forEach((s, i) => {
    if (s.value !== 'firefly') return;
    for (const c of [s.cell, ...board.rays[s.cell]!]) if (!lit.has(c)) lit.set(c, i);
  });
  return g.steps.map((s, i) => {
    const step: SimStep = { tier: s.tier, width: s.width, value: s.value, group: `${s.technique}:${s.because.join(',')}` };
    const at = lit.get(s.cell);
    return s.value === 'empty' && at !== undefined && at > i ? { ...step, litAt: at } : step;
  });
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
  /** Coins for finishing a chapter's main path (the chapter card's bonus); none when absent. */
  readonly chapterBonus?: number;
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
  /**
   * Time multiplier for a step a hint pointed at (the ring and the line say where and what
   * to look for; the player still finds the firefly). ASSUMPTION until real hint data exists.
   */
  pointedTimeFactor: 1.5,
  /** Hints one stuck spot may take before the player grinds it out (a safety bound, rarely reached). */
  maxHintsPerStuck: 6,
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
  economy: { startingCoins: 60, coinsPerSolve: 10, hintCost: 30, hintsPerAd: 3, chapterBonus: 30 } as Economy,
  /** Ad pacing from the project plan (Monetization, Ad placements). */
  ads: {
    /** No midgame ad until this many levels are complete (first session protection). */
    midgameAfterLevels: 5,
    /** Portal cap on midgame ads (CrazyGames: at most one per three minutes). */
    midgameMinGapSeconds: 180,
    /**
     * Seconds between levels (the solve's celebration, then the player's tap to continue). An
     * assumption since tap to continue: refit from the playtest's `continue` event seconds.
     */
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
          // The last level of a chapter finishes it: the chapter card's bonus.
          if (levels[i + 1]?.chapter !== levels[i]!.chapter) state.coins += economy.chapterBonus ?? 0;
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
  /** Steps a hint has crossed out this play. */
  const crossed = new Set<number>();

  for (const [k, step] of level.steps.entries()) {
    // Give up between steps once far past patience; finishing the last step always counts.
    if (k > 0 && out.seconds > profile.patience * cfg.hardStopFactor) return out;
    // A tile a hint already crossed out: nothing to work out.
    if (crossed.has(k)) continue;
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
      let resolved = step.value === undefined;
      for (let ask = 0; ask < cfg.maxHintsPerStuck; ask++) {
        const got = takeHint(profile, economy, state, rng, out);
        if (got === 'quit') return out;
        if (got === 'grind') {
          out.seconds += base * profile.speed * cfg.stretchTimeFactor;
          resolved = true;
          break;
        }
        if (resolved) break; // the older model: the hint resolves the step
        const group = simHintGroup(level.steps, k, crossed);
        if (group.length === 0) {
          // Nothing left to rule out before this firefly: the hint points, the player finds it.
          out.seconds += base * profile.speed * cfg.pointedTimeFactor;
          resolved = true;
          break;
        }
        for (const j of group) crossed.add(j);
        if (crossed.has(k)) {
          resolved = true;
          break;
        }
        // The hint crossed tiles the player had already worked out: still stuck.
      }
      if (!resolved) out.seconds += base * profile.speed * cfg.stretchTimeFactor; // grinds it out
      // A hinted step teaches a little; an unaided one teaches fully.
      if (gap === 1) learn(state, profile, 0.5);
    } else if (gap === 1) {
      learn(state, profile, 1);
    }

  }
  out.solved = true;
  return out;
}

/**
 * One hint for a stuck player: from the bank, with coins, or by watching an ad; refused
 * when none of those happens, and then they either quit or grind the step out.
 */
function takeHint(profile: PlayerProfile, economy: Economy, state: PlayerState, rng: Rng, out: PlayResult): 'hint' | 'quit' | 'grind' {
  const cfg = PLAYER_CONFIG;
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
    return rng.next() < cfg.quitWithoutHelp ? 'quit' : 'grind';
  }
  return 'hint';
}

/**
 * The steps the next hint crosses out for a player stuck on step `k`, as the real hint finds
 * them: the grader starts from the fireflies placed so far (every firefly step before `k`)
 * and the hint's own X marks, never the player's, so it re-finds, in trace order, the first
 * empty step that is still open on the board (not crossed by a hint, not lit by a firefly
 * already down), even one the player worked out long ago. It takes the run of open steps
 * sharing that step's technique and reason cells, at most `HINT_CROSS_CAP`, and stops at the
 * next firefly still to place. Empty when nothing is open before it (the hint points).
 * Exported for tests.
 */
export function simHintGroup(steps: readonly SimStep[], k: number, crossed: ReadonlySet<number>): number[] {
  const open = (j: number) => {
    const st = steps[j]!;
    return st.value === 'empty' && !crossed.has(j) && !(st.litAt !== undefined && st.litAt < k);
  };
  const out: number[] = [];
  let group: string | undefined;
  for (let j = 0; j < steps.length && out.length < HINT_CROSS_CAP; j++) {
    const st = steps[j]!;
    if (st.value === 'firefly') {
      if (j >= k) break; // the next firefly to place: the grader stops there
      continue; // already on the board
    }
    if (!open(j)) continue;
    if (group === undefined) group = st.group;
    else if (st.group !== group) break;
    out.push(j);
  }
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
  const chapterMains = new Map<string, string[]>();
  for (const l of levels) chapterMains.set(l.chapter, [...(chapterMains.get(l.chapter) ?? []), l.id]);

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
    const bonused = new Set<string>();
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
        // A main-path solve that finishes its chapter's main levels: the chapter card's bonus, once.
        if (mi !== undefined && !bonused.has(level.chapter) && (chapterMains.get(level.chapter) ?? []).every((id) => solved.has(id))) {
          bonused.add(level.chapter);
          state.coins += economy.chapterBonus ?? 0;
        }
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

