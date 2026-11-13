import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The status card reserves room for a one-line title and its sub-lines, so the
 * board above never resizes when the wording changes: a resize cancels the
 * firefly in flight from the jar (ui/app.ts, layout()). The reservation is a
 * calc in game.css that assumes the title's line height; this keeps the two in
 * step (a font change once made the title taller than the reservation).
 */
const css = readFileSync(join(import.meta.dirname, '../src/ui/game.css'), 'utf8');

function rule(selector: string): string {
  const i = css.indexOf(`${selector} {`);
  expect(i, `${selector} is missing from game.css`).toBeGreaterThanOrEqual(0);
  return css.slice(i, css.indexOf('}', i));
}

describe('the status card keeps its height', () => {
  it('reserves exactly the title and sub-line heights it declares', () => {
    const title = rule('.ff-status-title');
    const sub = rule('.ff-status-sub');
    const titleSize = Number(/font-size:\s*(\d+)px/.exec(title)?.[1]);
    const titleLine = Number(/line-height:\s*([\d.]+)/.exec(title)?.[1]);
    const subSize = Number(/font-size:\s*(\d+)px/.exec(sub)?.[1]);
    const subLine = Number(/line-height:\s*([\d.]+)/.exec(sub)?.[1]);
    expect(titleLine, '.ff-status-title needs an explicit unitless line-height').toBeGreaterThan(0);
    const reserves = [...css.matchAll(/min-height:\s*calc\((\d+)px \* ([\d.]+) \+ 2px \+ (\d+)px \* ([\d.]+) \* \d\)/g)];
    expect(reserves.length).toBeGreaterThanOrEqual(2);
    for (const m of reserves) {
      expect([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]).toEqual([titleSize, titleLine, subSize, subLine]);
    }
  });
});
