/**
 * The board renderer's palette, read once from the CSS tokens in theme.css so
 * colors live in exactly one place (a ratchet forbids color literals in code).
 * Every color token is listed here by its own name and read as `pal.<camelCase>`
 * (`--ff-gold-pool` → `pal.goldPool`), with no renaming in between;
 * `apps/game/test/theme.test.ts` fails if this list and theme.css disagree.
 */

import { camel, COLOR_TOKENS } from './tokens.ts';
import type { ColorKey } from './tokens.ts';

export type Palette = { readonly [K in ColorKey]: number } & {
  /** The same colors as CSS strings, for canvas drawing. */
  readonly css: { readonly [K in ColorKey]: string };
  readonly fontDisplay: string;
};

/** `#rgb` or `#rrggbb` (the CSS minifier shortens tokens) → `#rrggbb`. */
function normalizeHex(name: string, value: string): string {
  const v = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]!.repeat(2)}${short[2]!.repeat(2)}${short[3]!.repeat(2)}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  throw new Error(`theme token ${name} must be a hex color, got "${value}"`);
}

export function readPalette(root: Element = document.documentElement): Palette {
  const style = getComputedStyle(root);
  const nums: Record<string, number> = {};
  const css: Record<string, string> = {};
  for (const token of COLOR_TOKENS) {
    const v = normalizeHex(`--ff-${token}`, style.getPropertyValue(`--ff-${token}`));
    nums[camel(token)] = parseInt(v.slice(1), 16);
    css[camel(token)] = v;
  }
  const fontDisplay = style.getPropertyValue('--ff-font-display').trim() || 'serif';
  return { ...(nums as { [K in ColorKey]: number }), css: css as { [K in ColorKey]: string }, fontDisplay };
}
