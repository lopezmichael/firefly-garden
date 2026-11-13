import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Motion ratchet (docs/design/assets.md, "Motion"): every CSS animation and
 * transition in game.css stops under reduced motion (the controller sets
 * `data-motion='reduced'` on .ff-app from the in-game setting or the device's).
 * State changes still land; only the movement goes. A new animated class needs a
 * matching reduced-motion rule, or an entry below saying why it never runs then.
 */
const css = readFileSync(join(import.meta.dirname, '../src/ui/game.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Classes that animate but cannot be on screen under reduced motion, and why. */
const NEVER_REDUCED: Readonly<Record<string, string>> = {
  'ff-flier-wing-l': 'fliers are only created with motion on (ui/app.ts, flight())',
  'ff-flier-wing-r': 'fliers are only created with motion on (ui/app.ts, flight())',
};

interface Rule { readonly selectors: readonly string[]; readonly body: string }

function rules(): Rule[] {
  const out: Rule[] = [];
  // Flatten @keyframes away (their bodies are not rules) and @container / @media wrappers.
  const flat = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '').replace(/@(container|media)[^{]*\{/g, '');
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selectors: m[1]!.split(',').map((x) => x.trim()).filter(Boolean), body: m[2]! });
  }
  return out;
}

/** The class a selector finally styles: the last `.ff-…` in its last compound. */
function target(selector: string): string | null {
  const last = selector.split(/\s+|>/).filter(Boolean).pop() ?? '';
  const classes = [...last.matchAll(/\.(ff-[\w-]+)/g)].map((m) => m[1]!);
  return classes.pop() ?? null;
}

describe('every CSS motion stops under reduced motion', () => {
  const all = rules();
  const REDUCED = "[data-motion='reduced']";

  for (const property of ['animation', 'transition'] as const) {
    it(`${property}s`, () => {
      const moving = new Set<string>();
      const stopped = new Set<string>();
      for (const r of all) {
        const decl = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(r.body)?.[1]?.trim();
        if (!decl) continue;
        for (const sel of r.selectors) {
          const cls = target(sel);
          if (!cls) continue;
          if (sel.includes(REDUCED)) {
            if (decl === 'none') stopped.add(cls);
          } else if (decl !== 'none') {
            moving.add(cls);
          }
        }
      }
      expect(moving.size, `no ${property}s found: the parser is broken`).toBeGreaterThan(0);
      const missing = [...moving].filter((c) => !stopped.has(c) && !(c in NEVER_REDUCED));
      expect(missing, `animated without a reduced-motion rule in game.css`).toEqual([]);
    });
  }
});
