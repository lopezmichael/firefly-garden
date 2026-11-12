import { describe, expect, it } from 'vitest';
import { EVENT_SCHEMA_VERSION, validateEvent, type AnalyticsEvent } from '../src/index.ts';

const base = { v: EVENT_SCHEMA_VERSION, install: '3f9a1c0e7b2d4a55', at: 1_800_000_000_000, session: 3 } as const;

describe('validateEvent', () => {
  const good: AnalyticsEvent[] = [
    { ...base, type: 'session_start', platform: 'poki', coins: 60 },
    { ...base, type: 'session_end', seconds: 742 },
    { ...base, type: 'level_start', level: 'c02-l04', reason: 'breather-after-quit', attempt: 1 },
    { ...base, type: 'level_end', level: 'c02-l04', reason: 'main', attempt: 2, outcome: 'solved', seconds: 88.5, placements: 9, undos: 2, restarts: 0, hints: 1 },
    { ...base, type: 'hint', level: 'c02-l04', source: 'bank', step: 6 },
    { ...base, type: 'ad', kind: 'rewarded', completed: true, seconds: 31 },
    { ...base, type: 'coins', delta: -30, balance: 40, why: 'hint' },
  ];

  it.each(good.map((e) => [e.type, e] as const))('accepts a well-formed %s', (_t, e) => {
    expect(validateEvent(e)).toEqual([]);
  });

  it.each([
    ['not an object', 'x', /not an object/],
    ['a wrong version', { ...good[0], v: 2 }, /v must be/],
    ['an unknown type', { ...base, type: 'level_won' }, /unknown event type/],
    ['a negative count', { ...good[3], undos: -1 }, /undos must be a count/],
    ['an infinite duration', { ...good[1], seconds: Infinity }, /seconds must be seconds/],
    ['an unknown policy reason', { ...good[2], reason: 'bonus' }, /reason must be/],
    ['a huge install id', { ...good[0], install: 'a'.repeat(65) }, /install must be/],
    ['a non-random install id', { ...good[0], install: 'jane.doe@example.com' }, /install must be/],
    ['an extra field', { ...good[1], email: 'x' }, /unknown field "email"/],
    ['a timestamp far in the future', { ...good[1], at: 9e15 }, /at must be/],
    ['a missing outcome', { ...good[3], outcome: undefined }, /outcome must be/],
  ])('rejects %s', (_name, e, pattern) => {
    expect(validateEvent(e).join('\n')).toMatch(pattern);
  });
});
