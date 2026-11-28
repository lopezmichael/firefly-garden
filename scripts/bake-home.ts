// Bakes the home screen's painted art (docs/plans/2026-11-28-home-screen.md). The painter in
// art/home/ is plain browser JavaScript (washes, brush ink, glows on a 2D canvas); it takes about
// 400 ms per scene even on a desktop core, too slow to run at launch on a phone, so it runs here,
// once, in headless Chromium. Deterministic (the painter is seeded): rerunning gives the same art.
//
//   npm run art:home
//
// Writes apps/game/src/assets/home/: scene.webp (the still plate), cast.webp (every moving part
// of Pip and the friends, packed) and home.json (where each part sits and turns).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = join(import.meta.dirname, '..');
const ART = join(ROOT, 'art/home');
const OUT = join(ROOT, 'apps/game/src/assets/home');

interface Baked {
  plate: string;
  atlas: string;
  manifest: unknown;
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // A painter error fails the bake after it (thrown from the listener, it would skip closing the browser).
  const errors: Error[] = [];
  page.on('pageerror', (err) => errors.push(err));
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  // The painter's files share one global scope, as they did in the design pages.
  for (const f of ['lib.js', 'pip.js', 'scene.js', 'bake.js']) await page.addScriptTag({ content: readFileSync(join(ART, f), 'utf8') });
  const baked = await page.evaluate(() => (globalThis as unknown as { bakeHome(): Baked }).bakeHome());
  if (errors.length > 0) throw errors[0];
  mkdirSync(OUT, { recursive: true });
  const bytes = (url: string) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  writeFileSync(join(OUT, 'scene.webp'), bytes(baked.plate));
  writeFileSync(join(OUT, 'cast.webp'), bytes(baked.atlas));
  writeFileSync(join(OUT, 'home.json'), JSON.stringify(baked.manifest, null, 1) + '\n');
  const kb = (url: string) => (bytes(url).length / 1024).toFixed(0);
  console.log(`home art: scene ${kb(baked.plate)} KB, cast ${kb(baked.atlas)} KB → ${OUT}`);
} finally {
  await browser.close();
}
