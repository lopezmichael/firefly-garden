/**
 * Architecture ratchets: tests that fail the build when a boundary from
 * ARCHITECTURE.md is crossed. Fix the code, never loosen these.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
  const re = /(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"`]([^'"`]+)['"`]\s*\)|require\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  return [...source.matchAll(re)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]!);
}

describe('packages/core stays pure', () => {
  const coreFiles = files(join(ROOT, 'packages/core/src'), ['.ts']);

  it('has source files to check', () => {
    expect(coreFiles.length).toBeGreaterThan(0);
  });

  it('imports only its own modules (no DOM, renderer, SDK, Node or other workspace code)', () => {
    const CORE_SRC = join(ROOT, 'packages/core/src') + sep;
    const insideCore = (from: string, spec: string) =>
      (spec.startsWith('./') || spec.startsWith('../')) && resolve(dirname(from), spec).startsWith(CORE_SRC);
    const bad = coreFiles.flatMap((f) =>
      specifiers(readFileSync(f, 'utf8'))
        .filter((s) => !insideCore(f, s))
        .map((s) => `${relative(ROOT, f)} imports "${s}"`));
    expect(bad).toEqual([]);
  });

  it('has no dynamic import or require with a computed specifier', () => {
    const bad = coreFiles.filter((f) => /\b(?:import|require)\(\s*[^'"`\s)]/.test(readFileSync(f, 'utf8')));
    expect(bad.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('compiles without DOM or ambient Node types', () => {
    const raw = readFileSync(join(ROOT, 'packages/core/tsconfig.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const { compilerOptions } = JSON.parse(raw) as { compilerOptions: { lib: string[]; types: string[] } };
    expect(compilerOptions.lib.some((l) => l.toLowerCase().startsWith('dom'))).toBe(false);
    expect(compilerOptions.types).toEqual([]);
  });
});

describe('portal and ad SDKs stay behind the platform adapter', () => {
  const SDK = /\bPokiSDK\b|poki-sdk|\bCrazyGames\b|crazygames-sdk|playgama|@capacitor\/|admob|revenuecat|googletag|adsbygoogle/i;
  const PLATFORM_DIR = join(ROOT, 'apps/game/src/platform') + sep;

  it('mentions no SDK outside apps/game/src/platform/', () => {
    const candidates = [
      ...files(join(ROOT, 'apps/game/src'), ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.json', '.html', '.css']),
      join(ROOT, 'apps/game/index.html'),
    ].filter((f) => !f.startsWith(PLATFORM_DIR));
    const bad = candidates.filter((f) => SDK.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f));
    expect(bad).toEqual([]);
  });
});

describe('game state stays pure', () => {
  const STATE = join(ROOT, 'apps/game/src/state');
  const stateFiles = files(STATE, ['.ts']);

  it('has source files to check', () => {
    expect(stateFiles.length).toBeGreaterThan(0);
  });

  it('imports only @firefly/core and its own modules (no DOM, renderer, platform or UI)', () => {
    const inside = (from: string, spec: string) =>
      (spec.startsWith('./') || spec.startsWith('../')) && resolve(dirname(from), spec).startsWith(STATE + sep);
    const bad = stateFiles.flatMap((f) =>
      specifiers(readFileSync(f, 'utf8'))
        .filter((s) => s !== '@firefly/core' && !inside(f, s))
        .map((s) => `${relative(ROOT, f)} imports "${s}"`));
    expect(bad).toEqual([]);
  });

  it('has no dynamic import or require with a computed specifier', () => {
    const bad = stateFiles.filter((f) => /\b(?:import|require)\(\s*[^'"`\s)]|\b(?:import|require)\(\s*`[^`]*\$\{/.test(readFileSync(f, 'utf8')));
    expect(bad.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('compiles without DOM or ambient Node types', () => {
    const raw = readFileSync(join(ROOT, 'apps/game/tsconfig.state.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const { compilerOptions, include } = JSON.parse(raw) as { compilerOptions: { lib: string[]; types: string[] }; include: string[] };
    expect(compilerOptions.lib.some((l) => l.toLowerCase().startsWith('dom'))).toBe(false);
    expect(compilerOptions.types).toEqual([]);
    expect(include).toEqual(['src/state']);
  });

  it('never touches browser globals', () => {
    const GLOBALS = /\b(?:window|document|globalThis|self|localStorage|sessionStorage|indexedDB|navigator|fetch|XMLHttpRequest|WebSocket|requestAnimationFrame)\b/;
    const bad = stateFiles.filter((f) => GLOBALS.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
    expect(bad.map((f) => relative(ROOT, f))).toEqual([]);
  });
});

describe('colors come only from theme tokens', () => {
  it('has no color literals in apps/game/src outside theme.css', () => {
    const COLOR = /#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?\b(?![\w-])|0x[0-9a-f]{6}\b|\brgba?\(|\bhsla?\(/i;
    const THEME = join(ROOT, 'apps/game/src/theme.css');
    const bad = files(join(ROOT, 'apps/game/src'), ['.ts', '.css', '.html'])
      .filter((f) => f !== THEME)
      .filter((f) => COLOR.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(bad).toEqual([]);
  });
});
