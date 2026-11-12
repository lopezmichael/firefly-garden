/**
 * Analytics event schema. The game logs these locally in Phase 2 and sends
 * them to portal analytics in Phase 3; Phase 4 refits DIFFICULTY_CONFIG and
 * PLAYER_CONFIG from them. Every field the refit needs is here, so the
 * logging never has to be reworked. See docs/references/analytics.md.
 *
 * Events carry no personal data: a random install id the game generates,
 * level ids, counts and durations.
 */
import type { NextReason } from './policy.ts';

export const EVENT_SCHEMA_VERSION = 1;

interface Base {
  readonly v: typeof EVENT_SCHEMA_VERSION;
  /** Random id generated on first launch; never tied to a person. */
  readonly install: string;
  /** Milliseconds since epoch, client clock. */
  readonly at: number;
  /** Increments per sitting; with `at` it gives session length and return gaps. */
  readonly session: number;
}

export type HintSource = 'coins' | 'ad' | 'bank';
export type AdKind = 'midgame' | 'rewarded';

export type AnalyticsEvent =
  | (Base & { readonly type: 'session_start'; readonly platform: string; readonly coins: number })
  | (Base & { readonly type: 'session_end'; readonly seconds: number })
  | (Base & { readonly type: 'level_start'; readonly level: string; readonly reason: NextReason; readonly attempt: number })
  | (Base & {
      readonly type: 'level_end';
      readonly level: string;
      readonly reason: NextReason;
      readonly attempt: number;
      readonly outcome: 'solved' | 'quit';
      /** Active seconds on the board (paused time excluded). */
      readonly seconds: number;
      readonly placements: number;
      readonly undos: number;
      readonly restarts: number;
      readonly hints: number;
    })
  | (Base & { readonly type: 'hint'; readonly level: string; readonly source: HintSource; readonly step: number })
  | (Base & { readonly type: 'ad'; readonly kind: AdKind; readonly completed: boolean; readonly seconds: number })
  | (Base & { readonly type: 'coins'; readonly delta: number; readonly balance: number; readonly why: 'solve' | 'hint' | 'doubler' | 'start' });

export type EventType = AnalyticsEvent['type'];

const REASONS = new Set<string>(['main', 'retry', 'warm-up', 'breather-after-quit', 'breather-after-long', 'breather-after-hints']);
const isCount = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e9;
const isSeconds = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 86_400;
const isText = (v: unknown, max = 64) => typeof v === 'string' && v.length > 0 && v.length <= max;

/**
 * Validate an event before it is stored or sent (events are built from game
 * state that came from saved progress, which is untrusted). Returns the
 * problems found; empty means valid.
 */
export function validateEvent(e: unknown): string[] {
  if (typeof e !== 'object' || e === null || Array.isArray(e)) return ['event is not an object'];
  const r = e as Record<string, unknown>;
  const p: string[] = [];
  if (r.v !== EVENT_SCHEMA_VERSION) p.push(`v must be ${EVENT_SCHEMA_VERSION}`);
  if (!isText(r.install)) p.push('install must be a short string');
  if (typeof r.at !== 'number' || !Number.isFinite(r.at) || r.at <= 0) p.push('at must be a positive timestamp');
  if (!isCount(r.session)) p.push('session must be a count');
  const need = (key: string, ok: (v: unknown) => boolean, what: string) => {
    if (!ok(r[key])) p.push(`${String(r.type)}.${key} must be ${what}`);
  };
  switch (r.type) {
    case 'session_start':
      need('platform', (v) => isText(v, 32), 'a short string');
      need('coins', isCount, 'a count');
      break;
    case 'session_end':
      need('seconds', isSeconds, 'seconds');
      break;
    case 'level_start':
      need('level', isText, 'a level id');
      need('reason', (v) => typeof v === 'string' && REASONS.has(v), 'a next-level reason');
      need('attempt', isCount, 'a count');
      break;
    case 'level_end':
      need('level', isText, 'a level id');
      need('reason', (v) => typeof v === 'string' && REASONS.has(v), 'a next-level reason');
      need('attempt', isCount, 'a count');
      need('outcome', (v) => v === 'solved' || v === 'quit', '"solved" or "quit"');
      need('seconds', isSeconds, 'seconds');
      for (const k of ['placements', 'undos', 'restarts', 'hints']) need(k, isCount, 'a count');
      break;
    case 'hint':
      need('level', isText, 'a level id');
      need('source', (v) => v === 'coins' || v === 'ad' || v === 'bank', '"coins", "ad" or "bank"');
      need('step', isCount, 'a count');
      break;
    case 'ad':
      need('kind', (v) => v === 'midgame' || v === 'rewarded', '"midgame" or "rewarded"');
      need('completed', (v) => typeof v === 'boolean', 'a boolean');
      need('seconds', isSeconds, 'seconds');
      break;
    case 'coins':
      need('delta', (v) => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) < 1e6, 'an integer');
      need('balance', isCount, 'a count');
      need('why', (v) => v === 'solve' || v === 'hint' || v === 'doubler' || v === 'start', 'a known reason');
      break;
    default:
      p.push(`unknown event type ${JSON.stringify(r.type)}`);
  }
  return p;
}
