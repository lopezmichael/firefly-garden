import type { PlayRecord } from '@firefly/core';

/**
 * The chapter-finished moment (flow plan B, docs/plans/2026-11-13-flow-and-transitions.md):
 * which solve finishes a chapter, what the chapter card says about it, and its totals. Pure,
 * so the "this solve finished the chapter" rule is unit-tested.
 */

export interface ChapterLevels {
  readonly id: string;
  readonly levels: readonly string[];
}

/**
 * The index of the chapter this solve finishes, or null: `levelId` belongs to a chapter, was
 * not solved before, and every other level of that chapter was. `solvedBefore` is the solved
 * set as it was before this solve is recorded.
 */
export function chapterFinishedBy(
  chapters: readonly ChapterLevels[], levelId: string, solvedBefore: (id: string) => boolean,
): number | null {
  if (solvedBefore(levelId)) return null;
  const index = chapters.findIndex((c) => c.levels.includes(levelId));
  if (index < 0) return null;
  return chapters[index]!.levels.every((id) => id === levelId || solvedBefore(id)) ? index : null;
}

export interface ChapterTotals {
  /** Gardens in the chapter (all are solved when its card shows). */
  readonly gardens: number;
  /** Active seconds played on the chapter's gardens, every attempt counted. */
  readonly seconds: number;
  /** Hints used on the chapter's gardens. */
  readonly hints: number;
}

/** The chapter card's totals, from the play history (which keeps the most recent plays). */
export function chapterTotals(chapter: ChapterLevels, history: readonly Pick<PlayRecord, 'levelId' | 'seconds' | 'hints'>[]): ChapterTotals {
  const ids = new Set(chapter.levels);
  let seconds = 0, hints = 0;
  for (const h of history) {
    if (!ids.has(h.levelId)) continue;
    seconds += h.seconds;
    hints += h.hints;
  }
  return { gardens: chapter.levels.length, seconds: Math.round(seconds), hints };
}

/** What the chapter taught, for the card (by chapter id; written with each chapter's technique). */
const LINES: Readonly<Record<string, string>> = {
  c1: 'Every garden in the first bed is glowing. You read a bush’s dots at a glance now.',
  c2: 'You learned to read two bushes together, where their numbers share a spot.',
  c3: 'You learned to look one move ahead. Now you know every trick the roses teach.',
  c4: 'Bigger beds, and you read them all: sharing bushes and moves ahead together.',
  c5: 'The whole Rose Bed is glowing. Every trick you learned here, you used.',
};

export function chapterLine(chapterId: string): string {
  return LINES[chapterId] ?? 'Every garden in this bed is glowing.';
}

/** "9:24" for the card (minutes may run past 60: "74:05"). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
