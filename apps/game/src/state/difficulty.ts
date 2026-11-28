/**
 * Difficulty labels (docs/plans/2026-11-28-hints-coins-journal.md, section 5): every garden's
 * stored tier, graded count-aware as players see it (`gradeLevel`), as a word and a number of
 * leaves. The tier is the hardest technique the garden needs, so the label says what kind of
 * thinking it asks for, and a breather garden honestly reads Easy or Medium.
 */

export interface Difficulty {
  readonly word: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  /** 1 to 4. */
  readonly leaves: number;
}

// Plain words, as players know them from other puzzle games (Michael, 2026-11-28).
const WORDS = ['Easy', 'Medium', 'Hard', 'Expert'] as const;
export const MAX_LEAVES = WORDS.length;

/** The label for a tier (clamped to 1..4: a later, harder tier still reads Expert). */
export function difficultyOf(tier: number): Difficulty {
  const leaves = Math.min(MAX_LEAVES, Math.max(1, Math.round(Number.isFinite(tier) ? tier : 1)));
  return { word: WORDS[leaves - 1]!, leaves };
}
