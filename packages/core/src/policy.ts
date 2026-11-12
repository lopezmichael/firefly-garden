/**
 * Next-level policy: what to serve after each play. The main path (the
 * chapters, in order) is the default; the policy inserts a short detour from
 * a reserve pool of extra levels when the player's recent history suggests
 * they need one:
 *
 *   - back after a long break      → a quick warm-up, a tier below their best
 *   - quit the last level          → an easier breather, then back to that level
 *   - a long solve                 → an easier breather
 *   - hints on two levels running  → an easier breather
 *
 * Never two detours in a row, so progress never stalls, and detours never use
 * main-path levels. Pure and deterministic: the game calls it with real
 * timestamps; the simulator calls it with simulated ones.
 */

export interface PolicyLevel {
  readonly id: string;
  readonly tier: number;
  readonly score: number;
  readonly estimatedSeconds: number;
}

export type NextReason = 'main' | 'retry' | 'warm-up' | 'breather-after-quit' | 'breather-after-long' | 'breather-after-hints';

export interface PlayRecord {
  readonly levelId: string;
  readonly reason: NextReason;
  readonly solved: boolean;
  readonly seconds: number;
  readonly hints: number;
  /** When the play ended, in milliseconds. */
  readonly endedAt: number;
}

export interface PolicyInput {
  /** Main-path level ids, in play order. */
  readonly mainPath: readonly string[];
  /** Extra levels the policy may use for detours. */
  readonly reserve: readonly PolicyLevel[];
  /** Every level the policy may need to look up (main path and reserve). */
  readonly levels: ReadonlyMap<string, PolicyLevel>;
  readonly solved: ReadonlySet<string>;
  /**
   * Most recent last. The game may cap it (saved progress is untrusted and
   * must stay small); the two sets below carry the facts a capped history
   * would lose. Warm-up difficulty reads only this history, so a capped one
   * judges the player's comfortable tier from recent plays.
   */
  readonly history: readonly PlayRecord[];
  /** Reserve levels already served, beyond those in `history`, so detours never repeat. */
  readonly playedReserve?: ReadonlySet<string>;
  /** Main-path levels quit at least once, beyond those in `history`, so they come back as a retry. */
  readonly quitMain?: ReadonlySet<string>;
  /** Current time in milliseconds. */
  readonly now: number;
}

export interface NextLevel {
  readonly id: string;
  readonly reason: NextReason;
}

export const POLICY_CONFIG = {
  /** A break at least this long earns a warm-up. */
  returnGapHours: 8,
  /** Warm-ups take at most this long (estimated). */
  warmupMaxSeconds: 60,
  /** A solve is long past this multiple of its estimate... */
  longSolveFactor: 1.75,
  /** ...or past this many seconds. */
  longSolveSeconds: 240,
  /** Hinted main-path levels in a row before a breather. */
  hintStreak: 2,
  /**
   * Plays of history the game must keep at least when it caps saved history.
   * The hint streak and the last hint breather are read from history alone;
   * detours never come twice in a row, so 2 × hintStreak + 1 records always
   * cover them. 8 leaves room.
   */
  minHistory: 8,
  /** A breather scores at most this fraction of the level that triggered it... */
  breatherScoreFraction: 0.8,
  /** ...and takes at most this many seconds (estimated). */
  breatherMaxSeconds: 90,
} as const;

const DETOURS: ReadonlySet<NextReason> = new Set(['warm-up', 'breather-after-quit', 'breather-after-long', 'breather-after-hints']);

export function isDetour(reason: NextReason): boolean {
  return DETOURS.has(reason);
}

export function nextLevel(input: PolicyInput): NextLevel | null {
  const cfg = POLICY_CONFIG;
  const nextMain = input.mainPath.find((id) => !input.solved.has(id));
  const last = input.history.at(-1);
  const main = (): NextLevel | null => {
    if (nextMain === undefined) return null;
    const quitBefore = (input.quitMain?.has(nextMain) ?? false) || input.history.some((h) => h.levelId === nextMain && !h.solved);
    return { id: nextMain, reason: quitBefore ? 'retry' : 'main' };
  };
  // Done, or nothing played yet: no detours.
  if (!last || nextMain === undefined) return main();

  // Never two detours in a row.
  if (isDetour(last.reason)) return main();

  const detour = (reason: NextReason, pick: PolicyLevel | undefined): NextLevel | null =>
    pick ? { id: pick.id, reason } : main();

  // Back after a long break: a quick warm-up a tier below their best.
  if (input.now - last.endedAt >= cfg.returnGapHours * 3_600_000) {
    return detour('warm-up', pickWarmup(input));
  }

  const lastLevel = input.levels.get(last.levelId);
  if (!lastLevel) return main();

  // Quit: an easier breather, then the quit level comes back as a retry.
  if (!last.solved) return detour('breather-after-quit', pickBreather(input, lastLevel));

  // A long solve.
  if (last.seconds >= Math.min(cfg.longSolveSeconds, lastLevel.estimatedSeconds * cfg.longSolveFactor)) {
    return detour('breather-after-long', pickBreather(input, lastLevel));
  }

  // Hints on several main-path levels running, counted since the last hint breather
  // (so one breather does not set off the next).
  const lastHintBreather = input.history.map((h) => h.reason).lastIndexOf('breather-after-hints');
  const recentMain = input.history.slice(lastHintBreather + 1).filter((h) => !isDetour(h.reason)).slice(-cfg.hintStreak);
  if (recentMain.length === cfg.hintStreak && recentMain.every((h) => h.hints > 0)) {
    return detour('breather-after-hints', pickBreather(input, lastLevel));
  }

  return main();
}

function unplayedReserve(input: PolicyInput): PolicyLevel[] {
  const played = new Set(input.history.map((h) => h.levelId));
  return input.reserve.filter((l) => !input.solved.has(l.id) && !played.has(l.id) && !(input.playedReserve?.has(l.id) ?? false));
}

/** Highest tier the player has solved without hints (at least 1). */
function comfortableTier(input: PolicyInput): number {
  let best = 1;
  for (const h of input.history) {
    if (!h.solved || h.hints > 0) continue;
    const l = input.levels.get(h.levelId);
    if (l) best = Math.max(best, l.tier);
  }
  return best;
}

function pickWarmup(input: PolicyInput): PolicyLevel | undefined {
  const tier = Math.max(1, comfortableTier(input) - 1);
  return unplayedReserve(input)
    .filter((l) => l.tier <= tier && l.estimatedSeconds <= POLICY_CONFIG.warmupMaxSeconds)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0];
}

function pickBreather(input: PolicyInput, trigger: PolicyLevel): PolicyLevel | undefined {
  const cfg = POLICY_CONFIG;
  const maxTier = Math.max(1, trigger.tier - 1);
  return unplayedReserve(input)
    .filter((l) => l.tier <= maxTier && l.score <= trigger.score * cfg.breatherScoreFraction && l.estimatedSeconds <= cfg.breatherMaxSeconds)
    // The most engaging level that is still clearly easier.
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0];
}
