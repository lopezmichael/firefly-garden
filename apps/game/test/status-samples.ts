import { HINT_CROSS_CAP, HINT_REASONS, PLAYER_CONFIG, REMOVE_REASONS, ruleOutReason, STUCK_REASONS, ZERO_BUSH_REASON } from '@firefly/core';
import type { Evaluation, Hint, TechniqueId } from '@firefly/core';
import { readFileSync } from 'node:fs';
import { boardStatus, finishedStatus, FIRST_GARDEN, introStatus, noticeStatus } from '../src/state/status.ts';
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

/** The chapter intros in the shipped manifest. */
export function shippedIntros(): { title: string; sub: string }[] {
  const manifest = JSON.parse(readFileSync(new URL('../../../levels/manifest.json', import.meta.url), 'utf8')) as {
    chapters: { intro?: { title: string; sub: string } | null }[];
  };
  const seen = new Map<string, { title: string; sub: string }>();
  for (const c of manifest.chapters) if (c.intro) seen.set(c.intro.title, c.intro);
  return [...seen.values()];
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
  const hint = (h: Exclude<Hint, { kind: 'none' }>) => noticeStatus({ kind: 'hint', hint: h });
  const out: StatusText[] = [
    boardStatus(evaluation({ solved: true }), false, 1000),
    boardStatus(evaluation({ conflicts: [1, 2] }), false, coins),
    boardStatus(evaluation({ over: true }), false, coins),
    boardStatus(dark, false, coins, 0),
    boardStatus(dark, true, coins),
    boardStatus(dark, false, coins),
    boardStatus(evaluation({}), false, coins),
    finishedStatus(),
    FIRST_GARDEN,
    // Every chapter intro the manifest ships (written in scripts/launch-plan.ts).
    ...shippedIntros().map(introStatus),
    ...Object.values(notices).map((n) => noticeStatus(n)),
  ];
  out.push(hint({ kind: 'cross', cells: [0, 1, 2, 3], technique: 'T1-satisfied', reason: ZERO_BUSH_REASON, because: [0] }));
  for (const reason of Object.values(STUCK_REASONS)) out.push(hint({ kind: 'point', technique: null, reason, because: [0], target: 0 }));
  for (const reason of Object.values(REMOVE_REASONS)) out.push(hint({ kind: 'remove', cell: 0, reason }));
  for (const technique of Object.keys(HINT_REASONS) as TechniqueId[]) {
    out.push(hint({ kind: 'point', technique, reason: HINT_REASONS[technique], because: [0], target: 0 }));
    for (const n of [1, HINT_CROSS_CAP]) {
      out.push(hint({ kind: 'cross', cells: Array.from({ length: n }, (_, i) => i), technique, reason: ruleOutReason(technique, n), because: [0] }));
    }
  }
  return out;
}

