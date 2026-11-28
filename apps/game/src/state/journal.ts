import type { Board, PlayRecord } from '@firefly/core';
import { chapterLine, chapterTotals } from './chapters.ts';
import type { ChapterInfo } from './catalog.ts';

/**
 * The garden journal (docs/plans/2026-11-28-hints-coins-journal.md, section 4; design canvas
 * "Garden journal: a page per chapter"): one page per chapter, with its seal once every garden
 * glows, its line, its totals and a pressed sketch of each garden grown. Pure: what a page says is
 * decided here and unit-tested; `ui/journal.ts` only draws it.
 */

export type PageState = 'done' | 'growing' | 'dark';

export interface JournalGarden {
  readonly id: string;
  readonly grown: boolean;
}

export interface JournalPage {
  readonly chapterId: string;
  /** 1-based chapter number. */
  readonly number: number;
  /** "The Rose Bed". */
  readonly area: string;
  readonly state: PageState;
  /** The chapter card's line once it's done; a line about what's left while it grows. */
  readonly line: string;
  readonly gardens: readonly JournalGarden[];
  readonly grown: number;
  readonly seconds: number;
  readonly hints: number;
  /**
   * The play history (capped to recent plays) still holds a solved play for every grown garden,
   * so `seconds` and `hints` are whole. False once older plays have been trimmed: show no totals.
   */
  readonly totalsKnown: boolean;
}

/**
 * Every chapter's page. A chapter is `dark` until it can be played (the one before it is done, or
 * it is the first), `done` once every garden is solved, `growing` in between.
 */
export function journalPages(
  chapters: readonly ChapterInfo[],
  isSolved: (id: string) => boolean,
  history: readonly (Pick<PlayRecord, 'levelId' | 'seconds' | 'hints'> & { readonly solved?: boolean })[],
): JournalPage[] {
  let previousDone = true;
  return chapters.map((c, i) => {
    const gardens = c.levels.map((id) => ({ id, grown: isSolved(id) }));
    const grown = gardens.filter((g) => g.grown).length;
    const done = grown === gardens.length;
    const state: PageState = done ? 'done' : previousDone || grown > 0 ? 'growing' : 'dark';
    previousDone = done;
    const totals = chapterTotals(c, history);
    const playedSolved = new Set(history.filter((h) => 'solved' in h ? h.solved : true).map((h) => h.levelId));
    const totalsKnown = gardens.every((g) => !g.grown || playedSolved.has(g.id));
    const left = gardens.length - grown;
    const line = state === 'done'
      ? chapterLine(c.id)
      : state === 'growing'
        ? `Still growing: ${left} ${left === 1 ? 'garden' : 'gardens'} to go. The seal is stamped when every one glows.`
        : 'Still dark. This page opens when the chapter before it glows.';
    return {
      chapterId: c.id, number: i + 1, area: `The ${c.area}`, state, line, gardens, grown,
      seconds: totals.seconds, hints: totals.hints, totalsKnown,
    };
  });
}

/** The page the journal opens on: the first chapter still growing, else the last done one. */
export function openingPage(pages: readonly JournalPage[]): number {
  const growing = pages.findIndex((p) => p.state === 'growing');
  if (growing >= 0) return growing;
  let last = 0;
  pages.forEach((p, i) => { if (p.state === 'done') last = i; });
  return last;
}

export type SketchCell = 'path' | 'bush' | 'firefly' | 'lantern';

export interface Sketch {
  readonly w: number;
  readonly h: number;
  /** Row-major; `null` for cells outside the garden. */
  readonly cells: readonly (SketchCell | null)[];
}

/**
 * A grown garden's pressed sketch: its layout with the answer's fireflies on it (Michael,
 * 2026-11-28: show them; the player solved it). Only ever built for a solved garden.
 */
export function gardenSketch(board: Board, solution: ReadonlySet<number>): Sketch {
  const cells = board.kind.map((k, i): SketchCell | null => {
    if (k === 'void') return null;
    if (k === 'bush' || k === 'mushroom') return 'bush';
    if (board.lantern[i]) return 'lantern';
    return solution.has(i) ? 'firefly' : 'path';
  });
  return { w: board.w, h: board.h, cells };
}
