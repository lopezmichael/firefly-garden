/**
 * Architecture ratchets: tests that fail the build when a boundary from
 * ARCHITECTURE.md is crossed. Fix the code, never loosen these.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');

function files(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

/** Every module specifier in import/export-from statements and dynamic imports. */
function specifiers(source: string): string[] {
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  return [...source.matchAll(re)].map((m) => m[1] ?? m[2] ?? m[3]!);
}

describe('packages/core stays pure', () => {
  const coreFiles = files(join(ROOT, 'packages/core/src'), ['.ts']);

  it('has source files to check', () => {
    expect(coreFiles.length).toBeGreaterThan(0);
  });

  it('imports only its own modules (no DOM, renderer, SDK or Node packages)', () => {
    const bad = coreFiles.flatMap((f) =>
      specifiers(readFileSync(f, 'utf8'))
        .filter((s) => !s.startsWith('./') && !s.startsWith('../'))
        .map((s) => `${relative(ROOT, f)} imports "${s}"`));
    expect(bad).toEqual([]);
  });

  it('compiles without DOM or ambient Node types', () => {
    const raw = readFileSync(join(ROOT, 'packages/core/tsconfig.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const { compilerOptions } = JSON.parse(raw) as { compilerOptions: { lib: string[]; types: string[] } };
    expect(compilerOptions.lib.some((l) => l.toLowerCase().startsWith('dom'))).toBe(false);
    expect(compilerOptions.types).toEqual([]);
  });
});

describe('portal and ad SDKs stay behind the platform adapter', () => {
  const SDK = /\bPokiSDK\b|\bCrazyGames\b|playgama|@capacitor\/|admob|revenuecat|googletag|adsbygoogle/i;
  const PLATFORM_DIR = join(ROOT, 'apps/game/src/platform');

  it('mentions no SDK outside apps/game/src/platform/', () => {
    const candidates = [
      ...files(join(ROOT, 'apps/game/src'), ['.ts', '.tsx', '.js', '.html', '.css']),
      join(ROOT, 'apps/game/index.html'),
    ].filter((f) => !f.startsWith(PLATFORM_DIR));
    const bad = candidates.filter((f) => SDK.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f));
    expect(bad).toEqual([]);
  });
});
