import { isDetour, nextLevel, POLICY_CONFIG } from '@firefly/core';
import type { NextLevel, NextReason, PlayRecord } from '@firefly/core';
import type { Catalog } from './catalog.ts';

/**
 * Progress through the game: what has been solved, the recent play history
 * and the compact facts the next-level policy needs, and the call to
 * `nextLevel`. History is capped; `playedReserve` and `quitMain` keep what a
 * capped history would forget (rules.md, "Saved progress").
 */

/** History kept: comfortably above the policy's minimum. */
export const HISTORY_CAP = Math.max(50, POLICY_CONFIG.minHistory);

export interface Progress {
  readonly solved: ReadonlySet<string>;
  readonly history: readonly PlayRecord[];
  readonly playedReserve: ReadonlySet<string>;
  readonly quitMain: ReadonlySet<string>;
}

export interface PlayOutcome {
  readonly levelId: string;
  readonly reason: NextReason;
  readonly solved: boolean;
  readonly seconds: number;
  readonly hints: number;
  readonly endedAt: number;
}

export class Session {
  readonly catalog: Catalog;
  private solvedSet: Set<string>;
  private historyList: PlayRecord[];
  private playedReserveSet: Set<string>;
  private quitMainSet: Set<string>;

  constructor(catalog: Catalog, progress: Progress | null = null) {
    this.catalog = catalog;
    this.solvedSet = new Set(progress?.solved ?? []);
    this.historyList = [...(progress?.history ?? [])].slice(-HISTORY_CAP);
    this.playedReserveSet = new Set(progress?.playedReserve ?? []);
    this.quitMainSet = new Set(progress?.quitMain ?? []);
  }

  get progress(): Progress {
    return { solved: this.solvedSet, history: this.historyList, playedReserve: this.playedReserveSet, quitMain: this.quitMainSet };
  }

  /** What to play next, or null when the main path is finished. */
  next(now: number): NextLevel | null {
    return nextLevel({
      mainPath: this.catalog.mainPath,
      reserve: this.catalog.reserve,
      levels: this.catalog.levels,
      solved: this.solvedSet,
      history: this.historyList,
      playedReserve: this.playedReserveSet,
      quitMain: this.quitMainSet,
      now,
    });
  }

  record(outcome: PlayOutcome): void {
    this.historyList.push({ ...outcome });
    if (this.historyList.length > HISTORY_CAP) this.historyList.splice(0, this.historyList.length - HISTORY_CAP);
    if (outcome.solved) this.solvedSet.add(outcome.levelId);
    if (isDetour(outcome.reason) || this.catalog.reserveIds.has(outcome.levelId)) this.playedReserveSet.add(outcome.levelId);
    else if (!outcome.solved && this.catalog.mainIds.has(outcome.levelId)) this.quitMainSet.add(outcome.levelId);
  }

  /** Attempt number for a level: plays recorded for it, plus this one. */
  attempt(levelId: string): number {
    return this.historyList.filter((h) => h.levelId === levelId).length + 1;
  }

  /** Main-path levels solved, for chapter progress. */
  isSolved(levelId: string): boolean {
    return this.solvedSet.has(levelId);
  }
}
