import { MuteGate } from './gate.ts';
import type { MuteReason } from './gate.ts';

/**
 * Web Audio synth (Phase 2 plan, F): every sound is made from oscillators and
 * generated noise, so there are no audio files and nothing is added to the
 * bundle. The voices are the ones Michael picked on the sound audition page
 * (2026-11-27; docs/design/assets.md, "Sound"). The plumbing:
 *
 * - No AudioContext exists until the first user gesture (`unlock`), so the
 *   browser's autoplay policy is never tripped and nothing warns in the console.
 * - While muted for any reason (setting, hidden tab, ad) the context is
 *   suspended: silent, and no CPU spent. Sounds asked for while muted are
 *   dropped, never queued to burst out on resume.
 * - A browser without Web Audio gets a silent game, not an error.
 *
 * Knows nothing about the game: callers pick a voice and a pitch.
 */

/**
 * One voice per moment (the audition's picks): a landing (glass note), a call back (soft breath),
 * a bush blooming (wind chime), a hint (two bells a fifth apart), fireflies seeing each other (two
 * wood taps), an empty jar (hollow knock), the solve (four notes and a glow), a firefly reaching
 * the progress track (tiny tick), a chapter complete (warm bloom), a new chapter opening (sparkle
 * trail).
 */
export type Voice = 'place' | 'lift' | 'bush' | 'hint' | 'conflict' | 'empty' | 'solve' | 'land' | 'chapter' | 'opens';

export interface AudioState {
  readonly muted: boolean;
  readonly reasons: readonly MuteReason[];
  /** 'none' until the first gesture (or without Web Audio). */
  readonly context: 'none' | AudioContextState;
  /** Sounds started since load (for tests). */
  readonly played: number;
}

/** C major pentatonic over two octaves from C5: any pitch sounds fine next to any other. */
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
const note = (pitch: number) => SCALE[Math.round(Math.min(1, Math.max(0, pitch)) * (SCALE.length - 1))]!;
const LEVEL = 0.32;
/** Seconds a progress-track tick must leave before the next one sounds. */
const LAND_GAP = 0.03;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** The send into the small night-garden room (a generated reverb). */
  private wet: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** When the last progress-track tick started (context seconds): ticks arriving together patter, never stack. */
  private lastLand = -Infinity;
  private gestured = false;
  private readonly gate = new MuteGate();
  private played = 0;

  constructor(private readonly makeContext: () => AudioContext | null = defaultContext) {}

  /** Call from a user gesture (pointerdown, keydown). Safe to call often. */
  unlock(): void {
    this.gestured = true;
    if (!this.gate.muted) this.wake();
  }

  setMuted(reason: MuteReason, on: boolean): void {
    if (!this.gate.set(reason, on)) return;
    if (this.gate.muted) void this.ctx?.suspend().catch(() => undefined);
    else if (this.gestured) this.wake();
  }

  get state(): AudioState {
    return {
      muted: this.gate.muted,
      reasons: (['setting', 'hidden', 'ad'] as const).filter((r) => this.gate.has(r)),
      context: this.ctx?.state ?? 'none',
      played: this.played,
    };
  }

  /** Play a voice. `pitch` 0 to 1 picks a note (higher is higher). Silently dropped while muted. */
  play(voice: Voice, pitch = 0.5): void {
    const ctx = this.ctx, master = this.master, wet = this.wet;
    if (!ctx || !master || !wet || this.gate.muted || ctx.state !== 'running') return;
    // Fireflies the same distance from the last one land in the same instant: in-phase ticks would
    // add up into one harsh click (eight together is +18 dB), so a tick close behind another is skipped.
    if (voice === 'land') {
      if (ctx.currentTime < this.lastLand + LAND_GAP) return;
      this.lastLand = ctx.currentTime;
    }
    this.played++;
    const s = new Synth(ctx, master, wet, this.noiseBuffer(ctx));
    const t = ctx.currentTime + 0.005, f = note(pitch);
    switch (voice) {
      case 'place': // Glass note: a slightly beating pair and one glassy partial.
        s.tone('sine', f, t, 1.1, 0.8, 0.35, 0.006);
        s.tone('sine', f, t, 1.0, 0.45, 0.35, 0.006, 5);
        s.tone('sine', f * 2.76, t, 0.35, 0.12, 0.3, 0.004);
        break;
      case 'lift': // Soft breath: a falling puff of air under a low note.
        s.noise(t, 0.3, 0.5, 2600, 700, 0.8, 0.2);
        s.tone('sine', 330, t, 0.2, 0.25);
        break;
      case 'bush': // Wind chime: four high bells, loosely together.
        [2093, 2637, 2349, 3136].forEach((freq, k) => s.bell(freq, t + k * 0.055 + Math.random() * 0.02, 0.9, 0.22, 0.6));
        break;
      case 'hint': // Two bells, a fifth apart.
        s.bell(f, t, 1.2, 0.6);
        s.bell(f * 1.5, t + 0.14, 1.4, 0.5);
        break;
      case 'conflict': // Two wood taps: "not quite", never "wrong".
        for (const d of [0, 0.11]) {
          s.tone('sine', 230, t + d, 0.09, 0.7, 0, 0.002);
          s.noise(t + d, 0.04, 0.35, 900, 900, 3);
        }
        break;
      case 'empty': // Hollow knock.
        s.tone('triangle', 131, t, 0.16, 0.7, 0.1, 0.003);
        s.noise(t, 0.08, 0.4, 520, 520, 6, 0.1);
        break;
      case 'solve': // Four notes and a glow: a rising arpeggio of bells over a soft chord.
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, k) => s.bell(freq, t + k * 0.13, 1.0, 0.5, 0.5));
        [261.63, 329.63, 392, 523.25].forEach((freq) => s.swell(freq, t + 0.5, 0.35, 1.6, 0.16, 0.6));
        break;
      case 'land': // Tiny tick: a firefly reaching the progress track (a hair of jitter, so ticks patter).
        s.tone('sine', 2637, t + Math.random() * 0.012, 0.08, 0.25, 0.3, 0.002, (Math.random() - 0.5) * 30);
        break;
      case 'chapter': // Warm bloom: a major-seventh chord swelling in, one bell on top.
        [261.63, 329.63, 392, 493.88, 587.33].forEach((freq, k) => s.swell(freq, t + k * 0.06, 0.6, 2.0, 0.13, 0.7));
        s.bell(1567.98, t + 0.6, 1.4, 0.25);
        break;
      case 'opens': // Sparkle trail: rising pings along the path, a bell as the stop lights.
        for (let k = 0; k < 10; k++) s.tone('sine', note(k / 9) * 2, t + k * 0.12, 0.25, 0.14, 0.6, 0.003);
        s.bell(1567.98, t + 1.25, 1.3, 0.4);
        break;
    }
  }

  /** White noise, made once (decorative: Math.random is fine). */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  private wake(): void {
    if (!this.ctx) {
      this.ctx = this.makeContext();
      if (!this.ctx) return;
      this.master = this.ctx.createGain();
      this.master.gain.value = LEVEL;
      this.master.connect(this.ctx.destination);
      // A small garden at night: a generated, decaying-noise impulse response (no files).
      const len = Math.floor(this.ctx.sampleRate * 2.2), ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / len, 3.2);
      }
      const room = this.ctx.createConvolver();
      room.buffer = ir;
      this.wet = this.ctx.createGain();
      this.wet.gain.value = 0.28;
      this.wet.connect(room).connect(this.master);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
  }
}

function defaultContext(): AudioContext | null {
  try {
    return typeof AudioContext === 'function' ? new AudioContext() : null;
  } catch {
    // Web Audio refused (hardware busy, policy): play on without sound.
    return null;
  }
}

/** Building blocks for one sound: notes, swells, bells and filtered noise, each with an optional reverb send. */
class Synth {
  constructor(private readonly ctx: AudioContext, private readonly master: AudioNode, private readonly wet: AudioNode, private readonly white: AudioBuffer) {}

  /** A dry output, with `rev` of it also sent into the room. */
  private out(rev: number): AudioNode {
    const g = this.ctx.createGain();
    g.connect(this.master);
    if (rev > 0) {
      const send = this.ctx.createGain();
      send.gain.value = rev;
      g.connect(send).connect(this.wet);
    }
    return g;
  }

  /** One note with a quick attack and an exponential fade. */
  tone(type: OscillatorType, freq: number, at: number, length: number, gain: number, rev = 0, attack = 0.012, detune = 0): void {
    const osc = this.ctx.createOscillator(), env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(env).connect(this.out(rev));
    osc.start(at);
    osc.stop(at + length + 0.05);
  }

  /** A note that rises over `rise` and fades over `fall` (chords and glows). */
  swell(freq: number, at: number, rise: number, fall: number, gain: number, rev = 0): void {
    const osc = this.ctx.createOscillator(), env = this.ctx.createGain();
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + rise);
    env.gain.exponentialRampToValueAtTime(0.0001, at + rise + fall);
    osc.connect(env).connect(this.out(rev));
    osc.start(at);
    osc.stop(at + rise + fall + 0.05);
  }

  /** A small bell: a fundamental and two inharmonic partials that die away sooner. */
  bell(freq: number, at: number, length: number, gain: number, rev = 0.5): void {
    this.tone('sine', freq, at, length, gain, rev, 0.004);
    this.tone('sine', freq * 2.76, at, length * 0.45, gain * 0.32, rev, 0.003);
    this.tone('sine', freq * 5.4, at, length * 0.2, gain * 0.12, rev, 0.002);
  }

  /** Band-passed noise whose centre slides from `from` to `to` Hz (air, wood, a knock). */
  noise(at: number, length: number, gain: number, from: number, to: number, q: number, rev = 0): void {
    const src = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), env = this.ctx.createGain();
    src.buffer = this.white;
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, at);
    if (to !== from) filter.frequency.exponentialRampToValueAtTime(to, at + length);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.06, length / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    src.connect(filter).connect(env).connect(this.out(rev));
    src.start(at, Math.random());
    src.stop(at + length + 0.05);
  }
}
