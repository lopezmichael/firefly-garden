/**
 * What the home screen says (docs/plans/2026-11-28-home-screen.md): Pip's caption and the big
 * button, from where the player is. Pure, so every case is unit-tested, and short, so the caption
 * and the button never change size (the e2e test measures them at 320 px).
 */

export type HomeStart =
  /** Never played: the first garden. */
  | { readonly kind: 'first' }
  /** A garden left unfinished, waiting as it was left (`at` is null for one off the chapters' path, a detour). */
  | { readonly kind: 'resume'; readonly at: { readonly chapter: number; readonly garden: number } | null; readonly word: string }
  /** A chapter finished since the map last showed it: its unlock flight waits on the map. */
  | { readonly kind: 'unlock'; readonly chapter: number }
  /** The next garden on the path. */
  | { readonly kind: 'next'; readonly chapter: number; readonly garden: number; readonly word: string; readonly glowing: number }
  /** Every garden in the build is glowing. */
  | { readonly kind: 'finished' };

export interface HomeWords {
  /** The caption's first line, in the display face. */
  readonly title: string;
  readonly line: string;
  /** The big button, and the smaller line under it. */
  readonly go: string;
  readonly sub: string;
}

/** Longest caption line and button label (the layout is measured against these). */
export const HOME_LIMITS = { title: 16, line: 44, go: 22, sub: 26 } as const;

export function homeWords(s: HomeStart): HomeWords {
  switch (s.kind) {
    case 'first':
      return { title: "Hello, I'm Pip!", line: "The garden's gone dark. Shall we light it?", go: 'Light the first garden', sub: 'Easy · Chapter 1' };
    case 'resume':
      return {
        title: 'Welcome back!', line: 'Your garden is just as you left it.',
        go: s.at ? `Back to garden ${s.at.garden}` : 'Back to your garden', sub: s.at ? `${s.word} · Chapter ${s.at.chapter}` : s.word,
      };
    case 'unlock':
      return { title: 'You did it!', line: `Chapter ${s.chapter} is glowing. Come and see!`, go: 'See the garden map', sub: `Chapter ${s.chapter + 1} is opening` };
    case 'next':
      return {
        title: 'Welcome back!',
        line: s.glowing === 0 ? 'Your first garden is still waiting for you.'
          : s.glowing === 1 ? 'Your first garden glows! Ready for more?' : `${s.glowing} gardens are glowing. Ready for more?`,
        go: `Light garden ${s.garden}`,
        sub: `${s.word} · Chapter ${s.chapter}`,
      };
    case 'finished':
      return { title: 'Welcome back!', line: 'Every garden glows. More are on the way!', go: 'See the garden map', sub: 'Every garden is glowing' };
  }
}
