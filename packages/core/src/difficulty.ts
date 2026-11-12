import type { Board } from './board.ts';
import type { Grade } from './grader.ts';
import type { Level } from './types.ts';

/**
 * Difficulty model v0. Difficulty comes from which deductions a level forces
 * (the grader trace), with board size only as a tie-breaker. Every weight
 * lives in DIFFICULTY_CONFIG so Phase 4 can refit them to real solve times
 * and quit rates without touching the code that uses them.
 */
export const DIFFICULTY_CONFIG = {
  score: {
    perTier: 25, // hardest tier dominates
    perT3PlusStep: 4,
    perT4PlusStep: 6, // on top of the T3+ weight
    perNarrowStep: 1.5, // a T2+ step that was the only move available
    perPathCell: 0.1,
  },
  time: {
    /** Seconds to find one deduction of each tier when it is the only one on the board. */
    secondsPerTier: [0, 2.5, 4, 12, 18, 40],
    /** Searching is faster when many moves are available: cost × (1 + spread / (width + 1)). */
    spread: 2,
    /** Seconds to tap a firefly in. */
    secondsPerTap: 0.8,
  },
  /**
   * Content policy for shipped levels (estimated seconds). Casual portal
   * players: nothing asks for more than five minutes, and the opening
   * chapter stays under one (project plan: "under a minute each").
   */
  limits: {
    maxSecondsAnyLevel: 300,
    maxSecondsChapter1: 60,
  },
} as const;

export interface LevelFeatures {
  readonly maxTier: number;
  readonly steps: number;
  readonly t3PlusSteps: number;
  readonly t4PlusSteps: number;
  /** T2+ steps where only one cell could be decided. */
  readonly narrowSteps: number;
  /** Smallest width over the trace (Infinity if no steps). */
  readonly minWidth: number;
  readonly area: number;
  readonly pathCells: number;
  readonly bushes: number;
  readonly hiddenBushes: number;
  readonly fireflies: number;
  /** Twist keys present in the level. */
  readonly mechanics: readonly string[];
}

export interface Difficulty {
  readonly features: LevelFeatures;
  /** 1..5 (6 = the techniques could not finish it). */
  readonly tier: number;
  readonly score: number;
  /** Rough solve time in seconds for a player fluent in every technique used. */
  readonly estimatedSeconds: number;
}

export function measure(level: Level, board: Board, g: Grade): Difficulty {
  const cfg = DIFFICULTY_CONFIG;
  const steps = g.steps;
  const t3PlusSteps = steps.filter((s) => s.tier >= 3).length;
  const t4PlusSteps = steps.filter((s) => s.tier >= 4).length;
  const narrowSteps = steps.filter((s) => s.tier >= 2 && s.width === 1).length;
  const minWidth = steps.reduce((m, s) => Math.min(m, s.width), Infinity);
  const mechanics = Object.entries(level.twists ?? {})
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([k]) => k)
    .sort();

  const features: LevelFeatures = {
    maxTier: g.maxTier,
    steps: steps.length,
    t3PlusSteps,
    t4PlusSteps,
    narrowSteps,
    minWidth,
    area: board.w * board.h,
    pathCells: board.paths.length,
    bushes: level.bushes.length + (level.twists?.mushrooms?.length ?? 0),
    hiddenBushes: level.bushes.filter(([, , n]) => n === null).length,
    fireflies: g.fireflies.length - board.lanterns.length,
    mechanics,
  };

  const s = cfg.score;
  const score = Math.round(
    s.perTier * g.maxTier + s.perT3PlusStep * t3PlusSteps + s.perT4PlusStep * t4PlusSteps
    + s.perNarrowStep * narrowSteps + s.perPathCell * board.paths.length,
  );

  const t = cfg.time;
  let seconds = features.fireflies * t.secondsPerTap;
  for (const st of steps) seconds += t.secondsPerTier[st.tier]! * (1 + t.spread / (st.width + 1));

  return { features, tier: g.maxTier, score, estimatedSeconds: Math.round(seconds) };
}
