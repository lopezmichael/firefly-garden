import './fonts.css';
import './theme.css';
import './ui/game.css';
import launch from '../../../levels/launch.json';
import manifest from '../../../levels/manifest.json';
import reserve from '../../../levels/reserve.json';
import { createPlatform } from './platform/index.ts';
import { createCatalog } from './state/catalog.ts';
import { GameApp } from './ui/app.ts';
import { readPalette } from './view/theme.ts';

/** Chapters this build plays (Phase 2: the Rose Bed). */
const CHAPTERS = ['c1', 'c2', 'c3'];

async function start(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  const platform = createPlatform();
  await platform.init();
  // The board draws its numbers with the display font; wait so they never flash in a fallback face.
  // A font that fails to load is not fatal: the CSS stacks fall back to system faces.
  await Promise.all([document.fonts.load('400 24px "Young Serif"'), document.fonts.load('700 15px Figtree')]).catch(() => undefined);
  const catalog = createCatalog({ launch, reserve, manifest }, CHAPTERS);
  await new GameApp(root, catalog, platform, readPalette()).start();
}

start().catch((err: unknown) => {
  // A broken pack or a device without WebGL: say so instead of showing a blank page.
  console.error(err);
  const root = document.getElementById('app');
  if (!root) return;
  const box = document.createElement('div');
  box.className = 'ff-fail';
  const title = document.createElement('h1');
  title.textContent = "The garden couldn't open";
  const sub = document.createElement('p');
  sub.textContent = 'Try reloading the page. If it keeps happening, this browser may not support the game.';
  box.append(title, sub);
  root.replaceChildren(box);
});
