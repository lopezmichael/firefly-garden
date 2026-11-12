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
  | { readonly kind: 'jar-empty' };

/** `jarLeft`: fireflies still in the jar (an empty jar on an unsolved board gets its own line). */
export function boardStatus(ev: Evaluation, firstMove: boolean, coinsPerSolve: number, jarLeft = 1): StatusText {
  if (ev.solved) return { title: 'The garden is glowing!', sub: `Solved · +${coinsPerSolve} coins`, tone: 'solved' };
  if (ev.conflicts.length > 0) {
    return { title: 'Two fireflies can see each other', sub: 'Fireflies in the same row or column need a bush between them.', tone: 'warn' };
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
        ? 'Tap a tile to send out a firefly. A bush\u2019s dots fill as fireflies land around it.'
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
    case 'hint': {
      const h = n.hint;
      if (h.kind === 'remove') return { title: "That firefly can't stay", sub: h.reason, tone: 'glow' };
      if (h.kind === 'try-here') return { title: h.reason, sub: dark, tone: 'glow' };
      return {
        title: h.reason,
        sub: h.ruledOut.length > 0 ? 'The crossed-out tiles can’t hold a firefly.' : dark,
        tone: 'glow',
      };
    }
  }
}

/** Share of path tiles that need light and have it, 0 to 100. */
export function litPercent(ev: Evaluation, needsLight: number): number {
  if (needsLight === 0) return 100;
  return Math.round(((needsLight - ev.unlit) / needsLight) * 100);
}
