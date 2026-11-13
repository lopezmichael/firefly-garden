/**
 * The names of the color tokens in theme.css, in one pure module (no DOM) so
 * tests can check them against the stylesheet. The board reads each as
 * `pal.<camelCase>` (`--ff-gold-pool` → `pal.goldPool`).
 */

export const COLOR_TOKENS = [
  'night', 'night-deep', 'hill-dusk', 'hill-ink', 'hill-dots',
  'paper', 'paper-quiet', 'paper-dim', 'paper-track', 'paper-handle', 'paper-rule', 'paper-warm', 'paper-grain',
  'sumi', 'sumi-soft', 'sumi-quiet',
  'seal', 'on-seal', 'seal-ink',
  'dusk', 'dusk-edge', 'dusk-wash', 'dusk-quiet', 'dusk-locked',
  'gold', 'gold-edge', 'gold-pool', 'glow', 'glow-soft', 'glow-warm',
  'moss', 'moss-lo', 'moss-hi', 'moss-plain', 'moss-plain-lo', 'leaf', 'wilt', 'wilt-lo',
  'rose', 'rose-deep', 'rose-pale', 'rose-spiral', 'rose-leaf',
  'warn', 'warn-hatch', 'warn-glow',
  'ruled', 'firefly-rib', 'wing',
  'jar-paper', 'jar-rib',
] as const;

type Camel<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<Camel<B>>}` : S;
export type ColorKey = Camel<(typeof COLOR_TOKENS)[number]>;

export function camel(token: string): string {
  return token.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}
