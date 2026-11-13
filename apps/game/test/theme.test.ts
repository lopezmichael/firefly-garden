import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { camel, COLOR_TOKENS } from '../src/view/tokens.ts';

const css = readFileSync(join(import.meta.dirname, '../src/theme.css'), 'utf8');

describe('the board palette is the theme tokens, by name', () => {
  const declared = [...css.matchAll(/--ff-([a-z0-9-]+)\s*:\s*#[0-9a-f]{3,6}\s*;/gi)].map((m) => m[1]!);

  it('lists every color token in theme.css, once, and nothing else', () => {
    expect([...COLOR_TOKENS].sort()).toEqual([...declared].sort());
    expect(new Set(COLOR_TOKENS).size).toBe(COLOR_TOKENS.length);
  });

  it('names each palette key after its token', () => {
    expect(camel('gold-pool')).toBe('goldPool');
    expect(camel('moss-plain-lo')).toBe('mossPlainLo');
    expect(camel('night')).toBe('night');
  });
});
