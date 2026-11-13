/**
 * Contrast ratchet: the token pairs that carry text and game state must keep
 * WCAG 2.x contrast as the theme is tuned. Text needs 4.5:1; bush numbers
 * (24 px and up) and state graphics need 3:1. A token change that breaks a pair
 * fails the build: fix the token, never this list.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const THEME = join(import.meta.dirname, '..', 'apps/game/src/theme.css');

/** Every `--ff-*: #hex` declaration in theme.css. */
function readTokens(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/--ff-([a-z0-9-]+)\s*:\s*(#[0-9a-f]{3}(?:[0-9a-f]{3})?)\s*;/gi)) {
    let hex = m[2]!.toLowerCase();
    if (hex.length === 4) hex = `#${hex[1]!.repeat(2)}${hex[2]!.repeat(2)}${hex[3]!.repeat(2)}`;
    out.set(m[1]!, hex);
  }
  return out;
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5;
const LARGE = 3;

/** [foreground token, background token, minimum ratio, what it carries]. */
const PAIRS: readonly (readonly [string, string, number, string])[] = [
  // Text on the night
  ['paper', 'night', TEXT, 'titles and labels on the night'],
  ['paper-quiet', 'night', TEXT, 'secondary text on the night (garden count, captions)'],
  // Text on paper
  ['sumi', 'paper', TEXT, 'text on paper chrome'],
  ['sumi-soft', 'paper', TEXT, 'body text on paper'],
  ['sumi-quiet', 'paper', TEXT, 'small labels on paper'],
  ['sumi', 'paper-dim', TEXT, 'locked map stop label'],
  ['sumi-quiet', 'paper-dim', TEXT, 'locked map stop caption'],
  ['sumi', 'paper-warm', TEXT, 'coin badge'],
  ['on-seal', 'seal', TEXT, 'text on the seal-red action'],
  ['seal-ink', 'paper', TEXT, 'hint status title on the paper card'],
  ['rose-spiral', 'paper', TEXT, 'warning status title on the paper card'],
  ['sumi', 'gold', TEXT, 'coin badge and hint chip text over gold'],
  // Board numbers (Young Serif, 24 px and up)
  ['paper', 'moss', LARGE, 'bush number, wanting'],
  ['gold', 'moss', LARGE, 'bush number, happy'],
  ['warn', 'wilt', LARGE, 'bush number, too many'],
  // State graphics on the dark tile
  ['ruled', 'dusk', LARGE, 'ruled-out cross'],
  ['gold', 'dusk', LARGE, 'hint reason outline'],
  ['gold', 'moss', LARGE, 'filled bush dots'],
  ['paper', 'moss', LARGE, 'empty bush dots'],
];

describe('contrast math', () => {
  it('matches known WCAG ratios', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#767676', '#ffffff')).toBeGreaterThan(4.5);
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.5);
  });

  it('reads short and long hex tokens', () => {
    const t = readTokens(':root { --ff-a: #fff; --ff-b-c: #1C2740; }');
    expect(t.get('a')).toBe('#ffffff');
    expect(t.get('b-c')).toBe('#1c2740');
  });
});

describe('theme tokens keep their contrast', () => {
  const tokens = readTokens(readFileSync(THEME, 'utf8'));

  it.each(PAIRS)('%s on %s ≥ %s:1 (%s)', (fg, bg, min) => {
    const a = tokens.get(fg), b = tokens.get(bg);
    expect(a, `--ff-${fg} is missing from theme.css`).toBeDefined();
    expect(b, `--ff-${bg} is missing from theme.css`).toBeDefined();
    const ratio = contrast(a!, b!);
    expect(ratio, `--ff-${fg} on --ff-${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });
});
