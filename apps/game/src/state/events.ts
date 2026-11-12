import { EVENT_SCHEMA_VERSION, validateEvent } from '@firefly/core';
import type { AnalyticsEvent } from '@firefly/core';

/**
 * Analytics events, logged locally (docs/references/analytics.md). Every event
 * is validated with the core schema before it is stored; `validateEvent`
 * rejects unknown fields, so a stored event carries exactly the schema's
 * fields. Invalid events are counted and dropped, never stored. The log is a
 * capped ring buffer; the play-log panel copies it for playtesters to send back.
 */

export const EVENT_LOG_KEY = 'events';
export const EVENT_LOG_CAP = 2000;
/** A stored log larger than this is not ours (2,000 events is ~400 KB): start an empty one. */
export const MAX_LOG_CHARS = 1_000_000;

type Base = 'v' | 'install' | 'at' | 'session';
/** An event without the fields the log fills in. */
export type EventBody = AnalyticsEvent extends infer E ? (E extends AnalyticsEvent ? Omit<E, Base> : never) : never;

export interface Clock {
  now(): number;
}

export interface PlayLogSummary {
  readonly played: number;
  readonly solved: number;
  readonly hints: number;
  readonly sessions: number;
}

export class EventLog {
  private list: AnalyticsEvent[];
  /**
   * Events refused by validation, plus stored events dropped on load: a bug or
   * tampering signal for development (logged to the console), not shown to players.
   */
  dropped = 0;

  constructor(
    private readonly install: string,
    public session: number,
    private readonly levels: ReadonlySet<string>,
    private readonly clock: Clock,
    stored: readonly AnalyticsEvent[] = [],
  ) {
    this.list = stored.slice(-EVENT_LOG_CAP);
  }

  get events(): readonly AnalyticsEvent[] {
    return this.list;
  }

  /** Validate and store one event. Returns false (and counts it) if the schema refuses it. */
  log(body: EventBody): boolean {
    const event = { ...body, v: EVENT_SCHEMA_VERSION, install: this.install, at: Math.round(this.clock.now()), session: this.session };
    if (validateEvent(event, { levels: this.levels }).length > 0) {
      this.dropped++;
      return false;
    }
    this.list.push(event as AnalyticsEvent);
    if (this.list.length > EVENT_LOG_CAP) this.list.splice(0, this.list.length - EVENT_LOG_CAP);
    return true;
  }

  serialize(): string {
    return JSON.stringify(this.list);
  }

  summary(): PlayLogSummary {
    let played = 0, solved = 0, hints = 0;
    const sessions = new Set<number>();
    for (const e of this.list) {
      sessions.add(e.session);
      if (e.type === 'level_end') {
        played++;
        if (e.outcome === 'solved') solved++;
      } else if (e.type === 'hint') hints++;
    }
    return { played, solved, hints, sessions: sessions.size };
  }
}

/**
 * Read a stored log (untrusted): keep only this install's events that pass the
 * schema, newest last, capped. Events planted under another install id are
 * dropped, so the copied play log only ever holds this player's own events.
 */
export function parseEventLog(raw: string | null, levels: ReadonlySet<string>, install: string): { events: AnalyticsEvent[]; dropped: number } {
  if (raw === null || raw === '') return { events: [], dropped: 0 };
  if (raw.length > MAX_LOG_CHARS) return { events: [], dropped: 1 };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    // Unreadable is a valid outcome for untrusted input: start an empty log and say so.
    return { events: [], dropped: 1 };
  }
  if (!Array.isArray(json)) return { events: [], dropped: 1 };
  const tail = json.slice(-EVENT_LOG_CAP);
  const events = tail.filter((e): e is AnalyticsEvent => validateEvent(e, { levels }).length === 0 && e.install === install);
  // Older events trimmed by the cap are not failures; only refused ones in the kept tail count.
  return { events, dropped: tail.length - events.length };
}
