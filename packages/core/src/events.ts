/**
 * Analytics event schema. The game logs these locally in Phase 2 and sends
 * them to portal analytics in Phase 3; Phase 4 refits DIFFICULTY_CONFIG and
 * PLAYER_CONFIG from them. Every field the refit needs is here, so the
 * logging never has to be reworked. See docs/references/analytics.md.
 *
 * Events carry no names, contact details or device data: a random install id
 * the game generates, level ids, counts and durations. The install id is still
 * a persistent pseudonymous identifier; see docs/references/analytics.md.
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

// Typed against NextReason so the two lists cannot drift apart.
const REASON_FLAGS = {
  main: true, retry: true, 'warm-up': true, 'breather-after-quit': true, 'breather-after-long': true, 'breather-after-hints': true,
} as const satisfies Record<NextReason, true>;
const REASONS = new Set<string>(Object.keys(REASON_FLAGS));
const isCount = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e9;
/** Durations up to a week (a tab left open for days still logs a valid session_end). */
const isSeconds = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 7 * 86_400;
/** The install id is random: 16 to 64 hex characters (or a UUID's hex with dashes). */
const isInstallId = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{16,64}$/i.test(v);
/** Timestamps from 2020 to 2100, whole milliseconds. */
const isTimestamp = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 1_577_836_800_000 && v < 4_102_444_800_000;

const FIELDS: Readonly<Record<string, readonly string[]>> = {
  session_start: ['platform', 'coins'],
  session_end: ['seconds'],
  level_start: ['level', 'reason', 'attempt'],
  level_end: ['level', 'reason', 'attempt', 'outcome', 'seconds', 'placements', 'undos', 'restarts', 'hints'],
  hint: ['level', 'source', 'step'],
  ad: ['kind', 'completed', 'seconds'],
  coins: ['delta', 'balance', 'why'],
};
const BASE_FIELDS = ['v', 'install', 'at', 'session', 'type'];
const isText = (v: unknown, max = 64) => typeof v === 'string' && v.length > 0 && v.length <= max;

/**
 * Pass `levels` (every shipped level id) to also reject unknown level ids.
 *
 * Validate an event before it is stored or sent (events are built from game
 * state that came from saved progress, which is untrusted). Unknown fields are
 * rejected, so a valid event carries exactly the schema's fields. Returns the
 * problems found; empty means valid.
 */
export function validateEvent(e: unknown, options: { readonly levels?: ReadonlySet<string> } = {}): string[] {
  if (typeof e !== 'object' || e === null || Array.isArray(e)) return ['event is not an object'];
  const r = e as Record<string, unknown>;
  const p: string[] = [];
  if (r.v !== EVENT_SCHEMA_VERSION) p.push(`v must be ${EVENT_SCHEMA_VERSION}`);
  if (!isInstallId(r.install)) p.push('install must be a random hex id');
  if (!isTimestamp(r.at)) p.push('at must be a millisecond timestamp');
  const type = String(r.type);
  // Own keys only: a type like "constructor" or "__proto__" must not reach Object.prototype.
  const typeFields = Object.hasOwn(FIELDS, type) ? FIELDS[type]! : [];
  const allowed = new Set([...BASE_FIELDS, ...typeFields]);
  if (options.levels && 'level' in r && !(typeof r.level === 'string' && options.levels.has(r.level))) {
    p.push('level must be a known level id');
  }
  for (const k of Object.keys(r)) if (!allowed.has(k)) p.push(`unknown field "${k}"`);
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
