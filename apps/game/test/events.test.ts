import { describe, expect, it } from 'vitest';
import { EVENT_LOG_CAP, EventLog, MAX_LOG_CHARS, parseEventLog } from '../src/state/events.ts';

const INSTALL = '0123456789abcdef0123456789abcdef';
const LEVELS = new Set(['c1-01', 'c1-02']);
const NOW = Date.UTC(2026, 10, 12, 18);
const clock = { now: () => NOW };

describe('event log', () => {
  it('fills in the base fields and stores valid events', () => {
    const log = new EventLog(INSTALL, 2, LEVELS, clock);
    expect(log.log({ type: 'level_start', level: 'c1-01', reason: 'main', attempt: 1 })).toBe(true);
    expect(log.events[0]).toEqual({ type: 'level_start', level: 'c1-01', reason: 'main', attempt: 1, v: 1, install: INSTALL, at: NOW, session: 2 });
  });

  it('refuses unknown levels, bad numbers and extra fields, and counts them', () => {
    const log = new EventLog(INSTALL, 1, LEVELS, clock);
    expect(log.log({ type: 'level_start', level: 'c9-99', reason: 'main', attempt: 1 })).toBe(false);
    expect(log.log({ type: 'coins', delta: 10, balance: -5, why: 'solve' })).toBe(false);
    expect(log.log({ type: 'session_end', seconds: 5, name: 'Ada' } as never)).toBe(false);
    expect(log.events).toHaveLength(0);
    expect(log.dropped).toBe(3);
  });

  it('keeps only the newest events up to the cap', () => {
    const log = new EventLog(INSTALL, 1, LEVELS, clock);
    for (let i = 0; i < EVENT_LOG_CAP + 10; i++) log.log({ type: 'session_end', seconds: i });
    expect(log.events).toHaveLength(EVENT_LOG_CAP);
    expect(log.events[0]).toMatchObject({ seconds: 10 });
  });

  it('summarizes plays, solves, hints and sessions', () => {
    const log = new EventLog(INSTALL, 1, LEVELS, clock);
    const end = { type: 'level_end', level: 'c1-01', reason: 'main', attempt: 1, seconds: 30, placements: 4, undos: 0, restarts: 0, hints: 0 } as const;
    log.log({ ...end, outcome: 'solved' });
    log.session = 2;
    log.log({ ...end, outcome: 'quit' });
    log.log({ type: 'hint', level: 'c1-02', source: 'coins', step: 3 });
    expect(log.summary()).toEqual({ played: 2, solved: 1, hints: 1, sessions: 2 });
  });

  it('reads back a stored log, dropping anything the schema refuses', () => {
    const log = new EventLog(INSTALL, 1, LEVELS, clock);
    log.log({ type: 'session_start', platform: 'local', coins: 60 });
    const stored = JSON.parse(log.serialize()) as unknown[];
    stored.push({ type: 'session_start', platform: 'local', coins: 60, v: 1, install: 'nope', at: NOW, session: 1 }, null, '__proto__');
    const back = parseEventLog(JSON.stringify(stored), LEVELS, INSTALL);
    expect(back.events).toHaveLength(1);
    expect(back.dropped).toBe(3);
    expect(parseEventLog('{not json', LEVELS, INSTALL)).toEqual({ events: [], dropped: 1 });
    expect(parseEventLog('{"a":1}', LEVELS, INSTALL).events).toEqual([]);
  });

  it("drops another install's events, oversized logs, and does not count cap trimming as failures", () => {
    const mine = new EventLog(INSTALL, 1, LEVELS, clock);
    const theirs = new EventLog('fedcba9876543210fedcba9876543210', 1, LEVELS, clock);
    for (let i = 0; i < EVENT_LOG_CAP + 5; i++) mine.log({ type: 'session_end', seconds: i });
    theirs.log({ type: 'session_start', platform: 'planted text', coins: 1 });
    const raw = JSON.stringify([...JSON.parse(mine.serialize()) as unknown[], ...JSON.parse(theirs.serialize()) as unknown[]]);
    const back = parseEventLog(raw, LEVELS, INSTALL);
    expect(back.events.every((e) => e.install === INSTALL)).toBe(true);
    expect(back.dropped).toBe(1);
    expect(parseEventLog('[' + ' '.repeat(MAX_LOG_CHARS) + ']', LEVELS, INSTALL)).toEqual({ events: [], dropped: 1 });
  });
});
