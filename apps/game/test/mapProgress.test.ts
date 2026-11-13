import { describe, expect, it } from 'vitest';
import { unlockToShow } from '../src/state/mapProgress.ts';

const chapters = (finished: number) => ['c1', 'c2', 'c3'].map((id, i) => ({ id, finished: i < finished }));

describe('the map plays the unlock flight once per newly finished chapter', () => {
  it('plays nothing before any chapter is finished', () => {
    const m = unlockToShow(chapters(0), new Set());
    expect(m.from).toBeNull();
    expect([...m.seen]).toEqual([]);
  });

  it('flies from a chapter the first time the map opens after it is finished, then never again', () => {
    let seen: ReadonlySet<string> = new Set();
    const first = unlockToShow(chapters(1), seen);
    expect(first.from).toBe(0);
    seen = first.seen;
    expect(unlockToShow(chapters(1), seen).from).toBeNull();
    expect(unlockToShow(chapters(1), seen).from).toBeNull();
  });

  it('flies again when the next chapter is finished, from that chapter', () => {
    const seen = unlockToShow(chapters(1), new Set()).seen;
    const next = unlockToShow(chapters(2), seen);
    expect(next.from).toBe(1);
    expect(unlockToShow(chapters(2), next.seen).from).toBeNull();
  });

  it('gives a save from before the flag existed one flight, for its latest chapter', () => {
    const m = unlockToShow(chapters(3), new Set());
    expect(m.from).toBe(2);
    expect([...m.seen].sort()).toEqual(['c1', 'c2', 'c3']);
    expect(unlockToShow(chapters(3), m.seen).from).toBeNull();
  });

  it('forgets a seen chapter that is no longer finished (a reset), so it can fly again', () => {
    const m = unlockToShow(chapters(0), new Set(['c1']));
    expect(m.from).toBeNull();
    expect(m.seen.has('c1')).toBe(false);
    expect(unlockToShow(chapters(1), m.seen).from).toBe(0);
  });
});
