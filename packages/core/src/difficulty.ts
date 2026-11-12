import type { Board } from './board.ts';
import type { Grade } from './grader.ts';
import type { Level } from './types.ts';

/**
 * Difficulty model v1. Difficulty comes from which deductions a level forces
 * (the grader trace). The hardest tier picks a band of the score; how much
 * searching the trace demands places the level inside that band. Every weight
 * lives in DIFFICULTY_CONFIG so Phase 4 can refit them to real solve times
 * and quit rates without touching the code that uses them.
 */
export const DIFFICULTY_CONFIG = {
  score: {
    /** Each tier owns a band of this width: tier 2 scores from 50 up to (not reaching) 75. */
    perTier: 25,
    /**
     * Per tier, the search seconds (time model without taps) that map to the
     * bottom and top of its band, on a log scale: doubling the search moves a
     * level the same distance anywhere in the band. Set from the spread of
     * each tier in the census (2026-11-12) so every band uses its full width.
     */
    searchRange: [[1, 1], [15, 45], [25, 210], [50, 260], [45, 290], [100, 300]] as readonly (readonly [number, number])[],
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
    /** Tighter limits for particular chapters, by chapter id. */
    chapterMaxSeconds: { c1: 60, c3: 240 } as Readonly<Record<string, number>>,
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

  const t = cfg.time;
  let search = 0;
  for (const st of steps) search += t.secondsPerTier[st.tier]! * (1 + t.spread / (st.width + 1));
  const seconds = search + features.fireflies * t.secondsPerTap;

  // Band by tier, then a log-scale position inside it, clamped so a level
  // never leaves its tier's band.
  const s = cfg.score;
  const [lo, hi] = s.searchRange[Math.min(g.maxTier, s.searchRange.length - 1)]!;
  const pos = g.maxTier === 0 || search <= lo ? 0 : Math.min(1, Math.log(search / lo) / Math.log(hi / lo));
  const within = (s.perTier - 1) * pos;
  const score = Math.round(s.perTier * g.maxTier + within);

  return { features, tier: g.maxTier, score, estimatedSeconds: Math.round(seconds) };
}
