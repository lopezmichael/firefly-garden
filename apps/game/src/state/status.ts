import type { Evaluation, Hint } from '@firefly/core';

/**
 * The status card's words: it teaches by reacting to the board (design
 * baseline, "From the mockup"). Pure so the wording is tested and kept in one
 * place.
 */

export type Tone = 'plain' | 'warn' | 'glow' | 'solved';

export interface StatusText {
  readonly title: string;
  readonly sub: string;
  readonly tone: Tone;
}

export type Notice =
  | { readonly kind: 'hint'; readonly hint: Exclude<Hint, { kind: 'none' }> }
  | { readonly kind: 'locked' }
  | { readonly kind: 'no-coins'; readonly coinsPerSolve: number }
  | { readonly kind: 'reset' }
  | { readonly kind: 'jar-empty' }
  /** One-time tip: beams crossed for the first time (state/teach.ts). */
  | { readonly kind: 'tip-cross' };

/** `jarLeft`: fireflies still in the jar (an empty jar on an unsolved board gets its own line). */
export function boardStatus(ev: Evaluation, firstMove: boolean, coinsPerSolve: number, jarLeft = 1): StatusText {
  if (ev.solved) return { title: 'The garden is glowing!', sub: `Solved · +${coinsPerSolve} coins`, tone: 'solved' };
  if (ev.conflicts.length > 0) {
    return { title: 'Fireflies can see each other', sub: 'Fireflies in the same row or column need a bush between them.', tone: 'warn' };
  }
  if (ev.bushes.some((b) => b.state === 'over')) {
    return { title: 'A bush has too many fireflies', sub: "Diagonals count too. Its number turns pink when it's over.", tone: 'warn' };
  }
  if (jarLeft === 0) {
    return { title: 'The garden isn\u2019t glowing yet', sub: 'Every firefly is out. Call one back and try another spot.', tone: 'plain' };
  }
  if (ev.unlit > 0) {
    return {
      title: `${ev.unlit} path ${ev.unlit === 1 ? 'tile' : 'tiles'} still dark`,
      sub: firstMove
        ? 'Tap a tile to send out a firefly. Bush dots fill as fireflies land.'
        : 'A bush is done when all its dots are gold.',
      tone: 'plain',
    };
  }
  return { title: 'Every path is lit', sub: 'Now make each bush match its number.', tone: 'plain' };
}

/** Words for a notice. `ev` supplies the board's progress line under hint titles. */
export function noticeStatus(n: Notice, ev: Evaluation): StatusText {
  const dark = ev.unlit > 0 ? `${ev.unlit} path ${ev.unlit === 1 ? 'tile' : 'tiles'} still dark.` : 'Every path is lit.';
  switch (n.kind) {
    case 'locked':
      return { title: 'Hint fireflies stay put', sub: "A hint firefly is always right, so it's locked in place.", tone: 'glow' };
    case 'no-coins':
      return { title: 'Not enough coins for a hint', sub: `Solve a garden to earn ${n.coinsPerSolve} more.`, tone: 'plain' };
    case 'jar-empty':
      return { title: 'The jar is empty', sub: 'Tap a firefly on the board to call it back, then try another spot.', tone: 'plain' };
    case 'reset':
      return { title: 'Board cleared', sub: 'Your hint fireflies stay.', tone: 'plain' };
    case 'tip-cross':
      return { title: 'Light can cross', sub: "Only fireflies can't see each other.", tone: 'glow' };
    case 'hint': {
      // A short one-line heading per kind; the reason goes in the sub-line, so a long reason
      // never grows the card (see the status-length test).
      const h = n.hint;
      if (h.kind === 'remove') return { title: "That firefly can't stay", sub: h.reason, tone: 'glow' };
      if (h.kind === 'try-here') return { title: 'Try a firefly here', sub: dark, tone: 'glow' };
      return { title: h.ruledOut.length > 0 ? 'Crossed-out tiles stay empty' : 'A firefly goes here', sub: h.reason, tone: 'glow' };
    }
  }
}

/** The end of the build: every garden is lit. */
export function finishedStatus(): StatusText {
  return { title: 'Every garden is glowing!', sub: 'You lit every garden in this build. More gardens are on the way.', tone: 'solved' };
}

/** Share of path tiles that need light and have it, 0 to 100. */
export function litPercent(ev: Evaluation, needsLight: number): number {
  if (needsLight === 0) return 100;
  return Math.round(((needsLight - ev.unlit) / needsLight) * 100);
}

/** Where a solved garden sits: its place in a chapter, or a bonus (reserve) garden in an area. */
export type GardenPlace =
  | { readonly kind: 'main'; readonly index: number; readonly total: number; readonly area: string }
  | { readonly kind: 'bonus'; readonly area: string };

/** "m:ss" for a level clock in seconds. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The level-complete card's line: which garden, how long, and any hints. */
export function completeLine(place: GardenPlace, seconds: number, hints: number): string {
  const where = place.kind === 'main'
    ? `Garden ${place.index + 1} of ${place.total} in the ${place.area}.`
    : `A bonus garden in the ${place.area}.`;
  const help = hints === 0 ? '' : ` with ${hints} ${hints === 1 ? 'hint' : 'hints'}`;
  return `${where} Solved in ${clockText(seconds)}${help}.`;
}
