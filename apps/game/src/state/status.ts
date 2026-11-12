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
  | { readonly kind: 'reset' };

export function boardStatus(ev: Evaluation, firstMove: boolean, coinsPerSolve: number): StatusText {
  if (ev.solved) return { title: 'The garden is glowing!', sub: `Solved. +${coinsPerSolve} coins.`, tone: 'solved' };
  if (ev.conflicts.length > 0) {
    return { title: 'Two fireflies can see each other', sub: 'Fireflies in the same row or column need a bush between them.', tone: 'warn' };
  }
  if (ev.bushes.some((b) => b.state === 'over')) {
    return { title: 'A bush has too many fireflies', sub: "Diagonals count too. Its number turns pink when it's over.", tone: 'warn' };
  }
  if (ev.unlit > 0) {
    return {
      title: `${ev.unlit} path ${ev.unlit === 1 ? 'tile' : 'tiles'} still dark`,
      sub: firstMove
        ? 'Tap a tile to place a firefly. The dots under each bush fill up as fireflies land around it.'
        : 'Golden numbers mean that bush is happy.',
      tone: 'plain',
    };
  }
  return { title: 'Every path is lit', sub: 'Now make each bush match its number.', tone: 'plain' };
}

export function noticeStatus(n: Notice): StatusText {
  switch (n.kind) {
    case 'locked':
      return { title: 'Hint fireflies stay put', sub: "A hint firefly is always right, so it's locked in place.", tone: 'glow' };
    case 'no-coins':
      return { title: 'Not enough coins for a hint', sub: `Solve a garden to earn ${n.coinsPerSolve} more.`, tone: 'plain' };
    case 'reset':
      return { title: 'Board cleared', sub: 'Hint fireflies stay: a paid hint is never lost.', tone: 'plain' };
    case 'hint': {
      const h = n.hint;
      if (h.kind === 'remove') return { title: "That firefly can't stay", sub: h.reason, tone: 'glow' };
      if (h.kind === 'try-here') return { title: h.reason, sub: 'Hint fireflies are locked in place.', tone: 'glow' };
      return {
        title: h.reason,
        sub: h.ruledOut.length > 0 ? 'The crossed-out tiles can’t hold a firefly. Hint fireflies are locked.' : 'Hint fireflies are locked in place.',
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
