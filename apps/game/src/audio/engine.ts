import { MuteGate } from './gate.ts';
import type { MuteReason } from './gate.ts';

/**
 * Web Audio synth (Phase 2 plan, F): every sound is made from oscillators, so
 * there are no audio files and nothing is added to the bundle. The voices here
 * are placeholders, tuned later with the look; what is final is the plumbing:
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

export type Voice = 'chime' | 'sparkle' | 'bell' | 'flourish' | 'lift' | 'buzz' | 'bump';

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

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
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
    const ctx = this.ctx, out = this.master;
    if (!ctx || !out || this.gate.muted || ctx.state !== 'running') return;
    this.played++;
    const t = ctx.currentTime + 0.005;
    switch (voice) {
      case 'chime':
        tone(ctx, out, 'sine', note(pitch), t, 0.55, 1);
        tone(ctx, out, 'sine', note(pitch) * 2, t, 0.3, 0.25);
        break;
      case 'sparkle':
        tone(ctx, out, 'sine', note(pitch), t, 0.6, 1);
        tone(ctx, out, 'triangle', note(Math.min(1, pitch + 0.3)) * 2, t + 0.06, 0.4, 0.3);
        break;
      case 'bell':
        tone(ctx, out, 'sine', 1318.51, t, 0.9, 0.7);
        tone(ctx, out, 'sine', 1975.53, t + 0.07, 0.8, 0.45);
        break;
      case 'flourish':
        [0, 0.2, 0.4, 0.6, 0.8, 1].forEach((p, i) => tone(ctx, out, 'sine', note(p), t + i * 0.075, 0.7, 0.8));
        tone(ctx, out, 'triangle', note(1) / 2, t + 0.45, 1.1, 0.35);
        break;
      case 'lift':
        glide(ctx, out, 'sine', 392, 262, t, 0.18, 0.6);
        break;
      case 'buzz':
        tone(ctx, out, 'triangle', 196, t, 0.28, 0.5);
        tone(ctx, out, 'triangle', 207.65, t, 0.28, 0.4);
        break;
      case 'bump':
        glide(ctx, out, 'triangle', 165, 110, t, 0.12, 0.6);
        break;
    }
  }

  private wake(): void {
    if (!this.ctx) {
      this.ctx = this.makeContext();
      if (!this.ctx) return;
      this.master = this.ctx.createGain();
      this.master.gain.value = LEVEL;
      this.master.connect(this.ctx.destination);
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

/** One note with a soft attack and an exponential fade. */
function tone(ctx: AudioContext, out: AudioNode, type: OscillatorType, freq: number, at: number, length: number, gain: number): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** A note that slides from one pitch to another. */
function glide(ctx: AudioContext, out: AudioNode, type: OscillatorType, from: number, to: number, at: number, length: number, gain: number): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + length);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}
