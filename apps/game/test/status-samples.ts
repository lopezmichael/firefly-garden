import { HINT_REASONS, PLAYER_CONFIG, REMOVE_REASONS, TRY_HERE_REASON } from '@firefly/core';
import type { Evaluation, Hint, TechniqueId } from '@firefly/core';
import { boardStatus, finishedStatus, noticeStatus } from '../src/state/status.ts';
import type { Notice, StatusText } from '../src/state/status.ts';

/**
 * Shared by the wording-length unit test (status.test.ts) and the browser smoke test
 * (e2e/smoke.spec.ts), which shows each of these in the real card at 320 and 360 px.
 */

const coins = PLAYER_CONFIG.economy.coinsPerSolve;

/** A typed evaluation for wording tests: only what the status words read, nothing cast away. */
export function evaluation(o: { solved?: boolean; conflicts?: number[]; over?: boolean; unlit?: number }): Evaluation {
  return {
    fireflies: [], lit: [], conflicts: o.conflicts ?? [], unlit: o.unlit ?? 0, solved: o.solved ?? false,
    bushes: o.over ? [{ cell: 0, want: 1, have: 2, state: 'over' }] : [],
  };
}

/**
 * Every message the status card can show, with worst-case numbers, so the length budget below
 * covers all of them (hint reasons included). A new notice kind fails to compile until it has a
 * sample here.
 */
export function everyStatus(): StatusText[] {
  const dark = evaluation({ unlit: 888 });
  const notices: { readonly [K in Exclude<Notice['kind'], 'hint'>]: Extract<Notice, { kind: K }> } = {
    locked: { kind: 'locked' },
    'no-coins': { kind: 'no-coins', coinsPerSolve: 1000 },
    reset: { kind: 'reset' },
    'jar-empty': { kind: 'jar-empty' },
    'tip-cross': { kind: 'tip-cross' },
  };
  const hint = (h: Exclude<Hint, { kind: 'none' }>) => noticeStatus({ kind: 'hint', hint: h }, dark);
  const out: StatusText[] = [
    boardStatus(evaluation({ solved: true }), false, 1000),
    boardStatus(evaluation({ conflicts: [1, 2] }), false, coins),
    boardStatus(evaluation({ over: true }), false, coins),
    boardStatus(dark, false, coins, 0),
    boardStatus(dark, true, coins),
    boardStatus(dark, false, coins),
    boardStatus(evaluation({}), false, coins),
    finishedStatus(),
    ...Object.values(notices).map((n) => noticeStatus(n, dark)),
    hint({ kind: 'try-here', cell: 0, reason: TRY_HERE_REASON }),
  ];
  for (const reason of Object.values(REMOVE_REASONS)) out.push(hint({ kind: 'remove', cell: 0, reason }));
  for (const technique of Object.keys(HINT_REASONS) as TechniqueId[]) {
    for (const ruledOut of [[], [1]]) {
      out.push(hint({ kind: 'place', cell: 0, technique, reason: HINT_REASONS[technique], because: [], ruledOut }));
    }
  }
  return out;
}

