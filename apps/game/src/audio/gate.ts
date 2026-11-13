/**
 * Why the game is silent right now. Sound plays only when no reason holds:
 * the player's setting, a hidden tab, an ad on screen (portals require games
 * to be silent during ads). Pure, so the rules are tested in Node.
 */
export type MuteReason = 'setting' | 'hidden' | 'ad';

export class MuteGate {
  private readonly reasons = new Set<MuteReason>();

  /** Turn one reason on or off. True if that changed whether the game is muted. */
  set(reason: MuteReason, on: boolean): boolean {
    const was = this.muted;
    if (on) this.reasons.add(reason);
    else this.reasons.delete(reason);
    return was !== this.muted;
  }

  has(reason: MuteReason): boolean {
    return this.reasons.has(reason);
  }

  get muted(): boolean {
    return this.reasons.size > 0;
  }
}
