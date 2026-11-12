/**
 * The board renderer's palette, read once from the CSS tokens in theme.css so
 * colors live in exactly one place (a ratchet forbids color literals in code).
 */

const TOKENS = {
  tray: '--ff-tray', trayEdge: '--ff-tray-edge',
  tileDarkHi: '--ff-tile-dark-hi', tileDark: '--ff-tile-dark', tileDarkLo: '--ff-tile-dark-lo', tileDarkEdge: '--ff-tile-dark-edge',
  tileLitHi: '--ff-tile-lit-hi', tileLit: '--ff-tile-lit', tileLitLo: '--ff-tile-lit-lo', tileLitEdge: '--ff-tile-lit-edge',
  ruled: '--ff-ruled',
  mossHi: '--ff-moss-hi', moss: '--ff-moss', mossLo: '--ff-moss-lo', mossEdge: '--ff-moss-edge',
  mossHiddenHi: '--ff-moss-hidden-hi', mossHidden: '--ff-moss-hidden', leaf: '--ff-leaf',
  firefly: '--ff-firefly', fireflyEdge: '--ff-firefly-edge',
  hintFirefly: '--ff-hint-firefly', hintFireflyEdge: '--ff-hint-firefly-edge',
  conflict: '--ff-conflict', conflictEdge: '--ff-conflict-edge',
  head: '--ff-firefly-head', wing: '--ff-wing', shadow: '--ff-shadow',
  glow: '--ff-glow', gold: '--ff-gold', warn: '--ff-warn', ink: '--ff-ink', star: '--ff-star',
  petalPink: '--ff-petal-pink', petalLilac: '--ff-petal-lilac',
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
