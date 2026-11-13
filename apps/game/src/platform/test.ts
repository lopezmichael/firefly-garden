import { createLocalPlatform } from './local.ts';
import type { Platform } from './platform.ts';

/**
 * Scriptable stand-in for the end-to-end tests (Phase 2 plan, H): offers
 * rewarded ads (the friends build hides them) and lets a test decide whether
 * the next one completes or is cancelled, and how long it runs. Saves go to
 * localStorage like the local adapter, so reload-and-resume is real. Only
 * built in `--mode e2e`; production never includes it.
 */

export type AdOutcome = 'complete' | 'cancel';

export interface TestPlatform extends Platform {
  /** Script the next rewarded ads; when the queue is empty they complete. */
  queueRewarded(...outcomes: AdOutcome[]): void;
  /** How long an ad stays up, in milliseconds (default 300). */
  adMs: number;
  /** Calls seen so far, for assertions. */
  readonly calls: { gameplayStart: number; gameplayStop: number; rewarded: number; midgame: number };
  /** True while an ad is on screen. */
  readonly adShowing: boolean;
}

export function createTestPlatform(): TestPlatform {
  const local = createLocalPlatform();
  const queue: AdOutcome[] = [];
  const calls = { gameplayStart: 0, gameplayStop: 0, rewarded: 0, midgame: 0 };
  let showing = false;
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const platform: TestPlatform = {
    name: 'test',
    rewardedAds: true,
    adMs: 300,
    calls,
    get adShowing() {
      return showing;
    },
    init: () => local.init(),
    gameplayStart() {
      calls.gameplayStart++;
    },
    gameplayStop() {
      calls.gameplayStop++;
    },
    async showMidgame() {
      calls.midgame++;
      showing = true;
      await wait(platform.adMs);
      showing = false;
    },
    async showRewarded() {
      calls.rewarded++;
      showing = true;
      await wait(platform.adMs);
      showing = false;
      return (queue.shift() ?? 'complete') === 'complete';
    },
    queueRewarded(...outcomes) {
      queue.push(...outcomes);
    },
    save: (key, value) => local.save(key, value),
    load: (key) => local.load(key),
  };
  return platform;
}
