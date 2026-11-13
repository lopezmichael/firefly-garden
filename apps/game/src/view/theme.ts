/**
 * The board renderer's palette, read once from the CSS tokens in theme.css so
 * colors live in exactly one place (a ratchet forbids color literals in code).
 */

const TOKENS = {
  // Until the board is redrawn in the ink and wash shapes (theme plan, milestones 3 and 4),
  // its existing parts read the nearest ink and wash token.
  tray: '--ff-night', trayEdge: '--ff-night',
  tileDarkHi: '--ff-dusk-wash', tileDark: '--ff-dusk', tileDarkLo: '--ff-dusk', tileDarkEdge: '--ff-dusk-edge',
  tileLitHi: '--ff-glow-warm', tileLit: '--ff-gold', tileLitLo: '--ff-gold-pool', tileLitEdge: '--ff-gold-edge',
  ruled: '--ff-ruled',
  mossHi: '--ff-moss-hi', moss: '--ff-moss', mossLo: '--ff-moss-lo', mossEdge: '--ff-sumi',
  mossHiddenHi: '--ff-moss-plain', mossHidden: '--ff-moss-plain-lo', leaf: '--ff-leaf',
  firefly: '--ff-glow', fireflyEdge: '--ff-sumi',
  hintFirefly: '--ff-gold', hintFireflyEdge: '--ff-gold-edge',
  conflict: '--ff-warn', conflictEdge: '--ff-sumi',
  head: '--ff-sumi', wing: '--ff-wing', shadow: '--ff-night-deep',
  glow: '--ff-glow-soft', gold: '--ff-gold', warn: '--ff-warn', ink: '--ff-paper', star: '--ff-glow',
  petalPink: '--ff-rose', petalCream: '--ff-rose-pale',
  fontDisplay: '--ff-font-display',
} as const;

type ColorKey = Exclude<keyof typeof TOKENS, 'fontDisplay'>;

export type Palette = { readonly [K in ColorKey]: number } & {
  /** The same colors as CSS strings, for canvas gradients. */
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
  for (const [key, token] of Object.entries(TOKENS)) {
    if (key === 'fontDisplay') continue;
    const v = normalizeHex(token, style.getPropertyValue(token));
    nums[key] = parseInt(v.slice(1), 16);
    css[key] = v;
  }
  const fontDisplay = style.getPropertyValue(TOKENS.fontDisplay).trim() || 'sans-serif';
  return { ...(nums as { [K in ColorKey]: number }), css: css as { [K in ColorKey]: string }, fontDisplay };
}
