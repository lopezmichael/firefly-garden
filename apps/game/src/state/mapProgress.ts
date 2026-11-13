/**
 * The garden map's one-time unlock moment (theme plan, milestone 7c): when a
 * chapter is newly finished, the first map open after it plays one firefly
 * flying the path to the next stop. Which chapters the map has already shown
 * finished is kept in the save (`mapSeen`). Pure, so the "once per newly
 * finished chapter" rule is unit-tested.
 */

export interface ChapterProgress {
  readonly id: string;
  readonly finished: boolean;
}

export interface UnlockMoment {
  /** Index of the chapter the flight leaves from (the latest newly finished one), or null for none. */
  readonly from: number | null;
  /** The seen set to keep from now on: every finished chapter. */
  readonly seen: ReadonlySet<string>;
}

/**
 * Decide the unlock flight for this map open. Only the latest newly finished
 * chapter flies (a save from before this existed, with several finished
 * chapters, gets one flight, not one per chapter), and every finished chapter is
 * marked seen so the next open plays nothing.
 */
export function unlockToShow(chapters: readonly ChapterProgress[], seen: ReadonlySet<string>): UnlockMoment {
  let from: number | null = null;
  chapters.forEach((c, i) => {
    if (c.finished && !seen.has(c.id)) from = i;
  });
  return { from, seen: new Set(chapters.filter((c) => c.finished).map((c) => c.id)) };
}
