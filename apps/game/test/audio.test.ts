import { describe, expect, it } from 'vitest';
import { MuteGate } from '../src/audio/gate.ts';

describe('mute gate', () => {
  it('is silent while any reason holds, and says when that changes', () => {
    const g = new MuteGate();
    expect(g.muted).toBe(false);
    expect(g.set('hidden', true)).toBe(true);
    expect(g.set('ad', true)).toBe(false); // already muted
    expect(g.set('hidden', false)).toBe(false); // the ad still holds it
    expect(g.muted).toBe(true);
    expect(g.set('ad', false)).toBe(true);
    expect(g.muted).toBe(false);
  });

  it('the player setting holds through an ad ending and the tab coming back', () => {
    const g = new MuteGate();
    g.set('setting', true);
    g.set('ad', true);
    g.set('ad', false);
    g.set('hidden', true);
    g.set('hidden', false);
    expect(g.muted).toBe(true);
    expect(g.has('setting')).toBe(true);
  });
});
